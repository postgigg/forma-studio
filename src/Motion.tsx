import { useEffect, useRef, useState } from "react";
import { StaticCanvas } from "fabric";
import { Play, RotateCcw } from "lucide-react";
import type { Editor } from "./editor";
import { fonts, type CanvasData, type PageMotion } from "./types";
import { Modal } from "./ui";
import { deviceMotion, hasDeviceMotion, motionLength } from "./motion-render";

export const motionChoices = [
  { id: "none", name: "Still", detail: "Let the composition speak." },
  { id: "fade", name: "Fade", detail: "A soft, unified reveal." },
  { id: "rise", name: "Rise", detail: "A gentle upward entrance." },
  {
    id: "stagger",
    name: "Sequence",
    detail: "Layers arrive in reading order.",
  },
  { id: "drift", name: "Breathe", detail: "A slow, cinematic settling." },
] as const;
export function MotionCanvas({
  data,
  width,
  height,
  motion,
  replay = 0,
  presentation = false,
}: {
  data: CanvasData;
  width: number;
  height: number;
  motion?: PageMotion;
  replay?: number;
  presentation?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    wrap = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!ref.current) return;
    let closed = false,
      frame = 0;
    const scale = Math.min(
      1,
      (presentation ? 1600 : 850) / width,
      (presentation ? 1000 : 480) / height,
    );
    const canvas = new StaticCanvas(ref.current, {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      enableRetinaScaling: false,
    });
    canvas.setZoom(scale);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setError("");
    void (async () => {
      await Promise.all(fonts.map((f) => document.fonts.load(`16px "${f}"`)));
      await canvas.loadFromJSON(structuredClone(data));
      if (closed) return;
      const mode = motion?.style || "none",
        duration = Math.min(6, Math.max(0.5, motion?.duration || 2)) * 1000;
      const layers = canvas
        .getObjects()
        .map((o) => ({
          object: o,
          left: o.left,
          top: o.top,
          opacity: o.opacity,
          scaleX: o.scaleX,
          scaleY: o.scaleY,
        }));
      // Sort the entrance order without changing actual layer stacking.
      const order = [...layers].sort(
        (a, b) => a.top - b.top || a.left - b.left,
      );
      const movingDevice = layers.some((layer) =>
        hasDeviceMotion(layer.object),
      );
      const cycle = motionLength(
        motion || { style: "none", duration: 2 },
        layers.length,
      );
      const start = performance.now();
      if (wrap.current)
        wrap.current.dataset.playing = String(
          (mode !== "none" || movingDevice) && !reduced,
        );
      const animate = (now: number) => {
        if (closed) return;
        const elapsed = now - start;
        layers.forEach((layer) => {
          deviceMotion(layer.object, reduced ? null : elapsed / cycle);
          const delay =
            mode === "stagger"
              ? order.indexOf(layer) *
                Math.min(65, 600 / Math.max(1, layers.length))
              : 0;
          const t =
            reduced || mode === "none"
              ? 1
              : Math.min(1, Math.max(0, (elapsed - delay) / duration));
          const eased = 1 - Math.pow(1 - t, 3);
          const lift =
            mode === "rise" || mode === "stagger"
              ? (1 - eased) * height * 0.035
              : 0;
          const zoom = mode === "drift" ? 1 + (1 - eased) * 0.045 : 1;
          layer.object.set({
            left: width / 2 + (layer.left - width / 2) * zoom,
            top: height / 2 + (layer.top - height / 2) * zoom + lift,
            scaleX: layer.scaleX * zoom,
            scaleY: layer.scaleY * zoom,
            opacity:
              layer.opacity *
              (mode === "none" || reduced ? 1 : Math.min(1, t * 2.2)),
          });
        });
        canvas.renderAll();
        if (
          !reduced &&
          (movingDevice || (mode !== "none" && elapsed < duration + 650))
        )
          frame = requestAnimationFrame(animate);
        else if (wrap.current) wrap.current.dataset.playing = "false";
      };
      animate(start);
      if (wrap.current) wrap.current.dataset.ready = "true";
    })().catch((e) => {
      if (!closed) setError(e.message);
    });
    return () => {
      closed = true;
      cancelAnimationFrame(frame);
      void canvas.dispose();
    };
  }, [
    data,
    width,
    height,
    motion?.style,
    motion?.duration,
    replay,
    presentation,
  ]);
  return (
    <div
      ref={wrap}
      className={`motion-canvas ${presentation ? "is-presenting" : ""}`}
      data-playing="false"
      data-ready="false"
    >
      <canvas ref={ref} aria-label="Animated design preview" />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function MotionDialog({
  editor,
  onClose,
  notify,
}: {
  editor: Editor;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [motion, setMotion] = useState<PageMotion>(
    editor.page.motion || { style: "fade", duration: 2 },
  );
  const [replay, setReplay] = useState(0);
  const [data] = useState<CanvasData>(() => editor.canvas.toObject());
  return (
    <Modal title="Animate your page" onClose={onClose} wide>
      <div className="motion-body">
        <div className="motion-preview-stage">
          <MotionCanvas
            data={data}
            width={editor.doc.width}
            height={editor.doc.height}
            motion={motion}
            replay={replay}
          />
        </div>
        <div
          className="motion-options"
          role="radiogroup"
          aria-label="Page animation"
        >
          {motionChoices.map((choice) => (
            <button
              key={choice.id}
              role="radio"
              aria-checked={motion.style === choice.id}
              onClick={() => setMotion({ ...motion, style: choice.id })}
            >
              <span className={`motion-symbol motion-symbol-${choice.id}`}>
                <i />
                <i />
                <i />
              </span>
              <strong>{choice.name}</strong>
              <small>{choice.detail}</small>
            </button>
          ))}
        </div>
        <div className="motion-settings">
          <label>
            Duration{" "}
            <select
              aria-label="Animation duration"
              value={motion.duration}
              onChange={(e) =>
                setMotion({ ...motion, duration: +e.target.value })
              }
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} seconds
                </option>
              ))}
            </select>
          </label>
          <button className="secondary" onClick={() => setReplay((v) => v + 1)}>
            <RotateCcw size={15} /> Replay preview
          </button>
        </div>
        <p className="muted small">
          Plays in Present and in GIF or WebM downloads. Still images and PDFs
          keep the finished composition. Reduced-motion preferences are
          respected in previews.
        </p>
        <div className="refine-actions">
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            onClick={() => {
              editor.page.motion = motion;
              editor.commit();
              notify("Page animation saved. Use Present to play it.");
              onClose();
            }}
          >
            <Play size={15} /> Apply animation
          </button>
        </div>
      </div>
    </Modal>
  );
}
