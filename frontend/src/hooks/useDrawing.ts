import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { getSocket } from "../lib/socket";
import type { Stroke } from "../types";

const DEFAULT_COLOR = "#c2410c";

export const MAX_DRAWING_POINTS = 5000;
const LIMIT_WARNING_THROTTLE_MS = 2000;

export interface PeerStroke extends Stroke {
  userId: string;
}

export function useDrawing(
  docId: string | undefined,
  initialStrokes: Stroke[] | undefined,
  canEdit: boolean,
  onLimitReached?: () => void
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  // The stroke this user is currently drawing, kept separate until pointerup.
  const [liveStroke, setLiveStroke] = useState<Stroke | null>(null);
  const [peerStrokes, setPeerStrokes] = useState<Record<string, PeerStroke>>({});
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [eraser, setEraser] = useState(false);
  const [delMode, setDelMode] = useState(false);
  const [brush, setBrush] = useState(6);
  const [color, setColor] = useState(DEFAULT_COLOR);

  const currentStrokeRef = useRef<Stroke | null>(null);
  const tempIdRef = useRef<string>("");
  const hydratedDocRef = useRef<string | undefined>(undefined);
  const totalPointsRef = useRef(0);
  const lastLimitWarningRef = useRef(0);

  useEffect(() => {
    totalPointsRef.current = strokes.reduce((sum, s) => sum + s.pts.length, 0);
  }, [strokes]);

  // Notifies the caller that the drawing limit was hit, throttled.
  const warnLimitReached = useCallback(() => {
    const now = Date.now();
    if (now - lastLimitWarningRef.current > LIMIT_WARNING_THROTTLE_MS) {
      lastLimitWarningRef.current = now;
      onLimitReached?.();
    }
  }, [onLimitReached]);

  // Loads the document's saved strokes once they've arrived.
  useEffect(() => {
    if (docId && initialStrokes !== undefined && hydratedDocRef.current !== docId) {
      hydratedDocRef.current = docId;
      setStrokes(initialStrokes);
      setRedoStack([]);
      setLiveStroke(null);
      currentStrokeRef.current = null;
    }
  }, [docId, initialStrokes]);

  // Redraws the canvas from local, peer, and in progress strokes.
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Sort by start time so overlapping strokes stack consistently for everyone.
    const all: Stroke[] = [...strokes, ...Object.values(peerStrokes), ...(liveStroke ? [liveStroke] : [])].sort(
      (a, b) => (a.ts ?? 0) - (b.ts ?? 0)
    );
    all.forEach((s) => {
      if (!s || !s.pts.length) return;
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
  }, [strokes, peerStrokes, liveStroke]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Listens for peer drawing events and applies them locally.
  useEffect(() => {
    if (!docId) return;
    let socket: Socket | null = null;
    let cancelled = false;

    const onProgress = (data: {
      document_id: string;
      user_id: string;
      tempId: string;
      color: string;
      size: number;
      erase: boolean;
      point: { x: number; y: number };
    }) => {
      if (data.document_id !== docId) return;
      setPeerStrokes((prev) => {
        const existing = prev[data.user_id];
        const pts = existing && existing.pts.length ? [...existing.pts, data.point] : [data.point];
        // Local timestamp as a stand in until the real one arrives in onAdd.
        const ts = existing?.ts ?? Date.now();
        return { ...prev, [data.user_id]: { userId: data.user_id, color: data.color, size: data.size, erase: data.erase, pts, ts } };
      });
    };

    // Appends a peer's finished stroke instead of replacing the whole array.
    const onAdd = (data: { document_id: string; stroke: Stroke; user_id: string }) => {
      if (data.document_id !== docId) return;
      setStrokes((prev) => [...prev, data.stroke]);
      setPeerStrokes((prev) => {
        const next = { ...prev };
        delete next[data.user_id];
        return next;
      });
    };

    // Replaces the full strokes list, for undo, redo, delete, and clear.
    const onComplete = (data: { document_id: string; strokes: Stroke[]; user_id: string }) => {
      if (data.document_id !== docId) return;
      setStrokes(data.strokes);
      setPeerStrokes((prev) => {
        const next = { ...prev };
        delete next[data.user_id];
        return next;
      });
    };

    getSocket().then((s) => {
      if (cancelled) return;
      socket = s;
      s.on("drawing_stroke_progress", onProgress);
      s.on("drawing_stroke_add", onAdd);
      s.on("drawing_stroke_complete", onComplete);
    });

    return () => {
      cancelled = true;
      socket?.off("drawing_stroke_progress", onProgress);
      socket?.off("drawing_stroke_add", onAdd);
      socket?.off("drawing_stroke_complete", onComplete);
    };
  }, [docId]);

  // Sends the full strokes list, for undo, redo, delete, and clear.
  const emitComplete = useCallback(
    (next: Stroke[]) => {
      if (!docId) return;
      getSocket().then((s) => s.emit("drawing_stroke_complete", { document_id: docId, strokes: next }));
    },
    [docId]
  );

  // Sends one new finished stroke to be appended by the backend.
  const emitAdd = useCallback(
    (stroke: Stroke) => {
      if (!docId) return;
      getSocket().then((s) => s.emit("drawing_stroke_add", { document_id: docId, stroke }));
    },
    [docId]
  );

  // Converts a pointer event to canvas coordinates.
  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  }

  // Starts a stroke, or deletes/misses a hit test in delete mode.
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>, onMiss?: () => void) => {
      if (!drawing || !canEdit) return;
      const pt = pos(e);

      if (delMode) {
        let hit = -1;
        let best = Infinity;
        strokes.forEach((s, i) =>
          s.pts.forEach((p) => {
            const dist = Math.hypot(p.x - pt.x, p.y - pt.y);
            if (dist < Math.max(14, s.size) && dist < best) {
              best = dist;
              hit = i;
            }
          })
        );
        if (hit >= 0) {
          const removed = strokes[hit];
          const next = strokes.filter((_, i) => i !== hit);
          setStrokes(next);
          setRedoStack((r) => [...r, removed]);
          emitComplete(next);
        } else {
          onMiss?.();
        }
        return;
      }

      if (totalPointsRef.current >= MAX_DRAWING_POINTS) {
        warnLimitReached();
        return;
      }

      (e.target as Element).setPointerCapture(e.pointerId);
      tempIdRef.current = `${Date.now()}-${Math.random()}`;
      const newStroke: Stroke = {
        color: eraser ? "#000" : color,
        size: eraser ? Math.max(12, brush * 2) : brush,
        erase: eraser,
        pts: [pt],
        ts: Date.now(),
      };
      currentStrokeRef.current = newStroke;
      setLiveStroke(newStroke);
      setRedoStack([]);

      getSocket().then((s) =>
        s.emit("drawing_stroke_progress", {
          document_id: docId,
          tempId: tempIdRef.current,
          color: newStroke.color,
          size: newStroke.size,
          erase: newStroke.erase,
          point: pt,
        })
      );
    },
    [drawing, canEdit, delMode, strokes, eraser, color, brush, emitComplete, docId, warnLimitReached]
  );

  // Extends the current stroke with a new point.
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!currentStrokeRef.current) return;
      if (totalPointsRef.current + currentStrokeRef.current.pts.length >= MAX_DRAWING_POINTS) {
        warnLimitReached();
        return;
      }
      const pt = pos(e);
      // Updates the ref synchronously so a same tick pointerup sees the latest points.
      const next: Stroke = { ...currentStrokeRef.current, pts: [...currentStrokeRef.current.pts, pt] };
      currentStrokeRef.current = next;
      setLiveStroke(next);

      getSocket().then((s) =>
        s.emit("drawing_stroke_progress", {
          document_id: docId,
          tempId: tempIdRef.current,
          color: next.color,
          size: next.size,
          erase: next.erase,
          point: pt,
        })
      );
    },
    [docId, warnLimitReached]
  );

  // Finishes the current stroke and sends it.
  const onPointerUp = useCallback(() => {
    const finished = currentStrokeRef.current;
    if (!finished) return;
    currentStrokeRef.current = null;
    setLiveStroke(null);
    setStrokes((prev) => [...prev, finished]);
    emitAdd(finished);
  }, [emitAdd]);

  // Removes the last stroke and pushes it onto the redo stack.
  const undo = useCallback(() => {
    if (!strokes.length) return;
    const last = strokes[strokes.length - 1];
    const next = strokes.slice(0, -1);
    setStrokes(next);
    setRedoStack((r) => [...r, last]);
    emitComplete(next);
  }, [strokes, emitComplete]);

  // Restores the last undone stroke.
  const redo = useCallback(() => {
    if (!redoStack.length) return;
    const last = redoStack[redoStack.length - 1];
    const next = [...strokes, last];
    setStrokes(next);
    setRedoStack((r) => r.slice(0, -1));
    emitComplete(next);
  }, [strokes, redoStack, emitComplete]);

  // Clears all ink from the page after confirmation.
  const clearInk = useCallback(() => {
    if (!window.confirm("Clear all drawing on this page?")) return;
    setStrokes([]);
    emitComplete([]);
  }, [emitComplete]);

  return {
    canvasRef,
    strokes,
    peerStrokes,
    drawing,
    toggleDraw: () =>
      setDrawing((d) => {
        const next = !d;
        if (next) {
          // Always start with the default pen tool active.
          setEraser(false);
          setDelMode(false);
        }
        return next;
      }),
    eraser,
    toggleEraser: () => {
      setEraser((v) => !v);
      setDelMode(false);
    },
    delMode,
    toggleDelete: () => {
      setDelMode((v) => !v);
      setEraser(false);
    },
    brush,
    setBrush,
    color,
    setColor,
    undo,
    redo,
    clearInk,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
