import React, { Suspense, useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useAppState } from "../state/appState.jsx";
import { useOnlineStatus } from "../hooks/useOnlineStatus.js";
import { useInstallPrompt } from "../hooks/useInstallPrompt.js";
import { InstallHomeScreenPrompt } from "../components/pwa/InstallHomeScreenPrompt.jsx";
import {
  NotificationPermissionSheet,
  hasSeenPushPrompt,
} from "../components/pwa/NotificationPermissionSheet.jsx";
import { getNotificationPermission } from "../services/browserNotifications.js";
import { StackChromeContext } from "../hooks/useStackChrome.js";
import { CloudRainBackground } from "../components/background/CloudRainBackground.jsx";
import { NetworkBanner } from "../components/feedback/NetworkBanner.jsx";
import { MobileShell } from "../components/layout/MobileShell.jsx";
import { OnboardingScreen } from "../features/onboarding/OnboardingScreen.jsx";
import { AuthScreen } from "../features/auth/AuthScreen.jsx";
import { HomeScreen } from "../features/home/HomeScreen.jsx";
import { SearchScreen } from "../features/search/SearchScreen.jsx";
import { ProfileScreen } from "../features/profile/ProfileScreen.jsx";
import { SettingsScreen } from "../features/settings/SettingsScreen.jsx";
import { NotificationsScreen } from "../features/notifications/NotificationsScreen.jsx";
import { ActivityScreen } from "../features/activity/ActivityScreen.jsx";
import { PreviewGallery } from "../features/preview/PreviewGallery.jsx";
import { preloadCityPack } from "../services/cityPackService.js";
import { trackAppOpen } from "../services/analytics.js";
import { restoreSession, onAuthChange } from "../services/authService.js";
import { useHardwareBack } from "../hooks/useHardwareBack.js";
const CHUNK_RELOAD_KEY = "mframapa:chunk-reload";

// ── Lazy load helpers (hoisted; used by the React.lazy() declarations below) ─
function fallback(name) {
  return () => ({
    default: function ComingSoon() {
      const dark = document.documentElement.classList.contains("dark");
      return (
        <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 px-8 text-center">
          <div className="h-12 w-12 rounded-full" style={{ backgroundColor: "rgba(0,200,150,0.12)" }}>
            <span style={{ fontSize: "1.75rem", lineHeight: "48px" }}>🌿</span>
          </div>
          <p className="font-semibold" style={{ color: dark ? "#FFFFFF" : "#0F1419" }}>{name}</p>
          <p className="text-sm" style={{ color: dark ? "#9AA7B5" : "#5C6B7A" }}>
            This screen could not load. Pull to refresh.
          </p>
        </div>
      );
    },
  });
}

/** One reload on stale chunk (old SW → new deploy), then show fallback. */
function lazyScreen(importer, name) {
  return React.lazy(() =>
    importer()
      .then((mod) => {
        try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* ignore */ }
        return mod;
      })
      .catch(() => {
        try {
          if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
            sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
            window.location.reload();
            return new Promise(() => {});
          }
        } catch { /* private mode */ }
        return fallback(name)();
      })
  );
}

// ── Tab screens ─────────────────────────────────────────────────────────────
// Map stays lazy (Mapbox). Primary tabs are eager so tab switches stay snappy.
const CoreFeatureScreen = lazyScreen(
  () => import("../features/core/CoreFeatureScreen.jsx").then((m) => ({ default: m.CoreFeatureScreen })),
  "Map",
);

// ── Stack screens ───────────────────────────────────────────────────────────
const CityDetailScreen = lazyScreen(
  () => import("../features/cityDetail/CityDetailScreen.jsx").then((m) => ({ default: m.CityDetailScreen })),
  "City Detail",
);
const HealthRiskScreen = lazyScreen(
  () => import("../features/healthRisk/HealthRiskScreen.jsx").then((m) => ({ default: m.HealthRiskScreen })),
  "Health Risk",
);
const LanguageSelectorScreen = lazyScreen(
  () => import("../features/language/LanguageSelectorScreen.jsx").then((m) => ({ default: m.LanguageSelectorScreen })),
  "Language",
);
const SavedLocationsScreen = lazyScreen(
  () => import("../features/savedLocations/SavedLocationsScreen.jsx").then((m) => ({ default: m.SavedLocationsScreen })),
  "Saved Locations",
);
const HealthProfileScreen = lazyScreen(
  () => import("../features/healthProfile/HealthProfileScreen.jsx").then((m) => ({ default: m.HealthProfileScreen })),
  "Health Profile",
);
const AIInsightsScreen = lazyScreen(
  () => import("../features/aiInsights/AIInsightsScreen.jsx").then((m) => ({ default: m.AIInsightsScreen })),
  "AI Insights",
);
const PredictionDashboardScreen = lazyScreen(
  () => import("../features/predictionDashboard/PredictionDashboardScreen.jsx").then((m) => ({ default: m.PredictionDashboardScreen })),
  "Prediction Dashboard",
);
const CountryExplorerScreen = lazyScreen(
  () => import("../features/countryExplorer/CountryExplorerScreen.jsx").then((m) => ({ default: m.CountryExplorerScreen })),
  "Country Explorer",
);
const CompareCitiesScreen = lazyScreen(
  () => import("../features/compareCities/CompareCitiesScreen.jsx").then((m) => ({ default: m.CompareCitiesScreen })),
  "Compare Cities",
);
const TrustTransparencyScreen = lazyScreen(
  () => import("../features/trust/TrustTransparencyScreen.jsx").then((m) => ({ default: m.TrustTransparencyScreen })),
  "Trust & Transparency",
);
const ExportCentreScreen = lazyScreen(
  () => import("../features/export/ExportCentreScreen.jsx").then((m) => ({ default: m.ExportCentreScreen })),
  "Export Centre",
);
const FeedbackFormScreen = lazyScreen(
  () => import("../features/feedback/FeedbackFormScreen.jsx").then((m) => ({ default: m.FeedbackFormScreen })),
  "Feedback",
);
const AboutLegalScreen = lazyScreen(
  () => import("../features/about/AboutLegalScreen.jsx").then((m) => ({ default: m.AboutLegalScreen })),
  "About & Legal",
);
const AnomalyAlertScreen = lazyScreen(
  () => import("../features/anomaly/AnomalyAlertScreen.jsx").then((m) => ({ default: m.AnomalyAlertScreen })),
  "Anomaly Alert",
);
const DeleteAccountScreen = lazyScreen(
  () => import("../features/deleteAccount/DeleteAccountScreen.jsx").then((m) => ({ default: m.DeleteAccountScreen })),
  "Delete Account",
);
const ErrorScreen = lazyScreen(
  () => import("../features/system/ErrorScreen.jsx").then((m) => ({ default: m.ErrorScreen })),
  "Error",
);
const OfflineCityPickerScreen = lazyScreen(
  () => import("../features/system/OfflineCityPickerScreen.jsx").then((m) => ({ default: m.OfflineCityPickerScreen })),
  "Offline Cities",
);

// ── Screen name → component maps ─────────────────────────────────────────────
const TAB_SCREENS = {
  home: HomeScreen,
  core: CoreFeatureScreen,
  activity: ActivityScreen,
  search: SearchScreen,
  notifications: NotificationsScreen,
  profile: ProfileScreen,
  settings: SettingsScreen,
};

const STACK_SCREENS = {
  auth:                AuthScreen,   // optional sign-in, opened from Profile
  cityDetail:          CityDetailScreen,
  healthRisk:          HealthRiskScreen,
  languageSelector:    LanguageSelectorScreen,
  savedLocations:      SavedLocationsScreen,
  healthProfile:       HealthProfileScreen,
  aiInsights:          AIInsightsScreen,
  predictionDashboard: PredictionDashboardScreen,
  countryExplorer:     CountryExplorerScreen,
  compareCities:       CompareCitiesScreen,
  trust:               TrustTransparencyScreen,
  trustTransparency:   TrustTransparencyScreen,
  exportCentre:        ExportCentreScreen,
  feedback:            FeedbackFormScreen,
  feedbackForm:        FeedbackFormScreen,
  about:               AboutLegalScreen,
  aboutLegal:          AboutLegalScreen,
  anomalyAlert:        AnomalyAlertScreen,
  deleteAccount:       DeleteAccountScreen,
  error:               ErrorScreen,
  offlineCityPicker:   OfflineCityPickerScreen,
  // These tab screens are also reachable as stack screens (from "+" and Profile menus)
  // so the global back button appears on them.
  activity:      ActivityScreen,
  settings:      SettingsScreen,
  notifications: NotificationsScreen,
  search:        SearchScreen,
};

function ScreenSuspense({ children }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] items-center justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-app-green border-t-transparent" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

const IS_PREVIEW =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview");

export function App() {
  const { state: { onboardingComplete, ui, preferences }, dispatch } = useAppState();
  const isOnline = useOnlineStatus();
  const {
    canInstall,
    promptInstall,
    showBanner: showInstallBanner,
    dismiss: dismissInstall,
    isIos: isIosInstall,
  } = useInstallPrompt({
    // Wait until onboarding finishes so the sheet doesn't cover first-run slides.
    autoPrompt: onboardingComplete,
  });

  // Re-render when OS theme flips so "system" preference stays consistent with CSS.
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const isDark =
    preferences.theme === "dark" ||
    (preferences.theme === "system" && systemDark);

  const [pushPromptOpen, setPushPromptOpen] = useState(false);

  // once per load, before auth — drives installs / WAU / retention
  useEffect(() => {
    trackAppOpen();
  }, []);

  // Soft push explainer after onboarding + install sheet (never cold-prompt OS).
  useEffect(() => {
    if (!onboardingComplete || showInstallBanner) return undefined;
    if (hasSeenPushPrompt()) return undefined;
    if (getNotificationPermission() !== "default") return undefined;
    const timer = window.setTimeout(() => setPushPromptOpen(true), 2800);
    return () => window.clearTimeout(timer);
  }, [onboardingComplete, showInstallBanner]);

  // supabase persists the session; restore it on load and follow sign-in/out so a
  // signed-in user is not dropped back to the start screen on every relaunch.
  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then((restored) => {
        if (!cancelled && restored) {
          dispatch({ type: "RESTORE_SESSION", payload: restored });
          // Confirm-signup / returning session: one-shot Welcome via Resend.
          import("../services/api.js").then((m) => m.requestWelcomeEmail()).catch(() => undefined);
        }
      })
      .catch(() => undefined);

    const unsubscribe = onAuthChange((s) => {
      if (s?.access_token) {
        dispatch({
          type: "RESTORE_SESSION",
          payload: {
            token: s.access_token,
            user: {
              id: s.user?.id,
              email: s.user?.email,
              fullName: s.user?.user_metadata?.full_name ?? s.user?.email,
            },
          },
        });
        import("../services/api.js").then((m) => m.requestWelcomeEmail()).catch(() => undefined);
      } else {
        dispatch({ type: "LOGOUT" });
      }
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [dispatch]);

  // City pack is public — preload for guests and signed-in users alike.
  useEffect(() => {
    if (!isOnline) return;
    preloadCityPack().catch(() => undefined);
  }, [isOnline]);

  // Warm common stack chunks after first paint so Profile links open without a spinner.
  useEffect(() => {
    if (!onboardingComplete) return;
    const warm = () => {
      import("../features/savedLocations/SavedLocationsScreen.jsx");
      import("../features/export/ExportCentreScreen.jsx");
      import("../features/feedback/FeedbackFormScreen.jsx");
      import("../features/about/AboutLegalScreen.jsx");
      import("../features/trust/TrustTransparencyScreen.jsx");
      import("../features/predictionDashboard/PredictionDashboardScreen.jsx");
      import("../features/cityDetail/CityDetailScreen.jsx");
    };
    const ric = window.requestIdleCallback || ((cb) => setTimeout(cb, 400));
    const id = ric(warm);
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, [onboardingComplete]);

  // hooks must run on every render before any early return (rules of hooks)

  // the phone back button and gestures pop the screen stack instead of leaving
  useHardwareBack(ui.screenStack.length, dispatch);

  const ActiveTab = useMemo(
    () => TAB_SCREENS[ui.activeScreen] ?? HomeScreen,
    [ui.activeScreen]
  );

  if (IS_PREVIEW) return <PreviewGallery isOnline={isOnline} />;

  // ── Top of screenStack overrides the tab view (no tab bar) ────────────────
  const stackTop = ui.screenStack[ui.screenStack.length - 1] ?? null;
  const StackScreen = stackTop ? (STACK_SCREENS[stackTop.name] ?? null) : null;

  return (
    <>
      <CloudRainBackground isDark={isDark} />

      <div style={{ position: "relative", zIndex: 1 }}>
        <NetworkBanner isOnline={isOnline} />

        {/* air quality is free for everyone, so there is no sign-in wall: after
            onboarding you land straight in the app. signing in is optional and
            reached from Profile (it unlocks saved places, alerts and sync). */}
        {!onboardingComplete ? (
          <OnboardingScreen canInstall={canInstall} onInstall={promptInstall} />
        ) : StackScreen ? (
          // Flexible stack chrome: header (safe-area + back) + scrollable body.
          // Avoids a fixed overlay that covers titles and traps scroll on Android.
          <div
            className="mf-screen"
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100dvh",
              maxHeight: "100dvh",
              // Transparent so CloudRainBackground matches iOS (icons show through).
              backgroundColor: "transparent",
            }}
          >
            <header
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                paddingTop: "env(safe-area-inset-top)",
                paddingLeft: 8,
                paddingRight: 8,
                minHeight: "calc(env(safe-area-inset-top) + 52px)",
                backgroundColor: "transparent",
                borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
              }}
            >
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  window.history.back();
                }}
                aria-label="Go back"
                style={{
                  width: 44,
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 22,
                  backgroundColor: "transparent",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"}`,
                  cursor: "pointer",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <ChevronLeft size={22} color={isDark ? "#FFFFFF" : "#0F1419"} />
              </button>
            </header>

            <div
              data-testid="stack-scroll"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
              }}
            >
              <StackChromeContext.Provider value={true}>
                <ScreenSuspense>
                  <StackScreen isOnline={isOnline} params={stackTop.params} isDark={isDark} />
                </ScreenSuspense>
              </StackChromeContext.Provider>
            </div>
          </div>
        ) : (
          <MobileShell canInstall={canInstall} onInstall={promptInstall} isDark={isDark}>
            <ScreenSuspense>
              <ActiveTab isOnline={isOnline} isDark={isDark} />
            </ScreenSuspense>
          </MobileShell>
        )}

        {/* Auto-triggers once the browser marks the PWA installable (or on iOS). */}
        <InstallHomeScreenPrompt
          open={showInstallBanner && !pushPromptOpen}
          onInstall={promptInstall}
          onDismiss={dismissInstall}
          isIos={isIosInstall}
          isDark={isDark}
        />

        <NotificationPermissionSheet
          open={pushPromptOpen}
          onClose={() => setPushPromptOpen(false)}
          isDark={isDark}
        />
      </div>
    </>
  );
}
