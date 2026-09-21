import { useState } from "react";
import { createPortal } from "react-dom";
import { Bell, X } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation.js";
import { Colors, getColors, liquidGlass } from "../../utils/colors.js";
import { ensureNotificationPermission } from "../../services/browserNotifications.js";
import { subscribeWebPush } from "../../services/webPush.js";
import { useAppState } from "../../state/appState.jsx";

const PUSH_PROMPT_SEEN_KEY = "mframapa:push-prompt-seen";

export function markPushPromptSeen() {
  try {
    localStorage.setItem(PUSH_PROMPT_SEEN_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function hasSeenPushPrompt() {
  try {
    return localStorage.getItem(PUSH_PROMPT_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Soft explainer before the OS notification permission dialog.
 * z-[85] sits above GlassTabBar (50) and install (80). Callers close the
 * Alerts settings sheet (z-90) before opening this so the prompt is visible.
 */
export function NotificationPermissionSheet({ open, onClose, isDark = true }) {
  const { t } = useTranslation();
  const { state, dispatch } = useAppState();
  const colors = getColors(isDark);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // null | ok | local_only | denied | error

  if (!open) return null;

  async function handleAllow() {
    markPushPromptSeen();
    setBusy(true);
    setStatus(null);
    try {
      const permission = await ensureNotificationPermission();
      if (permission !== "granted") {
        setStatus("denied");
        setBusy(false);
        return;
      }
      const lat = state.homeSummary?.lat ?? state.ui?.selectedCity?.lat;
      const lon = state.homeSummary?.lon ?? state.ui?.selectedCity?.lon;
      // a sensitized health profile asks to be alerted sooner — schema/
      // registration only for now (see register_push_token in router.py);
      // the alert job doesn't consult this yet.
      const thresholdOffset = (state.profile?.healthConditions ?? []).length > 0 ? -15 : null;
      const result = await subscribeWebPush({ lat, lon, thresholdOffset });
      if (result?.ok) {
        dispatch({
          type: "UPDATE_PREFERENCES",
          payload: { notificationsEnabled: true },
        });
        setStatus("ok");
        setBusy(false);
        onClose?.();
        return;
      }
      // OS banners still work in-session; remote dust alerts need VAPID on the API.
      if (result?.reason === "no_vapid" || result?.reason === "unsupported") {
        setStatus("local_only");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  function handleNotNow() {
    markPushPromptSeen();
    onClose?.();
  }

  const statusCopy =
    status === "local_only"
      ? t("push_prompt.local_only")
      : status === "denied"
        ? t("push_prompt.denied")
        : status === "error"
          ? t("push_prompt.error")
          : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[85] flex flex-col justify-end"
      style={{
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
      onClick={handleNotNow}
      role="presentation"
    >
      <div
        className="relative mx-auto w-full max-w-md px-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mf-push-prompt-title"
      >
        <div
          className="overflow-hidden rounded-[24px] px-5 pb-5 pt-4"
          style={liquidGlass(isDark)}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[14px]"
                style={{ backgroundColor: `${Colors.brandGreen}22` }}
              >
                <Bell size={22} color={Colors.brandGreen} />
              </div>
              <div>
                <h2
                  id="mf-push-prompt-title"
                  className="text-[1.0625rem] font-bold leading-tight"
                  style={{ color: colors.text }}
                >
                  {t("push_prompt.title")}
                </h2>
                <p className="mt-1 text-[0.8125rem] leading-snug" style={{ color: colors.subtext }}>
                  {t("push_prompt.body")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleNotNow}
              className="p-2 active:opacity-60"
              aria-label={t("common.close", "Close")}
            >
              <X size={18} color={colors.subtext} />
            </button>
          </div>

          {statusCopy && (
            <p
              className="mb-3 rounded-xl px-3 py-2 text-[0.8125rem] leading-snug"
              style={{
                backgroundColor: isDark ? "rgba(245,197,24,0.12)" : "rgba(245,197,24,0.18)",
                color: isDark ? "#F5C518" : "#8A6A00",
              }}
              role="status"
            >
              {statusCopy}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleAllow}
              disabled={busy}
              className="w-full rounded-xl py-3 text-[0.9375rem] font-semibold text-white active:opacity-80 disabled:opacity-60"
              style={{ backgroundColor: Colors.brandGreen }}
            >
              {busy ? t("common.loading", "Please wait…") : t("push_prompt.allow")}
            </button>
            <button
              type="button"
              onClick={handleNotNow}
              className="w-full rounded-xl py-3 text-[0.9375rem] font-medium active:opacity-70"
              style={{ color: colors.subtext }}
            >
              {status ? t("common.close", "Close") : t("push_prompt.not_now")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
