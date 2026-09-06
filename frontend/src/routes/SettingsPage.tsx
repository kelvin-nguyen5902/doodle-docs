import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, ApiRequestError } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import { isValidUsername } from "../lib/username";

const inputStyle: React.CSSProperties = {
  padding: "11px 13px",
  border: "1px solid var(--border-input)",
  borderRadius: 9,
  background: "var(--card)",
  fontSize: 14,
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontFamily: "'Geist Mono', monospace",
  fontSize: 10,
  letterSpacing: ".1em",
  color: "var(--text-secondary)",
  textTransform: "uppercase",
};

const cardStyle: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 13,
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  maxWidth: 480,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  border: "none",
  borderRadius: 8,
  background: "var(--ac)",
  color: "var(--card)",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  alignSelf: "flex-start",
};

export default function SettingsPage() {
  const { profile, refreshProfile, signOut } = useAuth();
  const { flash } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [username, setUsername] = useState(profile?.username || "");
  const [profileError, setProfileError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name || "");
    setUsername(profile?.username || "");
  }, [profile]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [deleting, setDeleting] = useState(false);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError("");
    if (!fullName.trim()) return setProfileError("Enter your name.");
    const trimmedUsername = username.trim();
    if (!trimmedUsername) return setProfileError("Enter a username.");
    if (!isValidUsername(trimmedUsername)) {
      return setProfileError("Username must start with a letter and can only contain letters, numbers, '.' and '_'.");
    }

    setSavingProfile(true);
    try {
      await api.patch("/me", { full_name: fullName.trim(), username: trimmedUsername.toLowerCase() });
      await refreshProfile();
      flash("Profile updated");
    } catch (err) {
      setProfileError(err instanceof ApiRequestError ? err.message : "Could not update profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    if (password.length < 6) return setPasswordError("Password must be at least 6 characters.");
    if (password !== confirmPassword) return setPasswordError("Passwords do not match.");

    setSavingPassword(true);
    try {
      await api.patch("/me/password", { password });
      setPassword("");
      setConfirmPassword("");
      flash("Password updated");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm("Delete your account? This permanently deletes your profile and every document you own. This cannot be undone.")) {
      return;
    }
    setDeleting(true);
    try {
      await api.delete("/me");
      await signOut();
      navigate("/auth", { replace: true });
    } catch (err) {
      flash(err instanceof ApiRequestError ? err.message : "Could not delete account.");
      setDeleting(false);
    }
  }

  return (
    <div style={{ padding: "44px 52px", maxWidth: 760, display: "flex", flexDirection: "column", gap: 30 }}>
      <div>
        <h1 className="page-heading" style={{ margin: "0 0 6px", letterSpacing: "-.025em", fontWeight: 600 }}>Settings</h1>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>Manage your account.</p>
      </div>

      <form onSubmit={handleSaveProfile} style={cardStyle}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Profile</h3>
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={labelStyle}>Name</span>
          <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={labelStyle}>Username</span>
          <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={labelStyle}>Email</span>
          <input style={{ ...inputStyle, color: "var(--text-muted)" }} value={profile?.email || ""} disabled />
        </label>
        {profileError && (
          <div style={{ fontSize: 13, color: "var(--danger)", background: "var(--danger-bg)", border: "1px solid var(--danger-border)", padding: "10px 12px", borderRadius: 9 }}>
            {profileError}
          </div>
        )}
        <button type="submit" disabled={savingProfile} style={primaryButtonStyle}>
          {savingProfile ? "Saving…" : "Save changes"}
        </button>
      </form>

      <form onSubmit={handleChangePassword} style={cardStyle}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Password</h3>
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={labelStyle}>New password</span>
          <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={labelStyle}>Confirm new password</span>
          <input style={inputStyle} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </label>
        {passwordError && (
          <div style={{ fontSize: 13, color: "var(--danger)", background: "var(--danger-bg)", border: "1px solid var(--danger-border)", padding: "10px 12px", borderRadius: 9 }}>
            {passwordError}
          </div>
        )}
        <button type="submit" disabled={savingPassword} style={primaryButtonStyle}>
          {savingPassword ? "Updating…" : "Update password"}
        </button>
      </form>

      <div style={cardStyle}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Session</h3>
        <button
          onClick={signOut}
          style={{ padding: "10px 16px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", fontSize: 13, cursor: "pointer", alignSelf: "flex-start" }}
        >
          Sign out
        </button>
      </div>

      <div style={{ ...cardStyle, borderColor: "var(--danger-border)" }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
          Permanently delete your account and every document you own. Documents shared with you by others are unaffected.
        </p>
        <button
          onClick={handleDeleteAccount}
          disabled={deleting}
          style={{ padding: "10px 16px", border: "none", borderRadius: 8, background: "var(--danger)", color: "var(--card)", fontSize: 13, fontWeight: 500, cursor: "pointer", alignSelf: "flex-start" }}
        >
          {deleting ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </div>
  );
}
