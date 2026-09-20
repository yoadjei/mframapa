import { useState } from "react";
import { useAppState } from "../../state/appState.jsx";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useTranslation } from "../../hooks/useTranslation.js";
import { getColors } from "../../utils/colors.js";
import { StackBackButton } from "../../components/navigation/StackBackButton.jsx";
import { useStackChrome, stackTopPad } from "../../hooks/useStackChrome.js";
import { deleteHealthProfile } from "../../services/api.js";
import { HealthProfileForm } from "./HealthProfileForm.jsx";

export function HealthProfileScreen({ isDark }) {
  const { state, dispatch } = useAppState();
  const { t } = useTranslation();
  const { goBack } = useNavigation();
  const colors = getColors(isDark);
  const inStack = useStackChrome();
  const authenticated = state.session?.authenticated;
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    dispatch({ type: "UPDATE_PROFILE", payload: { healthConditions: [] } });
    if (authenticated) {
      try {
        await deleteHealthProfile();
      } catch {
        /* local state already cleared; best-effort remote delete */
      }
    }
    setDeleting(false);
    goBack();
  }

  return (
    <div style={{ minHeight: inStack ? undefined : "100dvh", paddingTop: inStack ? stackTopPad(true) : undefined }}>
      {!inStack && <div style={{ height: "env(safe-area-inset-top)" }} />}

      <div className="flex items-center justify-between px-4 py-3" style={{ paddingTop: 8 }}>
        {!inStack ? (
          <StackBackButton onClick={goBack} color={colors.text} variant="chevron" ariaLabel={t("common.go_back")} />
        ) : (
          <div style={{ width: 44 }} />
        )}
        <span className="text-[0.8125rem] font-bold uppercase tracking-widest" style={{ color: colors.text }}>
          {t("health_profile.title").toUpperCase()}
        </span>
        <div style={{ width: 44 }} />
      </div>

      <div className="px-4 pb-8">
        <HealthProfileForm colors={colors} onDone={goBack} />

        {(state.profile.healthConditions ?? []).length > 0 && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="mf-press mt-4 w-full rounded-2xl border py-3 text-center text-sm font-bold disabled:opacity-60"
            style={{ borderColor: "#E5393560", color: "#E53935" }}
          >
            {deleting ? "…" : t("health_profile.delete")}
          </button>
        )}
      </div>
    </div>
  );
}
