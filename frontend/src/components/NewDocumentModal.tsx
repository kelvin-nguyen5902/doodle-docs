import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiRequestError } from "../lib/api";
import { useDocumentsContext } from "../context/DocumentsContext";
import { Avatar, colorForId } from "./Avatar";
import { useToast } from "./ToastProvider";
import type { SearchResult } from "../types";

interface Props {
  onClose: () => void;
}

export default function NewDocumentModal({ onClose }: Props) {
  const { flash } = useToast();
  const { refresh: refreshDocuments } = useDocumentsContext();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult[]>([]);
  const [creating, setCreating] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const rows = await api.get<SearchResult[]>(`/users/search?q=${encodeURIComponent(query)}`);
      setResults(rows);
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  function addPerson(person: SearchResult) {
    setSelected((prev) => (prev.some((p) => p.id === person.id) ? prev : [...prev, person]));
  }

  function removePerson(id: string) {
    setSelected((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const doc = await api.post<{ id: string }>("/documents", { title: title.trim() || "Untitled document" });

      const invites = await Promise.allSettled(
        selected.map((person) => api.post(`/documents/${doc.id}/collaborators`, { user_id: person.id }))
      );
      const failed = invites.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        flash(`Document created, but ${failed} invitation${failed === 1 ? "" : "s"} failed to send`);
      }

      await refreshDocuments();
      navigate(`/doc/${doc.id}`);
      onClose();
    } catch (err) {
      flash(err instanceof ApiRequestError ? err.message : "Could not create document");
      setCreating(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(26,26,25,.32)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleCreate}
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
            <h3 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 600, letterSpacing: "-.02em" }}>New document</h3>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Name it and invite anyone who should have access right away.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            style={{ flex: "none", width: 30, height: 30, border: "1px solid var(--border)", background: "var(--card)", borderRadius: 8, cursor: "pointer", color: "var(--text-secondary)", fontSize: 14 }}
          >
            ✕
          </button>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: ".11em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
            Title
          </span>
          <input
            ref={titleInputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled document"
            maxLength={20}
            style={{ padding: "12px 13px", border: "1px solid var(--border-input)", borderRadius: 9, fontSize: 15, background: "#f8f4ea" }}
          />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: ".11em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
            Invite people (optional)
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username or email"
            style={{ padding: "11px 13px", border: "1px solid var(--border-input)", borderRadius: 9, fontSize: 14, background: "#f8f4ea" }}
          />
          {results.map((r) => {
            const already = selected.some((p) => p.id === r.id);
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 4px" }}>
                <Avatar label={r.full_name || r.username} color={colorForId(r.id)} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{r.full_name || r.username}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{`@${r.username}`}</div>
                </div>
                <button
                  type="button"
                  onClick={() => !already && addPerson(r)}
                  disabled={already}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 7,
                    fontSize: 12.5,
                    cursor: already ? "default" : "pointer",
                    border: `1px solid ${already ? "var(--border)" : "transparent"}`,
                    background: already ? "#f8f4ea" : "var(--ac)",
                    color: already ? "var(--text-muted)" : "var(--card)",
                  }}
                >
                  {already ? "Added" : "Add"}
                </button>
              </div>
            );
          })}
        </div>

        {selected.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--divider)", paddingTop: 16 }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", color: "var(--text-muted)", marginBottom: 4 }}>
              WILL BE INVITED
            </div>
            {selected.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "6px 0" }}>
                <Avatar label={p.full_name || p.username} color={colorForId(p.id)} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{p.full_name || p.username}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{`@${p.username}`}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removePerson(p.id)}
                  title="Remove"
                  style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 7, padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--danger)" }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="submit"
          disabled={creating}
          style={{
            marginTop: 4,
            padding: 13,
            border: "none",
            borderRadius: 10,
            background: "var(--ac)",
            color: "var(--card)",
            fontSize: 15,
            fontWeight: 500,
            cursor: creating ? "default" : "pointer",
          }}
        >
          {creating ? "Creating…" : "Create document"}
        </button>
      </form>
    </div>
  );
}
