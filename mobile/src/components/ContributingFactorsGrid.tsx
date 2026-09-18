import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { PollutantReading } from '../store/useStore';
import { useTranslation } from '../hooks/useTranslation';
import { formatRelativeTime } from '../utils/formatters';
import { ContributingFactorCard } from './ContributingFactorCard';
import { FACTOR_ORDER, MAX_FACTOR_CARDS } from '../config/contributingFactors';
import { getColors } from '../theme';

interface Props {
  pollutants?: PollutantReading[];
  isDark: boolean;
  colors: ReturnType<typeof getColors>;
  onSelect: (p: PollutantReading) => void;
}

const H_PADDING = 16 * 2;
const GAP = 8;
// Mirrors frontend-pwa's grid-cols-2 sm:grid-cols-4 breakpoint (Tailwind's sm = 640).
const WIDE_BREAKPOINT = 640;
// Mirrors frontend-pwa's max-w-[380px] on the grid — caps card size on a
// tablet or a wide window instead of letting them grow with the screen.
const MAX_GRID_WIDTH = 380;

/** "What's in your air" — up to 4 square, fixed-priority-order cards between
 *  the AQI hero card and "What to do". 2x2 on a phone, a single row of 4 on
 *  a wider screen. Mirrors frontend-pwa's ContributingFactorsGrid.jsx. */
export function ContributingFactorsGrid({ pollutants, isDark, colors, onSelect }: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  // Ticks once a minute so "Updated Xm ago" doesn't go stale while the
  // screen stays open.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!pollutants?.length) return null;

  const byCode = new Map(pollutants.map((p) => [p.code, p]));
  const shown = FACTOR_ORDER.slice(0, MAX_FACTOR_CARDS).map((code) => byCode.get(code) ?? null);

  const latestUpdate = shown
    .filter((p): p is PollutantReading => p != null)
    .map((p) => p.updated_at)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);

  const columns = width >= WIDE_BREAKPOINT ? 4 : 2;
  const gridWidth = Math.min(width - H_PADDING, MAX_GRID_WIDTH);
  const cardWidth = (gridWidth - GAP * (columns - 1)) / columns;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.subtext }]}>{t('factor.section_title')}</Text>
        {latestUpdate && (
          <Text style={[styles.updated, { color: colors.muted }]}>
            {t('factor.updated', { time: formatRelativeTime(latestUpdate) })}
          </Text>
        )}
      </View>

      <View style={[styles.grid, { gap: GAP }]}>
        {shown.map((pollutant, i) => (
          <View key={pollutant?.code ?? FACTOR_ORDER[i]} style={{ width: cardWidth }}>
            <ContributingFactorCard pollutant={pollutant} isDark={isDark} colors={colors} onPress={onSelect} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  updated: { fontSize: 11, fontWeight: '500' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
