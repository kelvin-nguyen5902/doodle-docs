import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isValidUsername } from "../lib/username";

const PASSWORD_RESET_BANNER_MS = 3000;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

const inputStyle: React.CSSProperties = {
  padding: "13px 14px",
  border: "1px solid var(--border-input)",
  borderRadius: 10,
  background: "var(--card)",
  fontSize: 15,
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontFamily: "'Geist Mono', monospace",
  fontSize: 11,
  letterSpacing: ".11em",
  color: "var(--text-secondary)",
  textTransform: "uppercase",
};

export default function AuthPage() {
  const { isAuthenticated, signIn, signUp, requestPasswordReset } = useAuth();
  const location = useLocation();
  const [justResetPassword, setJustResetPassword] = useState(
    () => Boolean((location.state as { passwordReset?: boolean } | null)?.passwordReset)
  );
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (!justResetPassword) return;
    const timeout = setTimeout(() => setJustResetPassword(false), PASSWORD_RESET_BANNER_MS);
    return () => clearTimeout(timeout);
  }, [justResetPassword]);

  // Login, register, and forgot-password share the email/password fields —
  // clear them on every switch so one form's input doesn't carry into another.
  function switchMode(next: "login" | "register" | "forgot") {
    setMode(next);
    setEmail("");
    setPassword("");
    setConfirm("");
    setFullName("");
    setUsername("");
    setError("");
    setResetSent(false);
  }

  if (isAuthenticated) return <Navigate to="/" replace />;

  const isRegister = mode === "register";
  const isForgot = mode === "forgot";

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(trimmedEmail);
      setResetSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim();

    if (!isRegister) {
      if (!trimmedEmail) {
        setError("Enter your email or username.");
        return;
      }
      setSubmitting(true);
      try {
        await signIn(trimmedEmail, password);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
      setError("Enter a valid email address, or leave it blank.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!fullName.trim()) {
      setError("Enter your name.");
      return;
    }
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError("Pick a username so collaborators can find you.");
      return;
    }
    if (!isValidUsername(trimmedUsername)) {
      setError("Username must start with a letter and can only contain letters, numbers, '.' and '_'.");
      return;
    }

    setSubmitting(true);
    try {
      await signUp(trimmedEmail || null, password, fullName.trim(), trimmedUsername.toLowerCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 40px" }}>
        <form
          onSubmit={isForgot ? handleForgotSubmit : handleSubmit}
          style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 22 }}
        >
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.02em" }}>Doodle Docs</span>
          </div>
          {isForgot ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {resetSent ? (
                <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  If an account exists for that email, we've sent a link to reset your password.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Enter your email and we'll send you a link to reset your password.
                  </div>
                  <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    <span style={labelStyle}>Email</span>
                    <input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} />
                  </label>
                  {error && (
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--danger)",
                        background: "var(--danger-bg)",
                        border: "1px solid var(--danger-border)",
                        padding: "10px 12px",
                        borderRadius: 9,
                      }}
                    >
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      marginTop: 4,
                      padding: 13,
                      border: "none",
                      borderRadius: 10,
                      background: "var(--ac)",
                      color: "var(--card)",
                      fontSize: 15,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Send reset link
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => switchMode("login")}
                style={{
                  padding: 13,
                  border: "1px solid var(--border-input)",
                  borderRadius: 10,
                  background: "var(--card)",
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Back to sign in
              </button>
            </div>
          ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {justResetPassword && !isRegister && (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text)",
                  background: "var(--active-row)",
                  border: "1px solid var(--border)",
                  padding: "10px 12px",
                  borderRadius: 9,
                }}
              >
                Password updated — sign in with your new password.
              </div>
            )}
            {isRegister && (
              <>
                <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <span style={labelStyle}>Name</span>
                  <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <span style={labelStyle}>Username</span>
                  <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} />
                </label>
              </>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <span style={labelStyle}>{isRegister ? "Email (optional)" : "Email or username"}</span>
              <input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <span style={labelStyle}>Password</span>
              <input
                style={inputStyle}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {!isRegister && (
              <button
                type="button"
                onClick={() => switchMode("forgot")}
                style={{
                  alignSelf: "flex-end",
                  marginTop: -12,
                  padding: 0,
                  border: "none",
                  background: "none",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Forgot password?
              </button>
            )}
            {isRegister && (
              <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span style={labelStyle}>Confirm password</span>
                <input
                  style={inputStyle}
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="repeat your password"
                />
              </label>
            )}
            {error && (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--danger)",
                  background: "var(--danger-bg)",
                  border: "1px solid var(--danger-border)",
                  padding: "10px 12px",
                  borderRadius: 9,
                }}
              >
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              style={{
                marginTop: 4,
                padding: 13,
                border: "none",
                borderRadius: 10,
                background: "var(--ac)",
                color: "var(--card)",
                fontSize: 15,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {isRegister ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => switchMode(isRegister ? "login" : "register")}
              style={{
                padding: 13,
                border: "1px solid var(--border-input)",
                borderRadius: 10,
                background: "var(--card)",
                fontSize: 15,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {isRegister ? "Back to sign in" : "Create account"}
            </button>
          </div>
          )}
        </form>
      </div>
    </div>
  );
}
