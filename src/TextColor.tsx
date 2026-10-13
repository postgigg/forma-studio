import { useState } from "react";
import { Color, Gradient, Textbox } from "fabric";
import { Palette } from "lucide-react";
import type { Editor } from "./editor";
import { colors } from "./types";
import { Modal } from "./ui";
export function TextColor({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState<"solid" | "gradient">("solid"),
    [start, setStart] = useState("#754adb"),
    [end, setEnd] = useState("#f0b8a4"),
    [angle, setAngle] = useState(0);
  const [startOpacity, setStartOpacity] = useState(100),
    [endOpacity, setEndOpacity] = useState(100);
  const alpha = (n: number) =>
    Math.round(n * 2.55)
      .toString(16)
      .padStart(2, "0");
  const object = editor.selected;
  if (!(object instanceof Textbox)) return null;
  const paint = editor.textStyle("fill");
  const openColors = () => {
    if (paint instanceof Gradient && paint.type === "linear") {
      const first = new Color(paint.colorStops[0].color),
        last = new Color(paint.colorStops.at(-1)!.color);
      setStart("#" + first.toHex());
      setEnd("#" + last.toHex());
      setStartOpacity(Math.round(first.getAlpha() * 100));
      setEndOpacity(Math.round(last.getAlpha() * 100));
      const { x1, y1, x2, y2 } = paint.coords;
      setAngle(
        Math.round(
          ((Math.atan2(Number(y2) - Number(y1), Number(x2) - Number(x1)) *
            180) /
            Math.PI +
            360) %
            360,
        ),
      );
      setMode("gradient");
    } else setMode("solid");
    setOpen(true);
  };
  const applyGradient = () => {
    const radians = (angle * Math.PI) / 180,
      dx = Math.cos(radians) / 2,
      dy = Math.sin(radians) / 2;
    editor.set({
      fill: new Gradient({
        type: "linear",
        gradientUnits: "percentage",
        coords: { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy },
        colorStops: [
          { offset: 0, color: start + alpha(startOpacity) },
          { offset: 1, color: end + alpha(endOpacity) },
        ],
      }),
    });
  };
  return (
    <>
      <button
        className="toolbar-button text-color-button"
        aria-label="Text color and gradient"
        onPointerDown={(e) => e.preventDefault()}
        onClick={openColors}
      >
        <Palette size={16} />
        <span>Color</span>
        <i
          style={{
            background:
              typeof paint === "string"
                ? paint
                : "linear-gradient(90deg,#754adb,#f0b8a4)",
          }}
        />
      </button>
      {open && (
        <Modal title="Text color" onClose={() => setOpen(false)}>
          <p className="modal-description">
            {editor.hasTextRange
              ? "Style your selected characters."
              : "Style the whole text box. Highlight words on the canvas to style only those words."}
          </p>
          <div
            className="color-mode"
            role="tablist"
            aria-label="Text fill type"
          >
            <button
              role="tab"
              aria-selected={mode === "solid"}
              onClick={() => setMode("solid")}
            >
              Solid color
            </button>
            <button
              role="tab"
              aria-selected={mode === "gradient"}
              onClick={() => setMode("gradient")}
            >
              Gradient
            </button>
          </div>
          {mode === "solid" ? (
            <>
              <label className="field">
                <span>Text color</span>
                <input
                  aria-label="Text fill color"
                  type="color"
                  value={
                    typeof paint === "string" && /^#[0-9a-f]{6}$/i.test(paint)
                      ? paint
                      : "#292432"
                  }
                  onChange={(e) => editor.set({ fill: e.target.value })}
                />
              </label>
              <div className="text-color-swatches">
                {colors.map((color) => (
                  <button
                    key={color}
                    aria-label={`Text color ${color}`}
                    style={{ background: color }}
                    onClick={() => editor.set({ fill: color })}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <div
                className="gradient-preview"
                style={{
                  background: `linear-gradient(${90 + angle}deg,${start}${alpha(startOpacity)},${end}${alpha(endOpacity)}), repeating-conic-gradient(#e4e0eb 0% 25%,#fff 0% 50%) 0 0/16px 16px`,
                }}
              >
                Aa
              </div>
              <div className="field-grid">
                <label className="field">
                  <span>Start color</span>
                  <input
                    aria-label="Gradient start color"
                    type="color"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>End color</span>
                  <input
                    aria-label="Gradient end color"
                    type="color"
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
                  aria-label="Gradient direction"
                  type="range"
                  min={0}
                  max={360}
                  value={angle}
                  onChange={(e) => setAngle(+e.target.value)}
                />
              </label>
              <button className="primary full" onClick={applyGradient}>
                Apply text gradient
              </button>
            </>
          )}
          <div className="field-grid">
            <label className="field">
              <span>Border color</span>
              <input
                aria-label="Text border color"
                type="color"
                value={
                  typeof editor.textStyle("stroke") === "string" &&
                  /^#[0-9a-f]{6}$/i.test(String(editor.textStyle("stroke")))
                    ? String(editor.textStyle("stroke"))
                    : "#292432"
                }
                onChange={(e) =>
                  editor.set({
                    stroke: e.target.value,
                    strokeWidth: Math.max(
                      1,
                      Number(editor.textStyle("strokeWidth")) || 0,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Border width</span>
              <input
                aria-label="Text border width"
                type="number"
                min={0}
                max={60}
                value={Number(editor.textStyle("strokeWidth")) || 0}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 0 && n <= 60)
                    editor.set({ strokeWidth: n });
                }}
              />
            </label>
          </div>
          <button className="secondary full" onClick={() => setOpen(false)}>
            Done
          </button>
        </Modal>
      )}
    </>
  );
}
