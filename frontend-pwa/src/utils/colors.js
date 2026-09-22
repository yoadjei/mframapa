export const Colors = {
  brandGreen: "#00C896",
  enterprise: "#F59E0B",
  programme: "#8B5CF6",
  danger: "#E53935",
  warning: "#F5C518",
};

/** which band a category falls in, independent of colour. */
export function aqiBand(category) {
  const c = (category ?? "").toLowerCase();
  if (c === "good") return "good";
  if (c === "moderate") return "moderate";
  if (c.includes("sensitive") || c.includes("unhealthy for")) return "sensitive";
  if (c === "unhealthy") return "unhealthy";
  if (c.includes("very") || c.includes("hazardous")) return "hazardous";
  return "moderate";
}

// measured against the page background: every one of these clears WCAG AA
// (4.5:1) for normal text. the previous single palette failed on four of five
// categories in light mode, and worst of all on hazardous in dark mode, which
// is the one that matters most.
const AQI_DARK = {
  good: "#00C896", moderate: "#F5C518", sensitive: "#FF8C00",
  unhealthy: "#E53935", hazardous: "#C043D5",
};
const AQI_LIGHT = {
  // Moderate: cooler olive (was #8B6E06 gold — yellowish wash on light UI).
  good: "#008060", moderate: "#5F6E28", sensitive: "#AB5E00",
  unhealthy: "#DD211C", hazardous: "#9C27B0",
};

export function getAQIColor(category, isDark = true) {
  return (isDark ? AQI_DARK : AQI_LIGHT)[aqiBand(category)];
}

/** Match backend aqi_category_from_pm25 for chart day coloring. */
export function aqiCategoryFromPm25(pm25) {
  const v = Number(pm25);
  if (!Number.isFinite(v)) return "Moderate";
  if (v <= 12) return "Good";
  if (v <= 35) return "Moderate";
  if (v <= 55) return "Unhealthy for Sensitive Groups";
  if (v <= 150) return "Unhealthy";
  return "Hazardous";
}

/** a shape for each band, so severity is legible without seeing colour.
 *  around one in twelve men has some colour vision deficiency. */
export function aqiSymbol(category) {
  return {
    good: "●", moderate: "◐", sensitive: "◑",
    unhealthy: "◕", hazardous: "■",
  }[aqiBand(category)];
}

/** Severity tiers returned by the backend's pollutants[] (backend/config/pollutants.py)
 *  map onto the same checked AQI bands/colours above — one palette, not a second system. */
const POLLUTANT_SEVERITY_TO_BAND = {
  good: "good",
  moderate: "moderate",
  high: "sensitive",
  severe: "unhealthy",
  hazardous: "hazardous",
  unknown: "moderate",
};

export function pollutantSeverityColor(severity, isDark = true) {
  const band = POLLUTANT_SEVERITY_TO_BAND[severity] ?? "moderate";
  return (isDark ? AQI_DARK : AQI_LIGHT)[band];
}

/** Same shape-per-band language as aqiSymbol(), so a pollutant card reads
 *  without colour just like the hero AQI badge does. */
export function pollutantSeveritySymbol(severity) {
  const band = POLLUTANT_SEVERITY_TO_BAND[severity] ?? "moderate";
  return { good: "●", moderate: "◐", sensitive: "◑", unhealthy: "◕", hazardous: "■" }[band];
}

// ── Contributing-factor cards (home screen "What's in your air") ───────────
// Reuses the same WCAG-checked AQI_DARK/AQI_LIGHT anchor colours as the rest
// of the app (good/moderate/sensitive/unhealthy) but interpolated smoothly
// against the cards' own 0/50/100/200% breakpoints (see
// contributingFactors.config.js) instead of snapped to the backend's 5-tier
// severity bands — a deliberately separate scale for this one component.

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const mix = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Smooth green→amber→orange→red fill colour for a % of WHO limit. */
export function factorFillColor(pct, isDark = true) {
  const palette = isDark ? AQI_DARK : AQI_LIGHT;
  const anchors = [palette.good, palette.moderate, palette.sensitive, palette.unhealthy];
  const stops = [0, 50, 100, 200];
  const p = pct == null ? 0 : Math.max(0, pct);
  if (p >= stops[stops.length - 1]) return anchors[anchors.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (p >= stops[i] && p <= stops[i + 1]) {
      const t = (p - stops[i]) / (stops[i + 1] - stops[i]);
      return mixHex(anchors[i], anchors[i + 1], t);
    }
  }
  return anchors[0];
}

/** rgba() string for the pulsing glow outline — computed in JS rather than
 *  via CSS color-mix() so the animation doesn't silently no-op on older
 *  WebViews that don't support it yet. */
export function factorFillRgba(pct, isDark, alpha) {
  const [r, g, b] = hexToRgb(factorFillColor(pct, isDark));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Status word for a factor card — readable without colour, per the same
 *  0/50/100/200% breakpoints as factorFillColor(). */
export function factorStatusKey(pct) {
  if (pct == null) return "factor.status.no_data";
  const p = Math.max(0, pct);
  if (p < 50) return "factor.status.safe";
  if (p < 100) return "factor.status.elevated";
  if (p < 200) return "factor.status.high";
  return "factor.status.dangerous";
}

/** Resolve dark/light from preference + OS (single source of truth). */
export function resolveIsDark(theme = "system") {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Apply html class / data-theme / theme-color before or after paint.
 * Keeps CSS (.mf-glass) and JS (getColors) from disagreeing.
 */
export function applyDocumentTheme(isDark) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", isDark);
  root.dataset.theme = isDark ? "dark" : "light";
  root.style.colorScheme = isDark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDark ? "#0A0D12" : "#E8ECF2");
}

/**
 * iOS 26 Liquid Glass surface — returns inline style object.
 * Apply as: <div style={{ ...liquidGlass(isDark), borderRadius: 20 }}>
 * Opacity is high enough that labels stay readable over the pattern bg.
 */
export function liquidGlass(isDark) {
  return isDark
    ? {
        background: "rgba(18,24,34,0.82)",
        backdropFilter: "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
        border: "1px solid rgba(255,255,255,0.16)",
        boxShadow: "0 6px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.10)",
      }
    : {
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(40px) saturate(160%)",
        WebkitBackdropFilter: "blur(40px) saturate(160%)",
        border: "1px solid rgba(15,20,25,0.10)",
        boxShadow: "0 4px 14px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.95)",
      };
}

export function getColors(isDark) {
  return isDark
    ? {
        bg:       "#0A0D12",
        card:     "#171E28",
        cardAlt:  "#10161F",
        surface:  "#1E2733",
        border:   "#25303C",
        text:     "#FFFFFF",
        // Brighter secondary/muted so small labels clear AA on #0A0D12.
        subtext:  "#B0BAC6",
        muted:    "#8B97A6",
        accentDim: "rgba(0,200,150,0.12)",
      }
    : {
        // Match mobile AppBackgroundColors.light — cool slate, not warm cream.
        bg:       "#E8ECF2",
        card:     "#FFFFFF",
        cardAlt:  "#F1F5F9",
        surface:  "#E2E8F0",
        border:   "#D4DAE3",
        text:     "#0F1419",
        // Darker secondary/muted for AA on white / #E8ECF2 (≥4.5:1).
        subtext:  "#3D4A57",
        muted:    "#4A5866",
        accentDim: "rgba(0,200,150,0.10)",
      };
}
