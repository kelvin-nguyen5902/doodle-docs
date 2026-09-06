import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useToast } from "../components/ToastProvider";
import type { Invitation } from "../types";

interface InvitationsContextValue {
  invitations: Invitation[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const InvitationsContext = createContext<InvitationsContextValue | undefined>(undefined);

export function InvitationsProvider({ children }: { children: ReactNode }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const { flash } = useToast();

  const refresh = useCallback(async () => {
    const rows = await api.get<Invitation[]>("/invitations");
    setInvitations(rows);
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    let socket: Awaited<ReturnType<typeof getSocket>> | null = null;
    let cancelled = false;

    const onInvitationCreated = () => {
      flash("New document invite");
      refresh();
    };

    const onInvitationCanceled = (data: { collaborator_id: string }) => {
      setInvitations((prev) => prev.filter((inv) => inv.id !== data.collaborator_id));
    };

    getSocket().then((s) => {
      if (cancelled) return;
      socket = s;
      s.on("invitation_created", onInvitationCreated);
      s.on("invitation_canceled", onInvitationCanceled);
    });

    return () => {
      cancelled = true;
      socket?.off("invitation_created", onInvitationCreated);
      socket?.off("invitation_canceled", onInvitationCanceled);
    };
  }, [refresh, flash]);

  return <InvitationsContext.Provider value={{ invitations, loading, refresh }}>{children}</InvitationsContext.Provider>;
}

export function useInvitationsContext() {
  const ctx = useContext(InvitationsContext);
  if (!ctx) throw new Error("useInvitationsContext must be used within InvitationsProvider");
  return ctx;
}
