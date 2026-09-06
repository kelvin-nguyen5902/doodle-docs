import { useEffect, useRef, useState } from "react";
import { type Editor, useEditorState } from "@tiptap/react";
import { DEFAULT_TEXT_COLOR } from "../hooks/useCollaborativeEditor";
import DrawToolbar from "./DrawToolbar";

interface Props {
  canEdit: boolean;
  editor: Editor | null;
  textColor: string;
  setTextColor: (color: string) => void;
  drawing: boolean;
  toggleDraw: () => void;
  drawProps: Omit<React.ComponentProps<typeof DrawToolbar>, "onDone">;
}

const groupStyle: React.CSSProperties = {
  display: "flex",
  gap: 2,
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 9,
  padding: 3,
};

const iconBtnStyle: React.CSSProperties = {
  width: 32,
  height: 28,
  border: "none",
  background: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
};

const SIZE_OPTIONS = [
  { value: "10px", label: "10 px" },
  { value: "13px", label: "13 px" },
  { value: "16px", label: "16 px" },
  { value: "18px", label: "18 px" },
  { value: "24px", label: "24 px" },
  { value: "32px", label: "32 px" },
  { value: "48px", label: "48 px" },
];
const DEFAULT_SIZE = "16px";

export default function EditorToolbar({ canEdit, editor, textColor, setTextColor, drawing, toggleDraw, drawProps }: Props) {
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const sizeMenuRef = useRef<HTMLDivElement>(null);
  // Holds the text selection while the colour picker steals focus, so it can be restored after.
  const savedSelectionRef = useRef<Range | null>(null);

  // Renders again whenever the editor's selection state actually changes.
  const state = useEditorState({
    editor,
    selector: (snapshot) => ({
      bold: snapshot.editor?.isActive("bold") ?? false,
      italic: snapshot.editor?.isActive("italic") ?? false,
      underline: snapshot.editor?.isActive("underline") ?? false,
      fontSize: (snapshot.editor?.getAttributes("textStyle").fontSize as string | undefined) ?? DEFAULT_SIZE,
    }),
  });

  // Closes the size menu on an outside click.
  useEffect(() => {
    if (!sizeMenuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (sizeMenuRef.current && !sizeMenuRef.current.contains(e.target as Node)) {
        setSizeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [sizeMenuOpen]);

  if (!canEdit) return null;

  const bold = state?.bold ?? false;
  const italic = state?.italic ?? false;
  const underline = state?.underline ?? false;
  const fontSize = state?.fontSize ?? DEFAULT_SIZE;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 24px 11px", flexWrap: "wrap" }}>
      <div style={groupStyle}>
        <button
          onClick={() => editor?.chain().focus().toggleBold().run()}
          style={{ ...iconBtnStyle, fontWeight: 700, background: bold ? "var(--active-row)" : "none" }}
        >
          B
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          style={{ ...iconBtnStyle, fontStyle: "italic", fontFamily: "Georgia, serif", background: italic ? "var(--active-row)" : "none" }}
        >
          I
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          style={{ ...iconBtnStyle, textDecoration: "underline", background: underline ? "var(--active-row)" : "none" }}
        >
          U
        </button>
      </div>

      <div
        ref={sizeMenuRef}
        style={{ position: "relative", display: "flex", alignItems: "center", gap: 7, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 9, padding: "3px 9px", height: 34 }}
      >
        <span className="mono" style={{ fontSize: 10, letterSpacing: ".1em", color: "var(--text-muted)" }}>
          SIZE
        </span>
        <button
          type="button"
          onClick={() => setSizeMenuOpen((o) => !o)}
          style={{ border: "none", background: "none", fontSize: 13, cursor: "pointer", padding: "2px 0", color: "var(--text)" }}
        >
          {SIZE_OPTIONS.find((o) => o.value === fontSize)?.label ?? "16 px"}
        </button>

        {sizeMenuOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 9,
              boxShadow: "0 8px 24px rgba(26,26,25,.12)",
              overflow: "hidden",
              zIndex: 50,
              minWidth: 84,
            }}
          >
            {SIZE_OPTIONS.map((o) => (
              <div
                key={o.value}
                // Prevents this click from collapsing the editor's text selection.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor?.chain().focus().setFontSize(o.value).run();
                  setSizeMenuOpen(false);
                }}
                style={{
                  padding: "7px 12px",
                  fontSize: 13,
                  cursor: "pointer",
                  userSelect: "none",
                  background: o.value === fontSize ? "var(--active-row)" : "transparent",
                }}
              >
                {o.label}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 9, padding: "3px 9px", height: 34 }}>
        <span className="mono" style={{ fontSize: 10, letterSpacing: ".1em", color: "var(--text-muted)" }}>
          COLOUR
        </span>
        {/* Forwards clicks to a hidden native colour input. */}
        <label
          onMouseDown={() => {
            const sel = window.getSelection();
            savedSelectionRef.current = sel && sel.rangeCount > 0 && !sel.isCollapsed ? sel.getRangeAt(0).cloneRange() : null;
          }}
          onClick={() => {
            if (!savedSelectionRef.current) return;
            const range = savedSelectionRef.current;
            // Waits a frame so the browser's own focus/picker behaviour finishes first.
            requestAnimationFrame(() => {
              const sel = window.getSelection();
              sel?.removeAllRanges();
              sel?.addRange(range);
            });
          }}
          style={{ display: "flex", alignItems: "center", cursor: "pointer" }}
          title="Text colour"
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 99,
              background: textColor,
              border: "1px solid var(--border)",
              boxShadow: "inset 0 0 0 2px var(--card)",
            }}
          />
          <input
            type="color"
            value={textColor}
            onChange={(e) => setTextColor(e.target.value)}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          />
        </label>
        {textColor.toLowerCase() !== DEFAULT_TEXT_COLOR && (
          <button
            type="button"
            title="Reset to default colour"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTextColor(DEFAULT_TEXT_COLOR)}
            style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, color: "var(--text-muted)", padding: 0, lineHeight: 1 }}
          >
            ✕
          </button>
        )}
      </div>

      <div style={{ width: 1, height: 24, background: "var(--border)", margin: "0 4px" }} />

      <button
        onClick={toggleDraw}
        style={{
          height: 34,
          padding: "0 14px",
          borderRadius: 9,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 500,
          border: `1px solid ${drawing ? "transparent" : "var(--border)"}`,
          background: drawing ? "var(--text)" : "var(--card)",
          color: drawing ? "var(--card)" : "var(--text)",
        }}
      >
        ✎ Draw
      </button>

      {drawing && <DrawToolbar {...drawProps} onDone={toggleDraw} />}
    </div>
  );
}
