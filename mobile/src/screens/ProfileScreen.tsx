import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { AvatarPickerSheet, naviiUrl } from '../components/AvatarPickerSheet';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { MframapaLogo } from '../components/MframapaLogo';
import { getColors, Colors } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { useStore } from '../store/useStore';
import { useTranslation } from '../hooks/useTranslation';
import { PROFILE_MENU_ITEMS } from '../navigation/profileMenuItems';

export function ProfileScreen() {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const profile = useStore((s) => s.profile);
  const updateProfile = useStore((s) => s.updateProfile);
  const signOut = useStore((s) => s.signOut);
  // isAuthenticated is real-sign-in-only now (guest use no longer fakes it —
  // see useStore.ts hasCompletedOnboarding); email presence is still the
  // simplest signal that this profile came from a real account.
  const hasAccount = Boolean(profile.email?.trim());

  const [pickerVisible, setPickerVisible] = useState(false);

  function confirmSignOut() {
    Alert.alert(
      t('signout.confirm_title'),
      t('signout.confirm_message'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.sign_out'), style: 'destructive', onPress: () => void signOut() },
      ],
    );
  }

  function handleAvatarSelect(seed: string) {
    void updateProfile({ avatarSeed: seed });
  }

  function goSignIn() {
    navigation.navigate('Login');
  }

  const displayEmail = profile.email?.trim() || '';

  return (
    <View style={[styles.root]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <MframapaLogo size="sm" markOnly />
        </View>
        <Text style={[styles.pageTitle, { color: colors.text }]}>{t('screen.profile.title')}</Text>

        <TouchableOpacity style={styles.avatarWrap} onPress={() => setPickerVisible(true)} activeOpacity={0.8}>
          {profile.avatarSeed ? (
            <Image
              source={{ uri: naviiUrl(profile.avatarSeed, 176) }}
              style={[styles.naviiAvatar, { backgroundColor: colors.surface }]}
              resizeMode="contain"
            />
          ) : (
            <Avatar initials={profile.initials || 'YA'} size={88} />
          )}
          <View style={[styles.editBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="pencil" size={13} color={colors.subtext} />
          </View>
        </TouchableOpacity>

        {hasAccount && profile.fullName?.trim() ? (
          <Text style={[styles.displayName, { color: colors.text }]}>{profile.fullName.trim()}</Text>
        ) : null}

        <View style={styles.tierRow}>
          <Text style={[styles.tierLabel, { color: colors.subtext }]}>{t('screen.profile.account_tier')}</Text>
          <Badge label={profile.tier.charAt(0).toUpperCase() + profile.tier.slice(1)} variant={profile.tier as any} />
        </View>

        {hasAccount ? (
          <View style={styles.form}>
            <Text style={[styles.sectionLabel, { color: colors.subtext }]}>
              {t('screen.profile.account_details')}
            </Text>
            <View style={[styles.detailsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Email only — matches PWA account details (name often missing from auth). */}
              <View style={styles.detailRowLast}>
                <Text style={[styles.detailLabel, { color: colors.subtext }]}>{t('screen.profile.email')}</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>
                  {displayEmail || t('screen.profile.not_set')}
                </Text>
              </View>
            </View>
            <Text style={[styles.managedNote, { color: colors.muted }]}>
              {t('screen.profile.managed_note')}
            </Text>
          </View>
        ) : (
          <View style={[styles.anonCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.anonTitle, { color: colors.text }]}>{t('screen.profile.anon_title')}</Text>
            <Text style={[styles.anonBody, { color: colors.subtext }]}>{t('screen.profile.anon_body')}</Text>
            <PrimaryButton label={t('screen.profile.sign_in')} onPress={goSignIn} />
          </View>
        )}

        <View style={[styles.links, { borderTopColor: colors.border }]}>
          {PROFILE_MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.screen}
              onPress={() => navigation.navigate(item.screen)}
              style={[styles.link, { borderBottomColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={t(item.labelKey)}
            >
              <Text style={[styles.linkText, { color: colors.text }]}>{t(item.labelKey)}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.accountActionsWrap}>
          {hasAccount ? (
            <View style={[styles.accountActions, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.accountActionsLabel, { color: colors.subtext }]}>
                {t('screen.profile.account_actions')}
              </Text>

              <TouchableOpacity
                onPress={confirmSignOut}
                style={styles.signOutRow}
                accessibilityRole="button"
                accessibilityLabel={t('settings.sign_out')}
              >
                <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
                <Text style={styles.signOutText}>{t('settings.sign_out')}</Text>
              </TouchableOpacity>

              <View style={[styles.dangerDivider, { backgroundColor: colors.border }]} />

              <TouchableOpacity
                onPress={() => navigation.navigate('DeleteAccount')}
                style={styles.deleteLink}
                accessibilityRole="button"
                accessibilityLabel={t('screen.profile.delete_account')}
              >
                <Text style={[styles.deleteLinkText, { color: Colors.danger }]}>
                  {t('screen.profile.delete_account')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={goSignIn}
              style={[styles.signInPill, { backgroundColor: Colors.brandGreen }]}
              accessibilityRole="button"
              accessibilityLabel={t('profile.sign_in_prompt')}
            >
              <Ionicons name="log-in-outline" size={18} color="#00110B" />
              <Text style={styles.signInPillText}>{t('profile.sign_in_prompt')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <AvatarPickerSheet
        visible={pickerVisible}
        selected={profile.avatarSeed}
        onSelect={handleAvatarSelect}
        onClose={() => setPickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16 },
  header: { alignItems: 'center', marginBottom: 8 },
  pageTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 20 },
  avatarWrap: { alignItems: 'center', marginBottom: 12, alignSelf: 'center' },
  naviiAvatar: { width: 88, height: 88, borderRadius: 44 },
  editBadge: {
    position: 'absolute', bottom: 0, right: -4,
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  displayName: { fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  tierRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 },
  tierLabel: { fontSize: 14 },
  form: { marginBottom: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  detailsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailRowLast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 14, fontWeight: '500', maxWidth: '62%', textAlign: 'right' },
  managedNote: { fontSize: 12, marginTop: 8, lineHeight: 16 },
  anonCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  anonTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  anonBody: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  links: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkText: { fontSize: 15 },
  accountActionsWrap: {
    marginTop: 40,
    marginBottom: 8,
    alignItems: 'center',
  },
  accountActions: {
    alignSelf: 'stretch',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  accountActionsLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 12,
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  signOutText: {
    color: Colors.danger,
    fontSize: 16,
    fontWeight: '600',
  },
  dangerDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
    marginHorizontal: 24,
  },
  deleteLink: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  deleteLinkText: {
    fontSize: 13,
    fontWeight: '400',
    opacity: 0.72,
  },
  signInPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  signInPillText: {
    color: '#00110B',
    fontSize: 15,
    fontWeight: '600',
  },
});
