import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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

export default function ResetPasswordPage() {
  const { completePasswordReset } = useAuth();
  const navigate = useNavigate();
  const [accessToken, setAccessToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    setAccessToken(params.get("access_token"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!accessToken) return;

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await completePasswordReset(accessToken, password);
      navigate("/auth", { replace: true, state: { passwordReset: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (accessToken === undefined) return null;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 40px" }}>
        <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.02em" }}>Doodle Docs</span>
          </div>

          {accessToken === null ? (
            <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              This reset link is invalid or has expired. Request a new one from the sign-in page.
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span style={labelStyle}>New password</span>
                <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span style={labelStyle}>Confirm new password</span>
                <input style={inputStyle} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
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
                Reset password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
