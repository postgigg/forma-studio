import { useEffect, useRef, useState } from "react";
import { RotateCcw, Upload } from "lucide-react";
import { type Editor } from "./editor";
import { Modal, Field } from "./ui";
import { fonts } from "./types";
import {
  PhotoFrame,
  defaultMask,
  frameShapes,
  type PhotoMask,
  type FrameShape,
} from "./photo-frame";

function MaskPreview({ mask }: { mask: PhotoMask }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    void PhotoFrame.create(mask).then((f) => {
      if (cancelled || !ref.current) return;
      const canvas = ref.current,
        ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, 96, 96);
      ctx.save();
      ctx.translate(48, 48);
      ctx.scale(0.15, 0.15);
      f._render(ctx);
      ctx.restore();
    });
    return () => {
      cancelled = true;
    };
  }, [mask]);
  return <canvas ref={ref} width={96} height={96} />;
}
export function PhotoFrameLibrary({
  editor,
  run,
}: {
  editor: Editor;
  run: (fn: () => unknown) => void;
}) {
  const [font, setFont] = useState("Arial"),
    [italic, setItalic] = useState(false);
  const add = (shape: FrameShape, letter = "A") =>
    run(() =>
      editor.addPhotoFrame({ ...defaultMask(shape, letter), font, italic }),
    );
  return (
    <div className="photo-frame-library">
      <p className="muted small">
        Add a placeholder, then drop a photo onto it. Double-click the filled
        frame to crop.
      </p>
      <h3 className="section-label">Shape frames</h3>
      <div className="mask-grid">
        {frameShapes
          .filter((s) => s !== "letter")
          .map((shape) => {
            const m = defaultMask(shape);
            return (
              <button
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData(
                    "application/x-forma",
                    JSON.stringify({ type: "photo-frame", mask: m }),
                  )
                }
                onClick={() => add(shape)}
                aria-label={`Add ${shape} photo frame`}
                key={shape}
              >
                <MaskPreview mask={m} />
                <small>{shape}</small>
              </button>
            );
          })}
      </div>
      <h3 className="section-label">Alphabet & numbers</h3>
      <Field label="Letter font">
        <select
          aria-label="Letter frame font"
          value={font}
          onChange={(e) => setFont(e.target.value)}
        >
          {fonts.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </Field>
      <label className="check-row">
        <input
          type="checkbox"
          checked={italic}
          onChange={(e) => setItalic(e.target.checked)}
        />
        Italic letters
      </label>
      <div className="mask-grid letter-mask-grid">
        {Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789").map((letter) => {
          const m = { ...defaultMask("letter", letter), font, italic };
          return (
            <button
              key={letter}
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData(
                  "application/x-forma",
                  JSON.stringify({ type: "photo-frame", mask: m }),
                )
              }
              aria-label={`Add letter ${letter} photo frame`}
              onClick={() => add("letter", letter)}
            >
              <MaskPreview mask={m} />
              <small>{letter}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
export function PhotoFrameDialog({
  editor,
  existing,
  onClose,
}: {
  editor: Editor;
  existing: PhotoFrame;
  onClose: () => void;
}) {
  const [mask, setMask] = useState<PhotoMask>(() =>
      structuredClone(existing.photoMask),
    ),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null),
    file = useRef<HTMLInputElement>(null),
    drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
      null,
    ),
    dest = useRef({
      doc: editor.doc.id,
      page: editor.page.id,
      baseline: JSON.stringify(existing.photoMask),
    });
  const change = (v: Partial<PhotoMask>) => setMask((m) => ({ ...m, ...v }));
  useEffect(() => {
    let cancelled = false;
    void PhotoFrame.create(mask)
      .then((f) => {
        if (cancelled || !ref.current) return;
        const c = ref.current,
          ctx = c.getContext("2d")!;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.save();
        ctx.translate(400, 400);
        ctx.scale(1.2, 1.2);
        f._render(ctx);
        ctx.restore();
        setError("");
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [mask]);
  const save = async () => {
    setWorking(true);
    try {
      const result = await PhotoFrame.create(mask);
      if (
        editor.busy ||
        editor.doc.id !== dest.current.doc ||
        editor.page.id !== dest.current.page ||
        !editor.objects.includes(existing) ||
        existing.lockMovementX ||
        JSON.stringify(existing.photoMask) !== dest.current.baseline
      )
        throw new Error(
          "The frame changed. Reopen it to edit the latest version.",
        );
      editor.replaceObject(existing, result);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <Modal title="Crop & edit photo frame" onClose={onClose} wide>
      <div className="photo-mask-dialog">
        <div className="mask-crop-preview">
          <canvas
            width={800}
            height={800}
            ref={ref}
            aria-label="Drag photo to reposition inside frame"
            onPointerDown={(e) => {
              if (!mask.src) return;
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                px: mask.panX,
                py: mask.panY,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const d = drag.current,
                b = e.currentTarget.getBoundingClientRect();
              change({
                panX: Math.max(
                  -1,
                  Math.min(1, d.px + ((e.clientX - d.x) / b.width) * 4),
                ),
                panY: Math.max(
                  -1,
                  Math.min(1, d.py + ((e.clientY - d.y) / b.height) * 4),
                ),
              });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          />
          <p>
            {mask.src
              ? "Drag the photo to reposition it."
              : "Drop a photo onto this placeholder or upload one below."}
          </p>
        </div>
        <div className="mask-controls">
          <Field label="Frame shape">
            <select
              aria-label="Photo frame shape"
              value={mask.shape}
              onChange={(e) => change({ shape: e.target.value as FrameShape })}
            >
              {frameShapes.map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          {mask.shape === "letter" && (
            <>
              <Field label="Letter or word">
                <input
                  aria-label="Frame letters"
                  value={mask.letter}
                  maxLength={12}
                  onChange={(e) => change({ letter: e.target.value })}
                />
              </Field>
              <Field label="Font">
                <select
                  aria-label="Photo frame font"
                  value={mask.font}
                  onChange={(e) => change({ font: e.target.value })}
                >
                  {fonts.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </Field>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={mask.italic}
                  onChange={(e) => change({ italic: e.target.checked })}
                />
                Italic
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={mask.bold}
                  onChange={(e) => change({ bold: e.target.checked })}
                />
                Bold
              </label>
            </>
          )}
          <Field label={`Crop zoom · ${Math.round(mask.zoom * 100)}%`}>
            <input
              type="range"
              aria-label="Photo crop zoom"
              min={1}
              max={4}
              step={0.01}
              value={mask.zoom}
              onChange={(e) => change({ zoom: +e.target.value })}
            />
          </Field>
          <Field label="Horizontal position">
            <input
              type="range"
              aria-label="Photo horizontal position"
              min={-1}
              max={1}
              step={0.01}
              value={mask.panX}
              onChange={(e) => change({ panX: +e.target.value })}
            />
          </Field>
          <Field label="Vertical position">
            <input
              type="range"
              aria-label="Photo vertical position"
              min={-1}
              max={1}
              step={0.01}
              value={mask.panY}
              onChange={(e) => change({ panY: +e.target.value })}
            />
          </Field>
          <button
            className="secondary full"
            onClick={() => change({ zoom: 1, panX: 0, panY: 0 })}
          >
            <RotateCcw size={15} />
            Reset crop
          </button>
          <button
            className="secondary full"
            onClick={() => file.current?.click()}
          >
            <Upload size={15} />
            {mask.src ? "Replace photo" : "Upload photo"}
          </button>
          <input
            hidden
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                if (f.size > 20_000_000)
                  throw new Error("Choose an image smaller than 20 MB.");
                const img = await createImageBitmap(f);
                const c = document.createElement("canvas"),
                  s = Math.min(1, 3200 / Math.max(img.width, img.height));
                c.width = Math.round(img.width * s);
                c.height = Math.round(img.height * s);
                c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
                img.close();
                change({
                  src: c.toDataURL("image/png"),
                  zoom: 1,
                  panX: 0,
                  panY: 0,
                });
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
          {mask.src && (
            <button
              className="text-button"
              onClick={() => change({ src: "", zoom: 1, panX: 0, panY: 0 })}
            >
              Remove photo, keep frame
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={working || !!error}
          onClick={() => void save()}
        >
          {working ? "Saving…" : "Save photo frame"}
        </button>
      </div>
    </Modal>
  );
}
