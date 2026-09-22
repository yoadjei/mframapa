import { useTranslation } from "../../../hooks/useTranslation.js";

/** The reviewer's core ask: within 3 seconds, know why today's air matters.
 *  Built entirely from real numbers already on the prediction (pollutants[]
 *  from the backend's WHO-limit math) — never a hardcoded "take care" line. */
export function HeroHeadline({ pred, colors }) {
  const { t } = useTranslation();
  const pm25 = pred?.pollutants?.find((p) => p.code === "pm25");
  if (!pm25 || pm25.pct_of_limit == null) return null;

  if (pm25.severity === "good") {
    return (
      <p className="mt-1.5 text-[0.8125rem] leading-5" style={{ color: colors.sub }}>
        {t("insight.safe_today")}
      </p>
    );
  }

  const multiple = (pm25.pct_of_limit / 100).toFixed(1);
  const cigs = pm25.cigarette_equivalent;

  return (
    <p className="mt-1.5 text-[0.8125rem] leading-5" style={{ color: colors.text }}>
      <span className="font-bold">{t("insight.pct_of_limit_headline", { multiple })}</span>
      {cigs != null && (
        <>
          {" "}
          {t("insight.cigarette_equivalent", { count: cigs })}
        </>
      )}
    </p>
  );
}
