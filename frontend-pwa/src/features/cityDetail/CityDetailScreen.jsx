import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Share,
  Sparkles,
} from "lucide-react";
import { useAppState } from "../../state/appState.jsx";
import { useTranslation } from "../../hooks/useTranslation.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { getColors, Colors, getAQIColor, aqiCategoryFromPm25 } from "../../utils/colors.js";
import { factorEntries } from "../../utils/factors.js";
import { cleanGuidanceText } from "../../utils/cleanGuidanceText.js";
import { aqiCategoryKey } from "../../utils/i18nHelpers.js";
import { generateInsight, getHistory } from "../../services/api.js";
import { PrimaryButton } from "../../components/ui/PrimaryButton.jsx";
import { StackBackButton } from "../../components/navigation/StackBackButton.jsx";
import { isDegradedPrediction } from "../healthRisk/deriveHealthRisks.js";

const TREND_DAY_KEYS = [
  "screen.city_detail.day_mon",
  "screen.city_detail.day_tue",
  "screen.city_detail.day_wed",
  "screen.city_detail.day_thu",
  "screen.city_detail.day_fri",
  "screen.city_detail.day_sat",
  "screen.city_detail.day_sun",
];

function healthAdviceKey(category) {
  const lower = (category || "").toLowerCase();
  if (lower.includes("hazardous")) return "advice.hazardous";
  if (lower.includes("very")) return "advice.very_unhealthy";
  if (lower.includes("unhealthy") && !lower.includes("sensitive")) return "advice.unhealthy";
  if (lower.includes("sensitive")) return "advice.sensitive";
  if (lower.includes("moderate")) return "advice.moderate";
  return "advice.good";
}

// Sparkline bar chart for the 7-day trend — per-day AQI colour (not one wash).
function TrendChart({ data, labels, isDark, labelColor, valueColor, weekendIndices = [] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height: 148 }}>
      {data.map((val, i) => {
        const dayColor = getAQIColor(aqiCategoryFromPm25(val), isDark);
        const isWeekend = weekendIndices.includes(i);
        return (
          <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1.5">
            <span
              className="text-[0.8125rem] font-semibold tabular-nums"
              style={{ color: valueColor ?? labelColor }}
            >
              {Math.round(val)}
            </span>
            <div
              className="w-full rounded-sm"
              style={{
                height: `${Math.max(10, Math.round((val / max) * 88))}px`,
                backgroundColor: dayColor,
                opacity: isWeekend ? 1 : 0.92,
                outline: isWeekend ? `2px solid ${dayColor}` : undefined,
                outlineOffset: 1,
              }}
            />
            <span
              className="text-[0.8125rem] font-medium"
              style={{ color: labelColor, fontWeight: isWeekend ? 700 : 500 }}
            >
              {labels[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function CityDetailScreen({ isDark, params }) {
  const { state, dispatch } = useAppState();
  const { t } = useTranslation();
  const { goBack, navigate } = useNavigation();
  const colors = getColors(isDark);
  const language = state.preferences?.language ?? "en";

  // params comes from the stack: { city: {...}, prediction: {...} }
  const prediction = params?.prediction ?? null;
  const city = params?.city ?? prediction?.city ?? null;

  const pm25 = prediction?.pm25 ?? 0;
  const category = prediction?.category ?? prediction?.aqi_category ?? "good";
  const uncertainty = prediction?.uncertainty ?? null;
  const factorList = factorEntries(prediction?.factors);
  const aqiColor = getAQIColor(category, isDark);
  // Soft light wash (avoid olive/yellow slab); dark keeps richer tint.
  const headerWashTop = isDark ? `${aqiColor}CC` : `${aqiColor}33`;
  const headerWashMid = isDark ? `${aqiColor}66` : `${aqiColor}14`;
  const chromeColor = isDark ? "#FFFFFF" : colors.text;
  const categoryLabel = t(aqiCategoryKey(category));
  const healthAdvice = cleanGuidanceText(t(healthAdviceKey(category)));
  const trendLabels = TREND_DAY_KEYS.map((key) => t(key));
  // real recent days rather than multipliers applied to today's number
  const [trendData, setTrendData] = useState([]);
  const [trendWeekendIdx, setTrendWeekendIdx] = useState([]);
  useEffect(() => {
    const lat = city?.lat, lon = city?.lon;
    if (lat == null || lon == null) { setTrendData([]); setTrendWeekendIdx([]); return; }
    let cancelled = false;
    getHistory(lat, lon, city?.name ?? "Unknown", 7)
      .then((days) => {
        if (cancelled) return;
        setTrendData(days.map((d) => Math.round(d.pm25)));
        setTrendWeekendIdx(
          days
            .map((d, i) => {
              const wd = d.date ? new Date(d.date).getDay() : -1;
              return wd === 0 || wd === 6 ? i : -1;
            })
            .filter((i) => i >= 0)
        );
      })
      .catch(() => { if (!cancelled) { setTrendData([]); setTrendWeekendIdx([]); } });
    return () => { cancelled = true; };
  }, [city?.lat, city?.lon, city?.name]);
  const cityName = city?.name ?? "";
  const displayName = cityName.split(",")[0].trim();

  const updatedAt = prediction?.timestamp
    ? new Date(prediction.timestamp).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  // Save city state
  const savedCities = state.savedCities ?? [];
  const isSaved = savedCities.some(
    (c) =>
      c.name === displayName ||
      (city &&
        Math.abs((c.lat ?? 0) - city.lat) < 0.01 &&
        Math.abs((c.lon ?? 0) - city.lon) < 0.01)
  );
  const [saving, setSaving] = useState(false);

  // AI Insight state — seed from params so we don't needlessly refetch
  const [insight, setInsight] = useState(() => prediction?.insight ?? undefined);
  const [insightLoading, setInsightLoading] = useState(false);
  const insightFetchedForRef = useRef(null);

  // Fetch insight when prediction changes and no insight is already present
  useEffect(() => {
    const locKey = city ? `${city.lat.toFixed(4)}:${city.lon.toFixed(4)}` : null;
    if (prediction?.insight) {
      setInsight(prediction.insight);
      insightFetchedForRef.current = locKey;
      return undefined;
    }
    if (!prediction || insightFetchedForRef.current === locKey) return undefined;
    insightFetchedForRef.current = locKey;

    let cancelled = false;
    const run = async () => {
      setInsightLoading(true);
      try {
        const text = await generateInsight({
          pm25: prediction.pm25,
          aqi_category: prediction.category ?? prediction.aqi_category,
          weather: prediction.weather ?? {},
          language,
          lat: city?.lat,
          lon: city?.lon,
        });
        if (!cancelled) setInsight(text);
      } catch {
        // leave insight undefined
      } finally {
        if (!cancelled) setInsightLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city?.lat, city?.lon, prediction?.insight]);

  function handleSave() {
    if (!city || isSaved || saving) return;
    setSaving(true);
    const name = displayName || cityName;
    dispatch({
      type: "SAVE_CITY",
      payload: {
        name,
        lat: city.lat,
        lon: city.lon,
        country: city.country ?? "",
        lastPm25: Math.round(pm25),
        lastAqiCategory: category,
        lastChecked: new Date().toLocaleString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        }),
      },
    });
    if (state.session?.authenticated) {
      import("../../services/api.js").then((m) =>
        m.saveLocationRemote({ name, lat: city.lat, lon: city.lon, country: city.country ?? "" })
      );
    }
    setSaving(false);
  }

  async function handleShare() {
    const text = `${cityName} air quality is ${categoryLabel}. PM2.5: ${Math.round(pm25)} μg/m³ — Mframapa AI`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Mframapa AI", text, url: "https://mframapaai.health/" });
      } catch {
        /* user cancelled */
      }
    } else {
      await navigator.clipboard.writeText(text);
    }
  }

  if (!prediction) {
    return (
      <>
        {/* Safe area spacer */}
        <div style={{ height: "env(safe-area-inset-top)" }} />
        <div
          className="flex flex-col items-center justify-center gap-4 px-6 py-16"
          style={{ backgroundColor: "transparent" }}
        >
          <p className="text-center text-[0.9375rem]" style={{ color: colors.subtext }}>
            {t("home.tap_check")}
          </p>
          <PrimaryButton label={t("common.back")} onClick={goBack} />
        </div>
      </>
    );
  }

  return (
    <div
      className="min-h-[100dvh] overflow-y-auto"
      style={{
        backgroundColor: "transparent",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 100px)",
      }}
    >
      {/* ── Gradient header (mirrors mobile LinearGradient + paddingTop: insets.top) ── */}
      <div
        style={{
          background: `linear-gradient(180deg, ${headerWashTop} 0%, ${headerWashMid} 55%, transparent 100%)`,
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div
          className="flex items-center justify-between px-4 pb-4"
          style={{ paddingTop: 12 }}
        >
          <StackBackButton
            onClick={goBack}
            color={chromeColor}
            variant="chevron"
            ariaLabel={t("common.go_back")}
          />

          {/* City name */}
          <h1
            className="flex-1 text-center text-[1.125rem] font-bold"
            style={{ color: chromeColor }}
          >
            {cityName}
          </h1>

          {/* Share button */}
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center justify-end active:opacity-60"
            style={{ minWidth: 60 }}
            aria-label={t("screen.share.title")}
          >
            {/* Lucide Share (nodes) — same glyph family as mobile share-social-outline */}
            <Share size={22} color={chromeColor} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* ── AQI block (mirrors mobile aqiBlock) ── */}
      <div className="flex flex-col gap-1.5 px-6 py-6" style={{ backgroundColor: aqiColor + "18" }}>
        {isDegradedPrediction(prediction) ? (
          <div
            className="mb-2 flex items-start gap-2 rounded-xl border px-3 py-2.5"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
          >
            <AlertTriangle size={18} color={colors.subtext} style={{ marginTop: 2, flexShrink: 0 }} />
            <p className="m-0 text-sm leading-snug" style={{ color: colors.text }}>
              {t("screen.city_detail.degraded_banner")}
            </p>
          </div>
        ) : null}
        <p className="mb-1 text-[0.75rem]" style={{ color: colors.subtext }}>
          {t("screen.city_detail.updated_at", { time: updatedAt })}
        </p>
        <p className="text-[0.8125rem] font-medium" style={{ color: colors.subtext }}>
          {t("screen.city_detail.pm25_concentration")}
        </p>
        <div className="mt-1 flex items-end gap-4">
          {/* Big PM2.5 number */}
          <span
            className="text-[3.5rem] font-black"
            style={{ color: colors.text, lineHeight: "60px" }}
          >
            {Math.round(pm25)}
          </span>
          <div className="flex flex-col gap-2 pb-2">
            <span className="text-[0.8125rem] font-semibold" style={{ color: colors.subtext }}>
              {t("unit.ug_m3")}
            </span>
            {/* AQI badge */}
            <span
              className="rounded-full px-3 py-1 text-[0.75rem] font-bold text-white"
              style={{ backgroundColor: aqiColor }}
            >
              {categoryLabel}
            </span>
          </div>
        </div>
        {uncertainty ? (
          <p className="mt-1 text-[0.8125rem]" style={{ color: colors.subtext }}>
            {t("screen.city_detail.uncertainty_range")}:{" "}
            {uncertainty.pm25_lower.toFixed(0)}–{uncertainty.pm25_upper.toFixed(0)}{" "}
            {t("unit.ug_m3")}
          </p>
        ) : null}
      </div>


      {/* ── AI Insights section header ── */}
      <div className="mt-2 flex items-center gap-2 px-4 pb-1">
        <Sparkles size={18} color={Colors.brandGreen} />
        <span className="text-[1rem] font-bold" style={{ color: colors.text }}>
          {t("screen.city_detail.ai_insights_section")}
        </span>
      </div>

      {/* ── Primary insight card ── */}
      <div
        className="mx-4 mb-3 mt-1 flex flex-col gap-2.5 rounded-2xl border p-4"
        style={{ backgroundColor: colors.card, borderColor: colors.border }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={18} color={Colors.brandGreen} />
          <span className="text-[0.875rem] font-semibold" style={{ color: colors.text }}>
            {t("card.insight_title")}
          </span>
        </div>
        {insightLoading ? (
          <div className="flex items-center gap-2.5 py-2">
            <Loader2 size={16} color={Colors.brandGreen} className="animate-spin" />
            <span className="flex-1 text-[0.875rem]" style={{ color: colors.subtext }}>
              {t("screen.city_detail.insight_loading")}
            </span>
          </div>
        ) : insight ? (
          <p className="text-[0.9375rem] leading-relaxed" style={{ color: colors.text }}>
            {cleanGuidanceText(insight)}
          </p>
        ) : (
          <p className="text-[0.9375rem] leading-relaxed" style={{ color: colors.subtext }}>
            {t("screen.ai_insights.no_insights_yet")}
          </p>
        )}
      </div>

      {/* ── 7-day trend: estimated PM2.5 (µg/m³) for each of the last 7 days ── */}
      {trendData.length > 1 ? (
        <div
          className="mx-4 mb-3 flex flex-col gap-2.5 rounded-2xl border p-4"
          style={{ backgroundColor: colors.card, borderColor: colors.border }}
        >
          <p className="text-[0.875rem] font-semibold" style={{ color: colors.text }}>
            {t("screen.city_detail.trend_7d")}
          </p>
          <p className="m-0 text-[0.75rem] leading-snug" style={{ color: colors.subtext }}>
            {t("screen.city_detail.trend_7d_hint")}
          </p>
          <TrendChart
            data={trendData}
            labels={trendLabels}
            isDark={isDark}
            labelColor={colors.subtext}
            valueColor={colors.text}
            weekendIndices={trendWeekendIdx}
          />
        </div>
      ) : null}

      {/* ── Contributing factors (API dict → readable rows) ── */}
      {factorList.length > 0 ? (
        <div
          className="mx-4 mb-3 flex flex-col gap-2.5 rounded-2xl border p-4"
          style={{ backgroundColor: colors.card, borderColor: colors.border }}
        >
          <p className="text-[0.875rem] font-semibold" style={{ color: colors.text }}>
            {t("card.factors_title")}
          </p>
          <ul className="flex flex-col gap-2">
            {factorList.slice(0, 6).map((factor) => (
              <li key={factor.key} className="flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: Colors.brandGreen }}
                />
                <span
                  className="text-[0.875rem] capitalize"
                  style={{ color: colors.text }}
                >
                  {factor.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}


      {/* ── Health guidance ── */}
      <div
        className="mx-4 mb-3 flex flex-col gap-2.5 rounded-2xl border p-4"
        style={{ backgroundColor: colors.card, borderColor: colors.border }}
      >
        <p className="text-[0.875rem] font-semibold" style={{ color: colors.subtext }}>
          {t("card.health_guidance")}
        </p>
        <p className="text-[0.9375rem] font-medium leading-relaxed" style={{ color: colors.text }}>
          {healthAdvice}
        </p>
        <button
          type="button"
          onClick={() => navigate("healthRisk", { prediction })}
          className="mt-1 flex items-center gap-1 active:opacity-60"
        >
          <span className="text-[0.875rem] font-semibold" style={{ color: Colors.brandGreen }}>
            {t("screen.city_detail.view_health_risk")}
          </span>
          <ChevronRight size={16} color={Colors.brandGreen} />
        </button>
      </div>

      {/* ── Save city (mirrors mobile saveSection) ── */}
      <div className="mx-4 mt-2 mb-3">
        {isSaved ? (
          <div
            className="flex items-center justify-center gap-2 rounded-full border px-5 py-4"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
          >
            <CheckCircle2 size={22} color={Colors.brandGreen} />
            <span className="text-[0.9375rem] font-semibold" style={{ color: colors.text }}>
              {t("screen.city_detail.saved")}
            </span>
          </div>
        ) : (
          <PrimaryButton
            label={t("screen.city_detail.save")}
            onClick={handleSave}
            loading={saving}
          />
        )}
      </div>
    </div>
  );
}
