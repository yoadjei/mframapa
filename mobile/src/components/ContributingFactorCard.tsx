import React, { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PollutantReading } from '../store/useStore';
import { useTranslation } from '../hooks/useTranslation';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { factorFillColor, factorFillRgba, factorStatusKey } from '../theme/colors';
import { FACTOR_TINY_LABEL_KEY } from '../config/contributingFactors';
import { getColors } from '../theme';

// Same real-world association as the app's other pollutant icons (see
// PollutantDetailSheet's health copy) — traffic makes NO2, sunlight drives
// ground-level ozone, factories/generators make SO2, flame is incomplete
// combustion (CO).
const FACTOR_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  no2: 'car-outline',
  o3: 'sunny-outline',
  so2: 'flash-outline',
  co: 'flame-outline',
};

interface Props {
  pollutant: PollutantReading | null;
  isDark: boolean;
  colors: ReturnType<typeof getColors>;
  onPress: (p: PollutantReading) => void;
}

/** One "What's in your air" card. Severity lives in the number, the status
 *  word, and the gauge fill — never in a flat colour wash over the whole
 *  card, so the grid reads as data rather than four traffic lights.
 *  Mirrors frontend-pwa's ContributingFactorCard.jsx. */
export function ContributingFactorCard({ pollutant, isDark, colors, onPress }: Props) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const fillAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  const pct = pollutant?.pct_of_limit ?? null;
  const hasData = pollutant != null && pollutant.value != null;
  const targetWidth = pct == null ? 0 : Math.max(0, Math.min(pct, 100));
  const over100 = pct != null && pct > 100;

  useEffect(() => {
    if (!hasData) return;
    if (reduceMotion) {
      fillAnim.setValue(targetWidth);
      return;
    }
    fillAnim.setValue(0);
    Animated.timing(fillAnim, {
      toValue: targetWidth,
      duration: 800,
      useNativeDriver: false,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetWidth, hasData, reduceMotion]);

  useEffect(() => {
    if (!over100 || reduceMotion) {
      glowAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 900, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over100, reduceMotion]);

  if (!hasData) {
    return (
      <View style={[styles.card, styles.noData, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
        <Text style={[styles.noDataText, { color: colors.subtext }]}>{t('factor.no_data')}</Text>
      </View>
    );
  }

  const color = factorFillColor(pct, isDark);
  const iconName = FACTOR_ICONS[pollutant.code] ?? 'car-outline';

  const glowShadowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] });
  const glowRadius = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 8] });

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(pollutant)}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={`${pollutant.short_name} ${t('pollutant.pct_of_limit')} ${pct != null ? Math.round(pct) : '--'}`}
    >
      <View style={styles.nameBlock}>
        <View style={styles.nameRow}>
          <Ionicons name={iconName} size={12} color={colors.subtext} />
          <Text style={[styles.shortName, { color: colors.text }]} numberOfLines={1}>
            {pollutant.short_name}
          </Text>
        </View>
        <Text style={[styles.tinyLabel, { color: colors.subtext }]} numberOfLines={1}>
          {t(FACTOR_TINY_LABEL_KEY[pollutant.code])}
        </Text>
      </View>

      <View>
        <Text style={[styles.pctNumber, { color }]}>
          {pct != null ? Math.min(Math.round(pct), 100) : '--'}
          <Text style={styles.pctSign}>%</Text>
        </Text>
        <Text style={[styles.statusLabel, { color }]} numberOfLines={1}>
          {t(factorStatusKey(pct))}
        </Text>

        <Animated.View
          style={[
            styles.gaugeTrack,
            { backgroundColor: colors.border },
            over100 && {
              shadowColor: factorFillRgba(pct, isDark, 1),
              shadowOpacity: glowShadowOpacity as unknown as number,
              shadowRadius: glowRadius as unknown as number,
              shadowOffset: { width: 0, height: 0 },
            },
          ]}
        >
          <Animated.View
            style={[
              styles.gaugeFill,
              {
                backgroundColor: color,
                width: fillAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
              },
            ]}
          />
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 1,
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    justifyContent: 'space-between',
  },
  noData: { alignItems: 'center', justifyContent: 'center' },
  noDataText: { fontSize: 11, fontWeight: '700' },
  nameBlock: {},
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  shortName: { fontSize: 11, fontWeight: '700' },
  tinyLabel: { fontSize: 9, fontWeight: '600', marginTop: 3 },
  pctNumber: { fontSize: 20, fontWeight: '800', lineHeight: 22 },
  pctSign: { fontSize: 10, fontWeight: '700' },
  statusLabel: { fontSize: 9, fontWeight: '700', marginTop: 1, letterSpacing: 0.3 },
  gaugeTrack: {
    marginTop: 6,
    height: 5,
    borderRadius: 3,
    overflow: 'visible',
    justifyContent: 'center',
  },
  gaugeFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
});
