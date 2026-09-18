import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, Colors } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { useStore } from '../store/useStore';
import { useTranslation } from '../hooks/useTranslation';
import { HEALTH_CONDITIONS } from '../config/healthConditions';
import { updateHealthProfile, deleteHealthProfile } from '../services/api';

/** Condition checkboxes + save/delete. Always writes to local state (works
 *  for guests); pushes to the backend too when signed in — the personalized
 *  /predict block only activates server-side once it's there, which is
 *  exactly the "sign in for personalization" pitch. Mirrors frontend-pwa's
 *  HealthProfileForm.jsx + HealthProfileScreen.jsx combined into one screen. */
export function HealthProfileScreen() {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);

  const [selected, setSelected] = useState<Set<string>>(new Set(profile.healthConditions ?? []));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function handleSave() {
    const healthConditions = Array.from(selected);
    setSaving(true);
    setProfile({ healthConditions });
    if (isAuthenticated) {
      try {
        await updateHealthProfile({ healthConditions });
      } catch {
        /* saved locally either way; a failed sync isn't worth blocking on */
      }
    }
    setSaving(false);
    navigation.goBack();
  }

  async function handleDelete() {
    setDeleting(true);
    setProfile({ healthConditions: [] });
    setSelected(new Set());
    if (isAuthenticated) {
      try {
        await deleteHealthProfile();
      } catch {
        /* local state already cleared; best-effort remote delete */
      }
    }
    setDeleting(false);
    navigation.goBack();
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('health_profile.title').toUpperCase()}</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.subtitle, { color: colors.subtext }]}>{t('health_profile.subtitle')}</Text>

        <View style={styles.list}>
          {HEALTH_CONDITIONS.map(({ code, labelKey }) => {
            const active = selected.has(code);
            return (
              <TouchableOpacity
                key={code}
                onPress={() => toggle(code)}
                activeOpacity={0.85}
                style={[
                  styles.row,
                  {
                    backgroundColor: active ? Colors.brandGreen + '18' : colors.card,
                    borderColor: active ? Colors.brandGreen + '60' : colors.border,
                  },
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
              >
                <Ionicons
                  name={active ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={active ? Colors.brandGreen : colors.subtext}
                />
                <Text style={[styles.rowLabel, { color: colors.text }]}>{t(labelKey)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!isAuthenticated && (
          <Text style={[styles.note, { color: colors.muted }]}>{t('health_profile.sign_in_prompt')}</Text>
        )}
        <Text style={[styles.note, { color: colors.muted }]}>{t('health_profile.privacy_note')}</Text>

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, { backgroundColor: Colors.brandGreen, opacity: saving ? 0.6 : 1 }]}
        >
          {saving ? <ActivityIndicator color="#00110B" /> : (
            <Text style={styles.saveBtnText}>{t('health_profile.save')}</Text>
          )}
        </TouchableOpacity>

        {(profile.healthConditions?.length ?? 0) > 0 && (
          <TouchableOpacity
            onPress={handleDelete}
            disabled={deleting}
            style={[styles.deleteBtn, { borderColor: Colors.danger + '60', opacity: deleting ? 0.6 : 1 }]}
          >
            {deleting ? <ActivityIndicator color={Colors.danger} /> : (
              <Text style={styles.deleteBtnText}>{t('health_profile.delete')}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 16 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowLabel: { fontSize: 15, fontWeight: '500', flex: 1 },
  note: { fontSize: 12, lineHeight: 17 },
  saveBtn: { marginTop: 4, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#00110B', fontSize: 16, fontWeight: '700' },
  deleteBtn: { marginTop: 4, borderRadius: 16, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  deleteBtnText: { color: Colors.danger, fontSize: 14, fontWeight: '700' },
});
