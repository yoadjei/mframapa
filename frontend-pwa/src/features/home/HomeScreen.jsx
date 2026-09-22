import { Bell, ChevronDown, MapPin, Navigation, Search, AlertTriangle, Clock, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppState } from "../../state/appState.jsx";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useTranslation } from "../../hooks/useTranslation.js";
import { fetchCityPrediction, fetchPredictionAtCoords } from "../../services/predictionService.js";
import { getDailyFact } from "../../services/api.js";
import {
  getNotificationPermission,
  showBrowserNotification,
} from "../../services/browserNotifications.js";

function localCalendarDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
import { MframapaLogo } from "../../components/brand/MframapaLogo.jsx";
import { getAQIColor, aqiSymbol, resolveIsDark, getColors } from "../../utils/colors.js";
import { ContributingFactorsGrid } from "./components/ContributingFactorsGrid.jsx";
import { PollutantDetailSheet } from "./components/PollutantDetailSheet.jsx";
import { InsightsSection } from "./components/InsightsSection.jsx";

// ── AQI helpers ───────────────────────────────────────────────────────────────

function aqiCategoryKey(category) {
  const c = (category ?? "").toLowerCase();
  if (c === "good")            return "aqi.good";
  if (c === "moderate")        return "aqi.moderate";
  if (c.includes("sensitive")) return "aqi.sensitive";
  if (c === "unhealthy")       return "aqi.unhealthy";
  return "aqi.hazardous";
}

// Animated count-up for the PM2.5 number
function useCountUp(target, duration = 600) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    if (target == null) { setDisplay(0); return; }
    const start = performance.now();
    const from = 0;
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      setDisplay(Math.round(from + (target - from) * p));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return display;
}

// ── Screen ─────────────────────────────────────────────────────────────────

export function HomeScreen({ isOnline, isDark: isDarkProp }) {
  const { state, dispatch } = useAppState();
  const { navigate } = useNavigation();
  const { t } = useTranslation();
  // Prefer App-resolved theme so CSS class + inline colors stay in lockstep.
  const isDark =
    typeof isDarkProp === "boolean"
      ? isDarkProp
      : resolveIsDark(state.preferences.theme);

  const [loading, setLoading]     = useState(false);
  const [locating, setLocating]   = useState(false);
  const [error, setError]         = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [selectedPollutant, setSelectedPollutant] = useState(null);

  const displayNum = useCountUp(prediction?.pm25 ?? null);

  const themeColors = getColors(isDark);
  const colors = {
    card:    themeColors.card,
    cardAlt: themeColors.cardAlt,
    border:  themeColors.border,
    text:    themeColors.text,
    sub:     themeColors.subtext,
    muted:   themeColors.muted,
    bg:      themeColors.bg,
  };

  // Offline: show the last saved reading instead of an empty "--" hero.
  useEffect(() => {
    if (isOnline) return;
    const s = state.homeSummary;
    if (s?.pm25 == null || !s?.city) return;
    setPrediction((prev) => {
      if (prev?.pm25 != null) return prev;
      return {
        city: { name: s.city, lat: s.lat, lon: s.lon },
        pm25: s.pm25,
        category: s.aqiCategory,
        aqi_category: s.aqiCategory,
        degraded: Boolean(s.degraded),
        timestamp: s.lastUpdated,
        insight: null,
        cached: true,
      };
    });
  }, [isOnline, state.homeSummary]);

  // Auto-fetch on mount if city is known
  useEffect(() => {
    if (!isOnline) return;
    const { city, lat, lon } = state.homeSummary ?? {};
    if (!city && lat == null) { handleLocate(); return; }   // first run: ask the device
    let active = true;
    setLoading(true);
    const language = state.preferences.language ?? "en";
    const request = lat != null && lon != null
      ? fetchPredictionAtCoords(lat, lon, language)
      : fetchCityPrediction(city, language);
    request
      .then((r) => { if (active) { setPrediction(r); updateSummary(r); } })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, state.homeSummary?.city, state.preferences.language]);

  // the same fact that goes out as the daily push, so home + inbox never disagree.
  const [fact, setFact] = useState("");
  useEffect(() => {
    let active = true;
    const lang = state.preferences.language ?? "en";
    getDailyFact(lang)
      .then(async (f) => {
        if (!active || !f) return;
        setFact(f);

        // Once per local calendar day: in-app Alerts tip + optional browser banner.
        const day = localCalendarDate();
        const seenKey = `mframapa:daily-fact-seen:${day}`;
        if (localStorage.getItem(seenKey)) return;

        const tipOn = state.preferences.notifPrefs?.tip !== false;
        const masterOn = state.preferences.notificationsEnabled !== false;
        if (!masterOn || !tipOn) return;

        const title = t("home.did_you_know");
        dispatch({
          type: "ADD_NOTIFICATION",
          payload: {
            id: `daily-fact-${day}`,
            type: "tip",
            title,
            subtitle: f,
            message: f,
            read: false,
            createdAt: new Date().toISOString(),
          },
        });
        localStorage.setItem(seenKey, "1");

        if (getNotificationPermission() === "granted") {
          showBrowserNotification({ title, body: f, tag: `daily-fact-${day}` });
        }
      })
      .catch(() => {});
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.preferences.language]);

  function updateSummary(r) {
    dispatch({
      type: "SET_HOME_SUMMARY",
      payload: {
        city: r.city?.name,
        lat: r.city?.lat,
        lon: r.city?.lon,
        pm25: r.pm25,
        aqiCategory: r.category,
        degraded: r.degraded,
        lastUpdated: r.timestamp,
      },
    });
  }

  // a neutral starting city so the home screen always shows a real reading even
  // when we have no location. the user can search their own city at any time.
  const FALLBACK_CITY = { name: "Accra", lat: 5.6, lon: -0.19 };
  async function loadFallbackCity() {
    try {
      setLoading(true);
      const r = await fetchPredictionAtCoords(
        FALLBACK_CITY.lat, FALLBACK_CITY.lon, state.preferences.language ?? "en"
      );
      setPrediction(r);
      updateSummary(r);
    } catch {
      /* offline or backend down — leave the empty state */
    } finally {
      setLoading(false);
    }
  }

  function handleLocate() {
    if (!navigator.geolocation) { setError(t("error.geolocation_unsupported")); loadFallbackCity(); return; }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const { latitude, longitude } = coords;
          setLoading(true);
          // fetchCityPrediction only ever accepted (name, language): the extra
          // coordinates were silently dropped and the coordinate string was then
          // looked up as a city name, which always failed. that is why granting
          // location changed nothing and the default city stayed on screen.
          const r = await fetchPredictionAtCoords(latitude, longitude, state.preferences.language ?? "en");
          setPrediction(r);
          updateSummary(r);
        } catch {
          setError(t("error.generic"));
          if (!prediction) loadFallbackCity();
        } finally {
          setLocating(false);
          setLoading(false);
        }
      },
      () => {
        setLocating(false);
        setError(t("pwa.core.location_permission"));
        // location refused or unavailable: show a starting city so home is not
        // blank, and let the banner invite the user to pick their own.
        if (!prediction) loadFallbackCity();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  const pred = prediction;
  const aqiColor = pred ? getAQIColor(pred.aqi_category ?? pred.category, isDark) : "#00C896";
  const unreadCount = state.notifications?.filter((n) => !n.read).length ?? 0;

  return (
    <div className="flex flex-col mf-tab-gap min-h-[100dvh]" style={{ backgroundColor: "transparent" }}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3">
          <MframapaLogo size="sm" isDark={isDark} markOnly />
          <button
            type="button"
            onClick={() => dispatch({ type: "NAVIGATE", payload: { name: "notifications", params: {} } })}
            className="relative p-1"
            aria-label={t("a11y.notifications", { count: unreadCount })}
          >
            <Bell size={26} color={colors.text} aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.6875rem] font-bold text-white"
                style={{ backgroundColor: "#E53935" }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* ── Location chip ── */}
        <button
          type="button"
          onClick={() => dispatch({ type: "NAVIGATE", payload: { name: "search", params: {} } })}
          className="mx-4 mb-3 flex items-center gap-2 self-start rounded-full border px-4 py-2.5"
          style={{ backgroundColor: colors.card, borderColor: colors.border }}
          aria-label={t("home.select_city")}
        >
          <MapPin size={20} color="#00C896" aria-hidden="true" />
          <span className="text-base font-bold" style={{ color: colors.text }}>
            {pred?.city?.name ?? state.homeSummary?.city ?? t("home.select_city")}
          </span>
          <ChevronDown size={18} color={colors.sub} aria-hidden="true" />
        </button>

        {/* ── Offline banner — only claim a cached reading when we actually have one ── */}
        {!isOnline && (
          <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl border px-3 py-2.5"
            style={{
              backgroundColor: isDark ? "#F5C51818" : "#F5C51828",
              borderColor: isDark ? "#F5C51840" : "#C9A00655",
              color: isDark ? "#F5C518" : "#8B6E06",
            }}>
            <AlertTriangle size={15} />
            <span className="text-sm font-medium">
              {(prediction?.pm25 != null || state.homeSummary?.pm25 != null)
                ? t("offline.cached_data")
                : t("offline.no_cache")}
            </span>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl border px-3 py-3"
            style={{ backgroundColor: "#E5393518", borderColor: "#E5393540", color: "#E53935" }}>
            <AlertTriangle size={16} />
            <span className="flex-1 text-sm font-medium">{error}</span>
          </div>
        )}

        {/* ── AQI Hero card ── */}
        <div className="mx-4 mb-3">
          <button
            type="button"
            disabled={!pred}
            onClick={() => {
              if (!pred) return;
              const city = pred.city ?? {
                name: pred.location?.name ?? state.homeSummary?.city,
                lat: pred.lat ?? pred.location?.lat ?? state.homeSummary?.lat,
                lon: pred.lon ?? pred.location?.lon ?? state.homeSummary?.lon,
              };
              navigate("cityDetail", { prediction: pred, city });
            }}
            className="mf-press relative w-full rounded-2xl border p-3.5 text-left"
            aria-label={
              pred
                ? t("a11y.reading_summary", {
                    city: pred.city?.name ?? "",
                    pm25: (pred.pm25 ?? 0).toFixed(0),
                    category: t(aqiCategoryKey(pred.aqi_category ?? pred.category)),
                  })
                : t("a11y.reading_pending")
            }
            style={{
              backgroundColor: pred ? aqiColor + (isDark ? "22" : "14") : colors.card,
              borderColor:     pred ? aqiColor + (isDark ? "45" : "40") : colors.border,
            }}
          >
            {/* Status first — category is the primary signal */}
            <p className="text-[0.6875rem] font-semibold uppercase tracking-widest" style={{ color: colors.sub }}>
              {t("home.air_now")}
            </p>

            {pred ? (
              <p
                className="mt-1 font-black leading-tight"
                style={{ fontSize: "1.25rem", color: aqiColor }}
              >
                <span aria-hidden="true" style={{ marginRight: 6 }}>
                  {aqiSymbol(pred.aqi_category ?? pred.category)}
                </span>
                {t(aqiCategoryKey(pred.aqi_category ?? pred.category))}
              </p>
            ) : (
              <p className="mt-1 font-black leading-tight" style={{ fontSize: "1.25rem", color: colors.sub }}>
                —
              </p>
            )}

            {/* PM2.5 secondary */}
            <div className="mt-1.5 flex items-baseline gap-1.5 flex-wrap">
              <span
                aria-hidden="true"
                className="font-bold leading-none tabular-nums"
                style={{ fontSize: "1.5rem", color: colors.text }}
              >
                {pred ? (loading ? "…" : displayNum) : "--"}
              </span>
              <span className="text-xs font-semibold" style={{ color: colors.sub }}>
                µg/m³ PM2.5
              </span>
              {(pred?.degraded || state.homeSummary?.degraded) && (
                <span
                  className="rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold"
                  style={{
                    backgroundColor: colors.cardAlt,
                    color: colors.subtext,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  {t("home.degraded_badge")}
                </span>
              )}
            </div>

            {/* Location + time stamp */}
            <p className="mt-2 text-xs" style={{ color: colors.sub }}>
              {pred
                ? `${pred.city?.name ?? ""} | ${t("card.today") ?? "Today"}, ${new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
                : t("home.tap_check") ?? "Tap Check to get started"}
            </p>

            {pred && (
              <ChevronRight
                size={18}
                color={colors.sub}
                style={{ position: "absolute", top: 14, right: 12 }}
                aria-hidden="true"
              />
            )}
          </button>
        </div>

        {selectedPollutant && (
          <PollutantDetailSheet
            pollutant={selectedPollutant}
            city={pred?.city}
            isDark={isDark}
            colors={colors}
            onClose={() => setSelectedPollutant(null)}
          />
        )}

        {/* ── What to do ── */}
        <InsightsSection
          pred={pred}
          colors={colors}
          firstName={state.session?.authenticated ? state.profile.firstName : undefined}
        />

        {/* ── Action tiles ── */}
        <div className="mx-4 mb-3 flex gap-2.5">
          {[
            {
              icon: Navigation,
              label: locating ? "…" : (t("home.action_check") ?? "Check"),
              action: handleLocate,
              loading: loading || locating,
              color: "#00C896",
            },
            {
              icon: Search,
              label: t("tab.search") ?? "Search",
              action: () => dispatch({ type: "NAVIGATE", payload: { name: "search", params: {} } }),
              loading: false,
              color: "#00C896",
            },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={item.action}
                disabled={item.loading}
                className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border py-4 active:opacity-70 disabled:opacity-50"
                style={{ backgroundColor: colors.card, borderColor: colors.border, minHeight: 88 }}
              >
                {item.loading
                  ? <span className="h-7 w-7 animate-spin rounded-full border-2 border-app-green border-t-transparent" />
                  : <Icon size={28} color={item.color} aria-hidden="true" />
                }
                <span className="text-sm font-bold" style={{ color: colors.text }}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── What's in your air: PM2.5/PM10/NO2/O3, tap for detail ── */}
        <ContributingFactorsGrid
          pollutants={pred?.pollutants}
          isDark={isDark}
          colors={colors}
          onSelect={setSelectedPollutant}
        />

        {/* ── Did you know ── */}
        {fact && (
          <div className="mf-glass mx-4 mb-3 rounded-2xl p-4">
            <p
              className="mb-1.5 text-[0.8125rem] font-semibold uppercase tracking-widest"
              style={{ color: colors.sub }}
            >
              {t("home.did_you_know")}
            </p>
            <p className="text-[0.9375rem] leading-6 m-0" style={{ color: colors.text }}>
              {fact}
            </p>
          </div>
        )}

    </div>
  );
}
