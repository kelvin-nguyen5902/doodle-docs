import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor as CoreEditor } from "@tiptap/core";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import CharacterCount from "@tiptap/extension-character-count";
import Collaboration from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import { getSocket } from "../lib/socket";

export const MAX_DOCUMENT_CHARS = 2000;
export const DEFAULT_TEXT_COLOR = "#241f18";

// Must match the backend's yjs_service.YJS_ROOT_KEY.
const YJS_ROOT_KEY = "default";

// How often a local edit attaches an HTML snapshot for the backend to save.
const HTML_SNAPSHOT_THROTTLE_MS = 4000;

// How long to wait after the last edit before sending a trailing HTML
// snapshot. Guarantees the final keystroke's content gets saved even when it
// lands inside the throttle window above, well before the backend's 2s idle
// checkpoint fires.
const HTML_SNAPSHOT_SETTLE_MS = 800;

// Renders a peer's cursor caret with their name label.
function renderCaret(user: { name?: string; color?: string }): HTMLElement {
  const color = user.color || "#9a9284";
  const caret = document.createElement("span");
  caret.style.position = "relative";
  caret.style.borderLeft = `2px solid ${color}`;
  caret.style.marginLeft = "-1px";
  caret.style.marginRight = "-1px";
  caret.style.pointerEvents = "none";
  caret.style.wordBreak = "normal";

  const label = document.createElement("span");
  label.textContent = user.name || "Someone";
  Object.assign(label.style, {
    position: "absolute",
    top: "-1.4em",
    left: "-2px",
    background: color,
    color: "#fffdf7",
    fontSize: "10.5px",
    fontWeight: "500",
    padding: "2px 6px",
    borderRadius: "5px 5px 5px 0",
    whiteSpace: "nowrap",
    letterSpacing: ".04em",
    fontFamily: "'Geist Mono', monospace",
    pointerEvents: "none",
    zIndex: "20",
  } satisfies Partial<CSSStyleDeclaration>);

  caret.appendChild(label);
  return caret;
}

// Renders a peer's selection highlight.
function renderSelection(user: { color?: string }) {
  return { style: `background-color: ${user.color || "#9a9284"}33;` };
}

// Builds an initial Yjs state from a document's existing HTML content, for
// documents that predate the collaborative editor.
function seedYDocFromHtml(html: string): Uint8Array {
  const seedEditor = new CoreEditor({
    extensions: [StarterKit.configure({ undoRedo: false }), TextStyle, FontSize, Color],
    content: html || "<p></p>",
  });
  const seedDoc = prosemirrorJSONToYDoc(seedEditor.schema, seedEditor.getJSON(), YJS_ROOT_KEY);
  const update = Y.encodeStateAsUpdate(seedDoc);
  seedEditor.destroy();
  return update;
}

interface Options {
  docId: string | undefined;
  canEdit: boolean;
  userName: string;
  userColor: string;
  onLimitReached?: () => void;
}

// Sets up a Tiptap editor synced over Yjs, with cursors, colour, and a save state.
export function useCollaborativeEditor({ docId, canEdit, userName, userColor, onLimitReached }: Options) {
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");

  // The colour picked from the toolbar's swatch, kept independent of the
  // cursor's own inherited marks. See onSelectionUpdate below.
  const [textColor, setTextColorState] = useState(DEFAULT_TEXT_COLOR);
  const textColorRef = useRef(textColor);
  useEffect(() => {
    textColorRef.current = textColor;
  }, [textColor]);

  // One Y.Doc and Awareness per open document.
  const { ydoc, awareness } = useMemo(() => {
    const doc = new Y.Doc();
    const aw = new awarenessProtocol.Awareness(doc);
    return { ydoc: doc, awareness: aw };
  }, [docId]);

  // CollaborationCaret only needs .awareness here. Transport is our own
  // Socket.IO wiring below, not a separate websocket server.
  const provider = useMemo(() => ({ awareness }), [awareness]);

  const editor = useEditor(
    {
      editable: canEdit,
      extensions: [
        StarterKit.configure({ undoRedo: false }), // Collaboration has its own shared undo
        TextStyle,
        FontSize,
        Color,
        CharacterCount.configure({ limit: MAX_DOCUMENT_CHARS }),
        Collaboration.configure({ document: ydoc, field: YJS_ROOT_KEY }),
        CollaborationCaret.configure({
          provider,
          user: { name: userName, color: userColor },
          render: renderCaret,
          selectionRender: renderSelection,
        }),
      ],
      editorProps: {
        // Sizes and styles the actual contentEditable node directly, since
        // wrapper styles alone leave it too short to be clickable everywhere.
        attributes: {
          class: "doc-typography",
          // translateZ(0) fixes a Chrome bug where the caret stops blinking
          // once the drawing canvas overlay is layered on top.
          style: "font-size: 16.5px; line-height: 1.72; color: #241f18; min-height: 900px; transform: translateZ(0);",
        },
        // Warns when a keystroke is attempted at the character limit.
        handleKeyDown: (_view, event) => {
          const atLimit = (editorRef.current?.storage.characterCount.characters() ?? 0) >= MAX_DOCUMENT_CHARS;
          const isPrintable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
          if (atLimit && isPrintable) {
            onLimitReached?.();
          }
          return false;
        },
      },
      // Reapplies the toolbar's picked colour on every cursor move, for a
      // collapsed selection only, so moving the cursor never repaints text.
      onSelectionUpdate: ({ editor }) => {
        if (!editor.state.selection.empty) return;
        const current = (editor.getAttributes("textStyle").color as string | undefined) ?? DEFAULT_TEXT_COLOR;
        if (current === textColorRef.current) return;
        if (textColorRef.current === DEFAULT_TEXT_COLOR) {
          editor.chain().unsetColor().run();
        } else {
          editor.chain().setColor(textColorRef.current).run();
        }
      },
    },
    [docId, ydoc, provider]
  );

  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Called by the toolbar to change the active text colour.
  const setTextColor = useCallback((color: string) => {
    setTextColorState(color);
    if (color === DEFAULT_TEXT_COLOR) {
      editorRef.current?.chain().focus().unsetColor().run();
    } else {
      editorRef.current?.chain().focus().setColor(color).run();
    }
  }, []);

  useEffect(() => {
    if (canEdit && userName && userColor) {
      awareness.setLocalStateField("user", { name: userName, color: userColor });
    }
  }, [awareness, canEdit, userName, userColor]);

  const lastHtmlEmitRef = useRef(0);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Wires the Y.Doc and awareness to the socket, syncing local edits out and
  // remote edits in.
  useEffect(() => {
    if (!docId) return;
    let socket: Awaited<ReturnType<typeof getSocket>> | null = null;
    let cancelled = false;
    let seeded = false;

    // Sends local edits over the socket. Ignores updates from a remote
    // origin, which are content arriving rather than something to save.
    const onLocalDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote" || !socket) return;
      setSaveState("saving");
      let html: string | undefined;
      const now = Date.now();
      if (now - lastHtmlEmitRef.current > HTML_SNAPSHOT_THROTTLE_MS) {
        html = editorRef.current?.getHTML();
        lastHtmlEmitRef.current = now;
      }
      socket.emit("yjs_update", { document_id: docId, update, html });
      setSaveState("saved");

      // Schedules a trailing snapshot once edits settle, so a throttled
      // (html-less) update here doesn't leave a stale mid-edit snapshot as
      // the last thing the backend has to checkpoint.
      clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = setTimeout(() => {
        const finalHtml = editorRef.current?.getHTML();
        if (finalHtml === undefined) return;
        lastHtmlEmitRef.current = Date.now();
        socket?.emit("yjs_html_snapshot", { document_id: docId, html: finalHtml });
      }, HTML_SNAPSHOT_SETTLE_MS);
    };
    ydoc.on("update", onLocalDocUpdate);

    // Sends local cursor/presence changes over the socket.
    const onLocalAwarenessUpdate = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      if (!socket) return;
      const changed = added.concat(updated, removed);
      const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changed);
      socket.emit("yjs_awareness", { document_id: docId, update });
    };
    awareness.on("update", onLocalAwarenessUpdate);

    // Applies the full document state received on join.
    const onSync = (data: { document_id: string; update: ArrayBuffer | Uint8Array }) => {
      if (data.document_id !== docId) return;
      Y.applyUpdate(ydoc, new Uint8Array(data.update), "remote");
    };
    // Applies an incremental update from a peer.
    const onRemoteUpdate = (data: { document_id: string; update: ArrayBuffer | Uint8Array }) => {
      if (data.document_id !== docId) return;
      Y.applyUpdate(ydoc, new Uint8Array(data.update), "remote");
    };
    // Applies a peer's cursor/presence update.
    const onAwarenessRemote = (data: { document_id: string; update: ArrayBuffer | Uint8Array }) => {
      if (data.document_id !== docId) return;
      awarenessProtocol.applyAwarenessUpdate(awareness, new Uint8Array(data.update), "remote");
    };
    // Seeds a brand new document's Yjs state from its existing HTML.
    const onSeedNeeded = (data: { document_id: string; content_html: string }) => {
      if (data.document_id !== docId || seeded || !socket) return;
      seeded = true;
      const update = seedYDocFromHtml(data.content_html);
      socket.emit("yjs_seed", { document_id: docId, update });
    };

    // The server pushes sync/seed events automatically on join, so the
    // client doesn't need to request a sync itself.
    getSocket().then((s) => {
      if (cancelled) return;
      socket = s;
      s.on("yjs_sync", onSync);
      s.on("yjs_update", onRemoteUpdate);
      s.on("yjs_awareness", onAwarenessRemote);
      s.on("yjs_seed_needed", onSeedNeeded);
    });

    return () => {
      cancelled = true;
      clearTimeout(settleTimeoutRef.current);
      ydoc.off("update", onLocalDocUpdate);
      awareness.off("update", onLocalAwarenessUpdate);
      socket?.off("yjs_sync", onSync);
      socket?.off("yjs_update", onRemoteUpdate);
      socket?.off("yjs_awareness", onAwarenessRemote);
      socket?.off("yjs_seed_needed", onSeedNeeded);
      // Not clearing this client's awareness state here. Peers naturally
      // age it out once heartbeats stop, and clearing it on every effect
      // cleanup (including React's dev mode double invoke) was wiping
      // presence right after mount.
    };
  }, [docId, ydoc, awareness]);

  return { editor, saveState, textColor, setTextColor };
}
