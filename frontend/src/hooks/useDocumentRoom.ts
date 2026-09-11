import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { getSocket } from "../lib/socket";
import type { PresenceMember } from "../types";

// Joins a document's collaboration room and tracks who else is present.
// getLatestHtml, if given, is read on leave and sent in the same
// leave_document event so the backend's checkpoint-on-leave uses fresh
// content instead of racing a separate yjs_html_snapshot event against it.
export function useDocumentRoom(docId: string | undefined, getLatestHtml?: () => string | undefined) {
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const getLatestHtmlRef = useRef(getLatestHtml);
  getLatestHtmlRef.current = getLatestHtml;

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
        socket.emit("leave_document", { document_id: docId, html: getLatestHtmlRef.current?.() });
        socket.off("presence_update", onPresence);
        socket.off("join_error", onJoinError);
        socket.off("connect", onConnect);
      }
      setMembers([]);
    };
  }, [docId]);

  return { members, error };
}
