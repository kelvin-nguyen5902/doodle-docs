import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { DocumentSummary, Stroke } from "../types";
import { Avatar, colorForId } from "./Avatar";

function isEmptyContent(html: string): boolean {
  return !html.replace(/<[^>]+>/g, "").trim();
}

// Scales the real document body down to thumbnail size, so formatting still
// looks right in miniature instead of being flattened to plain text.
const PREVIEW_SCALE = 0.34;

// Renders a document's ink at full resolution and lets CSS scale it down to
// thumbnail size.
function DrawingPreview({ strokes }: { strokes: Stroke[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokes.forEach((s) => {
      if (!s.pts.length) return;
      ctx.save();
      ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (s.pts.length === 1) {
        // A tap with no drag is a zero-length path — WebKit (iOS Safari) doesn't
        // render a round line cap's dot for that, so draw the dot explicitly.
        ctx.beginPath();
        ctx.arc(s.pts[0].x, s.pts[0].y, s.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(s.pts[0].x, s.pts[0].y);
        s.pts.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      }
      ctx.restore();
    });
  }, [strokes]);

  return (
    <canvas
      ref={canvasRef}
      width={820}
      height={1080}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 2 }}
    />
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Edited just now";
  if (mins < 60) return `Edited ${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Edited ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `Edited ${days} day${days === 1 ? "" : "s"} ago`;
}

interface Props {
  doc: DocumentSummary;
  onRename: () => void;
  onDelete: () => void;
  onLeave: () => void;
}

export default function DocumentCard({ doc, onRename, onDelete, onLeave }: Props) {
  const navigate = useNavigate();
  const emptyText = isEmptyContent(doc.content_html);
  const hasStrokes = doc.strokes.length > 0;

  const ownerLabel = doc.owner?.full_name || doc.owner?.username || "?";
  const meta = doc.is_owner ? timeAgo(doc.updated_at) : `${timeAgo(doc.updated_at)} · ${ownerLabel.split(" ")[0]}`;

  return (
    <div
      onClick={() => navigate(`/doc/${doc.id}`)}
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 13,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          // Matches the real editor page's proportions so this reads as a page thumbnail.
          aspectRatio: "820 / 1080",
          borderRadius: 4,
          background: "var(--card)",
          border: "1px solid var(--divider)",
          boxShadow: "0 6px 18px rgba(26,26,25,.05)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {emptyText && !hasStrokes ? (
          <div style={{ padding: 10, fontSize: 11, color: "var(--text-secondary)" }}>Empty document</div>
        ) : (
          <>
            {!emptyText && (
              <div
                className="doc-typography"
                style={
                  {
                    "--preview-scale": PREVIEW_SCALE,
                    transform: "scale(var(--preview-scale))",
                    transformOrigin: "top left",
                    width: `calc(100% / ${PREVIEW_SCALE})`,
                    // Same padding as the real page, so text lines up proportionally.
                    padding: "76px 84px",
                    fontSize: 16.5,
                    lineHeight: 1.72,
                    color: "#241f18",
                    pointerEvents: "none",
                    position: "relative",
                    zIndex: 1,
                  } as React.CSSProperties
                }
                dangerouslySetInnerHTML={{ __html: doc.content_html }}
              />
            )}
            {hasStrokes && <DrawingPreview strokes={doc.strokes} />}
          </>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {doc.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{meta}</div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 10,
          borderTop: "1px solid var(--divider)",
        }}
      >
        <div style={{ display: "flex" }}>
          <Avatar label={ownerLabel} color={doc.is_owner ? "var(--text)" : colorForId(doc.owner_id)} size={24} overlap />
          {doc.collaborators.map((c) => (
            <Avatar
              key={c.user_id}
              label={c.profile?.full_name || c.profile?.username || "?"}
              color={colorForId(c.user_id)}
              size={24}
              overlap
            />
          ))}
        </div>
        {doc.is_owner && (
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRename();
              }}
              style={{ border: "1px solid var(--border)", background: "var(--card)", borderRadius: 7, fontSize: 11, padding: "4px 8px", cursor: "pointer" }}
            >
              Rename
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              style={{
                border: "1px solid var(--border)",
                background: "var(--card)",
                borderRadius: 7,
                fontSize: 11,
                padding: "4px 8px",
                cursor: "pointer",
                color: "var(--danger)",
              }}
            >
              Delete
            </button>
          </div>
        )}
        {!doc.is_owner && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLeave();
            }}
            style={{
              border: "1px solid var(--border)",
              background: "var(--card)",
              borderRadius: 7,
              fontSize: 11,
              padding: "4px 8px",
              cursor: "pointer",
              color: "var(--danger)",
            }}
          >
            Leave
          </button>
        )}
      </div>
    </div>
  );
}
