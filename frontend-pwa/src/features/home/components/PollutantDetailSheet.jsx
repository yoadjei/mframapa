import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "../../../hooks/useTranslation.js";
import { getHistory, getPollutantInfo } from "../../../services/api.js";
import { pollutantSeverityColor } from "../../../utils/colors.js";

const SEVERITY_KEY = {
  good: "pollutant.severity.good",
  moderate: "pollutant.severity.moderate",
  high: "pollutant.severity.high",
  severe: "pollutant.severity.severe",
  hazardous: "pollutant.severity.hazardous",
  unknown: "pollutant.severity.moderate",
};

/** Thin 7-day sparkline — only ever built for PM2.5, the one pollutant the
 *  backend's /history endpoint actually reconstructs. Fabricating a trend
 *  for the other five (no historical series exists for them) would be
 *  exactly the kind of invented data the brief prohibits, so they render
 *  without a chart instead. */
function Sparkline({ days, color }) {
  const values = days.map((d) => d.pm25).filter((v) => v != null);
  if (values.length < 2) return null;

  const w = 280;
  const h = 56;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => ({
    x: pad + i * step,
    y: pad + (1 - (v - min) / span) * (h - pad * 2),
    v,
    date: days[i].date,
  }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${path} L ${points[points.length - 1].x} ${h - pad} L ${points[0].x} ${h - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label="7-day trend">
      <path d={areaPath} fill={color} opacity={0.12} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 3.5 : 2.5} fill={color}>
          <title>{`${p.date}: ${p.v} µg/m³`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function PollutantDetailSheet({ pollutant, city, isDark, colors, onClose }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState(null);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    let active = true;
    getPollutantInfo().then((all) => { if (active) setInfo(all?.[pollutant.code] ?? null); });
    if (pollutant.code === "pm25" && city?.lat != null && city?.lon != null) {
      getHistory(city.lat, city.lon, city.name, 7).then((d) => { if (active) setHistory(d); }).catch(() => {});
    }
    return () => { active = false; };
  }, [pollutant.code, city?.lat, city?.lon, city?.name]);

  const color = pollutantSeverityColor(pollutant.severity, isDark);

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={pollutant.name}
    >
      <div
        className="w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-t-[24px] p-5"
        style={{ backgroundColor: colors.bg }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-black" style={{ color: colors.text }}>
              {pollutant.short_name} · {pollutant.name}
            </p>
            <p className="mt-1 text-sm" style={{ color }}>
              {pollutant.value} {pollutant.unit} — {Math.round(pollutant.pct_of_limit ?? 0)}% {t("pollutant.pct_of_limit")}
              {" · "}
              {t(SEVERITY_KEY[pollutant.severity] ?? SEVERITY_KEY.moderate)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("btn.close") ?? "Close"} className="p-1">
            <X size={22} color={colors.sub} />
          </button>
        </div>

        {history?.length > 1 && (
          <div className="mt-4">
            <p className="mb-1.5 text-[0.75rem] font-semibold uppercase tracking-widest" style={{ color: colors.sub }}>
              {t("pollutant.detail.trend")}
            </p>
            <Sparkline days={history} color={color} />
          </div>
        )}

        {info && (
          <div className="mt-4 flex flex-col gap-4">
            <section>
              <p className="text-[0.75rem] font-semibold uppercase tracking-widest" style={{ color: colors.sub }}>
                {t("pollutant.detail.what_it_is")}
              </p>
              <p className="mt-1 text-[0.9375rem] leading-6" style={{ color: colors.text }}>{info.what_it_is}</p>
            </section>

            <section>
              <p className="text-[0.75rem] font-semibold uppercase tracking-widest" style={{ color: colors.sub }}>
                {t("pollutant.detail.local_sources")}
              </p>
              <ul className="mt-1 list-disc pl-5">
                {(info.local_sources ?? []).map((s) => (
                  <li key={s} className="text-[0.9375rem] leading-6" style={{ color: colors.text }}>{s}</li>
                ))}
              </ul>
            </section>

            <section>
              <p className="text-[0.75rem] font-semibold uppercase tracking-widest" style={{ color: colors.sub }}>
                {t("pollutant.detail.body_effects")}
              </p>
              <p className="mt-1 text-[0.9375rem] leading-6" style={{ color: colors.text }}>{info.body_effects}</p>
            </section>

            <section>
              <p className="text-[0.75rem] font-semibold uppercase tracking-widest" style={{ color: colors.sub }}>
                {t("pollutant.detail.at_risk")}
              </p>
              <p className="mt-1 text-[0.9375rem] leading-6" style={{ color: colors.text }}>
                {(info.at_risk_groups ?? []).join(" · ")}
              </p>
            </section>

            <section className="rounded-2xl border p-3.5" style={{ borderColor: color + "40", backgroundColor: color + (isDark ? "1c" : "12") }}>
              <p className="text-[0.75rem] font-semibold uppercase tracking-widest" style={{ color }}>
                {t("pollutant.detail.actions")}
              </p>
              <ul className="mt-1 list-disc pl-5">
                {(info.actions_by_severity?.[pollutant.severity] ?? info.actions_by_severity?.moderate ?? []).map((a) => (
                  <li key={a} className="text-[0.9375rem] leading-6 font-medium" style={{ color: colors.text }}>{a}</li>
                ))}
              </ul>
            </section>

            <p className="text-[0.75rem]" style={{ color: colors.muted }}>
              {t("pollutant.detail.sources")}: {(info.citations ?? []).join(" · ")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
