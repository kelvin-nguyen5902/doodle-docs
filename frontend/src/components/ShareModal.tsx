import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { Avatar, colorForId } from "./Avatar";
import { useToast } from "./ToastProvider";
import type { Collaborator, SearchResult } from "../types";

interface Props {
  docId: string;
  docTitle: string;
  isOwner: boolean;
  canInvite: boolean;
  onClose: () => void;
}

export default function ShareModal({ docId, docTitle, isOwner, canInvite, onClose }: Props) {
  const { flash } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Fetches the current collaborator list for this document.
  const loadCollaborators = useCallback(async () => {
    const rows = await api.get<Collaborator[]>(`/documents/${docId}/collaborators`);
    setCollaborators(rows);
  }, [docId]);

  useEffect(() => {
    loadCollaborators();
  }, [loadCollaborators]);

  // Searches for users to invite, debounced.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const rows = await api.get<SearchResult[]>(`/users/search?q=${encodeURIComponent(query)}&document_id=${docId}`);
      setResults(rows);
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, docId]);

  // Invites a user to collaborate on this document.
  async function invite(userId: string, label: string) {
    try {
      await api.post(`/documents/${docId}/collaborators`, { user_id: userId });
      flash(`Invitation sent to ${label}`);
      setResults((r) => r.map((x) => (x.id === userId ? { ...x, access_status: "pending" } : x)));
      loadCollaborators();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not send invitation");
    }
  }

  // Removes a collaborator or cancels a pending invite.
  async function remove(collabId: string, userId: string, wasPending: boolean) {
    try {
      await api.delete(`/documents/${docId}/collaborators/${collabId}`);
      flash(wasPending ? "Invite canceled" : "Access removed");
      setResults((r) => r.map((x) => (x.id === userId ? { ...x, access_status: null } : x)));
      loadCollaborators();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not remove collaborator");
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(26,26,25,.32)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          background: "var(--card)",
          borderRadius: 16,
          padding: 26,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          animation: "rise .18s ease-out",
          boxShadow: "0 24px 60px rgba(26,26,25,.2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 600, letterSpacing: "-.02em" }}>Share "{docTitle}"</h3>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Invite users to collaborate on this document with</p>
          </div>
          <button
            onClick={onClose}
            title="Close"
            style={{ flex: "none", width: 30, height: 30, border: "1px solid var(--border)", background: "var(--card)", borderRadius: 8, cursor: "pointer", color: "var(--text-secondary)", fontSize: 14 }}
          >
            ✕
          </button>
        </div>

        {canInvite && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by username"
              style={{ padding: "11px 13px", border: "1px solid var(--border-input)", borderRadius: 9, fontSize: 14, background: "#f8f4ea" }}
            />
            {results.map((r) => {
              const existing = r.access_status !== null;
              const label = existing ? (r.access_status === "pending" ? "Invited" : "Has access") : "Invite";
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 4px" }}>
                  <Avatar label={r.full_name || r.username} color={colorForId(r.id)} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{r.full_name || r.username}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{`@${r.username}`}</div>
                  </div>
                  <button
                    onClick={() => !existing && invite(r.id, `@${r.username}`)}
                    disabled={existing}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 7,
                      fontSize: 12.5,
                      cursor: existing ? "default" : "pointer",
                      border: `1px solid ${existing ? "var(--border)" : "transparent"}`,
                      background: existing ? "#f8f4ea" : "var(--ac)",
                      color: existing ? "var(--text-muted)" : "var(--card)",
                    }}
                  >
                    {label}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--divider)", paddingTop: 16 }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", color: "var(--text-muted)", marginBottom: 4 }}>
            WHO HAS ACCESS
          </div>
          {collaborators.map((c) => {
            const name = c.profile?.full_name || c.profile?.username || "?";
            return (
              <div key={c.id ?? c.user_id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "6px 0" }}>
                <Avatar label={name} color={colorForId(c.user_id)} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.profile?.username ? `@${c.profile.username}` : ""}</div>
                </div>
                {c.is_owner && (
                  <span className="mono" style={{ fontSize: 10, letterSpacing: ".08em", color: "var(--text-secondary)", paddingRight: 6 }}>
                    OWNER
                  </span>
                )}
                {c.status === "pending" && (
                  <span
                    className="mono"
                    style={{ fontSize: 10, letterSpacing: ".08em", color: "var(--pending-text)", background: "var(--pending-bg)", border: "1px solid var(--pending-border)", padding: "3px 7px", borderRadius: 6 }}
                  >
                    PENDING
                  </span>
                )}
                {isOwner && !c.is_owner && (c.status === "accepted" || c.status === "pending") && (
                  <button
                    onClick={() => c.id && remove(c.id, c.user_id, c.status === "pending")}
                    title={c.status === "pending" ? "Cancel invite" : "Remove"}
                    style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 7, padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--danger)" }}
                  >
                    {c.status === "pending" ? "Cancel" : "Remove"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
