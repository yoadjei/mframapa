export const Colors = {
  bgPrimary:    '#0B0F14',
  bgSecondary:  '#121821',
  bgCard:       '#171E28',
  bgCardAlt:    '#10161F',

  brandGreen:   '#00C896',
  brandGreenDim:'#00A87C',

  textPrimary:   '#FFFFFF',
  textSecondary: '#B0BAC6',
  textMuted:     '#8B97A6',

  aqiGood:          '#00C896',
  aqiModerate:      '#F5C518',
  aqiHigh:          '#FF8C00',
  aqiUnhealthy:     '#E53935',
  aqiVeryUnhealthy: '#9C27B0',

  danger:     '#E53935',
  warning:    '#F5C518',
  success:    '#00C896',
  enterprise: '#C8A200',

  lightBg:              '#E8ECF2',
  lightCard:            '#FFFFFF',
  lightBorder:          '#D4DAE3',
  lightTextPrimary:     '#0F1419',
  lightTextSecondary:   '#3D4A57',
  lightTextMuted:       '#4A5866',
} as const;

export type ColorKey = keyof typeof Colors;

export function aqiBand(category: string): 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'hazardous' {
  const cat = (category ?? '').toLowerCase();
  if (cat === 'good') return 'good';
  if (cat === 'moderate') return 'moderate';
  if (cat.includes('sensitive') || cat === 'high' || cat.includes('unhealthy for')) return 'sensitive';
  if (cat === 'unhealthy') return 'unhealthy';
  if (cat.includes('very') || cat.includes('hazardous')) return 'hazardous';
  return 'moderate';
}

// measured against each theme background: all clear WCAG AA (4.5:1) for text.
// the previous single palette failed on four of five categories in light mode
// and on hazardous in dark, the one that matters most. mirrors the pwa.
const AQI_DARK: Record<string, string> = {
  good: '#00C896', moderate: '#F5C518', sensitive: '#FF8C00',
  unhealthy: '#E53935', hazardous: '#C043D5',
};
const AQI_LIGHT: Record<string, string> = {
  // Moderate: cooler olive (was #8B6E06 gold — read as yellowish wash on light UI).
  good: '#008060', moderate: '#5F6E28', sensitive: '#AB5E00',
  unhealthy: '#DD211C', hazardous: '#9C27B0',
};

export function getAQIColor(category: string, isDark = true): string {
  return (isDark ? AQI_DARK : AQI_LIGHT)[aqiBand(category)];
}

/** Match backend aqi_category_from_pm25 for chart day coloring. */
export function aqiCategoryFromPm25(pm25: number): string {
  const v = Number(pm25);
  if (!Number.isFinite(v)) return 'Moderate';
  if (v <= 12) return 'Good';
  if (v <= 35) return 'Moderate';
  if (v <= 55) return 'Unhealthy for Sensitive Groups';
  if (v <= 150) return 'Unhealthy';
  return 'Hazardous';
}

// a shape per band, so severity is legible without seeing colour (roughly one
// in twelve men has colour vision deficiency).
export function aqiSymbol(category: string): string {
  return { good: '●', moderate: '◐', sensitive: '◑', unhealthy: '◕', hazardous: '■' }[aqiBand(category)];
}

// Severity tiers returned by the backend's pollutants[] (backend/config/pollutants.py)
// map onto the same checked AQI bands/colours above — one palette, not a second
// system. Mirrors frontend-pwa/src/utils/colors.js exactly.
type PollutantSeverity = 'good' | 'moderate' | 'high' | 'severe' | 'hazardous' | 'unknown';
type Band = 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'hazardous';

const POLLUTANT_SEVERITY_TO_BAND: Record<PollutantSeverity, Band> = {
  good: 'good',
  moderate: 'moderate',
  high: 'sensitive',
  severe: 'unhealthy',
  hazardous: 'hazardous',
  unknown: 'moderate',
};

export function pollutantSeverityColor(severity: string, isDark = true): string {
  const band = POLLUTANT_SEVERITY_TO_BAND[severity as PollutantSeverity] ?? 'moderate';
  return (isDark ? AQI_DARK : AQI_LIGHT)[band];
}

const BAND_SYMBOLS: Record<Band, string> = {
  good: '●', moderate: '◐', sensitive: '◑', unhealthy: '◕', hazardous: '■',
};

export function pollutantSeveritySymbol(severity: string): string {
  const band = POLLUTANT_SEVERITY_TO_BAND[severity as PollutantSeverity] ?? 'moderate';
  return BAND_SYMBOLS[band];
}

// ── Contributing-factor cards (home screen "What's in your air") ───────────
// Reuses the same WCAG-checked AQI_DARK/AQI_LIGHT anchors as the rest of the
// app, interpolated smoothly against these cards' own 0/50/100/200%
// breakpoints (see mobile/src/config/contributingFactors.ts) instead of the
// backend's 5-tier severity bands — a deliberately separate scale for this
// one component. Mirrors frontend-pwa/src/utils/colors.js exactly.

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(hexA: string, hexB: string, t: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const mix = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const FACTOR_FILL_STOPS = [0, 50, 100, 200];

export function factorFillColor(pct: number | null | undefined, isDark = true): string {
  const palette = isDark ? AQI_DARK : AQI_LIGHT;
  const anchors = [palette.good, palette.moderate, palette.sensitive, palette.unhealthy];
  const p = pct == null ? 0 : Math.max(0, pct);
  if (p >= FACTOR_FILL_STOPS[FACTOR_FILL_STOPS.length - 1]) return anchors[anchors.length - 1];
  for (let i = 0; i < FACTOR_FILL_STOPS.length - 1; i++) {
    if (p >= FACTOR_FILL_STOPS[i] && p <= FACTOR_FILL_STOPS[i + 1]) {
      const t = (p - FACTOR_FILL_STOPS[i]) / (FACTOR_FILL_STOPS[i + 1] - FACTOR_FILL_STOPS[i]);
      return mixHex(anchors[i], anchors[i + 1], t);
    }
  }
  return anchors[0];
}

export function factorFillRgba(pct: number | null | undefined, isDark: boolean, alpha: number): string {
  const [r, g, b] = hexToRgb(factorFillColor(pct, isDark));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function factorStatusKey(pct: number | null | undefined): string {
  if (pct == null) return 'factor.status.no_data';
  const p = Math.max(0, pct);
  if (p < 50) return 'factor.status.safe';
  if (p < 100) return 'factor.status.elevated';
  if (p < 200) return 'factor.status.high';
  return 'factor.status.dangerous';
}
