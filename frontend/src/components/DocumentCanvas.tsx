import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { EditorContent, type Editor } from "@tiptap/react";

export interface PeerCursor {
  userId: string;
  x: number;
  y: number;
  name: string;
  color: string;
}

interface Props {
  editor: Editor | null;
  canvasRef: RefObject<HTMLCanvasElement>;
  drawing: boolean;
  delMode: boolean;
  eraser: boolean;
  peerCursors: PeerCursor[];
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>, onMiss?: () => void) => void;
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: () => void;
  onMissStroke: () => void;
}

// A peer's live pointer while they're actively drawing a stroke.
function DrawingCursor({ x, y, name, color }: PeerCursor) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: 3,
      }}
    >
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, border: "2px solid var(--card)", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }} />
      <span
        style={{
          position: "absolute",
          top: 12,
          left: 8,
          whiteSpace: "nowrap",
          background: color,
          color: "#fffdf7",
          fontSize: "10.5px",
          fontWeight: 500,
          padding: "2px 6px",
          borderRadius: "5px 5px 5px 0",
          letterSpacing: ".04em",
          fontFamily: "'Geist Mono', monospace",
        }}
      >
        {name}
      </span>
    </div>
  );
}

const PAGE_WIDTH = 820;
const PAGE_MIN_HEIGHT = 1080;

export default function DocumentCanvas({
  editor,
  canvasRef,
  drawing,
  delMode,
  eraser,
  peerCursors,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onMissStroke,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pageHeight, setPageHeight] = useState(PAGE_MIN_HEIGHT);

  // Scales the whole page down to fit the available width, keeping the
  // 820x1080 layout intact so text and canvas stay in sync.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const page = pageRef.current;
    if (!container || !page) return;
    const update = () => {
      // Subtract the container's own padding, which isn't usable page space.
      const cs = getComputedStyle(container);
      const available = container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      setScale(available > 0 ? Math.min(1, available / PAGE_WIDTH) : 1);
      setPageHeight(page.offsetHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    ro.observe(page);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="doc-scroll" style={{ flex: 1, padding: "34px 24px 90px", overflow: "auto" }}>
      {/* Reserves the scaled page's actual footprint so layout and centering work. */}
      <div style={{ width: PAGE_WIDTH * scale, height: pageHeight * scale, margin: "0 auto" }}>
        <div
          ref={pageRef}
          style={{
            position: "relative",
            width: PAGE_WIDTH,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            boxShadow: "0 12px 40px rgba(26,26,25,.05)",
            minHeight: PAGE_MIN_HEIGHT,
            padding: "76px 84px",
          }}
        >
          <EditorContent
            editor={editor}
            className="doc-typography"
            style={{ fontSize: 16.5, lineHeight: 1.72, color: "#241f18", minHeight: 900 }}
          />
          <canvas
            ref={canvasRef}
            width={PAGE_WIDTH}
            height={PAGE_MIN_HEIGHT}
            onPointerDown={(e) => onPointerDown(e, onMissStroke)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: PAGE_WIDTH,
              height: PAGE_MIN_HEIGHT,
              zIndex: 2,
              touchAction: "none",
              pointerEvents: drawing ? "auto" : "none",
              cursor: delMode ? "pointer" : eraser ? "cell" : "crosshair",
            }}
          />
          {peerCursors.map((c) => (
            <DrawingCursor key={c.userId} {...c} />
          ))}
        </div>
      </div>
    </div>
  );
}
