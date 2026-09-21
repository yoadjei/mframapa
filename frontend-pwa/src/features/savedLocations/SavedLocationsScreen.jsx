import { MapPin, Plus, Trash2 } from "lucide-react";
import { useAppState } from "../../state/appState.jsx";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useTranslation } from "../../hooks/useTranslation.js";
import { getColors, Colors, getAQIColor } from "../../utils/colors.js";
import { StackBackButton } from "../../components/navigation/StackBackButton.jsx";
import { useStackChrome, stackTopPad } from "../../hooks/useStackChrome.js";
import { removeLocationRemote } from "../../services/api.js";

export function SavedLocationsScreen({ isDark }) {
  const { state, dispatch } = useAppState();
  const { t } = useTranslation();
  const { goBack, navigateToTab } = useNavigation();
  const colors = getColors(isDark);
  const inStack = useStackChrome();

  // Must match SAVE_CITY / REMOVE_CITY in appState (not a phantom savedLocations key).
  const savedLocations = state.savedCities ?? [];

  function handleDelete(name) {
    dispatch({ type: "REMOVE_CITY", payload: name });
    if (state.session?.authenticated) removeLocationRemote(name);
  }

  function handleAdd() {
    navigateToTab("search");
  }

  return (
    <div style={{ minHeight: inStack ? undefined : "100dvh", paddingTop: inStack ? stackTopPad(true) : undefined }}>
      {!inStack && <div style={{ height: "env(safe-area-inset-top)" }} />}

      <div className="flex items-center justify-between px-4 py-3" style={{ paddingTop: 8 }}>
        {!inStack ? (
          <StackBackButton
            onClick={goBack}
            color={colors.text}
            variant="chevron"
            ariaLabel={t("common.go_back")}
          />
        ) : (
          <div style={{ width: 44 }} />
        )}

        <span
          className="text-[0.8125rem] font-bold uppercase tracking-widest"
          style={{ color: colors.text }}
        >
          {t("screen.saved_locations.title").toUpperCase()}
        </span>

        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center justify-center active:opacity-60"
          aria-label={t("screen.saved_locations.add")}
        >
          <Plus size={24} color={Colors.brandGreen} />
        </button>
      </div>

      <div
        className="flex flex-col gap-2.5 px-4 pt-2"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 100px)" }}
      >
        {savedLocations.length === 0 ? (
          <div
            className="mt-2 flex flex-col items-center gap-3 rounded-2xl p-6"
            style={{ border: `1.5px dashed ${colors.border}` }}
          >
            <MapPin size={36} color={colors.subtext} />
            <p className="text-center text-[0.875rem]" style={{ color: colors.subtext }}>
              {t("screen.saved_locations.nothing_saved_yet")}
            </p>
            <button
              type="button"
              onClick={handleAdd}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[0.875rem] font-semibold active:opacity-70"
              style={{
                backgroundColor: Colors.brandGreen + "22",
                color: Colors.brandGreen,
              }}
            >
              <Plus size={16} color={Colors.brandGreen} />
              {t("screen.saved_locations.add")}
            </button>
          </div>
        ) : (
          savedLocations.map((item) => {
            const aqiColor = getAQIColor(item.lastAqiCategory ?? "moderate", isDark);
            const key = `${item.name}|${item.lat}|${item.lon}`;
            return (
              <div
                key={key}
                className="flex items-center justify-between rounded-2xl border p-3.5"
                style={{
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                }}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-[1.125rem] font-bold" style={{ color: colors.text }}>
                    {item.name}
                  </span>
                  {item.country ? (
                    <span className="text-[0.75rem]" style={{ color: colors.subtext }}>
                      {item.country}
                    </span>
                  ) : null}
                  <div className="mt-0.5 flex items-center gap-1">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: aqiColor }}
                    />
                    <span
                      className="text-[0.6875rem] font-semibold"
                      style={{ color: colors.subtext }}
                    >
                      {item.lastAqiCategory
                        ? item.lastAqiCategory
                        : t("common.aqi")}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[0.6875rem]" style={{ color: colors.subtext }}>
                      {t("screen.saved_locations.last_pm25")}
                    </span>
                    <span className="text-[0.875rem] font-bold" style={{ color: colors.text }}>
                      {item.lastPm25 != null
                        ? `${item.lastPm25} ${t("unit.ug_m3")}`
                        : "—"}
                    </span>
                    {item.lastChecked ? (
                      <span className="text-[0.6875rem]" style={{ color: colors.muted }}>
                        {item.lastChecked}
                      </span>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(item.name)}
                    className="flex h-8 w-8 items-center justify-center rounded-full active:opacity-60"
                    style={{ backgroundColor: Colors.danger + "18" }}
                    aria-label={t("common.delete")}
                  >
                    <Trash2 size={16} color={Colors.danger} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
