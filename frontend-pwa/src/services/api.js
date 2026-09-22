import { httpClient, normalizeError } from "./httpClient.js";
import { PERSISTENCE_KEY } from "../state/appState.jsx";

// read straight from the persisted store rather than threading a name prop
// through every screen that calls generateInsight — Home, Search, City Detail
// and Core Feature all go through this one function.
function currentFirstName() {
  try {
    const raw = localStorage.getItem(PERSISTENCE_KEY);
    if (!raw) return "";
    const name = JSON.parse(raw)?.profile?.firstName;
    return typeof name === "string" ? name.trim() : "";
  } catch {
    return "";
  }
}

const predictionCache = new Map();
const PREDICTION_CACHE_TTL_MS = 5 * 60 * 1000;

function predictionCacheKey(lat, lon, name) {
  return `${lat.toFixed(3)}:${lon.toFixed(3)}:${name || ""}`;
}

export async function resolveLocation(city) {
  try {
    const response = await httpClient.get("/api/v1/resolve-location", { params: { city } });
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error, "Location lookup failed"));
  }
}

export async function getPrediction(lat, lon, name = "Unknown") {
  const key = predictionCacheKey(lat, lon, name);
  const cached = predictionCache.get(key);
  if (cached && Date.now() - cached.timestamp < PREDICTION_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const response = await httpClient.get("/api/v1/predict", {
      params: { lat, lon, name },
    });
    predictionCache.set(key, { data: response.data, timestamp: Date.now() });
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error, "Prediction request failed"));
  }
}

export async function submitReport(lat, lon, perceivedQuality, comment = null) {
  try {
    const response = await httpClient.post("/api/v1/report", {
      lat,
      lon,
      perceived_quality: perceivedQuality,
      comment,
    });
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error, "Report submission failed"));
  }
}

export async function checkHealth() {
  try {
    const response = await httpClient.get("/api/v1/health");
    return response.data;
  } catch {
    return { status: "offline" };
  }
}

export function clearPredictionCache() {
  predictionCache.clear();
}

export async function translateUiStrings(strings, targetLanguage, targetLanguageName = "") {
  const response = await httpClient.post("/api/v1/translate", {
    strings,
    target_language: targetLanguage,
    target_language_name: targetLanguageName,
  });
  return {
    translations: response.data.translations,
    fallback: Boolean(response.data.fallback),
  };
}

export async function generateInsight({ pm25, aqi_category, weather = {}, language = "en", language_name = "", lat, lon, name }) {
  const response = await httpClient.post("/api/v1/generate-insight", {
    pm25,
    aqi_category,
    weather,
    language,
    language_name,
    lat,
    lon,
    name: name ?? currentFirstName(),
  });
  return response.data.insight;
}

// one cached request powering the continental map (avoids a per-city fan-out that
// would exhaust the anonymous rate limit on a single screen).
export async function getMapSummary() {
  try {
    const response = await httpClient.get("/api/v1/map-summary");
    return response.data?.cities ?? [];
  } catch (error) {
    throw new Error(normalizeError(error, "Could not load the map"));
  }
}

// real multi-day outlook. the horizon is capped server-side to the days our
// weather + air-quality inputs actually cover, so this never invents numbers.
export async function getForecast(lat, lon, name = "Unknown", days = 4) {
  try {
    const response = await httpClient.get("/api/v1/forecast", { params: { lat, lon, name, days } });
    return response.data?.days ?? [];
  } catch (error) {
    throw new Error(normalizeError(error, "Could not load the forecast"));
  }
}

// recent past, oldest day first. the window is capped server-side to what the
// archives can actually reconstruct — missing days come back omitted, not filled in.
export async function getHistory(lat, lon, name = "Unknown", days = 14) {
  try {
    const response = await httpClient.get("/api/v1/history", { params: { lat, lon, name, days } });
    return response.data?.days ?? [];
  } catch (error) {
    throw new Error(normalizeError(error, "Could not load the history"));
  }
}

// the whole playback window for the playback cities, in one cached request.
// asking per city would make every client rebuild the same fixed window.
export async function getMapHistory(days = 14) {
  try {
    const response = await httpClient.get("/api/v1/map-history", { params: { days } });
    return response.data ?? { dates: [], cities: [] };
  } catch (error) {
    throw new Error(normalizeError(error, "Could not load the history"));
  }
}

// one short reviewed fact a day, the same for everyone, translated server side.
export async function getDailyFact(language = "en", languageName = "") {
  try {
    const response = await httpClient.get("/api/v1/daily-fact", {
      params: { language, language_name: languageName },
    });
    return response.data?.fact ?? "";
  } catch {
    return "";                       // a missing fact should never block the screen
  }
}

// static per-pollutant health copy. changes only when we ship new copy, so
// fetched once per session and cached in memory rather than on every predict.
let pollutantInfoCache = null;

export async function getPollutantInfo() {
  if (pollutantInfoCache) return pollutantInfoCache;
  try {
    const response = await httpClient.get("/api/v1/pollutant-info");
    pollutantInfoCache = response.data?.pollutants ?? {};
    return pollutantInfoCache;
  } catch {
    return {};                       // detail sheet degrades to numbers-only
  }
}

/** the signed-in user's onboarding health profile (conditions, locations, routine). */
export async function getHealthProfile() {
  try {
    const response = await httpClient.get("/api/v1/health-profile");
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error, "Could not load your health profile"));
  }
}

export async function updateHealthProfile({ homeLocation, workLocation, healthConditions, routine }) {
  try {
    await httpClient.put("/api/v1/health-profile", {
      home_location: homeLocation ?? null,
      work_location: workLocation ?? null,
      health_conditions: healthConditions ?? [],
      routine: routine ?? null,
    });
  } catch (error) {
    throw new Error(normalizeError(error, "Could not save your health profile"));
  }
}

/** permanently delete the signed-in user's saved health profile (not the account). */
export async function deleteHealthProfile() {
  try {
    await httpClient.delete("/api/v1/health-profile");
  } catch (error) {
    throw new Error(normalizeError(error, "Could not delete your health profile"));
  }
}

// account-level sync on top of the already-working local saved-locations
// feature (savedCities in appState.jsx) — best-effort; a signed-in user's
// local list is always the source of truth for what's on screen.
export async function listSavedLocationsRemote() {
  try {
    const response = await httpClient.get("/api/v1/saved-locations");
    return response.data?.locations ?? [];
  } catch {
    return [];
  }
}

export async function saveLocationRemote({ name, lat, lon, country }) {
  try {
    await httpClient.post("/api/v1/saved-locations", { name, lat, lon, country });
  } catch {
    /* local save already happened; remote sync is best-effort */
  }
}

export async function removeLocationRemote(name) {
  try {
    await httpClient.delete(`/api/v1/saved-locations/${encodeURIComponent(name)}`);
  } catch {
    /* local removal already happened; remote sync is best-effort */
  }
}

/** permanently delete the signed-in account. irreversible. */
export async function deleteAccount() {
  try {
    await httpClient.delete("/api/v1/account");
  } catch (error) {
    throw new Error(normalizeError(error, "Could not delete your account."));
  }
}

/** send a user report. category is one of bug, feature, data, general. */
export async function sendFeedback({ category, message, email }) {
  try {
    await httpClient.post("/api/v1/feedback", {
      category, message, email: email || null, platform: "web",
    });
  } catch (error) {
    throw new Error(normalizeError(error, "Could not send your feedback."));
  }
}

/** One-time Welcome email after a real signed-in session. Failures are silent. */
export async function requestWelcomeEmail() {
  try {
    await httpClient.post("/api/v1/auth/welcome");
  } catch {
    /* welcome is best-effort; never block sign-in */
  }
}
