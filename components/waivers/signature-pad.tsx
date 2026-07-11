"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 180;

/**
 * A native HTML5 canvas signature pad — no drawing-library dependency.
 * `width`/`height` set the canvas's internal pixel resolution; the element
 * is then stretched to fill its container via CSS, so pointer coordinates
 * must be rescaled from CSS pixel space back into canvas pixel space or
 * every stroke would land in the wrong place on any screen wider than
 * `CANVAS_WIDTH`.
 */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  function pointerPos(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = pointerPos(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointerPos(event);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineTo(x, y);
    ctx.stroke();
    hasDrawnRef.current = true;
  }

  function stopDrawing() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (hasDrawnRef.current) onChange(canvasRef.current?.toDataURL("image/png") ?? null);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        data-testid="signature-canvas"
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="w-full touch-none rounded-lg border border-border bg-white"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Draw your signature above</p>
        <Button type="button" variant="ghost" size="sm" onClick={clear}>
          Clear
        </Button>
      </div>
    </div>
  );
}
