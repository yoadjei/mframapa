import React, { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GlassTabBar } from '../components/navigation/GlassTabBar';

import { useStore } from '../store/useStore';
import { useTranslation } from '../hooks/useTranslation';

// Onboarding
import { SplashScreen } from '../screens/onboarding/SplashScreen';
import { OnboardingSlidesScreen } from '../screens/onboarding/OnboardingSlidesScreen';
import { PermissionsScreen } from '../screens/onboarding/PermissionsScreen';
import { LoginScreen } from '../screens/onboarding/LoginScreen';
import { SignUpScreen } from '../screens/onboarding/SignUpScreen';
import { ForgotPasswordScreen } from '../screens/onboarding/ForgotPasswordScreen';

// Core tab screens
import { HomeScreen } from '../screens/HomeScreen';
import { MapScreen } from '../screens/MapScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { AlertsScreen } from '../screens/AlertsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';

// Shared detail screens
import { CityDetailScreen } from '../screens/CityDetailScreen';
import { HealthRiskScreen } from '../screens/HealthRiskScreen';

// Profile stack screens
import { SettingsScreen } from '../screens/SettingsScreen';
import { HealthProfileScreen } from '../screens/HealthProfileScreen';
import { SavedLocationsScreen } from '../screens/SavedLocationsScreen';
import { ActivityFeedScreen } from '../screens/ActivityFeedScreen';
import { AIInsightsScreen } from '../screens/AIInsightsScreen';
import { PredictionDashboardScreen } from '../screens/PredictionDashboardScreen';
import { CountryExplorerScreen } from '../screens/CountryExplorerScreen';
import { CompareCitiesScreen } from '../screens/CompareCitiesScreen';
import { AnomalyAlertScreen } from '../screens/AnomalyAlertScreen';
import { TrustTransparencyScreen } from '../screens/TrustTransparencyScreen';
import { ExportCentreScreen } from '../screens/ExportCentreScreen';
import { LanguageSelectorScreen } from '../screens/LanguageSelectorScreen';
import { DeleteAccountScreen } from '../screens/DeleteAccountScreen';
import { AboutLegalScreen } from '../screens/AboutLegalScreen';
import { LegalDetailScreen } from '../screens/LegalDetailScreen';
import { FeedbackFormScreen } from '../screens/FeedbackFormScreen';

// System screens
import { OfflineCityPickerScreen } from '../screens/system/OfflineCityPickerScreen';
import { ErrorScreen } from '../screens/system/ErrorScreen';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const stackScreenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: 'transparent' as const },
};

// ─── Home Stack ───────────────────────────────────────────────────────────────
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="CityDetail" component={CityDetailScreen} />
      <Stack.Screen name="HealthRisk" component={HealthRiskScreen} />
      <Stack.Screen name="AIInsights" component={AIInsightsScreen} />
      <Stack.Screen name="PredictionDashboard" component={PredictionDashboardScreen} />
      <Stack.Screen name="AnomalyAlert" component={AnomalyAlertScreen} />
    </Stack.Navigator>
  );
}

// ─── Map Stack ────────────────────────────────────────────────────────────────
function MapStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="MapMain" component={MapScreen} />
      <Stack.Screen name="CityDetail" component={CityDetailScreen} />
      {/* CityDetail's "view health risk breakdown" link needs this here too —
          CityDetail is reachable from every tab, so HealthRisk must be. */}
      <Stack.Screen name="HealthRisk" component={HealthRiskScreen} />
    </Stack.Navigator>
  );
}

// ─── Search Stack ─────────────────────────────────────────────────────────────
function SearchStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="SearchMain" component={SearchScreen} />
      <Stack.Screen name="CityDetail" component={CityDetailScreen} />
      <Stack.Screen name="HealthRisk" component={HealthRiskScreen} />
    </Stack.Navigator>
  );
}

// ─── Alerts Stack ─────────────────────────────────────────────────────────────
function AlertsStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="AlertsMain" component={AlertsScreen} />
    </Stack.Navigator>
  );
}

// ─── Profile Stack ────────────────────────────────────────────────────────────
function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      {/* Guest → account: same auth screens as onboarding, without flipping the root tree */}
      <Stack.Screen name="Login" children={() => <LoginScreen />} />
      <Stack.Screen name="SignUp" children={() => <SignUpScreen />} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="HealthProfile" component={HealthProfileScreen} />
      <Stack.Screen name="SavedLocations" component={SavedLocationsScreen} />
      <Stack.Screen name="CityDetail" component={CityDetailScreen} />
      <Stack.Screen name="HealthRisk" component={HealthRiskScreen} />
      <Stack.Screen name="ActivityFeed" component={ActivityFeedScreen} />
      <Stack.Screen name="AIInsights" component={AIInsightsScreen} />
      <Stack.Screen name="PredictionDashboard" component={PredictionDashboardScreen} />
      <Stack.Screen name="CountryExplorer" component={CountryExplorerScreen} />
      <Stack.Screen name="CompareCities" component={CompareCitiesScreen} />
      <Stack.Screen name="TrustTransparency" component={TrustTransparencyScreen} />
      <Stack.Screen name="ExportCentre" component={ExportCentreScreen} />
      <Stack.Screen name="LanguageSelector" component={LanguageSelectorScreen} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
      <Stack.Screen name="AboutLegal" component={AboutLegalScreen} />
      <Stack.Screen name="LegalDetail" component={LegalDetailScreen} />
      <Stack.Screen name="FeedbackForm" component={FeedbackFormScreen} />
      <Stack.Screen name="OfflineCityPicker" component={OfflineCityPickerScreen} />
      <Stack.Screen name="Error" component={ErrorScreen} />
    </Stack.Navigator>
  );
}

// ─── Main Tab Navigator ───────────────────────────────────────────────────────
function MainApp() {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={stackScreenOptions}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{ tabBarLabel: t('tab.home') }}
      />
      <Tab.Screen
        name="Map"
        component={MapStack}
        options={{ tabBarLabel: t('tab.map') }}
      />
      <Tab.Screen
        name="Search"
        component={SearchStack}
        options={{ tabBarButton: () => null }}
      />
      <Tab.Screen
        name="Alerts"
        component={AlertsStack}
        options={{ tabBarButton: () => null }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ tabBarLabel: t('tab.profile') }}
      />
    </Tab.Navigator>
  );
}

// ─── Onboarding Stack ─────────────────────────────────────────────────────────
// Deliberately no auth step: the app is usable as a guest, and sign-in /
// sign-up are optional, reachable only from Profile (see ProfileStack above)
// — never a gate on first open. Matches frontend-pwa's OnboardingScreen.jsx.
function OnboardingNavigator({ onDone }: { onDone: () => void }) {
  type Phase = 'splash' | 'slides' | 'permissions';
  const [phase, setPhase] = useState<Phase>('splash');

  if (phase === 'splash') {
    return <SplashScreen onDone={() => setPhase('slides')} />;
  }
  if (phase === 'slides') {
    return <OnboardingSlidesScreen onDone={() => setPhase('permissions')} />;
  }
  return <PermissionsScreen onAllow={onDone} onSkip={onDone} />;
}

// ─── Root Navigator ───────────────────────────────────────────────────────────
export function AppNavigator() {
  const hasCompletedOnboarding = useStore((s) => s.hasCompletedOnboarding);
  const completeOnboarding = useStore((s) => s.completeOnboarding);

  if (!hasCompletedOnboarding) {
    return <OnboardingNavigator onDone={completeOnboarding} />;
  }

  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="MainApp" component={MainApp} />
      <Stack.Screen name="OfflineCityPicker" component={OfflineCityPickerScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Error" component={ErrorScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
