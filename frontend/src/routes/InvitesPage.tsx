import { useNavigate } from "react-router-dom";
import { useInvitationsContext } from "../context/InvitationsContext";
import { useDocumentsContext } from "../context/DocumentsContext";
import { api } from "../lib/api";
import { Avatar, colorForId } from "../components/Avatar";
import { useToast } from "../components/ToastProvider";

export default function InvitesPage() {
  const { invitations, loading, refresh } = useInvitationsContext();
  const { refresh: refreshDocuments } = useDocumentsContext();
  const { flash } = useToast();
  const navigate = useNavigate();

  async function accept(id: string) {
    try {
      const collab = await api.post<{ document_id: string }>(`/invitations/${id}/accept`);
      refresh();
      refreshDocuments();
      navigate(`/doc/${collab.document_id}`);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not accept invitation");
    }
  }

  async function decline(id: string) {
    try {
      await api.post(`/invitations/${id}/decline`);
      flash("Invitation declined");
      refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not decline invitation");
    }
  }

  return (
    <div className="invites-page" style={{ maxWidth: 760 }}>
      <h1 className="page-heading" style={{ margin: "0 0 6px", letterSpacing: "-.025em", fontWeight: 600 }}>Invitations</h1>
      <p style={{ margin: "0 0 28px", fontSize: 14, color: "var(--text-secondary)" }}>
        Accept an invitation to start collaborating on that document.
      </p>
      {loading ? (
        <div style={{ color: "var(--text-muted)" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {invitations.map((inv) => {
            const fromName = inv.from_profile?.full_name || inv.from_profile?.username || "Someone";
            return (
              <div
                key={inv.id}
                className="invite-card"
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <Avatar label={fromName} color={colorForId(inv.from_profile?.id || "")} size={38} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{inv.document_title}</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {fromName} invited you to collaborate
                  </div>
                </div>
                <div className="invite-card-actions" style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => decline(inv.id)}
                    style={{ padding: "8px 14px", border: "1px solid var(--border)", background: "var(--card)", borderRadius: 8, fontSize: 13, cursor: "pointer" }}
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => accept(inv.id)}
                    style={{ padding: "8px 14px", border: "none", background: "var(--ac)", color: "var(--card)", borderRadius: 8, fontSize: 13, cursor: "pointer" }}
                  >
                    Accept
                  </button>
                </div>
              </div>
            );
          })}
          {invitations.length === 0 && (
            <div style={{ border: "1px dashed var(--border-dashed)", borderRadius: 12, padding: 44, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
              Nothing pending. Invites you receive will land here.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
