import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { getSocket } from "../lib/socket";
import type { PresenceMember } from "../types";

// Joins a document's collaboration room and tracks who else is present.
export function useDocumentRoom(docId: string | undefined) {
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!docId) return;
    let socket: Socket | null = null;
    let cancelled = false;

    const onPresence = (p: { document_id: string; members: PresenceMember[] }) => {
      if (p.document_id === docId) setMembers(p.members);
    };
    const onJoinError = (e: { document_id: string; message: string }) => {
      if (e.document_id === docId) setError(e.message);
    };
    // Persistent listener so every reconnect rejoins the room, not just the first connect.
    const onConnect = () => {
      socket?.emit("join_document", { document_id: docId });
    };

    getSocket().then((s) => {
      if (cancelled) return;
      socket = s;
      s.on("presence_update", onPresence);
      s.on("join_error", onJoinError);
      s.on("connect", onConnect);
      if (s.connected) {
        s.emit("join_document", { document_id: docId });
      }
    });

    return () => {
      cancelled = true;
      if (socket) {
        socket.emit("leave_document", { document_id: docId });
        socket.off("presence_update", onPresence);
        socket.off("join_error", onJoinError);
        socket.off("connect", onConnect);
      }
      setMembers([]);
    };
  }, [docId]);

  return { members, error };
}
