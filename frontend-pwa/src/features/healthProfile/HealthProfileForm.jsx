import { useState } from "react";
import { useAppState } from "../../state/appState.jsx";
import { useTranslation } from "../../hooks/useTranslation.js";
import { updateHealthProfile } from "../../services/api.js";
import { HEALTH_CONDITIONS } from "./healthConditions.js";

/** Condition checkboxes + save, shared by onboarding and the Profile screen.
 *  Always writes to local state (works for guests); pushes to the backend too
 *  when signed in — the personalized /predict block only activates server-side
 *  once it's there, which is exactly the "sign in for personalization" pitch. */
export function HealthProfileForm({ colors, onDone, doneLabel }) {
  const { state, dispatch } = useAppState();
  const { t } = useTranslation();
  const authenticated = state.session?.authenticated;
  const [selected, setSelected] = useState(new Set(state.profile.healthConditions ?? []));
  const [saving, setSaving] = useState(false);

  function toggle(code) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  async function handleSave() {
    const healthConditions = Array.from(selected);
    setSaving(true);
    dispatch({ type: "UPDATE_PROFILE", payload: { healthConditions } });
    if (authenticated) {
      try {
        await updateHealthProfile({
          healthConditions,
          homeLocation: state.profile.homeLocation,
          workLocation: state.profile.workLocation,
          routine: state.profile.routine,
        });
      } catch {
        /* saved locally either way; a failed sync isn't worth blocking onboarding over */
      }
    }
    setSaving(false);
    onDone?.();
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-5" style={{ color: colors.sub }}>
        {t("health_profile.subtitle")}
      </p>

      <div className="flex flex-col gap-2.5">
        {HEALTH_CONDITIONS.map(({ code, labelKey }) => (
          <label
            key={code}
            className="flex items-center gap-3 rounded-2xl border px-4 py-3"
            style={{
              backgroundColor: selected.has(code) ? "#00C89618" : colors.card,
              borderColor: selected.has(code) ? "#00C89660" : colors.border,
            }}
          >
            <input
              type="checkbox"
              checked={selected.has(code)}
              onChange={() => toggle(code)}
              className="h-5 w-5 accent-app-green"
            />
            <span className="text-[0.9375rem] font-medium" style={{ color: colors.text }}>
              {t(labelKey)}
            </span>
          </label>
        ))}
      </div>

      {!authenticated && (
        <p className="text-[0.8125rem]" style={{ color: colors.muted }}>
          {t("health_profile.sign_in_prompt")}
        </p>
      )}
      <p className="text-[0.75rem]" style={{ color: colors.muted }}>
        {t("health_profile.privacy_note")}
      </p>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mf-press mt-1 rounded-2xl py-3.5 text-center text-base font-bold text-white disabled:opacity-60"
        style={{ backgroundColor: "#00C896" }}
      >
        {saving ? "…" : (doneLabel ?? t("health_profile.save"))}
      </button>
    </div>
  );
}
