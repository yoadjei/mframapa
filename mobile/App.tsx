import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { useStore } from './src/store/useStore';
import { AppNavigator } from './src/navigation/AppNavigator';
import { navigationRef, navigate } from './src/navigation/navigationRef';
import { CloudRainBackground } from './src/components/CloudRainBackground';
import { AppBackgroundColors } from './src/theme/background';
import { TextScaledRoot } from './src/theme/TextScaledRoot';
import { loadBootTheme, type BootTheme } from './src/theme/bootTheme';
import { useTheme } from './src/hooks/useTheme';
import { getAfricanCities } from './src/services/cities';
import { saveCities } from './src/services/offline';
import {
  getPermissionStatus,
  getAndRegisterPushToken,
  addNotificationListener,
  addNotificationResponseListener,
  pushPayloadToInbox,
} from './src/services/notifications';
import {
  NotificationPermissionSheet,
  hasSeenPushPrompt,
} from './src/components/NotificationPermissionSheet';
import { syncLocaleInBackground } from './src/services/translation';
import { trackAppOpen } from './src/services/analytics';
import { initSentry } from './src/services/sentry';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';

initSentry();   // crash reporting before anything renders

export default function App() {
  const { isDark } = useTheme();
  const hasCompletedOnboarding = useStore((s) => s.hasCompletedOnboarding);
  const offlineCities = useStore((s) => s.offlineCities);
  const setOfflineCities = useStore((s) => s.setOfflineCities);
  const lastPrediction = useStore((s) => s.lastPrediction);
  const language = useStore((s) => s.language);
  const alertsEnabled = useStore((s) => s.alertsEnabled);
  const addNotification = useStore((s) => s.addNotification);
  const textScale = useStore((s) => s.textScale);
  const [pushPromptOpen, setPushPromptOpen] = useState(false);
  const [boot, setBoot] = useState<BootTheme | null>(null);
  const [storeHydrated, setStoreHydrated] = useState(() => useStore.persist.hasHydrated());

  // PWA-style pre-paint theme: hold the shell until AsyncStorage theme is known.
  useEffect(() => {
    let cancelled = false;
    loadBootTheme().then((theme) => {
      if (!cancelled) setBoot(theme);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (useStore.persist.hasHydrated()) {
      setStoreHydrated(true);
      return undefined;
    }
    return useStore.persist.onFinishHydration(() => setStoreHydrated(true));
  }, []);

  // Cap OS Dynamic Type so in-app textScale (TextScaledRoot) owns the size step.
  useEffect(() => {
    const defaults = { allowFontScaling: true, maxFontSizeMultiplier: 1.35 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Text as any).defaultProps = { ...(Text as any).defaultProps, ...defaults };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (TextInput as any).defaultProps = { ...(TextInput as any).defaultProps, ...defaults };
  }, []);

  useEffect(() => {
    trackAppOpen();   // installs / WAU / retention
    // Always hydrate from the bundled catalog so usual climate fields stay current.
    const cities = getAfricanCities();
    setOfflineCities(cities);
    saveCities(cities).catch(() => undefined);
  }, []);

  // Mirror OS push (episode alerts + Did you know) into the in-app Alerts inbox.
  useEffect(() => {
    function ingest(content: { title?: string | null; body?: string | null; data?: Record<string, unknown> | null }) {
      addNotification(pushPayloadToInbox(content));
    }
    const received = addNotificationListener((notification) => {
      ingest(notification?.request?.content ?? {});
    });
    const response = addNotificationResponseListener((res) => {
      const content = res?.notification?.request?.content ?? {};
      ingest(content);
      const data = (content.data ?? {}) as Record<string, unknown>;
      const type = String(data.type ?? '');
      // Episode pushes open the anomaly screen; tips land in Alerts.
      if (type === 'alert' || data.city) {
        navigate('MainApp', {
          screen: 'Home',
          params: {
            screen: 'AnomalyAlert',
            params: {
              alert: {
                title: content.title,
                description: content.body,
                area: data.city,
              },
            },
          },
        });
      } else {
        navigate('MainApp', { screen: 'Alerts' });
      }
    });
    return () => {
      received.remove();
      response.remove();
    };
  }, [addNotification]);

  // Register push token only when OS permission is already granted.
  // Do not cold-prompt on mount — NotificationSettingsSheet owns the prompt.
  const alertLat = lastPrediction?.location.lat;
  const alertLon = lastPrediction?.location.lon;
  useEffect(() => {
    if (!alertsEnabled) return;
    if (alertLat == null || alertLon == null) return;
    async function initPush() {
      const status = await getPermissionStatus();
      if (status === 'granted') await getAndRegisterPushToken(alertLat, alertLon);
    }
    initPush().catch(() => undefined);
  }, [alertLat, alertLon, alertsEnabled]);

  // Background OTA translation sync — refreshes the server-side locale bundle
  // whenever the app language changes so strings stay current without blocking the UI.
  useEffect(() => {
    syncLocaleInBackground(language).catch(() => undefined);
  }, [language]);

  // Soft push explainer after the user reaches the main app (never cold OS prompt).
  useEffect(() => {
    if (!hasCompletedOnboarding) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      if (await hasSeenPushPrompt()) return;
      const status = await getPermissionStatus();
      if (status === 'undetermined') setPushPromptOpen(true);
    }, 2800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hasCompletedOnboarding]);

  // Prefer boot theme until zustand finishes rehydrate (avoids dark→light flash).
  const resolvedDark = storeHydrated ? isDark : (boot?.isDark ?? true);
  const shellBg = resolvedDark ? AppBackgroundColors.dark : AppBackgroundColors.light;

  const navTheme = resolvedDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: 'transparent',
          card: '#171E28',
          text: '#FFFFFF',
          border: '#2A3441',
          primary: '#00C896',
          notification: '#00C896',
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: 'transparent',
          card: '#FFFFFF',
          text: '#0F1419',
          border: '#D4DAE3',
          primary: '#00C896',
          notification: '#00C896',
        },
      };

  // First frame: solid boot color (no CloudRain / nav) until theme is known.
  if (!boot) {
    return <View style={[styles.shell, { backgroundColor: shellBg }]} />;
  }

  return (
    <AppErrorBoundary>
    <SafeAreaProvider>
      <View style={[styles.shell, { backgroundColor: shellBg }]}>
        <CloudRainBackground />
        <TextScaledRoot scale={textScale}>
          <View style={styles.nav}>
            <NavigationContainer
              ref={navigationRef}
              key={hasCompletedOnboarding ? 'main' : 'onboarding'}
              theme={navTheme}
            >
              <AppNavigator />
              <StatusBar style={resolvedDark ? 'light' : 'dark'} />
            </NavigationContainer>
          </View>
        </TextScaledRoot>
        <NotificationPermissionSheet
          visible={pushPromptOpen}
          onClose={() => setPushPromptOpen(false)}
        />
      </View>
    </SafeAreaProvider>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  nav: { flex: 1, backgroundColor: 'transparent' },
});
