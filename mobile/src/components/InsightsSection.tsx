import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PredictionResult } from '../store/useStore';
import { useTranslation } from '../hooks/useTranslation';
import { cleanGuidanceText } from '../utils/cleanGuidanceText';
import { getColors } from '../theme';

// Matches the icon keys backend/config/personalized_advice.py hands back on
// each advice item — same convention as the factor cards' icon map.
const ADVICE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  wind: 'body-outline',
  car: 'car-outline',
  sun: 'sunny-outline',
  factory: 'flash-outline',
  flame: 'flame-outline',
  home: 'home-outline',
  alert: 'alert-circle-outline',
};

const VISIBLE_CAP = 4;

interface Props {
  pred: PredictionResult | null;
  colors: ReturnType<typeof getColors>;
  firstName?: string;
}

/** "Kwame, carry your reliever inhaler..." instead of "Carry your reliever
 *  inhaler..." — only the lead item gets the address (repeating a name on
 *  every line reads as a mail-merge, not a person talking to you), and only
 *  for a signed-in user with a real name on file. */
function addressed(text: string, firstName?: string): string {
  if (!firstName) return text;
  return `${firstName}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** Workstream 3 personalization: the health-based rules engine
 *  (backend/config/personalized_advice.py) replaces the generic mood line
 *  with condition-specific, NO2/O3/SO2/CO-driven advice whenever there's
 *  anything to say — an asthmatic and a guest looking at the same reading
 *  see genuinely different instructions. When nothing is elevated there's
 *  no advice to rewrite, so the generic mood line still carries that case.
 *  Mirrors frontend-pwa's InsightsSection.jsx. */
export function InsightsSection({ pred, colors, firstName }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (!pred) return null;

  const advice = pred.personalizedAdvice ?? [];
  const hasAdvice = advice.length > 0;

  if (!pred.insight && !hasAdvice) return null;

  const visibleAdvice = expanded ? advice : advice.slice(0, VISIBLE_CAP);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.subtext }]}>{t('home.advice_title')}</Text>

      {hasAdvice ? (
        <View style={styles.list}>
          {visibleAdvice.map((item, i) => {
            const iconName = ADVICE_ICONS[item.icon] ?? 'body-outline';
            return (
              <View key={item.id} style={styles.row}>
                <Ionicons name={iconName} size={16} color={colors.text} style={styles.rowIcon} />
                <View style={styles.rowText}>
                  <Text style={[styles.itemText, { color: colors.text }]}>
                    {i === 0 ? addressed(item.text, firstName) : item.text}
                  </Text>
                  {item.detail ? (
                    <Text style={[styles.itemDetail, { color: colors.subtext }]}>{item.detail}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        pred.insight ? (
          <Text style={[styles.body, { color: colors.text }]}>{cleanGuidanceText(pred.insight)}</Text>
        ) : null
      )}

      {hasAdvice && advice.length > VISIBLE_CAP && (
        <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.seeAll}>
          <Text style={[styles.seeAllText, { color: colors.subtext }]}>
            {expanded ? t('insight.see_less') : t('insight.see_all', { count: String(advice.length) })}
          </Text>
        </TouchableOpacity>
      )}

      {pred.personalized && (
        <Text style={[styles.personalized, { color: '#FF8C00' }]}>
          {t('insight.personalized_category', {
            category: pred.personalized.category,
            reason: pred.personalized.reason,
          })}
        </Text>
      )}

      {hasAdvice && (
        <Text style={[styles.disclaimer, { color: colors.muted }]}>{t('insight.disclaimer')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 16, borderWidth: 1 },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 22 },
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowIcon: { marginTop: 2 },
  rowText: { flex: 1 },
  itemText: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
  itemDetail: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  seeAll: { marginTop: 8 },
  seeAllText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  personalized: { fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 8 },
  disclaimer: { fontSize: 10, lineHeight: 14, marginTop: 10 },
});
