import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useInvitationsContext } from "../context/InvitationsContext";
import { Avatar, colorForId } from "./Avatar";

const COLLAPSE_KEY = "dd_sidebar_collapsed";
const EXPANDED_WIDTH = 252;
const COLLAPSED_WIDTH = 64;
const FORCE_COLLAPSE_QUERY = "(max-width: 499px)";

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function useForcedNarrowCollapse(): boolean {
  const [forced, setForced] = useState(() => window.matchMedia(FORCE_COLLAPSE_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(FORCE_COLLAPSE_QUERY);
    const onChange = () => setForced(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return forced;
}

export default function Sidebar() {
  const { profile } = useAuth();
  const { invitations } = useInvitationsContext();
  const navigate = useNavigate();
  const [collapsedPref, setCollapsedPref] = useState(loadCollapsed);
  const forcedNarrow = useForcedNarrowCollapse();
  const collapsed = collapsedPref || forcedNarrow;

  function toggleCollapsed() {
    setCollapsedPref((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  const iconButtonStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    border: "none",
    background: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    borderRadius: 7,
    fontSize: 26,
  };

  return (
    <div
      className="sidebar-shell"
      style={{
        width: collapsed ? COLLAPSED_WIDTH : `min(${EXPANDED_WIDTH}px, 33vw)`,
        flex: "none",
        position: "sticky",
        top: 0,
        zIndex: 40,
        transition: "width .15s ease-out",
      }}
    >
      {!forcedNarrow && (
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            position: "absolute",
            top: "50%",
            right: -12,
            transform: "translateY(-50%)",
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(26,26,25,.1)",
            zIndex: 10,
          }}
        >
          {collapsed ? "»" : "«"}
        </button>
      )}

      <div
        style={{
          width: "100%",
          height: "100%",
          background: "var(--card)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          padding: collapsed ? "20px 10px" : "20px 16px",
          gap: 18,
          transition: "padding .15s ease-out",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, padding: collapsed ? 0 : "0 6px", justifyContent: collapsed ? "center" : "flex-start" }}>
          <div
            style={{
              width: 32,
              height: 32,
              flex: "none",
              borderRadius: 9,
              background: "var(--ac)",
              display: "grid",
              placeItems: "center",
              color: "var(--card)",
              fontSize: 17,
            }}
          >
            ✎
          </div>
          {!collapsed && <span className="sidebar-logo-text" style={{ fontWeight: 600, letterSpacing: "-.015em", whiteSpace: "nowrap" }}>Doodle Docs</span>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={() => navigate("/")}
            title="Documents"
            className="sidebar-nav-btn"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              padding: collapsed ? "9px 0" : "9px 10px",
              border: "1px solid var(--border)",
              borderRadius: 9,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {collapsed ? "▤" : <span>Documents</span>}
          </button>
          <button
            onClick={() => navigate("/invitations")}
            title="Invitations"
            className="sidebar-nav-btn"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "space-between",
              padding: collapsed ? "9px 0" : "9px 10px",
              border: "1px solid var(--border)",
              borderRadius: 9,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {!collapsed && <span>Invitations</span>}
            <span
              style={{
                minWidth: 20,
                height: 20,
                borderRadius: 99,
                display: "grid",
                placeItems: "center",
                fontSize: 11,
                fontWeight: 500,
                padding: "0 6px",
                background: invitations.length ? "var(--ac)" : "var(--divider)",
                color: invitations.length ? "var(--card)" : "var(--text-muted)",
              }}
            >
              {invitations.length}
            </span>
          </button>
        </div>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: 9,
              padding: "8px 6px",
              borderTop: "1px solid var(--divider)",
            }}
          >
            <Avatar label={profile?.full_name || profile?.username || "Y"} color={colorForId(profile?.id || "")} size={28} />
            {!collapsed && (
              <>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {profile?.full_name || profile?.username}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {profile?.email || (profile?.full_name ? `@${profile.username}` : "")}
                  </div>
                </div>
                <button onClick={() => navigate("/settings")} title="Settings" style={iconButtonStyle}>
                  ⚙
                </button>
              </>
            )}
          </div>
          {collapsed && (
            <button onClick={() => navigate("/settings")} title="Settings" style={{ ...iconButtonStyle, alignSelf: "center" }}>
              ⚙
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
