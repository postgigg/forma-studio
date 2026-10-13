import { useState } from "react";
import {
  Color,
  FabricImage,
  FabricObject,
  Gradient,
  Group,
  Point,
  Textbox,
  util,
} from "fabric";
import { Palette } from "lucide-react";
import type { Editor } from "./editor";
import { Modal } from "./ui";
import { colors } from "./types";
import { DeviceFrame } from "./device-frame";

function leaves(object: FabricObject): FabricObject[] {
  if (object instanceof FabricImage || object instanceof DeviceFrame) return [];
  return object instanceof Group
    ? object.getObjects().flatMap(leaves)
    : [object];
}
const visiblePaint = (value: unknown) =>
  !!value && value !== "none" && value !== "transparent";
export function GraphicColor({
  editor,
  compact = false,
}: {
  editor: Editor;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState("solid"),
    [scope, setScope] = useState("all"),
    [start, setStart] = useState("#754adb"),
    [end, setEnd] = useState("#f0b8a4"),
    [angle, setAngle] = useState(0);
  const [startOpacity, setStartOpacity] = useState(100),
    [endOpacity, setEndOpacity] = useState(100);
  const alpha = (n: number) =>
    Math.round(n * 2.55)
      .toString(16)
      .padStart(2, "0");
  const selected = editor.selected;
  if (
    !selected ||
    selected instanceof Textbox ||
    selected instanceof FabricImage ||
    selected instanceof DeviceFrame
  )
    return null;
  const objects = leaves(selected),
    palette = [
      ...new Set(
        objects.flatMap((o) =>
          [o.fill, o.stroke].filter(
            (p) => typeof p === "string" && visiblePaint(p),
          ),
        ),
      ),
    ] as string[];
  const apply = (gradient: boolean, color = start) => {
    const bounds = selected.getBoundingRect(),
      r = (angle * Math.PI) / 180;
    const center = new Point(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    const delta = new Point(
      (Math.cos(r) * bounds.width) / 2,
      (Math.sin(r) * bounds.height) / 2,
    );
    for (const object of objects) {
      const local = (point: Point) =>
        point
          .transform(util.invertTransform(object.calcTransformMatrix()))
          .add(new Point(object.width / 2, object.height / 2));
      const from = local(center.subtract(delta)),
        to = local(center.add(delta));
      for (const key of ["fill", "stroke"] as const)
        if (
          visiblePaint(object[key]) &&
          (scope === "all" || object[key] === scope)
        ) {
          if (object instanceof Textbox) object.removeStyle(key);
          object.set(
            key,
            gradient
              ? new Gradient({
                  type: "linear",
                  gradientUnits: "pixels",
                  coords: { x1: from.x, y1: from.y, x2: to.x, y2: to.y },
                  colorStops: [
                    { offset: 0, color: start + alpha(startOpacity) },
                    { offset: 1, color: end + alpha(endOpacity) },
                  ],
                })
              : color,
          );
        }
      object.dirty = true;
    }
    selected.dirty = true;
    editor.canvas.requestRenderAll();
    editor.commit();
    if (scope !== "all") setScope(gradient ? "all" : color);
  };
  return (
    <>
      <button
        className={
          compact ? "secondary full" : "toolbar-button graphic-color-button"
        }
        aria-label="Graphic colors and gradient"
        onClick={() => {
          setScope("all");
          const owner = objects.find(
            (o) => o.fill instanceof Gradient || o.stroke instanceof Gradient,
          );
          const paint =
            owner?.fill instanceof Gradient ? owner.fill : owner?.stroke;
          if (paint instanceof Gradient && paint.type === "linear") {
            const first = new Color(paint.colorStops[0].color),
              last = new Color(paint.colorStops.at(-1)!.color);
            setStart("#" + first.toHex());
            setEnd("#" + last.toHex());
            setStartOpacity(Math.round(first.getAlpha() * 100));
            setEndOpacity(Math.round(last.getAlpha() * 100));
            const c = paint.coords,
              matrix = owner!.calcTransformMatrix();
            const from = new Point(
              Number(c.x1) - owner!.width / 2,
              Number(c.y1) - owner!.height / 2,
            ).transform(matrix);
            const to = new Point(
              Number(c.x2) - owner!.width / 2,
              Number(c.y2) - owner!.height / 2,
            ).transform(matrix);
            const bounds = selected.getBoundingRect();
            setAngle(
              Math.round(
                ((Math.atan2(
                  (to.y - from.y) / bounds.height,
                  (to.x - from.x) / bounds.width,
                ) *
                  180) /
                  Math.PI +
                  360) %
                  360,
              ),
            );
            setMode("gradient");
          } else {
            setMode("solid");
            if (palette[0]?.startsWith("#")) setStart(palette[0].slice(0, 7));
          }
          setOpen(true);
        }}
      >
        <Palette size={16} />
        <span>Colors & gradient</span>
      </button>
      {open && (
        <Modal title="Graphic colors" onClose={() => setOpen(false)}>
          <p className="modal-description">
            Color the whole graphic or replace one color. Every shape stays
            editable.
          </p>
          <label className="field">
            <span>Apply to</span>
            <select
              aria-label="Graphic color scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="all">All graphic colors</option>
              {palette.map((color) => (
                <option key={color} value={color}>
                  {color.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <div
            className="color-mode"
            role="tablist"
            aria-label="Graphic fill type"
          >
            {["solid", "gradient"].map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value)}
              >
                {value === "solid" ? "Solid color" : "Gradient"}
              </button>
            ))}
          </div>
          {mode === "solid" ? (
            <>
              <label className="field">
                <span>Graphic color</span>
                <input
                  type="color"
                  aria-label="Graphic fill color"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    apply(false, e.target.value);
                  }}
                />
              </label>
              <div className="text-color-swatches">
                {colors.map((color) => (
                  <button
                    key={color}
                    aria-label={`Graphic color ${color}`}
                    style={{ background: color }}
                    onClick={() => {
                      setStart(color);
                      apply(false, color);
                    }}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <div
                className="gradient-preview"
                style={{
                  background: `linear-gradient(${angle + 90}deg,${start}${alpha(startOpacity)},${end}${alpha(endOpacity)}), repeating-conic-gradient(#e4e0eb 0% 25%,#fff 0% 50%) 0 0/16px 16px`,
                }}
              />
              <div className="field-grid">
                <label className="field">
                  <span>Start color</span>
                  <input
                    type="color"
                    aria-label="Graphic gradient start"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>End color</span>
                  <input
                    type="color"
                    aria-label="Graphic gradient end"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
              </div>
              <div className="field-grid">
                <label className="field">
                  <span>Start opacity · {startOpacity}%</span>
                  <input
                    aria-label="Gradient start opacity"
                    type="range"
                    min={0}
                    max={100}
                    value={startOpacity}
                    onChange={(e) => setStartOpacity(+e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>End opacity · {endOpacity}%</span>
                  <input
                    aria-label="Gradient end opacity"
                    type="range"
                    min={0}
                    max={100}
                    value={endOpacity}
                    onChange={(e) => setEndOpacity(+e.target.value)}
                  />
                </label>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  setEnd(start);
                  setStartOpacity(100);
                  setEndOpacity(0);
                }}
              >
                Fade to transparent
              </button>
              <label className="field">
                <span>Direction · {angle}°</span>
                <input
                  type="range"
                  aria-label="Graphic gradient direction"
                  min={0}
                  max={360}
                  value={angle}
                  onChange={(e) => setAngle(+e.target.value)}
                />
              </label>
              <button className="primary full" onClick={() => apply(true)}>
                Apply graphic gradient
              </button>
            </>
          )}
          <button className="secondary full" onClick={() => setOpen(false)}>
            Done
          </button>
        </Modal>
      )}
    </>
  );
}
