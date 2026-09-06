import { useState } from "react";
import { useDocumentsContext } from "../context/DocumentsContext";
import { api } from "../lib/api";
import DocumentCard from "../components/DocumentCard";
import NewDocumentModal from "../components/NewDocumentModal";
import { useToast } from "../components/ToastProvider";

export default function DashboardPage() {
  const { documents, loading, refresh } = useDocumentsContext();
  const { flash } = useToast();
  const [newDocOpen, setNewDocOpen] = useState(false);

  async function handleRename(id: string, currentTitle: string) {
    const title = window.prompt("Rename document", currentTitle);
    if (!title || !title.trim()) return;
    try {
      await api.patch(`/documents/${id}`, { title: title.trim() });
      flash("Renamed");
      refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not rename");
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/documents/${id}`);
      flash("Document deleted");
      refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not delete");
    }
  }

  async function handleLeave(id: string, title: string) {
    if (!window.confirm(`Leave "${title}"? You'll lose access unless someone invites you again.`)) return;
    try {
      await api.post(`/documents/${id}/leave`);
      flash("Left document");
      refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not leave document");
    }
  }

  return (
    <div style={{ padding: "44px 52px", maxWidth: 1100 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-heading" style={{ margin: 0, letterSpacing: "-.025em", fontWeight: 600 }}>Documents</h1>
      </div>
      <button
        onClick={() => setNewDocOpen(true)}
        style={{ padding: "11px 18px", border: "none", borderRadius: 9, background: "var(--ac)", color: "#fff", fontSize: 14, cursor: "pointer", marginBottom: 30 }}
      >
        + New document
      </button>

      {loading ? (
        <div style={{ color: "var(--text-muted)" }}>Loading…</div>
      ) : documents.length === 0 ? (
        <div style={{ border: "1px dashed var(--border-dashed)", borderRadius: 12, padding: 44, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
          No documents yet. Create one to get started.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(258px, 1fr))", gap: 14 }}>
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onRename={() => handleRename(doc.id, doc.title)}
              onDelete={() => handleDelete(doc.id, doc.title)}
              onLeave={() => handleLeave(doc.id, doc.title)}
            />
          ))}
        </div>
      )}

      {newDocOpen && <NewDocumentModal onClose={() => setNewDocOpen(false)} />}
    </div>
  );
}
