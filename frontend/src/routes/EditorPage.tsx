import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useDocument } from "../hooks/useDocument";
import { useDocumentRoom } from "../hooks/useDocumentRoom";
import { useCollaborativeEditor, MAX_DOCUMENT_CHARS } from "../hooks/useCollaborativeEditor";
import { useDrawing } from "../hooks/useDrawing";
import { useDocumentsContext } from "../context/DocumentsContext";
import { api } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import { colorForId } from "../components/Avatar";
import EditorHeader from "../components/EditorHeader";
import EditorToolbar from "../components/EditorToolbar";
import DocumentCanvas from "../components/DocumentCanvas";
import ShareModal from "../components/ShareModal";

export default function EditorPage() {
  const { docId } = useParams<{ docId: string }>();
  const { profile } = useAuth();
  const { flash } = useToast();
  const { doc, loading, error } = useDocument(docId);
  const { refresh: refreshDocuments } = useDocumentsContext();

  // Every accepted collaborator can edit, there's no lesser "viewer" role.
  const canEdit = !!doc;
  const isOwner = doc?.role === "owner";

  const { editor, saveState, textColor, setTextColor, getLatestHtml } = useCollaborativeEditor({
    docId,
    canEdit,
    userName: profile?.full_name || profile?.username || "You",
    userColor: colorForId(profile?.id || ""),
    onLimitReached: () => flash(`Documents are limited to ${MAX_DOCUMENT_CHARS} characters`),
  });
  const { members } = useDocumentRoom(docId, getLatestHtml);
  const drawingHook = useDrawing(docId, doc?.strokes, canEdit, () =>
    flash("Drawing limit reached, delete some ink to draw more")
  );

  const [title, setTitle] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (doc) setTitle(doc.title);
  }, [doc?.id, doc?.title]);

  // Disables editing while drawing, without recreating the editor.
  useEffect(() => {
    editor?.setEditable(canEdit && !drawingHook.drawing);
  }, [editor, canEdit, drawingHook.drawing]);

  // Refreshes the dashboard's document list on leaving the editor.
  useEffect(() => {
    return () => {
      refreshDocuments();
    };
  }, [refreshDocuments]);

  // Updates the title locally and saves it after a short debounce.
  function handleTitleChange(next: string) {
    setTitle(next);
    clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(async () => {
      try {
        await api.patch(`/documents/${docId}`, { title: next.trim() || "Untitled document" });
        refreshDocuments();
      } catch (err) {
        flash(err instanceof Error ? err.message : "Could not rename");
      }
    }, 600);
  }

  if (loading) {
    return <div style={{ padding: 52, color: "var(--text-muted)" }}>Loading…</div>;
  }
  if (error || !doc) {
    return <div style={{ padding: 52, color: "var(--danger)" }}>{error || "Document not found"}</div>;
  }

  return (
    <>
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "var(--bg)" }}>
        <EditorHeader
          title={title}
          onTitleChange={handleTitleChange}
          canEditTitle={isOwner}
          saveState={saveState}
          presenceMembers={members}
          currentUserId={profile?.id || ""}
          currentUserName={profile?.full_name || profile?.username || "You"}
          onOpenShare={() => setShareOpen(true)}
        />
        <EditorToolbar
          canEdit={canEdit}
          editor={editor}
          textColor={textColor}
          setTextColor={setTextColor}
          drawing={drawingHook.drawing}
          toggleDraw={drawingHook.toggleDraw}
          drawProps={{
            color: drawingHook.color,
            setColor: drawingHook.setColor,
            eraser: drawingHook.eraser,
            toggleEraser: drawingHook.toggleEraser,
            delMode: drawingHook.delMode,
            toggleDelete: drawingHook.toggleDelete,
            brush: drawingHook.brush,
            setBrush: drawingHook.setBrush,
            undo: drawingHook.undo,
            redo: drawingHook.redo,
            clearInk: drawingHook.clearInk,
          }}
        />
      </div>
      <DocumentCanvas
        editor={editor}
        canvasRef={drawingHook.canvasRef}
        drawing={drawingHook.drawing}
        delMode={drawingHook.delMode}
        eraser={drawingHook.eraser}
        peerCursors={Object.values(drawingHook.peerStrokes).flatMap((s) => {
          const point = s.pts[s.pts.length - 1];
          const member = members.find((m) => m.user_id === s.userId);
          if (!point || !member) return [];
          return [{ userId: s.userId, x: point.x, y: point.y, name: member.name, color: member.color }];
        })}
        onPointerDown={drawingHook.onPointerDown}
        onPointerMove={drawingHook.onPointerMove}
        onPointerUp={drawingHook.onPointerUp}
        onMissStroke={() => flash("No stroke here — click directly on ink")}
      />
      <div style={{ display: "flex", justifyContent: "center", padding: "0 24px 20px" }}>
        <div style={{ width: 820, display: "flex", justifyContent: "space-between", fontFamily: "'Geist Mono', monospace", fontSize: 11, letterSpacing: ".06em", color: "var(--text-muted)" }}>
          <span>{editor?.storage.characterCount.words() ?? 0} WORDS</span>
        </div>
      </div>

      {shareOpen && <ShareModal docId={doc.id} docTitle={title} isOwner={isOwner} canInvite={canEdit} onClose={() => setShareOpen(false)} />}
    </>
  );
}
