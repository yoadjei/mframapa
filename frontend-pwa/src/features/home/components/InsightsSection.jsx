import { useState } from "react";
import { Wind, Car, Sun, Factory, Flame, Home, AlertTriangle } from "lucide-react";
import { useTranslation } from "../../../hooks/useTranslation.js";
import { cleanGuidanceText } from "../../../utils/cleanGuidanceText.js";

// Matches the icon keys backend/config/personalized_advice.py hands back on
// each advice item — same convention as FACTOR_ICONS on the contributing
// factor cards.
const ADVICE_ICONS = { wind: Wind, car: Car, sun: Sun, factory: Factory, flame: Flame, home: Home, alert: AlertTriangle };

const VISIBLE_CAP = 4;

/** "Kwame, carry your reliever inhaler..." instead of "Carry your reliever
 *  inhaler..." — only the lead item gets the address (repeating a name on
 *  every line reads as a mail-merge, not a person talking to you), and only
 *  for a signed-in user with a real name on file. */
function addressed(text, firstName) {
  if (!firstName) return text;
  return `${firstName}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** Reviewer feedback item 3 + Workstream 3 personalization: the health-based
 *  rules engine (backend/config/personalized_advice.py) replaces the generic
 *  mood line with condition-specific, NO2/O3/SO2/CO-driven advice whenever
 *  there's anything to say — an asthmatic and a guest looking at the same
 *  reading see genuinely different instructions, not the same paragraph
 *  with a label on top. When nothing is elevated there's no advice to
 *  rewrite, so the generic "air is good" mood line still carries that case. */
export function InsightsSection({ pred, colors, firstName }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (!pred) return null;

  const advice = pred.personalizedAdvice ?? [];
  const hasAdvice = advice.length > 0;

  const comparison = pred.comparison;
  const worst = pred.pollutants?.[0];
  const hasComparisonLine = comparison?.pct_vs_week_avg != null;
  const hasWorstLine = worst && worst.severity !== "good" && worst.pct_of_limit != null;

  if (!pred.insight && !hasComparisonLine && !hasWorstLine && !hasAdvice) return null;

  let comparisonLine = null;
  if (hasComparisonLine) {
    const pct = Math.abs(comparison.pct_vs_week_avg);
    if (pct < 5) {
      comparisonLine = t("insight.comparison_similar");
    } else if (comparison.pct_vs_week_avg > 0) {
      comparisonLine = t("insight.comparison_worse", { pct: Math.round(pct) });
    } else {
      comparisonLine = t("insight.comparison_better", { pct: Math.round(pct) });
    }
  }

  const worstLine = hasWorstLine
    ? t("insight.worst_pollutant", { pollutant: worst.short_name, pct: Math.round(worst.pct_of_limit) })
    : null;

  const visibleAdvice = expanded ? advice : advice.slice(0, VISIBLE_CAP);

  return (
    <div className="mf-glass mx-4 mb-3 rounded-2xl p-4" role="status" aria-live="polite">
      <p className="mb-1.5 text-[0.8125rem] font-semibold uppercase tracking-widest" style={{ color: colors.sub }}>
        {t("home.advice_title")}
      </p>

      {hasAdvice ? (
        <ul className="mt-1 flex flex-col gap-2.5">
          {visibleAdvice.map((item, i) => {
            const Icon = ADVICE_ICONS[item.icon] ?? Wind;
            return (
              <li key={item.id} className="flex items-start gap-2.5">
                <Icon size={16} color={colors.text} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold leading-5" style={{ color: colors.text }}>
                    {i === 0 ? addressed(item.text, firstName) : item.text}
                  </p>
                  {item.detail && (
                    <p className="m-0 mt-0.5 text-xs leading-5" style={{ color: colors.sub }}>
                      {item.detail}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        pred.insight && (
          <p className="m-0 text-base leading-6" style={{ color: colors.text }}>
            {cleanGuidanceText(pred.insight)}
          </p>
        )
      )}

      {hasAdvice && advice.length > VISIBLE_CAP && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-bold uppercase tracking-wide"
          style={{ color: colors.sub }}
        >
          {expanded ? t("insight.see_less") : t("insight.see_all", { count: advice.length })}
        </button>
      )}

      {(comparisonLine || worstLine) && (
        <p className="mt-2 text-sm leading-6 m-0" style={{ color: colors.sub }}>
          {[comparisonLine, worstLine].filter(Boolean).join(" ")}
        </p>
      )}

      {pred.personalized && (
        <p className="mt-2 text-sm font-semibold leading-6 m-0" style={{ color: "#FF8C00" }}>
          {t("insight.personalized_category", {
            category: pred.personalized.category,
            reason: pred.personalized.reason,
          })}
        </p>
      )}

      {hasAdvice && (
        <p className="mt-2.5 text-[0.6875rem] leading-4 m-0" style={{ color: colors.muted }}>
          {t("insight.disclaimer")}
        </p>
      )}
    </div>
  );
}
