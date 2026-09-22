/**
 * Auth screens — mirrors mobile/src/screens/onboarding/
 *   LoginScreen.tsx  → <LoginView>
 *   SignUpScreen.tsx → <SignUpView>
 *   ForgotPasswordScreen.tsx → <ForgotView>
 *
 * All views have transparent backgrounds so CloudRainBackground shows through,
 * matching the mobile behaviour exactly.
 */
import { useId, useMemo, useState } from "react";
import { Mail, Lock, MapPin, User, Eye, EyeOff } from "lucide-react";
import { useAppState } from "../../state/appState.jsx";
import { login, signup, resetPassword } from "../../services/authService.js";
import { useTranslation } from "../../hooks/useTranslation.js";
import { useStackChrome, stackTitlePad } from "../../hooks/useStackChrome.js";
import { africanCities } from "../../data/africanCities.js";
import { isValidEmail, passwordProblem } from "../../utils/validators.js";
import { normalizeError } from "../../services/httpClient.js";
import { MframapaLogo } from "../../components/brand/MframapaLogo.jsx";
import { PrimaryButton } from "../../components/ui/PrimaryButton.jsx";
import { StackBackButton } from "../../components/navigation/StackBackButton.jsx";

const GREEN = "#00C896";

// this screen used a single dark palette, so in light mode the headings and
// labels were white on white. colours now follow the app theme.
function palette(isDark) {
  return isDark
    ? { TEXT: "#FFFFFF", SUBTEXT: "#9AA7B5", MUTED: "#647182", BORDER: "#25303C", SURFACE: "#1E2733", BG: "#0A0D12" }
    : { TEXT: "#0F1419", SUBTEXT: "#5C6B7A", MUTED: "#7B8A99", BORDER: "#D4DAE3", SURFACE: "#FFFFFF", BG: "#E8ECF2" };
}

// ── Shared field ──────────────────────────────────────────────────────────────
function Field({ label, placeholder, value, onChange, type = "text", icon: Icon, secure, autoComplete, c, listId }) {
  const [show, setShow] = useState(false);
  const inputId = useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && (
        <label htmlFor={inputId} style={{ fontSize: "0.8125rem", fontWeight: 500, color: c.SUBTEXT }}>{label}</label>
      )}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        borderRadius: 12, border: `1px solid ${c.BORDER}`,
        backgroundColor: c.SURFACE,
        paddingLeft: 14, paddingRight: 14, paddingTop: 14, paddingBottom: 14,
      }}>
        {Icon && <Icon size={18} color={c.MUTED} aria-hidden="true" />}
        <input
          id={inputId}
          list={listId}
          type={secure ? (show ? "text" : "password") : type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: "0.9375rem", color: c.TEXT }}
          className="placeholder:opacity-40"
        />
        {secure && (
          <button type="button"
            aria-label={show ? "Hide password" : "Show password"}
            onClick={() => setShow((v) => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, opacity: 0.6, lineHeight: 1, minWidth: 24, minHeight: 24 }}>
            {show ? <EyeOff size={18} color={c.MUTED} /> : <Eye size={18} color={c.MUTED} />}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Transparent scroll wrapper (matches mobile KeyboardAvoidingView + ScrollView) ──
function AuthScroll({ children }) {
  const inStack = useStackChrome();
  return (
    <div style={{
      // Parent stack chrome already scrolls + owns safe-area; avoid nested traps.
      minHeight: inStack ? undefined : "100dvh",
      overflowY: inStack ? "visible" : "auto",
      paddingTop: inStack ? 0 : "env(safe-area-inset-top)",
      paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      <div style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 16, paddingBottom: 32 }}>
        {children}
      </div>
    </div>
  );
}

// ── Back button row (yields to global stack back when inStack) ─────────────────
function BackBtn({ onPress, c, ariaLabel = "Go back" }) {
  return (
    <StackBackButton
      onClick={onPress}
      color={c.TEXT}
      variant="chevron"
      ariaLabel={ariaLabel}
    />
  );
}

/* ────────────────────────────────────────────────────── LoginView ── */
// Mirrors mobile/src/screens/onboarding/LoginScreen.tsx
function LoginView({ onAuth, onSignUp, onForgot, c, isDark }) {
  const { t } = useTranslation();
  const inStack = useStackChrome();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) { setError(t("auth.error.fill_required")); return; }
    if (!isValidEmail(email)) { setError(t("auth.error.email_invalid")); return; }
    setLoading(true);
    try {
      const result = await login({ email: email.trim(), password });
      onAuth({ ...result, tier: "free" });
    } catch (err) {
      setError(err?.key ? t(err.key) : normalizeError(err, t("auth.error.login_failed")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScroll>
      {/* logoWrap — alignItems center, marginBottom 36 */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 36 }}>
        <MframapaLogo size="lg" isDark={isDark} markOnly />
      </div>

      {/* heading — pad left when global stack back is present */}
      <p style={{ fontSize: "1.75rem", fontWeight: 800, color: c.TEXT, marginBottom: 6, marginTop: 0, paddingLeft: stackTitlePad(inStack) }}>
        {t("auth.login.title")}
      </p>
      {/* sub */}
      <p style={{ fontSize: "0.9375rem", color: c.SUBTEXT, marginBottom: 28, marginTop: 0 }}>
        {t("auth.login.subtitle")}
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {/* Email — marginBottom 16 */}
        <div style={{ marginBottom: 16 }}>
          <Field c={c} label={t("auth.login.email")} placeholder={t("auth.login.email")} value={email} onChange={setEmail}
            type="email" icon={Mail} autoComplete="email" />
        </div>

        {/* Password — marginBottom 0 (forgot sits below) */}
        <div style={{ marginBottom: 4 }}>
          <Field c={c} label={t("auth.login.password")} placeholder={t("auth.login.password")} value={password} onChange={setPassword}
            secure icon={Lock} autoComplete="current-password" />
        </div>

        {/* Forgot password — alignSelf flex-end, marginBottom 24 */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
          <button type="button" onClick={onForgot}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.875rem", fontWeight: 500, color: GREEN }}>
            {t("auth.login.forgot")}
          </button>
        </div>

        {error && (
          <p style={{ fontSize: "0.8125rem", color: "#E53935", backgroundColor: "rgba(229,57,53,0.08)",
            borderRadius: 10, padding: "10px 14px", marginBottom: 12, marginTop: 0 }}>
            {error}
          </p>
        )}

        {/* cta — marginTop 4 */}
        <div style={{ marginTop: 4 }}>
          <PrimaryButton label={t("auth.login.cta")} type="submit" loading={loading} />
        </div>
      </form>

      {/* signupRow — justifyContent center, marginTop 24, gap 6 */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginTop: 24, gap: 6 }}>
        <span style={{ fontSize: "0.875rem", color: c.SUBTEXT }}>{t("auth.login.no_account")}</span>
        <button type="button" onClick={onSignUp}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.875rem", fontWeight: 600, color: GREEN }}>
          {t("auth.login.sign_up")}
        </button>
      </div>
    </AuthScroll>
  );
}

/* ────────────────────────────────────────────────────── SignUpView ── */
// Mirrors mobile/src/screens/onboarding/SignUpScreen.tsx
function SignUpView({ onAuth, onBack, c, isDark }) {
  const { t } = useTranslation();
  const [firstName, setFirstName]           = useState("");
  const [email, setEmail]                   = useState("");
  const [password, setPassword]             = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cityQuery, setCityQuery]           = useState("");
  const [error, setError]                   = useState("");
  const [loading, setLoading]               = useState(false);
  const [notice, setNotice] = useState("");

  // suggestions come from the bundled city list; a plain text input backed by a
  // datalist stays fully usable with a keyboard and a screen reader.
  const suggestions = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    if (q.length < 3) return [];   // show matches only after three letters
    return africanCities.filter((city) => city.name.toLowerCase().includes(q)).slice(0, 6);
  }, [cityQuery]);

  function resolveCity() {
    const q = cityQuery.trim().toLowerCase();
    if (!q) return null;
    return (
      africanCities.find((city) => city.name.toLowerCase() === q) ||
      africanCities.find((city) => city.name.toLowerCase().includes(q)) ||
      null
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setNotice("");
    if (!firstName.trim() || !email.trim() || !password) { setError(t("auth.error.fill_required")); return; }
    if (!isValidEmail(email)) { setError(t("auth.error.email_invalid")); return; }
    const pwProblem = passwordProblem(password);
    if (pwProblem) { setError(t(pwProblem)); return; }
    if (password !== confirmPassword) { setError(t("auth.error.password_mismatch")); return; }
    const homeCity = cityQuery.trim() ? resolveCity() : null;
    if (cityQuery.trim() && !homeCity) { setError(t("auth.error.city_unknown")); return; }
    setLoading(true);
    try {
      const result = await signup({
        firstName: firstName.trim(),
        email: email.trim(),
        password,
        homeCity: homeCity && { name: homeCity.name, lat: homeCity.lat, lon: homeCity.lon },
      });
      if (result.pending) {
        setNotice(t("auth.signup.pending"));
      } else {
        onAuth({ ...result, tier: "free" });
      }
    } catch (err) {
      setError(err?.key ? t(err.key) : normalizeError(err, t("auth.error.signup_failed")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScroll>
      <div style={{ marginBottom: 16 }}>
        <BackBtn c={c} onPress={onBack} ariaLabel={t("common.go_back")} />
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
        <MframapaLogo size="lg" isDark={isDark} markOnly />
      </div>

      <p style={{ fontSize: "1.75rem", fontWeight: 800, color: c.TEXT, marginBottom: 6, marginTop: 0 }}>
        {t("auth.signup.title")}
      </p>
      <p style={{ fontSize: "0.9375rem", color: c.SUBTEXT, marginBottom: 24, marginTop: 0 }}>
        {t("auth.signup.subtitle")}
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <div style={{ marginBottom: 16 }}>
          <Field c={c} label={t("auth.signup.first_name")} placeholder={t("auth.signup.first_name_placeholder")}
            value={firstName} onChange={setFirstName} icon={User} autoComplete="given-name" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Field c={c} label={t("auth.signup.email")} placeholder={t("auth.signup.email")} value={email} onChange={setEmail}
            type="email" icon={Mail} autoComplete="email" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Field c={c} label={t("auth.signup.password")} placeholder={t("auth.signup.password")} value={password} onChange={setPassword}
            secure icon={Lock} autoComplete="new-password" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Field c={c} label={t("auth.signup.confirm")} placeholder={t("auth.signup.confirm")} value={confirmPassword}
            onChange={setConfirmPassword} secure icon={Lock} autoComplete="new-password" />
        </div>
        <div style={{ marginBottom: 4 }}>
          <Field c={c} label={t("auth.signup.home_city")} placeholder={t("auth.signup.home_city_placeholder")}
            value={cityQuery} onChange={setCityQuery} icon={MapPin} autoComplete="off" listId="signup-city-list" />
          <datalist id="signup-city-list">
            {suggestions.map((city) => (
              <option key={`${city.name}-${city.lat}`} value={city.name}>{city.country}</option>
            ))}
          </datalist>
          <p style={{ fontSize: "0.75rem", color: c.MUTED, margin: "6px 2px 0" }}>
            {t("auth.signup.home_city_hint")}
          </p>
        </div>

        {error && (
          <p style={{ fontSize: "0.8125rem", color: "#E53935", backgroundColor: "rgba(229,57,53,0.08)",
            borderRadius: 10, padding: "10px 14px", marginBottom: 12, marginTop: 0 }}>
            {error}
          </p>
        )}
        {notice && (
          <p style={{ fontSize: "0.8125rem", color: GREEN, backgroundColor: "rgba(16,185,129,0.10)",
            borderRadius: 10, padding: "10px 14px", marginBottom: 12, marginTop: 0 }}>
            {notice}
          </p>
        )}

        {/* cta — marginTop 8 */}
        <div style={{ marginTop: 8 }}>
          <PrimaryButton label="Create account" type="submit" loading={loading} />
        </div>
      </form>

      {/* loginRow — justifyContent center, marginTop 24, gap 6 */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginTop: 24, gap: 6 }}>
        <span style={{ fontSize: "0.875rem", color: c.SUBTEXT }}>{t("auth.signup.have_account")}</span>
        <button type="button" onClick={onBack}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.875rem", fontWeight: 600, color: GREEN }}>
          {t("auth.signup.sign_in")}
        </button>
      </div>
    </AuthScroll>
  );
}

/* ────────────────────────────────────────────────── ForgotView ── */
// Mirrors mobile/src/screens/onboarding/ForgotPasswordScreen.tsx
function ForgotView({ onBack , c, isDark }) {
  const { t } = useTranslation();
  const [email, setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]     = useState(false);
  const [error, setError]   = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!isValidEmail(email)) { setError(t("auth.error.email_invalid")); return; }
    setLoading(true);
    try {
      await resetPassword(email.trim());
      // always report the same thing, so this cannot be used to discover which
      // addresses have accounts.
      setSent(true);
    } catch (err) {
      setError(err?.key ? t(err.key) : normalizeError(err, t("auth.error.generic")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScroll>
      {/* backBtn — marginBottom 24 */}
      <div style={{ marginBottom: 24 }}>
        <BackBtn c={c} onPress={onBack} ariaLabel={t("common.go_back")} />
      </div>

      {/* iconWrap — 72×72, borderRadius 22, green bg dim, centered, marginBottom 24 */}
      <div style={{
        width: 72, height: 72, borderRadius: 22,
        backgroundColor: GREEN + "22",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 24px",
      }}>
        <Lock size={40} color={GREEN} />
      </div>

      <p style={{ fontSize: "1.75rem", fontWeight: 800, color: c.TEXT, marginBottom: 6, marginTop: 0 }}>
        {t("auth.forgot.title")}
      </p>
      <p style={{ fontSize: "0.9375rem", color: c.SUBTEXT, marginBottom: 28, marginTop: 0 }}>
        {t("auth.forgot.subtitle")}
      </p>

      {sent ? (
        /* sentBox — green border + bg, flex row, gap 10, borderRadius 12, padding 16 */
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          borderRadius: 12, border: `1px solid ${GREEN}44`,
          backgroundColor: GREEN + "18",
          padding: 16, marginBottom: 16,
        }}>
          {/* checkmark-circle */}
          <div style={{
            width: 20, height: 20, borderRadius: "50%",
            backgroundColor: GREEN, display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="#0A0D12" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p style={{ fontSize: "0.875rem", fontWeight: 500, color: GREEN, margin: 0, flex: 1 }}>
            {t("auth.forgot.sent")}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && (
            <p style={{ fontSize: "0.8125rem", color: "#E53935", backgroundColor: "rgba(229,57,53,0.08)",
              borderRadius: 10, padding: "10px 14px", marginBottom: 12, marginTop: 0 }}>
              {error}
            </p>
          )}
          <div style={{ marginBottom: 16 }}>
            <Field c={c} label={t("auth.login.email")} placeholder="Email" value={email} onChange={setEmail}
              type="email" icon={Mail} autoComplete="email" />
          </div>
          {/* cta — marginTop 8 */}
          <div style={{ marginTop: 8 }}>
            <PrimaryButton label={t("auth.forgot.cta")} type="submit" loading={loading} />
          </div>
        </form>
      )}

      {/* backLinkWrap — alignSelf center, marginTop 24 */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
        <button type="button" onClick={onBack}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.875rem", color: c.SUBTEXT }}>
          {t("auth.forgot.back")}
        </button>
      </div>
    </AuthScroll>
  );
}

/* ── Root ── */
export function AuthScreen({ isDark = true, params }) {
  const { state, dispatch } = useAppState();
  const c = palette(isDark);
  // Sign In from Profile always lands on login (email + password only).
  // "login" | "signup" | "forgot"
  const initial =
    params?.mode === "signup" ? "signup" : params?.mode === "forgot" ? "forgot" : "login";
  const [screen, setScreen] = useState(initial);

  function handleAuth(payload) {
    dispatch({ type: "LOGIN_SUCCESS", payload });
    // One-time Resend welcome after a real session (signup with session or login).
    import("../../services/api.js").then((m) => m.requestWelcomeEmail()).catch(() => undefined);
    // Reconcile the health profile now that there's an account to save it to:
    // an existing server-side profile wins (returning user, new device); a
    // guest's locally-answered onboarding gets pushed up for the first time.
    import("../../services/api.js").then(async (m) => {
      try {
        const server = await m.getHealthProfile();
        if (server?.health_conditions?.length) {
          dispatch({
            type: "UPDATE_PROFILE",
            payload: {
              healthConditions: server.health_conditions,
              homeLocation: server.home_location,
              workLocation: server.work_location,
              routine: server.routine,
            },
          });
        } else if (state.profile.healthConditions?.length) {
          // guest answered onboarding's health-profile step before signing in —
          // nothing on the server yet, so push what they already told us.
          await m.updateHealthProfile({
            healthConditions: state.profile.healthConditions,
            homeLocation: state.profile.homeLocation,
            workLocation: state.profile.workLocation,
            routine: state.profile.routine,
          });
        }
      } catch {
        /* offline, or nothing to reconcile — fine, keep local */
      }
    }).catch(() => undefined);
    // merge any saved locations already on the account into the local list —
    // additive only, never drops a location the device already has saved.
    import("../../services/api.js").then(async (m) => {
      try {
        const remote = await m.listSavedLocationsRemote();
        for (const loc of remote) {
          dispatch({
            type: "SAVE_CITY",
            payload: { name: loc.name, lat: loc.lat, lon: loc.lon, country: loc.country ?? "" },
          });
        }
      } catch {
        /* offline, or nothing saved remotely yet */
      }
    }).catch(() => undefined);
  }

  if (screen === "signup") {
    return <SignUpView onAuth={handleAuth} onBack={() => setScreen("login")} c={c} isDark={isDark} />;
  }
  if (screen === "forgot") {
    return <ForgotView onBack={() => setScreen("login")} c={c} isDark={isDark} />;
  }
  return (
    <LoginView
      onAuth={handleAuth}
      onSignUp={() => setScreen("signup")}
      onForgot={() => setScreen("forgot")}
      c={c}
      isDark={isDark}
    />
  );
}
