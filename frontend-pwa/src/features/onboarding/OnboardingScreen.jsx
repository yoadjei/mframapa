import { useState, useEffect, useRef } from "react";
import { BellRing, MapPin, Globe2 } from "lucide-react";
import { MorphBackground } from "../../components/background/MorphBackground.jsx";
import { useAppState } from "../../state/appState.jsx";
import { useTranslation } from "../../hooks/useTranslation.js";
import { MframapaLogo } from "../../components/brand/MframapaLogo.jsx";
import { PrimaryButton } from "../../components/ui/PrimaryButton.jsx";
import { OutlineButton } from "../../components/ui/OutlineButton.jsx";

const BRAND_GREEN = "#00C896";
const MUTED = "#647182";

const SLIDES = [
  {
    icon: null,                       // slide one shows the mframapa mark
    titleKey: "screen.onboarding.slide1_title",
    subKey: "screen.onboarding.slide1_sub",
  },
  {
    icon: Globe2,
    titleKey: "screen.onboarding.slide2_title",
    subKey: "screen.onboarding.slide2_sub",
  },
  {
    icon: BellRing,
    titleKey: "screen.onboarding.slide3_title",
    subKey: "screen.onboarding.slide3_sub",
  },
];

function useT() {
  // the real catalog, so this screen is translated like every other one
  const { t } = useTranslation();
  return t;
}

/* ─────────────────────────────────────────────────────────── Splash phase ── */
function SplashPhase({ onDone }) {
  // three beats: the mark fades in alone, the wordmark then wipes in from the
  // right, and the whole lockup settles before we move on. reduced motion gets
  // the end state immediately rather than a sequence it did not ask for.
  const [stage, setStage] = useState(0);   // 0 hidden, 1 mark, 2 wordmark

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) {
      setStage(2);
      const advance = setTimeout(onDone, 900);
      return () => clearTimeout(advance);
    }
    const timers = [
      setTimeout(() => setStage(1), 60),     // mark fades in
      setTimeout(() => setStage(2), 1100),   // wordmark wipes in
      setTimeout(onDone, 3000),              // hold, then continue
    ];
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center"
      style={{
        backgroundColor: "#0A0D12",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            opacity: stage >= 1 ? 1 : 0,
            transform: stage >= 1 ? "scale(1)" : "scale(0.88)",
            transition: "opacity 600ms var(--mf-ease-out), transform 600ms var(--mf-ease-out)",
          }}
        >
          <MframapaLogo size="lg" markOnly />
        </div>

        {/* the wordmark reveals by unclipping from the right, so it reads as one
            mark growing into the full lockup rather than two separate fades. */}
        <div
          aria-hidden={stage < 2}
          style={{
            overflow: "hidden",
            maxWidth: stage >= 2 ? 220 : 0,
            opacity: stage >= 2 ? 1 : 0,
            transform: stage >= 2 ? "translateX(0)" : "translateX(-12px)",
            transition:
              "max-width 700ms var(--mf-ease-out), opacity 500ms ease 120ms, transform 700ms var(--mf-ease-out)",
          }}
        >
          <span style={{ fontSize: "1.625rem", fontWeight: 700, letterSpacing: "0.2px", whiteSpace: "nowrap" }}>
            <span style={{ color: BRAND_GREEN, fontWeight: 800 }}>m</span>
            <span style={{ color: "#FFFFFF" }}>framapa</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── Slides phase ── */
function SlidesPhase({ onDone }) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef(null);
  const t = useT();

  function goNext() {
    if (index < SLIDES.length - 1) {
      setIndex((i) => i + 1);
    } else {
      onDone();
    }
  }

  // the slides could only be moved forward, so anyone who wanted to reread the
  // one before Get Started had no way back to it.
  function goBack() {
    setIndex((i) => Math.max(0, i - 1));
  }

  // Animate the slide track via CSS translate
  const translateX = `-${index * 100}%`;

  return (
    <div
      className="flex min-h-[100dvh] flex-col overflow-hidden"
      style={{
        backgroundColor: "#0A0D12",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Header — logo */}
      <div className="flex shrink-0 items-center px-6 pt-4 pb-2">
        <MframapaLogo size="sm" markOnly />
      </div>

      {/* Slide track */}
      <div className="flex flex-1 overflow-hidden">
        <div
          ref={trackRef}
          className="flex w-full"
          style={{
            transform: `translateX(${translateX})`,
            transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
            willChange: "transform",
          }}
        >
          {SLIDES.map((slide, i) => {
            const IconComp = slide.icon;
            return (
              <div
                key={i}
                className="flex w-full shrink-0 flex-col items-center justify-center px-6"
                style={{ minWidth: "100%" }}
              >
                {/* Icon in gradient circle */}
                <div
                  style={{
                    width: "min(75vw, 280px)",
                    height: "min(75vw, 280px)",
                    borderRadius: "50%",
                    background: "radial-gradient(circle at 40% 40%, #0D3325, #071810)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "40px",
                    flexShrink: 0,
                  }}
                >
                  {IconComp ? (
                    <IconComp size={120} color={BRAND_GREEN} style={{ opacity: 0.9 }} aria-hidden="true" />
                  ) : (
                    <MframapaLogo size="xl" markOnly />
                  )}
                </div>

                {/* Text block */}
                <div className="flex flex-col items-center gap-3 text-center">
                  <h1 className="text-2xl font-bold leading-8" style={{ color: "#FFFFFF" }}>
                    {t(slide.titleKey)}
                  </h1>
                  <p className="text-sm leading-5" style={{ color: "#9AA7B5" }}>
                    {t(slide.subKey)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom — dots + button */}
      <div
        className="flex shrink-0 flex-col items-center gap-5 px-6 pb-6"
      >
        {/* Dots double as jump targets, so any slide can be revisited */}
        <div className="flex gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setIndex(i)}
              style={{
                width: 8,
                height: 8,
                padding: 0,
                border: "none",
                cursor: "pointer",
                borderRadius: 4,
                backgroundColor: i === index ? BRAND_GREEN : MUTED,
                transition: "background-color 0.25s",
              }}
            />
          ))}
        </div>

        <PrimaryButton
          label={
            index === SLIDES.length - 1
              ? t("screen.onboarding.get_started")
              : t("screen.onboarding.next")
          }
          onClick={goNext}
        />

        <button
          type="button"
          onClick={goBack}
          disabled={index === 0}
          style={{
            background: "none",
            border: "none",
            padding: "4px 8px",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: index === 0 ? "default" : "pointer",
            opacity: index === 0 ? 0 : 1,
            color: MUTED,
            transition: "opacity 0.2s",
          }}
        >
          {t("common.back")}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────── Permissions phase ── */
function PermissionsPhase({ onDone, canInstall, onInstall }) {
  const [requesting, setRequesting] = useState(false);
  const t = useT();

  async function handleInstall() {
    await onInstall?.();
  }

  async function handleAllow() {
    if (requesting) return;
    setRequesting(true);
    try {
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 8000,
        });
      });
    } catch {
      // Denied or unavailable — still proceed
    } finally {
      setRequesting(false);
      onDone();
    }
  }

  function handleSkip() {
    onDone();
  }

  return (
    <div
      className="flex min-h-[100dvh] flex-col px-6"
      style={{
        backgroundColor: "#0A0D12",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Logo */}
      <div className="flex shrink-0 items-center justify-center pt-4 pb-2">
        <MframapaLogo size="md" markOnly />
      </div>

      {/* Center content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        {/* Icon circle */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            border: `2px solid ${BRAND_GREEN}`,
            backgroundColor: "rgba(0, 200, 150, 0.08)",
            boxShadow: `0 0 20px rgba(0, 200, 150, 0.25)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 8,
          }}
        >
          <MapPin size={52} color={BRAND_GREEN} />
        </div>

        <h1
          className="text-center text-[1.625rem] font-bold"
          style={{ color: "#FFFFFF" }}
        >
          {t("screen.permissions.title")}
        </h1>

        <p
          className="text-center text-[0.9375rem] leading-[22px]"
          style={{ color: "#9AA7B5" }}
        >
          {t(
            "screen.permissions.body",
            "We use your location to find the nearest city and show local air quality. Location data is never stored on our servers."
          )}
        </p>
      </div>

      {/* Bottom buttons */}
      <div className="flex shrink-0 flex-col items-center gap-3 pb-4">
        <PrimaryButton
          label={t("screen.permissions.allow")}
          onClick={handleAllow}
          loading={requesting}
        />
        <OutlineButton
          label={t("screen.permissions.not_now")}
          onClick={handleSkip}
          color={MUTED}
        />

        {canInstall ? (
          <button
            type="button"
            onClick={handleInstall}
            className="text-[0.875rem] font-semibold active:opacity-70"
            style={{ color: BRAND_GREEN }}
          >
            {t("onboarding.install", "Install app")}
          </button>
        ) : null}

        {/* Progress dots (two dots — permissions is step 2 of 2 post-slides) */}
        <div className="flex gap-2 mt-1">
          <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND_GREEN }} />
          <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: MUTED }} />
        </div>

        <button
          type="button"
          onClick={handleSkip}
          className="text-[0.8125rem]"
          style={{ color: BRAND_GREEN }}
        >
          {t("screen.permissions.setup_later")}
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────── OnboardingScreen root ── */
export function OnboardingScreen({ canInstall, onInstall }) {
  const { state, dispatch } = useAppState();
  const [phase, setPhase] = useState("splash"); // "splash" | "slides" | "permissions"
  const liteMode = state.preferences?.liteMode ?? false;

  function completeOnboarding() {
    dispatch({ type: "COMPLETE_ONBOARDING" });
  }

  // one moving backdrop across all three phases, so first run feels continuous
  // rather than like three separate screens.
  //
  // Deliberately no sign-in and no health-profile step here: the app is
  // usable as a guest, and personalization (health profile, tightened
  // thresholds) is opt-in from Profile once someone chooses to sign in —
  // never a gate on first open.
  return (
    <>
      <MorphBackground isDark liteMode={liteMode} />
      <div style={{ position: "relative", zIndex: 1 }}>
        {phase === "splash" ? (
          <SplashPhase onDone={() => setPhase("slides")} />
        ) : phase === "slides" ? (
          <SlidesPhase onDone={() => setPhase("permissions")} />
        ) : (
          <PermissionsPhase
            onDone={completeOnboarding}
            canInstall={canInstall}
            onInstall={onInstall}
          />
        )}
      </div>
    </>
  );
}
