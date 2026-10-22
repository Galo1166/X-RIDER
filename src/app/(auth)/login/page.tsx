"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Fingerprint, KeyRound, Pencil, RefreshCw, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";

type AuthMode = "login" | "signup" | "forgot";

function normalizeNigerianPhone(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("234")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return /^[789]\d{9}$/.test(digits) ? `+234${digits}` : null;
}

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<AuthMode>("login");
  const [stage, setStage] = useState<"details" | "code">("details");
  const [loginWithOtp, setLoginWithOtp] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [devCode, setDevCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  function postAuthPath(): string {
    return new URLSearchParams(window.location.search).get("next") === "/rider/login"
      ? "/rider/login"
      : "/home";
  }

  const normalizedPhone = normalizeNigerianPhone(phone);
  const validName = fullName.trim().length >= 2 && fullName.trim().length <= 100;
  const validPassword = password.length >= 8 && new TextEncoder().encode(password).length <= 128;
  const passwordsMatch = password === confirmPassword;
  const canRequestCode = normalizedPhone !== null && (
    mode === "forgot" ||
    mode === "login" && loginWithOtp ||
    mode === "signup" && validName && validPassword && passwordsMatch && termsAccepted
  );
  const canSubmitDetails = mode === "login" && !loginWithOtp
    ? normalizedPhone !== null && password.length > 0
    : canRequestCode;
  const canSubmitCode = /^\d{6}$/.test(code) && challengeId.length > 0 && (
    mode !== "forgot" || validPassword && passwordsMatch
  );

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  function clearChallenge() {
    setCode("");
    setChallengeId("");
    setDevCode("");
    setResendIn(0);
  }

  function goBack() {
    if (stage === "code") {
      setStage("details");
      clearChallenge();
      return;
    }
    if (mode !== "login") {
      switchMode("login");
      return;
    }
    if (window.history.length > 1) window.history.back();
    else router.replace("/");
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setStage("details");
    setLoginWithOtp(false);
    setPassword("");
    setConfirmPassword("");
    clearChallenge();
  }

  async function requestCode() {
    if (!normalizedPhone) {
      toast("Enter a valid Nigerian mobile number, for example 803 123 4567.");
      return;
    }
    if (mode === "signup" && !validName) {
      toast("Enter your full name to create an account.");
      return;
    }
    if (mode === "signup" && !validPassword) {
      toast("Choose a password with at least 8 characters (maximum 128 bytes).");
      return;
    }
    if (mode === "signup" && !passwordsMatch) {
      toast("Your passwords do not match.");
      return;
    }
    if (mode === "signup" && !termsAccepted) {
      toast("Please accept the terms to create an account.");
      return;
    }

    const purpose = mode === "forgot" ? "password_reset" : mode === "signup" ? "signup" : "login";
    setBusy(true);
    try {
      const challenge = await api.requestPhoneOtp(normalizedPhone, purpose, mode === "signup"
        ? { name: fullName.trim(), password, termsAccepted }
        : undefined);
      setChallengeId(challenge.challengeId);
      setDevCode(challenge.devCode ?? "");
      setCode("");
      setStage("code");
      setResendIn(60);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not send a verification code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitDetails() {
    if (!normalizedPhone) {
      toast("Enter a valid Nigerian mobile number, for example 803 123 4567.");
      return;
    }
    if (mode === "login" && !loginWithOtp) {
      setBusy(true);
      try {
        await api.signIn(normalizedPhone, password);
        router.replace(postAuthPath());
      } catch (error) {
        toast(error instanceof Error ? error.message : "Could not sign in. Please try again.");
      } finally {
        setBusy(false);
      }
      return;
    }
    await requestCode();
  }

  async function submitCode() {
    if (!canSubmitCode) {
      toast(mode === "forgot"
        ? "Enter the six-digit code and matching new password fields."
        : "Enter the six-digit verification code.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "forgot") {
        await api.resetPassword(normalizedPhone!, challengeId, code, password);
        switchMode("login");
        toast("Password reset. Sign in with your new password.");
      } else {
        await api.verifyPhoneOtp(normalizedPhone!, challengeId, code);
        router.replace(postAuthPath());
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not verify the code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const title = stage === "code"
    ? mode === "forgot" ? "Reset your password" : "Verify your number"
    : mode === "login" ? "Welcome back" : mode === "signup" ? "Create account" : "Forgot password?";
  const subtitle = stage === "code"
    ? mode === "forgot"
      ? `Enter the code sent to ${normalizedPhone ?? phone} and choose a new password.`
      : `Enter the six-digit code sent to ${normalizedPhone ?? phone}.`
    : mode === "login"
      ? loginWithOtp
        ? "Sign in with a one-time code sent to your Nigerian mobile number."
        : "Sign in securely with your Nigerian mobile number and password."
      : mode === "signup"
        ? "Create your account with your name, phone number, and a secure password."
        : "Enter the Nigerian mobile number linked to your account to reset your password.";

  return (
    <div className="login-screen">
      <header className="login-header">
        <button aria-label={stage === "code" ? "Edit phone number" : "Back"} className="icon-button" type="button" onClick={goBack}>
          <ArrowLeft aria-hidden="true" size={24} />
        </button>

        <div className="brand-block">
          <span className="brand-logo-mark" aria-hidden="true">X</span>
          <span className="brand-name">X-RIDER</span>
        </div>

        <div className="header-user-avatar" aria-label="Account security">
          <ShieldCheck aria-hidden="true" size={18} />
        </div>
      </header>

      <main className="login-main">
        <div className="login-panel">
          <div className="welcome-band">
            <span className="status-dot" />
            <span>{stage === "code" ? mode === "forgot" ? "Secure password reset" : "Secure verification" : "Fast Lane Booking"}</span>
          </div>

          <h1 className="login-title">{title}</h1>
          <p className="login-subtitle">{subtitle}</p>

          <div className="login-card">

            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (stage === "details") void submitDetails();
                else void submitCode();
              }}
            >
              {stage === "details" ? (
                <>
                  {mode === "signup" && (
                    <div className="field-group">
                      <label className="field-label" htmlFor="full-name">Full name</label>
                      <div className="input-shell input-with-icon">
                        <UserRound aria-hidden="true" className="input-icon" size={20} />
                        <input
                          id="full-name"
                          type="text"
                          autoComplete="name"
                          placeholder="Your full name"
                          maxLength={100}
                          required
                          value={fullName}
                          onChange={(event) => setFullName(event.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="field-group">
                    <label className="field-label" htmlFor="phone">Mobile number</label>
                    <div className="input-shell phone-shell">
                      <span className="country-picker" aria-label="Nigeria country code">
                        <span className="country-flag">🇳🇬</span>
                        <span className="country-code">+234</span>
                      </span>
                      <input
                        id="phone"
                        type="tel"
                        autoComplete="tel-national"
                        inputMode="numeric"
                        placeholder="803 123 4567"
                        aria-describedby="phone-hint"
                        required
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                      />
                    </div>
                    <span id="phone-hint" className="field-hint">Enter 10 digits after +234. You may include the leading 0.</span>
                  </div>

                  {mode === "login" && !loginWithOtp && (
                    <div className="field-group">
                      <label className="field-label" htmlFor="password">Password</label>
                      <input
                        id="password"
                        className="password-input"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                      <div className="field-row">
                        <button type="button" className="text-link" onClick={() => switchMode("forgot")}>Forgot password?</button>
                        <button type="button" className="text-link" onClick={() => setLoginWithOtp(true)}>Sign in with a code</button>
                      </div>
                    </div>
                  )}

                  {mode === "signup" && (
                    <>
                      <div className="field-group">
                        <label className="field-label" htmlFor="signup-password">Create password</label>
                        <input
                          id="signup-password"
                          className="password-input"
                          type="password"
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={128}
                          required
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                        />
                        <span className="field-hint">Use at least 8 characters. Your phone will be verified before the account is created.</span>
                      </div>
                      <div className="field-group">
                        <label className="field-label" htmlFor="confirm-password">Confirm password</label>
                        <input
                          id="confirm-password"
                          className="password-input"
                          type="password"
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={128}
                          required
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                        />
                        {confirmPassword && !passwordsMatch && <span className="field-hint error-hint">Passwords do not match.</span>}
                      </div>
                      <label className="terms-row">
                        <input
                          type="checkbox"
                          required
                          checked={termsAccepted}
                          onChange={(event) => setTermsAccepted(event.target.checked)}
                        />
                        <span>I agree to X-RIDER&apos;s terms and privacy policy.</span>
                      </label>
                    </>
                  )}

                  <button type="submit" className="primary-action" disabled={busy || !canSubmitDetails}>
                    <span>
                      {busy
                        ? mode === "login" && !loginWithOtp ? "Signing in…" : "Sending code…"
                        : mode === "login" && !loginWithOtp
                          ? "Log in"
                          : mode === "forgot" ? "Send reset code" : "Continue with verification"}
                    </span>
                    {busy ? <RefreshCw aria-hidden="true" className="spin-icon" size={20} /> : <ArrowRight aria-hidden="true" size={22} />}
                  </button>
                  {mode === "signup" && !canSubmitDetails && (
                    <p className="form-hint" role="status">Enter your details, matching passwords, and accept the terms to continue.</p>
                  )}
                  {mode === "forgot" && !normalizedPhone && (
                    <p className="form-hint" role="status">Enter a valid Nigerian mobile number to continue.</p>
                  )}
                </>
              ) : (
                <>
                  <div className="field-group">
                    <label className="field-label" htmlFor="otp-code">6-digit verification code</label>
                    <input
                      id="otp-code"
                      className="otp-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      placeholder="000000"
                      required
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </div>

                  {mode === "forgot" && (
                    <>
                      <div className="field-group">
                        <label className="field-label" htmlFor="new-password">New password</label>
                        <input
                          id="new-password"
                          className="password-input"
                          type="password"
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={128}
                          required
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                        />
                        <span className="field-hint">Use at least 8 characters.</span>
                      </div>
                      <div className="field-group">
                        <label className="field-label" htmlFor="confirm-new-password">Confirm new password</label>
                        <input
                          id="confirm-new-password"
                          className="password-input"
                          type="password"
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={128}
                          required
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                        />
                        {confirmPassword && !passwordsMatch && <span className="field-hint error-hint">Passwords do not match.</span>}
                      </div>
                    </>
                  )}

                  {devCode && (
                    <p className="dev-otp-note" role="status">
                      Development preview only — SMS is not configured. Your test code is <strong>{devCode}</strong>.
                    </p>
                  )}

                  <button type="submit" className="primary-action" disabled={busy || !canSubmitCode}>
                    <span>
                      {busy
                        ? mode === "forgot" ? "Resetting password…" : "Verifying…"
                        : mode === "forgot" ? "Reset password" : "Verify and continue"}
                    </span>
                    {busy ? <RefreshCw aria-hidden="true" className="spin-icon" size={20} /> : <Check aria-hidden="true" size={22} />}
                  </button>

                  <div className="otp-actions">
                    <button type="button" className="text-link" onClick={goBack} disabled={busy}>
                      <Pencil aria-hidden="true" size={14} /> Change number
                    </button>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => void requestCode()}
                      disabled={busy || resendIn > 0}
                    >
                      {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                    </button>
                  </div>
                </>
              )}
            </form>

            {stage === "details" && (
              <div className="signin-prompt">
                {mode === "login"
                  ? loginWithOtp ? "Prefer your password?" : "New to X-RIDER?"
                  : mode === "signup" ? "Already have an account?" : "Remembered your password?"}
                <button
                  type="button"
                  className="text-link signup-link"
                  onClick={() => {
                    if (mode === "login" && loginWithOtp) setLoginWithOtp(false);
                    else switchMode(mode === "login" ? "signup" : "login");
                  }}
                  disabled={busy}
                >
                  {mode === "login" ? loginWithOtp ? "Use password" : "Create account" : "Log in"}
                </button>
              </div>
            )}

            <p className="security-note">
              Verification codes expire after five minutes. Local development displays a test code; configure an SMS provider before launch.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
