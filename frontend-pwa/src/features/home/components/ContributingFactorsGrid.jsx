import { useEffect, useState } from "react";
import { useTranslation } from "../../../hooks/useTranslation.js";
import { formatRelativeTime } from "../../../utils/time.js";
import { ContributingFactorCard } from "./ContributingFactorCard.jsx";
import { FACTOR_ORDER, MAX_FACTOR_CARDS } from "./contributingFactors.config.js";

/** "What's in your air" — up to 4 square, fixed-priority-order cards between
 *  the AQI hero card and "What to do". A card whose data failed to load
 *  still renders (greyed, "No data") so the grid never reflows. */
export function ContributingFactorsGrid({ pollutants, isDark, colors, onSelect }) {
  const { t } = useTranslation();

  // Ticks once a minute so "Updated Xm ago" doesn't go stale while the
  // screen stays open.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!pollutants?.length) return null;

  const byCode = new Map(pollutants.map((p) => [p.code, p]));
  const shown = FACTOR_ORDER.slice(0, MAX_FACTOR_CARDS).map((code) => byCode.get(code) ?? null);

  const latestUpdate = shown
    .filter(Boolean)
    .map((p) => p.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="mx-4 mb-3">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[0.8125rem] font-semibold uppercase tracking-widest" style={{ color: colors.sub }}>
          {t("factor.section_title")}
        </p>
        {latestUpdate && (
          <p className="text-[0.6875rem] font-medium" style={{ color: colors.muted }}>
            {t("factor.updated", { time: formatRelativeTime(latestUpdate) })}
          </p>
        )}
      </div>

      <div className="grid max-w-[380px] grid-cols-2 gap-2 sm:grid-cols-4">
        {shown.map((pollutant, i) => (
          <ContributingFactorCard
            key={pollutant?.code ?? FACTOR_ORDER[i]}
            pollutant={pollutant}
            isDark={isDark}
            colors={colors}
            onTap={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
