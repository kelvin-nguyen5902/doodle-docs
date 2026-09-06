interface Props {
  color: string;
  setColor: (c: string) => void;
  eraser: boolean;
  toggleEraser: () => void;
  delMode: boolean;
  toggleDelete: () => void;
  brush: number;
  setBrush: (n: number) => void;
  undo: () => void;
  redo: () => void;
  clearInk: () => void;
  onDone: () => void;
}

const btnStyle = (active: boolean, danger = false): React.CSSProperties => ({
  padding: "5px 11px",
  borderRadius: 7,
  cursor: "pointer",
  fontSize: 12,
  whiteSpace: "nowrap",
  flex: "none",
  border: `1px solid ${active ? "transparent" : "var(--border)"}`,
  background: active ? (danger ? "var(--danger)" : "var(--text)") : "var(--card)",
  color: active ? "var(--card)" : danger ? "var(--danger)" : "var(--text)",
});

export default function DrawToolbar({
  color,
  setColor,
  eraser,
  toggleEraser,
  delMode,
  toggleDelete,
  brush,
  setBrush,
  undo,
  redo,
  clearInk,
  onDone,
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 9,
        padding: "6px 10px",
        animation: "rise .18s ease-out",
      }}
    >
      {/* Forwards clicks to a hidden native colour input. */}
      <label
        title="Pick a colour"
        style={{
          width: 20,
          height: 20,
          borderRadius: 99,
          cursor: "pointer",
          display: "block",
          background: color,
          border: `2px solid ${!eraser ? "var(--text)" : "transparent"}`,
          boxShadow: "0 0 0 1px var(--border)",
        }}
      >
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        />
      </label>
      <div style={{ width: 1, height: 20, background: "var(--divider)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: ".06em" }}>
          SIZE
        </span>
        <input type="range" min={1} max={24} value={brush} onChange={(e) => setBrush(Number(e.target.value))} style={{ width: 82, accentColor: "var(--ac)" }} />
        <span className="mono" style={{ fontSize: 11, color: "var(--text-secondary)", width: 20 }}>
          {brush}
        </span>
      </div>
      <div style={{ width: 1, height: 20, background: "var(--divider)" }} />
      <button onClick={toggleEraser} style={btnStyle(eraser)}>
        Eraser
      </button>
      <button onClick={toggleDelete} style={btnStyle(delMode, true)}>
        Delete stroke
      </button>
      <button onClick={undo} style={btnStyle(false)}>
        ↶ Undo
      </button>
      <button onClick={redo} style={btnStyle(false)}>
        ↷ Redo
      </button>
      <button onClick={clearInk} style={{ ...btnStyle(false), color: "var(--danger)" }}>
        Clear ink
      </button>
      <div style={{ width: 1, height: 20, background: "var(--divider)" }} />
      <button
        onClick={onDone}
        style={{
          padding: "5px 14px",
          borderRadius: 7,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
          whiteSpace: "nowrap",
          flex: "none",
          border: "none",
          background: "var(--ac)",
          color: "var(--card)",
        }}
      >
        Done
      </button>
    </div>
  );
}
