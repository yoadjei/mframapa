import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassSheet } from './ui/GlassSheet';
import { PollutantReading } from '../store/useStore';
import { getPollutantInfo, PollutantInfo } from '../services/api';
import { useTranslation } from '../hooks/useTranslation';
import { pollutantSeverityColor } from '../theme/colors';
import { getColors } from '../theme';

const SEVERITY_KEY: Record<string, string> = {
  good: 'pollutant.severity.good',
  moderate: 'pollutant.severity.moderate',
  high: 'pollutant.severity.high',
  severe: 'pollutant.severity.severe',
  hazardous: 'pollutant.severity.hazardous',
  unknown: 'pollutant.severity.moderate',
};

interface Props {
  pollutant: PollutantReading | null;
  isDark: boolean;
  colors: ReturnType<typeof getColors>;
  onClose: () => void;
}

/** Tap-to-expand detail for a pollutant card. Mirrors frontend-pwa's
 *  PollutantDetailSheet.jsx content (what it is, local sources, body
 *  effects, at-risk groups, actions, citations) — the 7-day sparkline is
 *  PWA-only for now since it needs a per-point history fetch that mobile
 *  doesn't have wired up yet. */
export function PollutantDetailSheet({ pollutant, isDark, colors, onClose }: Props) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<PollutantInfo | null>(null);

  useEffect(() => {
    if (!pollutant) return;
    let active = true;
    getPollutantInfo().then((all) => {
      if (active) setInfo(all[pollutant.code] ?? null);
    });
    return () => {
      active = false;
    };
  }, [pollutant?.code]);

  if (!pollutant) return null;
  const color = pollutantSeverityColor(pollutant.severity, isDark);
  const actions = info?.actions_by_severity?.[pollutant.severity] ?? info?.actions_by_severity?.moderate ?? [];

  return (
    <GlassSheet visible={Boolean(pollutant)} onClose={onClose} sheetStyle={{ maxHeight: '85%' }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>
            {pollutant.short_name} · {pollutant.name}
          </Text>
          <Text style={[styles.subtitle, { color }]}>
            {pollutant.value} {pollutant.unit} — {Math.round(pollutant.pct_of_limit ?? 0)}%{' '}
            {t('pollutant.pct_of_limit')} · {t(SEVERITY_KEY[pollutant.severity] ?? SEVERITY_KEY.moderate)}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} accessibilityLabel={t('common.close') ?? 'Close'} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={colors.subtext} />
        </TouchableOpacity>
      </View>

      {info ? (
        <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
          <Section title={t('pollutant.detail.what_it_is')} colors={colors}>
            <Text style={[styles.body, { color: colors.text }]}>{info.what_it_is}</Text>
          </Section>

          <Section title={t('pollutant.detail.local_sources')} colors={colors}>
            {info.local_sources.map((s) => (
              <Text key={s} style={[styles.bullet, { color: colors.text }]}>
                {'•'} {s}
              </Text>
            ))}
          </Section>

          <Section title={t('pollutant.detail.body_effects')} colors={colors}>
            <Text style={[styles.body, { color: colors.text }]}>{info.body_effects}</Text>
          </Section>

          <Section title={t('pollutant.detail.at_risk')} colors={colors}>
            <Text style={[styles.body, { color: colors.text }]}>{info.at_risk_groups.join(' · ')}</Text>
          </Section>

          <View style={[styles.actionsBox, { borderColor: color + '40', backgroundColor: color + (isDark ? '1c' : '12') }]}>
            <Text style={[styles.sectionTitle, { color }]}>{t('pollutant.detail.actions')}</Text>
            {actions.map((a) => (
              <Text key={a} style={[styles.bullet, styles.actionBullet, { color: colors.text }]}>
                {'•'} {a}
              </Text>
            ))}
          </View>

          <Text style={[styles.citations, { color: colors.muted }]}>
            {t('pollutant.detail.sources')}: {info.citations.join(' · ')}
          </Text>
        </ScrollView>
      ) : null}
    </GlassSheet>
  );
}

function Section({ title, colors, children }: { title: string; colors: ReturnType<typeof getColors>; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.subtext }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  closeBtn: { padding: 4 },
  scroll: { marginTop: 12 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  body: { fontSize: 15, lineHeight: 22 },
  bullet: { fontSize: 15, lineHeight: 22 },
  actionsBox: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 16 },
  actionBullet: { fontWeight: '600' },
  citations: { fontSize: 11, marginBottom: 20 },
});
