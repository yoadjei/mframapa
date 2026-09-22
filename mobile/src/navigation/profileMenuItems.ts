import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Screens pushed on the Profile stack — shown on the Profile tab (PWA parity). */
export type ProfileMenuItem = {
  id: string;
  labelKey: string;
  screen: string;
};

/** FAB “+” menu — matches PWA GlassTabBar MORE_ITEMS (Search / Alerts / Activity / Settings). */
export type FabMoreItem = {
  id: string;
  labelKey: string;
  icon: IoniconName;
  /** Tab route name, or Profile stack screen when `viaProfile` is true. */
  route: string;
  viaProfile?: boolean;
};

/** Full product link list on Profile (same order as PWA ALL_MENU_ITEMS). */
export const PROFILE_MENU_ITEMS: ProfileMenuItem[] = [
  { id: 'settings', labelKey: 'screen.profile.link_settings', screen: 'Settings' },
  { id: 'health', labelKey: 'health_profile.title', screen: 'HealthProfile' },
  { id: 'saved', labelKey: 'screen.profile.link_saved_locations', screen: 'SavedLocations' },
  { id: 'activity', labelKey: 'screen.profile.link_activity_feed', screen: 'ActivityFeed' },
  { id: 'ai', labelKey: 'screen.profile.link_ai_insights', screen: 'AIInsights' },
  { id: 'prediction', labelKey: 'screen.profile.link_prediction', screen: 'PredictionDashboard' },
  { id: 'country', labelKey: 'screen.profile.link_country', screen: 'CountryExplorer' },
  { id: 'compare', labelKey: 'screen.profile.link_compare', screen: 'CompareCities' },
  { id: 'trust', labelKey: 'screen.profile.link_trust', screen: 'TrustTransparency' },
  { id: 'export', labelKey: 'screen.profile.link_export', screen: 'ExportCentre' },
  { id: 'about', labelKey: 'screen.profile.link_about', screen: 'AboutLegal' },
  { id: 'feedback', labelKey: 'screen.profile.link_feedback', screen: 'FeedbackForm' },
];

/** PWA-parity FAB: quick nav. Alerts/notifications live on the Home bell only. */
export const FAB_MORE_ITEMS: FabMoreItem[] = [
  { id: 'search', labelKey: 'tab.search', icon: 'search-outline', route: 'Search' },
  {
    id: 'activity',
    labelKey: 'screen.profile.link_activity_feed',
    icon: 'pulse-outline',
    route: 'ActivityFeed',
    viaProfile: true,
  },
  {
    id: 'settings',
    labelKey: 'tab.settings',
    icon: 'settings-outline',
    route: 'Settings',
    viaProfile: true,
  },
];
