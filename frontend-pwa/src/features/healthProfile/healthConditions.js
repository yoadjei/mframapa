/** Shared condition list for onboarding + Profile > Health profile, and for
 *  backend/config/pollutants.py's SENSITIZING_CONDITIONS (keep codes in sync). */
export const HEALTH_CONDITIONS = [
  { code: "asthma", labelKey: "health_profile.condition.asthma" },
  { code: "heart_condition", labelKey: "health_profile.condition.heart_condition" },
  { code: "pregnancy", labelKey: "health_profile.condition.pregnancy" },
  { code: "elderly_household", labelKey: "health_profile.condition.elderly_household" },
  { code: "young_children", labelKey: "health_profile.condition.young_children" },
  { code: "outdoor_worker", labelKey: "health_profile.condition.outdoor_worker" },
];
