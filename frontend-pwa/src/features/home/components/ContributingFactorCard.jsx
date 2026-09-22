import { useEffect, useState } from "react";
import { Car, Sun, Factory, Flame } from "lucide-react";
import { useTranslation } from "../../../hooks/useTranslation.js";
import { usePrefersReducedMotion } from "../../../hooks/usePrefersReducedMotion.js";
import { factorFillColor, factorFillRgba, factorStatusKey } from "../../../utils/colors.js";
import { FACTOR_TINY_LABEL_KEY } from "./contributingFactors.config.js";

// Same real-world association as the app's other pollutant icons (see
// PollutantDetailSheet's health copy) — traffic makes NO2, sunlight drives
// ground-level ozone, factories/generators make SO2, flame is incomplete
// combustion (CO).
const FACTOR_ICONS = { no2: Car, o3: Sun, so2: Factory, co: Flame };

/** Fills left-to-right from empty on mount (skipped under reduced motion).
 *  Scaled 0–100% of the WHO limit — the bar is full exactly at the limit,
 *  and stays full (plus the pulsing glow) for anything further over it. */
function Gauge({ pct, color, trackColor, reduceMotion, glowStrong, glowWeak }) {
  const targetWidth = pct == null ? 0 : Math.max(0, Math.min(pct, 100));
  const [display, setDisplay] = useState(reduceMotion ? targetWidth : 0);

  useEffect(() => {
    if (reduceMotion) { setDisplay(targetWidth); return; }
    setDisplay(0);
    // Two RAFs: the first lets the 0-width frame actually paint, so the
    // second one's change to `targetWidth` is a transition, not a jump-cut.
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => setDisplay(targetWidth));
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, [targetWidth, reduceMotion]);

  const over100 = pct != null && pct > 100;

  return (
    <div
      className={over100 ? "mf-factor-glow" : undefined}
      style={{
        "--mf-glow-strong": glowStrong,
        "--mf-glow-weak": glowWeak,
        position: "relative",
        height: 5,
        borderRadius: 3,
        backgroundColor: trackColor,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: `${display}%`,
          borderRadius: 3,
          backgroundColor: color,
          transition: reduceMotion ? "none" : "width 800ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
    </div>
  );
}

/** One "What's in your air" card. Severity lives in the number, the status
 *  word, and the gauge fill — never in a flat colour wash over the whole
 *  card, so the grid reads as data rather than four traffic lights. */
export function ContributingFactorCard({ pollutant, isDark, colors, onTap }) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();

  if (!pollutant || pollutant.value == null) {
    return (
      <div
        className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border p-2 opacity-60"
        style={{ backgroundColor: colors.cardAlt, borderColor: colors.border }}
      >
        <span className="text-[0.6875rem] font-bold" style={{ color: colors.sub }}>
          {t("factor.no_data")}
        </span>
      </div>
    );
  }

  const pct = pollutant.pct_of_limit;
  const color = factorFillColor(pct, isDark);
  const Icon = FACTOR_ICONS[pollutant.code] ?? Car;

  return (
    <button
      type="button"
      onClick={() => onTap(pollutant)}
      className="mf-press flex aspect-square flex-col justify-between rounded-xl border p-2.5 text-left"
      style={{ backgroundColor: colors.card, borderColor: colors.border }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Icon size={12} color={colors.sub} aria-hidden="true" />
          <p className="truncate text-[0.6875rem] font-bold leading-none" style={{ color: colors.text }}>
            {pollutant.short_name}
          </p>
        </div>
        <p className="mt-1 truncate text-[0.5625rem] font-semibold" style={{ color: colors.sub }}>
          {t(FACTOR_TINY_LABEL_KEY[pollutant.code])}
        </p>
      </div>

      <div>
        <span className="block text-xl font-black leading-none tabular-nums" style={{ color }}>
          {pct != null ? Math.min(Math.round(pct), 100) : "--"}
          <span className="text-[0.625rem] font-bold">%</span>
        </span>
        <span className="mt-0.5 block truncate text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color }}>
          {t(factorStatusKey(pct))}
        </span>
        <div
          className="mt-1.5"
          role="progressbar"
          aria-label={`${pollutant.short_name} ${t("pollutant.pct_of_limit")}`}
          aria-valuenow={pct != null ? Math.min(Math.round(pct), 100) : 0}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <Gauge
            pct={pct}
            color={color}
            trackColor={colors.border}
            reduceMotion={reduceMotion}
            glowStrong={factorFillRgba(pct, isDark, 0.5)}
            glowWeak={factorFillRgba(pct, isDark, 0)}
          />
        </div>
      </div>
    </button>
  );
}
