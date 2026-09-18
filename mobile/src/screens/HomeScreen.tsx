import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PollutantReading, useStore } from '../store/useStore';
import { getDailyFact } from '../services/api';
import { fetchPredictionAtCoords } from '../services/prediction';
import { ContributingFactorsGrid } from '../components/ContributingFactorsGrid';
import { InsightsSection } from '../components/InsightsSection';
import { PollutantDetailSheet } from '../components/PollutantDetailSheet';
import { isAfricanCountryCode } from '../utils/africanCountries';
import { OfflineBanner } from '../components/OfflineBanner';
import { getColors, Colors } from '../theme';
import { getAQIColor } from '../theme/colors';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../hooks/useTranslation';
import { aqiCategoryKey } from '../utils/i18nHelpers';
import { MframapaLogo } from '../components/MframapaLogo';
import { useRateLimit } from '../hooks/useRateLimit';

export function HomeScreen() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  const lastPrediction = useStore((s) => s.lastPrediction);
  const offlineCities  = useStore((s) => s.offlineCities);
  const language       = useStore((s) => s.language);
  const addNotification = useStore((s) => s.addNotification);
  const unreadCount    = useStore((s) => s.notifications.filter((n) => !n.read).length);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const fullName        = useStore((s) => s.profile.fullName);

  // Same fact as the quiet-day push — surface on Home and once/day in Alerts.
  const [fact, setFact] = useState('');
  useEffect(() => {
    let active = true;
    getDailyFact(language)
      .then(async (f) => {
        if (!active || !f) return;
        setFact(f);

        const now = new Date();
        const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const seenKey = `mframapa:daily-fact-seen:${day}`;
        const seen = await AsyncStorage.getItem(seenKey);
        if (seen) return;

        const { alertsEnabled, notifPrefs } = useStore.getState();
        if (!alertsEnabled || notifPrefs.tip === false) return;

        addNotification({
          id: `daily-fact-${day}`,
          type: 'tip',
          title: t('home.did_you_know'),
          subtitle: f,
          timestamp: new Date().toISOString(),
          read: false,
        });
        await AsyncStorage.setItem(seenKey, '1');
      })
      .catch(() => {});
    return () => { active = false; };
  }, [language, addNotification, t]);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [selectedPollutant, setSelectedPollutant] = useState<PollutantReading | null>(null);
  const { secondsRemaining, isRateLimited } = useRateLimit();

  // AQI count-up animation
  const animVal = useRef(new Animated.Value(0)).current;
  const [displayNum, setDisplayNum] = useState(0);

  useEffect(() => {
    if (!lastPrediction) return;
    animVal.setValue(0);
    Animated.timing(animVal, { toValue: lastPrediction.pm25, duration: 600, useNativeDriver: false }).start();
    const id = animVal.addListener(({ value }) => setDisplayNum(Math.round(value)));
    return () => animVal.removeListener(id);
  }, [lastPrediction?.pm25]);

  async function handleLocate() {
    setError(null);
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setError(t('error.location')); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geo?.isoCountryCode && !isAfricanCountryCode(geo.isoCountryCode)) {
        setError(t('error.outside_africa'));
        return;
      }
      const name = geo?.city ?? geo?.district ?? geo?.region ?? `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
      await fetchPredictionAtCoords(latitude, longitude, name, language, offlineCities);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'OUTSIDE_AFRICA') setError(t('error.outside_africa'));
      else if (msg.toLowerCase().includes('network') || msg === 'ERR_NETWORK') setError(t('error.network'));
      else setError(t('error.prediction'));
    } finally {
      setLoading(false);
    }
  }

  const pred = lastPrediction;
  const aqiColor = pred ? getAQIColor(pred.aqi_category, isDark) : Colors.brandGreen;

  function openCityDetail() {
    if (!pred) return;
    navigation.navigate('CityDetail', { prediction: pred });
  }

  const heroCardContent = (
    <>
      <Text style={[styles.pm25Label, { color: colors.subtext }]}>{t('home.air_now')}</Text>
      {pred ? (
        <Text style={[styles.statusTitle, { color: aqiColor }]}>
          {t(aqiCategoryKey(pred.aqi_category))}
        </Text>
      ) : (
        <Text style={[styles.statusTitle, { color: colors.subtext }]}>—</Text>
      )}
      <View style={styles.aqiRow}>
        <Text style={[styles.aqiNumber, { color: colors.text }]}>{pred ? displayNum : '--'}</Text>
        <Text style={[styles.aqiUnit, { color: colors.subtext }]}>µg/m³ PM2.5</Text>
      </View>
      <Text style={[styles.locationStamp, { color: colors.subtext }]}>
        {pred
          ? `${pred.location.name} | ${t('card.today')}, ${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
          : t('home.tap_check')}
      </Text>
    </>
  );

  return (
    <View style={[styles.root]}>
      <View style={{ height: insets.top }} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

        {/* Header */}
        <View style={styles.header}>
          <MframapaLogo size="sm" markOnly />
          <TouchableOpacity onPress={() => navigation.navigate('Alerts')} style={styles.bellBtn} accessibilityLabel={t('tab.alerts')}>
            <Ionicons name="notifications-outline" size={26} color={colors.text} />
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        {/* Location Selector */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Search')}
          style={[styles.locationChip, { backgroundColor: colors.card, borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={t('home.select_city')}
        >
          <Ionicons name="location-outline" size={20} color={Colors.brandGreen} />
          <Text style={[styles.locationText, { color: colors.text }]}>
            {pred ? `${pred.location.name}` : t('home.select_city')}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.subtext} />
        </TouchableOpacity>

        <OfflineBanner />

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: Colors.danger + '18', borderColor: Colors.danger + '40' }]}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
            <Text style={[styles.errorText, { color: Colors.danger }]}>{error}</Text>
          </View>
        ) : null}

        {/* Primary AQI Hero Card */}
        <View style={styles.heroCardWrap}>
          <TouchableOpacity
            onPress={openCityDetail}
            disabled={!pred}
            activeOpacity={pred ? 0.85 : 1}
            accessibilityRole={pred ? 'button' : undefined}
            accessibilityLabel={pred ? t('screen.city_detail.air_quality') : undefined}
            style={[
              styles.heroCard,
              {
                backgroundColor: pred ? aqiColor + (isDark ? '22' : '14') : colors.card,
                borderColor: pred ? aqiColor + (isDark ? '45' : '40') : colors.border,
              }]}
          >
            {heroCardContent}
            {pred ? (
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.subtext}
                style={styles.heroChevron}
              />
            ) : null}
          </TouchableOpacity>
        </View>

        {/* What to do — personalized advice rules engine (PWA parity) */}
        <InsightsSection
          pred={pred}
          colors={colors}
          firstName={isAuthenticated ? fullName?.trim().split(' ')[0] || undefined : undefined}
        />

        {/* Rate-limit notice */}
        {isRateLimited ? (
          <View style={[styles.rateLimitBox, { backgroundColor: Colors.warning + '18', borderColor: Colors.warning + '40' }]}>
            <Ionicons name="time-outline" size={16} color={Colors.warning} />
            <Text style={[styles.rateLimitText, { color: Colors.warning }]}>
              {t('error.rate_limited', { seconds: String(secondsRemaining) })}
            </Text>
          </View>
        ) : null}

        {/* Quick Actions */}
        <View style={styles.actionRow}>
          {[
            {
              icon: 'navigate-circle-outline' as const,
              label: isRateLimited ? `${secondsRemaining}s` : t('home.action_check'),
              action: handleLocate,
              loading,
              disabled: loading || isRateLimited,
            },
            { icon: 'search-outline' as const, label: t('tab.search'), action: () => navigation.navigate('Search'), loading: false, disabled: false },
          ].map((item, i) => (
            <TouchableOpacity
              key={i}
              onPress={item.action}
              disabled={item.disabled}
              style={[
                styles.actionTile,
                { backgroundColor: colors.card, borderColor: colors.border },
                item.disabled ? { opacity: 0.5 } : null,
              ]}
            >
              {item.loading
                ? <ActivityIndicator size="small" color={Colors.brandGreen} />
                : <Ionicons name={item.icon} size={28} color={isRateLimited && i === 0 ? Colors.warning : Colors.brandGreen} />
              }
              <Text style={[styles.actionLabel, { color: colors.text }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* What's in your air: PM2.5/PM10/NO2/O3, tap for detail (PWA parity) */}
        <ContributingFactorsGrid
          pollutants={pred?.pollutants}
          isDark={isDark}
          colors={colors}
          onSelect={setSelectedPollutant}
        />

        {fact ? (
          <View style={[styles.factCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.factLabel, { color: colors.subtext }]}>{t('home.did_you_know')}</Text>
            <Text style={[styles.factBody, { color: colors.text }]}>{fact}</Text>
          </View>
        ) : null}

      </ScrollView>

      <PollutantDetailSheet
        pollutant={selectedPollutant}
        isDark={isDark}
        colors={colors}
        onClose={() => setSelectedPollutant(null)}
      />
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
    paddingVertical: 12,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wordmark: { fontSize: 16, fontWeight: '800', letterSpacing: 1.5 },
  bellBtn: { position: 'relative', padding: 4 },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  locationText: { fontSize: 17, fontWeight: '700' },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: { flex: 1, fontSize: 13, fontWeight: '500' },
  rateLimitBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rateLimitText: { flex: 1, fontSize: 13, fontWeight: '500' },
  heroCardWrap: { paddingHorizontal: 16, marginBottom: 12 },
  heroCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    justifyContent: 'space-between',
    position: 'relative',
  },
  heroChevron: { position: 'absolute', top: 14, right: 12 },
  pm25Label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 25,
    marginTop: 4,
  },
  aqiRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6, marginBottom: 6 },
  aqiNumber: { fontSize: 24, fontWeight: '800', lineHeight: 28 },
  aqiUnit: { fontSize: 12, fontWeight: '600' },
  locationStamp: { fontSize: 12 },
  statRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  statLabel: { fontSize: 13, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 22, fontWeight: '800' },
  statSub: { fontSize: 14, fontWeight: '500' },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 12,
  },
  actionTile: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
    gap: 8,
    minHeight: 88,
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 14, fontWeight: '700' },
  factCard: { marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 16, borderWidth: 1 },
  factLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  factBody: { fontSize: 16, lineHeight: 24 },
});
