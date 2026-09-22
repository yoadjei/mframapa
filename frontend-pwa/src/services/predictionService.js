import { africanCities } from "../data/africanCities.js";
import { languageName } from "../i18n/languages.js";
import { getPrediction, generateInsight } from "./api.js";
import { getCachedCities } from "./cityPackService.js";

export function findCity(query) {
  if (!query) return null;
  const text = query.trim().toLowerCase();
  const cities = getCachedCities();
  return (
    cities.find((city) => city.name.toLowerCase() === text) ||
    cities.find((city) => city.name.toLowerCase().includes(text)) ||
    africanCities.find((city) => city.name.toLowerCase() === text) ||
    africanCities.find((city) => city.name.toLowerCase().includes(text)) ||
    null
  );
}

/** nearest known city to a coordinate, so a device fix gets a human name.
 *  equirectangular distance is plenty at city scale and needs no network call. */
export function nearestCity(lat, lon) {
  const pool = getCachedCities()?.length ? getCachedCities() : africanCities;
  let best = null;
  let bestD = Infinity;
  for (const c of pool) {
    const dx = (c.lon - lon) * Math.cos((lat * Math.PI) / 180);
    const dy = c.lat - lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** predict at an exact coordinate. the device fix is the truth here, so the
 *  nearest city is used only to label it, never to move the reading. */
export async function fetchPredictionAtCoords(lat, lon, language = "en") {
  const near = nearestCity(lat, lon);
  const label = near?.name ?? `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  return buildPrediction(
    { name: label, country: near?.country ?? "", lat, lon },
    await getPrediction(lat, lon, label),
    language
  );
}

export async function fetchCityPrediction(cityName, language = "en") {
  const city = findCity(cityName);
  if (!city) throw new Error("error.city_not_found");

  const response = await getPrediction(city.lat, city.lon, city.name);
  return buildPrediction(city, response, language);
}

async function buildPrediction(city, response, language) {

  let insight;
  try {
    insight = await generateInsight({
      // the server picks seasonal wording from these, so harmattan advice only
      // appears where and when the harmattan actually blows
      lat: city.lat,
      lon: city.lon,
      pm25: response.pm25,
      aqi_category: response.aqi_category,
      weather: response.weather ?? {},
      language,
      language_name: languageName(language),
    });
  } catch {
    insight = undefined;
  }

  return {
    city,
    pm25: response.pm25,
    category: response.aqi_category,
    degraded: Boolean(response?.sources?.degraded || response?.degraded),
    timestamp: response.timestamp || new Date().toISOString(),
    weather: response.weather ?? null,
    sourceSummary: response.sources_used ?? [],
    factors: response.factors ?? null,
    uncertainty: response.uncertainty ?? null,
    model: response.model ?? null,
    pollutants: response.pollutants ?? [],
    comparison: response.comparison ?? null,
    personalized: response.personalized ?? null,
    personalizedAdvice: response.personalized_advice ?? [],
    insight,
  };
}
