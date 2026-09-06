import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, colorForId } from "./Avatar";
import type { PresenceMember } from "../types";

// Below this width the header switches to a compact layout.
const NARROW_QUERY = "(max-width: 480px)";

// Tracks whether the header is currently in its narrow layout.
function useNarrowHeader(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

interface Props {
  title: string;
  onTitleChange: (title: string) => void;
  canEditTitle: boolean;
  saveState: "saved" | "saving";
  presenceMembers: PresenceMember[];
  currentUserId: string;
  currentUserName: string;
  onOpenShare: () => void;
}

export default function EditorHeader({
  title,
  onTitleChange,
  canEditTitle,
  saveState,
  presenceMembers,
  currentUserId,
  currentUserName,
  onOpenShare,
}: Props) {
  const navigate = useNavigate();
  const narrow = useNarrowHeader();
  const others = presenceMembers.filter((m) => m.user_id !== currentUserId);

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 24px" }}>
        <button
          onClick={() => navigate("/")}
          style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: "var(--text-secondary)", flex: "0 0 auto" }}
        >
          ←
        </button>
        <input
          value={title}
          disabled={!canEditTitle}
          onChange={(e) => onTitleChange(e.target.value)}
          title={title}
          maxLength={20}
          // Truncated while unfocused, scrollable once focused. See tokens.css.
          className="editor-title-input"
          style={{
            border: "1px solid transparent",
            background: "none",
            fontSize: 16,
            fontWeight: 500,
            padding: "5px 8px",
            borderRadius: 7,
            flex: narrow ? "0 1 auto" : "1 1 auto",
            minWidth: narrow ? 0 : 180,
            maxWidth: narrow ? "38vw" : 520,
          }}
        />
        {narrow ? (
          // A compact status dot replaces the full label on narrow screens.
          <div
            title={saveState === "saving" ? "Saving…" : "All changes saved"}
            style={{
              flex: "0 0 auto",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: saveState === "saving" ? "var(--pending-text)" : "var(--text-muted)",
              animation: saveState === "saving" ? "blink 1s infinite" : "none",
            }}
          />
        ) : (
          <span
            className="mono"
            style={{
              fontSize: 10.5,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: saveState === "saving" ? "var(--pending-text)" : "var(--text-muted)",
              animation: saveState === "saving" ? "blink 1s infinite" : "none",
              whiteSpace: "nowrap",
            }}
          >
            {saveState === "saving" ? "Saving…" : "All changes saved"}
          </span>
        )}
        <div style={{ display: "flex", alignItems: "center", marginLeft: "auto", flex: "0 0 auto" }}>
          <Avatar label={currentUserName} color={colorForId(currentUserId)} size={28} ring="#f1ece2" overlap title={`${currentUserName} (you)`} />
          {others.map((m) => (
            <Avatar key={m.user_id} label={m.name} color={m.color} size={28} ring="#f1ece2" overlap title={m.name} />
          ))}
        </div>
        <button
          onClick={onOpenShare}
          style={{ marginLeft: 10, padding: "8px 15px", border: "none", borderRadius: 8, background: "var(--ac)", color: "#fff", fontSize: 13, cursor: "pointer", flex: "0 0 auto" }}
        >
          Share
        </button>
      </div>
    </div>
  );
}
