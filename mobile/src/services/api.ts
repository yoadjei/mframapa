import axios, { AxiosError } from 'axios';
import type { AuthResponse } from '@supabase/supabase-js';
import { PollutantReading, PredictionResult } from '../store/useStore';
import { API_BASE_URL, languageName } from '../utils/constants';
import { factorLabels } from '../utils/factors';
import { getCurrentSession, getSupabase } from './supabase';

const BASE_URL = API_BASE_URL;

if (__DEV__) {
  console.log('[Mframapa] API base URL:', BASE_URL);
}

const client = axios.create({
  baseURL: BASE_URL,
  // Cold upstreams (esp. sparse northern sites) can exceed 20s before answering.
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// the signed-in user's supabase token is the api credential — rate limits and
// paid features are resolved from it server-side. no key is shipped in the app.
client.interceptors.request.use(async (config) => {
  const session = await getCurrentSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// ── 429 Rate-limit state ───────────────────────────────────────────────────────
type RateLimitListener = (retryAfterMs: number) => void;
const _rateLimitListeners: Set<RateLimitListener> = new Set();

/** Subscribe to rate-limit events. Returns an unsubscribe fn. */
export function onRateLimit(listener: RateLimitListener): () => void {
  _rateLimitListeners.add(listener);
  return () => _rateLimitListeners.delete(listener);
}

// Home / CityDetail can fire several authenticated calls at once. If the
// shared token is bad, they all 401 in the same tick — and each independently
// calling refreshSession() races them against each other. Supabase refresh
// tokens are single-use: the first concurrent call rotates it and succeeds,
// the rest are then trying to redeem a refresh token that is already spent
// and fail. Funneling every caller through one shared in-flight promise means
// only one actual refresh call ever goes out; everyone else awaits its result.
let _refreshPromise: Promise<AuthResponse> | null = null;
function refreshSessionOnce(): Promise<AuthResponse> {
  if (!_refreshPromise) {
    const supabase = getSupabase();
    if (!supabase) {
      return Promise.resolve({ data: { session: null, user: null }, error: null } as AuthResponse);
    }
    _refreshPromise = supabase.auth.refreshSession().finally(() => {
      _refreshPromise = null;
    });
  }
  return _refreshPromise;
}

client.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    if (err.response?.status === 429) {
      const retryAfterHeader =
        (err.response.headers as Record<string, string>)['retry-after'] ?? '60';
      const retryAfterMs = parseFloat(retryAfterHeader) * 1000;
      _rateLimitListeners.forEach((fn) => fn(retryAfterMs));
    }
    // The backend deliberately rejects a bad credential with 401 instead of
    // quietly treating it as anonymous (see authenticate_or_anonymous in
    // backend/api/security.py) — so a 401 here means the token we sent was
    // rejected. Try refreshing it once and retrying with the fresh token
    // before giving up: autoRefreshToken only fires on its own proactive
    // timer, it does not react to a 401 from us, so a token the backend has
    // started rejecting (clock skew, a rotated key, a backend blip) would
    // otherwise sit there and get resent, unrefreshed, on every request.
    //
    // These are two separate attempts with two separate flags on purpose: a
    // refreshed token can itself still be rejected (the backend problem was
    // never actually about staleness), and that must not consume the one
    // retry a public endpoint needs to fall back to anonymous — otherwise a
    // persistently-invalid session breaks every request forever with no
    // recovery, which is what happened when both were folded into one flag.
    const original = err.config as
      | (typeof err.config & { _retriedRefresh?: boolean; _retriedAnon?: boolean })
      | undefined;
    if (err.response?.status !== 401 || !original) {
      return Promise.reject(err);
    }

    const hadToken = Boolean(original.headers?.Authorization || original.headers?.authorization);
    if (hadToken && !original._retriedRefresh) {
      original._retriedRefresh = true;
      try {
        const { data } = await refreshSessionOnce();
        const token = data?.session?.access_token;
        if (token && original.headers) {
          original.headers.Authorization = `Bearer ${token}`;
          return client.request(original);
        }
      } catch {
        /* refresh failed outright — fall through to the anonymous retry */
      }
    }

    if (!original._retriedAnon) {
      original._retriedAnon = true;
      if (original.headers) {
        delete original.headers.Authorization;
        delete original.headers.authorization;
      }
      return client.request(original);
    }

    return Promise.reject(err);
  },
);

function mapPrediction(
  data: Record<string, unknown>,
  name: string,
  lat: number,
  lon: number,
  insight?: string
): PredictionResult {
  const uncertainty = data.uncertainty as Record<string, number> | undefined;
  const weather = data.weather as Record<string, number> | undefined;
  const model = data.model as Record<string, string> | undefined;
  const rawFactors = data.factors as Record<string, number> | string[] | undefined;
  const factors = Array.isArray(rawFactors)
    ? rawFactors
    : rawFactors
      ? Object.keys(rawFactors)
      : undefined;

  const modelSource = model?.source ?? '';
  const degraded = Boolean(
    data.degraded ||
      modelSource === 'openmeteo_fallback' ||
      modelSource === 'fallback_constant'
  );

  return {
    pm25: data.pm25 as number,
    aqi_category: data.aqi_category as string,
    uncertainty: {
      pm25_lower: uncertainty?.pm25_lower ?? (data.pm25 as number) * 0.85,
      pm25_upper: uncertainty?.pm25_upper ?? (data.pm25 as number) * 1.15,
    },
    weather: {
      temp: weather?.temp ?? null,
      humidity: weather?.humidity ?? null,
      wind: weather?.wind ?? null,
    },
    location: { name, lat, lon },
    factors: factorLabels(factors),
    model: model?.region_id
      ? `${model.region_id} / ${model.segment ?? 'all'}`
      : undefined,
    modelSource,
    degraded,
    insight,
    pollutants: data.pollutants as PollutantReading[] | undefined,
    personalized: data.personalized as { category: string; reason: string } | null | undefined,
    personalizedAdvice: data.personalized_advice as PredictionResult['personalizedAdvice'],
  };
}

export async function getPrediction(
  lat: number,
  lon: number,
  name: string,
  language = 'en',
  firstName?: string
): Promise<PredictionResult> {
  const { data } = await client.get('/api/v1/predict', {
    params: { lat, lon, name },
  });

  const targetLanguageName = languageName(language);

  let insight: string | undefined;
  try {
    insight = await generateInsight({
      pm25: data.pm25,
      aqi_category: data.aqi_category,
      weather: data.weather,
      language,
      language_name: targetLanguageName,
      lat,
      lon,
      name: firstName,
    });
  } catch {
    insight = undefined;
  }

  return mapPrediction(data, name, lat, lon, insight);
}

export type ForecastDay = {
  date: string;
  day_offset: number;
  pm25: number;
  aqi_category: string;
  uncertainty?: { pm25_lower?: number; pm25_upper?: number };
  inputs: 'full' | 'reduced';
};

export type HistoryDay = {
  date: string;
  days_ago: number;
  pm25: number;
  aqi_category: string;
  uncertainty?: { pm25_lower?: number; pm25_upper?: number };
};

export type MapSummaryCity = {
  name: string;
  lat: number;
  lon: number;
  pm25: number;
  aqi_category: string;
};

// one cached request powering the continental map — a per-city fan-out would
// burn the whole anonymous rate-limit budget on a single screen.
export async function getMapSummary(): Promise<MapSummaryCity[]> {
  const { data } = await client.get('/api/v1/map-summary');
  return data?.cities ?? [];
}

// multi-day outlook. the horizon is capped server-side to the days our weather
// and air-quality inputs actually cover, so this never invents numbers.
export async function getForecast(
  lat: number,
  lon: number,
  name = 'Unknown',
  days = 4
): Promise<ForecastDay[]> {
  const { data } = await client.get('/api/v1/forecast', { params: { lat, lon, name, days } });
  return data?.days ?? [];
}

// recent past, oldest day first. days the archives cannot reconstruct come back
// omitted rather than filled in.
export async function getHistory(
  lat: number,
  lon: number,
  name = 'Unknown',
  days = 14
): Promise<HistoryDay[]> {
  const { data } = await client.get('/api/v1/history', { params: { lat, lon, name, days } });
  return data?.days ?? [];
}

export type MapHistory = {
  dates: string[];
  cities: { name: string; lat: number; lon: number; days: HistoryDay[] }[];
};

// the whole playback window in one cached request — asking per city would make
// every client pay to rebuild the same fixed window.
export async function getMapHistory(days = 14): Promise<MapHistory> {
  const { data } = await client.get('/api/v1/map-history', { params: { days } });
  return { dates: data?.dates ?? [], cities: data?.cities ?? [] };
}

export type PollutantInfo = {
  what_it_is: string;
  local_sources: string[];
  body_effects: string;
  at_risk_groups: string[];
  actions_by_severity: Record<string, string[]>;
  citations: string[];
};

// static per-pollutant health copy. changes only when we ship new copy, so
// fetched once per app session and cached in memory rather than on every predict.
let pollutantInfoCache: Record<string, PollutantInfo> | null = null;

export async function getPollutantInfo(): Promise<Record<string, PollutantInfo>> {
  if (pollutantInfoCache) return pollutantInfoCache;
  try {
    const { data } = await client.get('/api/v1/pollutant-info');
    pollutantInfoCache = (data?.pollutants as Record<string, PollutantInfo>) ?? {};
    return pollutantInfoCache;
  } catch {
    return {};
  }
}

// one short reviewed fact a day, the same for everyone, translated server side.
export async function getDailyFact(language = 'en', languageName = ''): Promise<string> {
  try {
    const { data } = await client.get('/api/v1/daily-fact', {
      params: { language, language_name: languageName },
    });
    return (data?.fact as string) ?? '';
  } catch {
    return '';
  }
}

/** send a user report. category is one of bug, feature, data, general. */
export async function sendFeedback(body: {
  category: string;
  message: string;
  email?: string | null;
}): Promise<void> {
  await client.post('/api/v1/feedback', { ...body, platform: 'mobile' });
}

/** permanently delete the signed-in account. irreversible. */
export async function deleteAccount(): Promise<void> {
  await client.delete('/api/v1/account');
}

export interface HealthProfileBody {
  healthConditions: string[];
  homeLocation?: unknown;
  workLocation?: unknown;
  routine?: unknown;
}

/** the signed-in user's health profile (conditions, locations, routine). */
export async function getHealthProfile(): Promise<{
  health_conditions: string[];
  home_location: unknown;
  work_location: unknown;
  routine: unknown;
}> {
  const { data } = await client.get('/api/v1/health-profile');
  return data;
}

export async function updateHealthProfile({
  healthConditions, homeLocation, workLocation, routine,
}: HealthProfileBody): Promise<void> {
  await client.put('/api/v1/health-profile', {
    health_conditions: healthConditions ?? [],
    home_location: homeLocation ?? null,
    work_location: workLocation ?? null,
    routine: routine ?? null,
  });
}

/** permanently delete the signed-in user's saved health profile (not the account). */
export async function deleteHealthProfile(): Promise<void> {
  await client.delete('/api/v1/health-profile');
}

/** One-time Welcome email after a real signed-in session. Failures are silent. */
export async function requestWelcomeEmail(): Promise<void> {
  try {
    await client.post('/api/v1/auth/welcome');
  } catch {
    /* best-effort */
  }
}

export async function generateInsight(body: {
  pm25: number;
  aqi_category: string;
  weather?: Record<string, unknown>;
  language?: string;
  language_name?: string;
  lat?: number;
  lon?: number;
  /** first name of the signed-in user, if any — personalizes a fraction of the lines. */
  name?: string;
}): Promise<string> {
  const { data } = await client.post('/api/v1/generate-insight', body);
  return data.insight as string;
}

export async function translateUiStrings(
  strings: Record<string, string>,
  targetLanguage: string,
  targetLanguageName?: string
): Promise<{ translations: Record<string, string>; fallback: boolean }> {
  const { data } = await client.post<{
    translations: Record<string, string>;
    fallback?: boolean;
  }>('/api/v1/translate', {
    strings,
    target_language: targetLanguage,
    target_language_name: targetLanguageName ?? '',
  }, { timeout: 90000 });
  return {
    translations: data.translations,
    fallback: data.fallback ?? false,
  };
}

export async function resolveLocation(
  city: string
): Promise<{ lat: number; lon: number; name: string; is_africa: boolean }> {
  const { data } = await client.get('/api/v1/resolve-location', {
    params: { city },
  });
  return data;
}

export async function checkHealth(): Promise<{ status: string }> {
  const { data } = await client.get('/api/v1/health');
  return data;
}

export async function registerPushToken(
  token: string,
  platform: 'android' | 'ios' | 'web',
  lat?: number,
  lon?: number,
): Promise<void> {
  await client.post('/api/v1/register-push-token', { token, platform, lat, lon });
}

export interface AnalyticsEvent {
  device_id: string;
  event: string;
  platform?: 'web' | 'android' | 'ios';
  country?: string;
}

export async function postEvents(events: AnalyticsEvent[]): Promise<void> {
  await client.post('/api/v1/events', { events });
}

export async function syncTranslations(
  lang: string,
  langName?: string,
): Promise<{ translations: Record<string, string>; fallback: boolean }> {
  const { data } = await client.get<{
    translations: Record<string, string>;
    fallback: boolean;
  }>('/api/v1/translations/sync', {
    params: { lang, lang_name: langName ?? '' },
    timeout: 90000,
  });
  return { translations: data.translations, fallback: data.fallback };
}

export async function suggestTranslation(body: {
  key: string;
  original: string;
  suggested: string;
  language: string;
  language_name?: string;
}): Promise<void> {
  await client.post('/api/v1/translations/suggest', body);
}
