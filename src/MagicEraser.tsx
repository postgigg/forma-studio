import { useEffect, useRef, useState } from "react";
import { Eraser, RotateCcw, Sparkles, Square } from "lucide-react";
import type { Editor } from "./editor";
import { Modal } from "./ui";
import { designerRequest } from "./ai";
import { useBrandGuidance } from "./BrandContext";
import { AiEngine, useDesignIntent } from "./DesignIntent";
import {
  applyRefinement,
  makeRefinedSelection,
  type SelectionSnapshot,
  type RefinedSelection,
  type RefinementJob,
} from "./refinement";

type Stroke = {
  tool?: "brush" | "circle" | "lasso";
  size: number;
  points: { x: number; y: number }[];
};
async function picture(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}
export async function blendErasedPhoto(
  original: string,
  changed: string,
  mask: HTMLCanvasElement,
  featherInside = false,
) {
  const [before, after] = await Promise.all([
    picture(original),
    picture(changed),
  ]);
  const patch = document.createElement("canvas");
  patch.width = before.width;
  patch.height = before.height;
  const p = patch.getContext("2d")!;
  p.drawImage(after, 0, 0, patch.width, patch.height);
  p.globalCompositeOperation = "destination-in";
  if (featherInside) {
    // Feather inward only: zero-alpha pixels outside the original selection stay untouched.
    const soft = document.createElement("canvas");
    soft.width = mask.width;
    soft.height = mask.height;
    const ctx = soft.getContext("2d")!;
    ctx.filter = `blur(${Math.max(3, Math.min(mask.width, mask.height) * 0.035)}px)`;
    ctx.drawImage(mask, 0, 0);
    ctx.filter = "none";
    const blurred = ctx.getImageData(0, 0, soft.width, soft.height),
      original = mask
        .getContext("2d")!
        .getImageData(0, 0, mask.width, mask.height);
    for (let i = 3; i < blurred.data.length; i += 4)
      blurred.data[i] = Math.round(
        original.data[i] * Math.max(0, (blurred.data[i] - 128) / 127),
      );
    ctx.putImageData(blurred, 0, 0);
    p.drawImage(soft, 0, 0, patch.width, patch.height);
  } else p.drawImage(mask, 0, 0, patch.width, patch.height);
  const canvas = document.createElement("canvas");
  canvas.width = before.width;
  canvas.height = before.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(before, 0, 0);
  ctx.drawImage(patch, 0, 0);
  return canvas.toDataURL("image/png");
}
export function MagicEraser({
  editor,
  snapshot,
  onClose,
  notify,
  pencil = false,
}: {
  editor: Editor;
  snapshot: SelectionSnapshot;
  onClose: () => void;
  notify: (message: string) => void;
  pencil?: boolean;
}) {
  const source = snapshot.images[0];
  const [tool, setTool] = useState<"brush" | "circle" | "lasso">(
    pencil ? "circle" : "brush",
  );
  const [prompt, setPrompt] = useState(""),
    [size, setSize] = useState(12),
    [strokes, setStrokes] = useState<Stroke[]>([]),
    [dimensions, setDimensions] = useState({ width: 1, height: 1 }),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [job, setJob] = useState<RefinementJob | null>(null),
    [candidate, setCandidate] = useState<RefinedSelection | null>(null),
    [after, setAfter] = useState("");
  const { brandContext, control: brandControl } = useBrandGuidance(working);
  const { designIntent, control: intentControl } = useDesignIntent(working);
  const overlay = useRef<HTMLCanvasElement>(null),
    mask = useRef(document.createElement("canvas")),
    drawing = useRef<Stroke | null>(null),
    alive = useRef(true),
    owned = useRef<{ id: string; token: string } | null>(null);
  const connect = async () => {
    try {
      const session = await designerRequest("/session");
      if (!session.ready)
        throw new Error("Sign in to Codex and start your local designer.");
      if (alive.current) {
        setToken(session.token);
        setError("");
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  };
  useEffect(() => {
    alive.current = true;
    void connect();
    return () => {
      alive.current = false;
      const current = owned.current;
      if (current)
        void designerRequest(`/refinements/${current.id}`, current.token, {
          method: "DELETE",
        }).catch(() => {});
    };
  }, []);
  const draw = (items: Stroke[]) => {
    const canvas = mask.current;
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const ctx = canvas.getContext("2d")!;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    for (const stroke of items) {
      if (stroke.tool === "circle" && stroke.points.length > 1) {
        const a = stroke.points[0],
          b = stroke.points.at(-1)!;
        ctx.beginPath();
        ctx.ellipse(
          (a.x + b.x) / 2,
          (a.y + b.y) / 2,
          Math.max(0.5, Math.abs(b.x - a.x) / 2),
          Math.max(0.5, Math.abs(b.y - a.y) / 2),
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        continue;
      }
      if (stroke.tool === "lasso" && stroke.points.length > 2) {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        stroke.points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();
        continue;
      }
      ctx.lineWidth = stroke.size;
      ctx.beginPath();
      const first = stroke.points[0];
      ctx.moveTo(first.x, first.y);
      stroke.points.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
      if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.arc(first.x, first.y, stroke.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const view = overlay.current;
    if (view) {
      view.width = canvas.width;
      view.height = canvas.height;
      const v = view.getContext("2d")!;
      v.drawImage(canvas, 0, 0);
      v.globalCompositeOperation = "source-in";
      v.fillStyle = "rgba(151,77,232,.62)";
      v.fillRect(0, 0, canvas.width, canvas.height);
    }
  };
  useEffect(() => {
    draw(strokes);
  }, [strokes, dimensions]);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const b = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          dimensions.width,
          ((event.clientX - b.left) * dimensions.width) / b.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          dimensions.height,
          ((event.clientY - b.top) * dimensions.height) / b.height,
        ),
      ),
    };
  };
  const cancel = async () => {
    const current = owned.current;
    if (!current) return;
    try {
      await designerRequest(`/refinements/${current.id}`, current.token, {
        method: "DELETE",
      });
      owned.current = null;
      setWorking(false);
      setJob(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const generate = async () => {
    setWorking(true);
    setError("");
    setCandidate(null);
    setAfter("");
    const frozen = document.createElement("canvas");
    frozen.width = mask.current.width;
    frozen.height = mask.current.height;
    frozen.getContext("2d")!.drawImage(mask.current, 0, 0);
    const guide = document.createElement("canvas");
    guide.width = frozen.width;
    guide.height = frozen.height;
    const g = guide.getContext("2d")!;
    g.fillStyle = "#000000";
    g.fillRect(0, 0, guide.width, guide.height);
    g.drawImage(frozen, 0, 0);
    try {
      let next: RefinementJob = await designerRequest("/refinements", token, {
        method: "POST",
        body: JSON.stringify({
          prompt: pencil
            ? prompt.trim()
            : `Remove the marked object and naturally reconstruct its background. ${prompt.trim()}`,
          width: snapshot.width,
          brandContext,
          ...(pencil ? { designIntent } : {}),
          height: snapshot.height,
          nodes: snapshot.nodes,
          images: snapshot.images,
          preview: snapshot.preview,
          ...(pencil
            ? { pencil: { id: source.id, mask: guide.toDataURL("image/png") } }
            : {
                eraser: { id: source.id, mask: guide.toDataURL("image/png") },
              }),
        }),
      });
      owned.current = { id: next.id, token };
      if (!alive.current) {
        await designerRequest(`/refinements/${next.id}`, token, {
          method: "DELETE",
        });
        owned.current = null;
        return;
      }
      while (alive.current && owned.current?.id === next.id) {
        setJob(next);
        if (next.status === "completed" && next.result) {
          const changed = next.result.images.find((i) => i.id === source.id);
          if (!changed)
            throw new Error("No edited photo was returned. Try again.");
          const src = await blendErasedPhoto(
            source.src,
            changed.src,
            frozen,
            pencil,
          );
          const result = await makeRefinedSelection(snapshot, {
            summary: next.result.summary,
            edits: [],
            images: [{ id: source.id, src }],
          });
          if (alive.current) {
            setAfter(src);
            setCandidate(result);
          }
          owned.current = null;
          break;
        }
        if (next.status === "failed" || next.status === "cancelled") {
          owned.current = null;
          throw new Error(next.error || "Image edit cancelled.");
        }
        await new Promise((resolve) => setTimeout(resolve, 1200));
        if (!alive.current || owned.current?.id !== next.id) break;
        next = await designerRequest(`/refinements/${next.id}`, token);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setWorking(false);
    }
  };
  return (
    <Modal title={pencil ? "AI Pencil" : "Magic Eraser"} wide onClose={onClose}>
      {brandControl}
      <p className="modal-description">
        {pencil
          ? "Circle, outline, or brush over the area you want to change. Describe what belongs there; AI uses the whole image to match its style, light, and perspective."
          : "Brush over an object and its shadow. AI fills the marked area with a natural background."}
      </p>
      <div className={`eraser-previews ${after ? "has-after" : ""}`}>
        <figure>
          <figcaption>
            {after
              ? "Your marked area"
              : pencil
                ? "Mark where the change belongs"
                : "Paint what you want to remove"}
          </figcaption>
          <div className="eraser-image">
            <img
              src={source.src}
              alt={
                pencil
                  ? "Original image for AI Pencil"
                  : "Original photo for Magic Eraser"
              }
              onLoad={(e) =>
                setDimensions({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                })
              }
            />
            <canvas
              ref={overlay}
              aria-label={
                pencil ? "Mark the area to edit" : "Mark the area to erase"
              }
              style={{
                touchAction: "none",
                cursor: working ? "wait" : "crosshair",
              }}
              onPointerDown={(e) => {
                if (working) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                drawing.current = {
                  tool,
                  size:
                    (size / 100) *
                    Math.min(dimensions.width, dimensions.height),
                  points: [point(e)],
                };
                setCandidate(null);
                setAfter("");
                draw([...strokes, drawing.current]);
              }}
              onPointerMove={(e) => {
                if (!drawing.current) return;
                drawing.current.points.push(point(e));
                draw([...strokes, drawing.current]);
              }}
              onPointerUp={(e) => {
                if (!drawing.current) return;
                const stroke = drawing.current;
                drawing.current = null;
                setStrokes((previous) => [...previous, stroke]);
                e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => {
                drawing.current = null;
                draw(strokes);
              }}
            />
          </div>
        </figure>
        {after && (
          <figure>
            <figcaption>
              {pencil ? "Proposed targeted edit" : "Background restored"}
            </figcaption>
            <img
              className="eraser-result"
              src={after}
              alt={pencil ? "AI Pencil result" : "Magic Eraser result"}
            />
          </figure>
        )}
      </div>
      <div className="eraser-tools">
        {pencil && (
          <label className="field">
            <span>Marking tool</span>
            <select
              aria-label="AI Pencil marking tool"
              value={tool}
              disabled={working}
              onChange={(e) => setTool(e.target.value as typeof tool)}
            >
              <option value="circle">Circle an area</option>
              <option value="lasso">Freehand outline</option>
              <option value="brush">Paint an area</option>
            </select>
          </label>
        )}
        <label className="field">
          <span>Brush size · {size}%</span>
          <input
            aria-label={pencil ? "AI Pencil brush size" : "Eraser brush size"}
            type="range"
            min={1}
            max={35}
            value={size}
            disabled={working}
            onChange={(e) => setSize(+e.target.value)}
          />
        </label>
        <button
          className="secondary"
          disabled={working || !strokes.length}
          onClick={() => {
            setStrokes(strokes.slice(0, -1));
            setCandidate(null);
            setAfter("");
          }}
        >
          <RotateCcw size={15} /> Undo brush
        </button>
        <button
          className="text-button"
          disabled={working || !strokes.length}
          onClick={() => {
            setStrokes([]);
            setCandidate(null);
            setAfter("");
          }}
        >
          Clear marks
        </button>
      </div>
      <label className="field">
        <span>
          {pencil ? (
            "What should appear or change here?"
          ) : (
            <>
              What should disappear? <small>Optional</small>
            </>
          )}
        </span>
        <input
          aria-label={
            pencil ? "AI Pencil instructions" : "Magic Eraser instructions"
          }
          maxLength={2000}
          disabled={working}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            pencil
              ? "Add a shark swimming left through this area. Match the ocean illustration’s colors, texture, lighting, and scale…"
              : "Remove the turtle and continue the beach sand and shoreline…"
          }
        />
      </label>
      {pencil && intentControl}
      <AiEngine images />
      {working && (
        <div className="ai-progress">
          <span className="spinner" />
          <strong>{job?.stage || "Preparing your photo…"}</strong>
          <p>{job?.elapsedSeconds || 0}s</p>
          <button className="text-button" onClick={() => void cancel()}>
            <Square size={12} /> {pencil ? "Cancel edit" : "Cancel erasing"}
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="ai-error">
          {error}
          <button className="text-button" onClick={() => void connect()}>
            Reconnect
          </button>
        </div>
      )}
      <p className="muted">
        Review before applying. Pixels outside your brush marks stay unchanged,
        and Undo restores your photo.
      </p>
      <div className="refine-actions">
        <button className="secondary" onClick={onClose}>
          Close
        </button>
        <button
          className={candidate ? "secondary" : "primary"}
          disabled={
            working ||
            !token ||
            !strokes.length ||
            (pencil && prompt.trim().length < 8)
          }
          onClick={() => void generate()}
        >
          <Eraser size={16} />
          {candidate
            ? "Try again"
            : pencil
              ? "Generate targeted edit"
              : "Erase with AI"}
        </button>
        {candidate && (
          <button
            className="primary"
            disabled={working}
            onClick={async () => {
              setWorking(true);
              try {
                await applyRefinement(editor, snapshot, candidate);
                notify(
                  pencil
                    ? "Targeted edit applied. Undo restores your original image."
                    : "Object erased. Undo restores your original photo.",
                );
                onClose();
              } catch (e) {
                setError((e as Error).message);
                setWorking(false);
              }
            }}
          >
            <Sparkles size={16} />{" "}
            {pencil ? "Apply targeted edit" : "Apply erased photo"}
          </button>
        )}
      </div>
    </Modal>
  );
}
