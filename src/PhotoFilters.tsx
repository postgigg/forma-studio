import { useEffect, useState } from "react";
import { FabricImage } from "fabric";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Field } from "./ui";
import type { Editor } from "./editor";
import {
  applyPhotoGrades,
  photoGrades,
  validGrades,
  type GradedImage,
} from "./photo-filters";

export function PhotoFilters({
  editor,
  image,
}: {
  editor: Editor;
  image: GradedImage;
}) {
  const [family, setFamily] = useState("All");
  const layers = validGrades(image.photoGrades);
  const sourceElement = image._originalElement;
  const signature = JSON.stringify([
    image.width,
    image.height,
    image.cropX,
    image.cropY,
    image.filters.map((f) => f.toObject()),
    layers,
    image.photoBrightness,
  ]);
  const [previews, setPreviews] = useState<{
    image?: GradedImage;
    source?: GradedImage["_originalElement"];
    signature: string;
    images: Record<string, string>;
  }>({ signature: "", images: {} });
  const previewReady =
    previews.image === image &&
    previews.source === sourceElement &&
    previews.signature === signature;
  const [previewError, setPreviewError] = useState(false);
  useEffect(() => {
    let cancelled = false,
      frame = 0,
      index = 0;
    const images: Record<string, string> = {};
    setPreviewError(false);
    // Downsample the original crop once. Use the same filter stack and
    // brightness order as the canvas; previews never edit the selected image.
    const source = document.createElement("canvas"),
      scale = Math.min(1, 240 / Math.max(image.width, image.height));
    source.width = Math.max(1, Math.round(image.width * scale));
    source.height = Math.max(1, Math.round(image.height * scale));
    try {
      source
        .getContext("2d")!
        .drawImage(
          sourceElement,
          image.cropX,
          image.cropY,
          image.width,
          image.height,
          0,
          0,
          source.width,
          source.height,
        );
    } catch {
      setPreviewError(true);
      return;
    }
    const batch = () => {
      if (cancelled) return;
      try {
        for (let n = 0; n < 4 && index < photoGrades.length; n++, index++) {
          const copy = document.createElement("canvas");
          copy.width = source.width;
          copy.height = source.height;
          copy.getContext("2d")!.drawImage(source, 0, 0);
          const preview = new FabricImage(copy) as GradedImage;
          try {
            preview.filters = [...image.filters];
            preview.photoGrades = layers;
            preview.photoBrightness = image.photoBrightness;
            applyPhotoGrades(preview, [
              ...layers,
              { id: photoGrades[index].id, amount: 1 },
            ]);
            images[photoGrades[index].id] = preview
              .toCanvasElement({ withoutTransform: true, withoutShadow: true })
              .toDataURL("image/webp", 0.88);
          } finally {
            preview.dispose();
          }
        }
        setPreviews({
          image,
          source: sourceElement,
          signature,
          images: { ...images },
        });
        if (index < photoGrades.length) frame = requestAnimationFrame(batch);
      } catch {
        setPreviewError(true);
      }
    };
    frame = requestAnimationFrame(batch);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [image, sourceElement, signature]);
  const change = (next: typeof layers) => editor.setPhotoGrades(next);
  return (
    <div className="photo-filter-controls">
      <div className="section-heading">
        <h4>Photo filters</h4>
        <button
          className="text-button"
          onClick={() => editor.imageFilter("original")}
        >
          Reset
        </button>
      </div>
      <Field label="Filter collection">
        <select
          value={family}
          onChange={(e) => setFamily(e.target.value)}
          aria-label="Filter collection"
        >
          {["All", ...new Set(photoGrades.map((g) => g.family))].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </Field>
      {layers.length >= 6 && (
        <p className="muted small">
          Six filters are applied. Remove one from the stack to add another.
        </p>
      )}
      <div
        className="filter-grid"
        aria-label="Photo filters"
        aria-busy={
          !previewError &&
          (!previewReady ||
            Object.keys(previews.images).length < photoGrades.length)
        }
      >
        {photoGrades
          .filter((g) => family === "All" || g.family === family)
          .map((g) => (
            <button
              key={g.id}
              disabled={layers.length >= 6}
              onClick={() => change([...layers, { id: g.id, amount: 1 }])}
            >
              {previewReady && previews.images[g.id] ? (
                <img src={previews.images[g.id]} alt="" draggable={false} />
              ) : (
                <span
                  className="filter-preview-placeholder"
                  aria-hidden="true"
                />
              )}
              <span className="filter-preview-name">{g.name}</span>
            </button>
          ))}
      </div>
      {previewError && (
        <p className="muted small" role="status">
          Previews could not be drawn for this image. You can still apply a
          filter and view it on the canvas.
        </p>
      )}
      {!!layers.length && (
        <ol className="photo-grade-stack" aria-label="Applied filters">
          {layers.map((g, i) => (
            <li key={`${i}-${g.id}`}>
              <div>
                <strong>{photoGrades.find((p) => p.id === g.id)!.name}</strong>
                <button
                  aria-label={`Move filter ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => {
                    const n = [...layers];
                    [n[i - 1], n[i]] = [n[i], n[i - 1]];
                    change(n);
                  }}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  aria-label={`Move filter ${i + 1} down`}
                  disabled={i === layers.length - 1}
                  onClick={() => {
                    const n = [...layers];
                    [n[i + 1], n[i]] = [n[i], n[i + 1]];
                    change(n);
                  }}
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  aria-label={`Remove filter ${i + 1}`}
                  onClick={() => change(layers.filter((_, k) => k !== i))}
                >
                  <X size={14} />
                </button>
              </div>
              <label>
                Strength{" "}
                <input
                  type="range"
                  aria-label={`Filter ${i + 1} strength`}
                  min={0}
                  max={100}
                  value={Math.round(g.amount * 100)}
                  onChange={(e) =>
                    change(
                      layers.map((v, k) =>
                        k === i ? { ...v, amount: +e.target.value / 100 } : v,
                      ),
                    )
                  }
                />
                <output>{Math.round(g.amount * 100)}%</output>
              </label>
            </li>
          ))}
        </ol>
      )}
      <Field label="Brightness">
        <input
          type="range"
          aria-label="Brightness"
          min={-0.5}
          max={0.5}
          step={0.01}
          value={
            image.photoBrightness ??
            (
              image.filters.find((f) => f.type === "Brightness") as {
                brightness?: number;
              }
            )?.brightness ??
            0
          }
          onChange={(e) => editor.brightness(+e.target.value)}
        />
      </Field>
    </div>
  );
}
