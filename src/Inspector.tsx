import { useEffect, useState } from "react";
import { ActiveSelection, FabricImage, Group, Textbox, Rect } from "fabric";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Layers,
  LockKeyhole,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  UnlockKeyhole,
} from "lucide-react";
import { Editor } from "./editor";
import { colors } from "./types";
import { useFontLibrary, fontLabel } from "./font-library";
import { Field, IconButton } from "./ui";
import { GraphicColor } from "./GraphicColor";
import { DeviceFrame } from "./device-frame";
import { SolidObject } from "./solid-object";
import { PhotoFrame } from "./photo-frame";
import { isChart } from "./charts";

export function Inspector({
  editor,
  run,
  collapsed,
  propertiesRequest = 0,
  onRebuild,
  onErase,
  onPencil,
  onFrame,
  onChart,
  onPhotoFrame,
  onSolid,
}: {
  editor: Editor;
  run: (fn: () => unknown) => void;
  collapsed: boolean;
  propertiesRequest?: number;
  onRebuild: () => void;
  onErase: () => void;
  onPencil: () => void;
  onFrame: () => void;
  onChart: () => void;
  onPhotoFrame: () => void;
  onSolid: () => void;
}) {
  const [tab, setTab] = useState("properties");
  useEffect(() => { if (propertiesRequest) setTab('properties'); }, [propertiesRequest]);
  const { families: fonts } = useFontLibrary();
  const obj = editor.selected;
  const appearance = obj instanceof ActiveSelection ? obj.getObjects()[0] : obj;
  const paint =
    appearance instanceof Group ? appearance.getObjects()[0] : appearance;
  const paintColor =
    typeof paint?.fill === "string" && paint.fill ? paint.fill : paint?.stroke;
  const text = obj instanceof Textbox ? obj : null;
  const image = obj instanceof FabricImage ? obj : null;
  const number = (
    label: string,
    value: number,
    key: string,
    min?: number,
    max?: number,
  ) => (
    <Field label={label}>
      <input
        type="number"
        aria-label={label}
        value={Math.round(value * 100) / 100}
        min={min}
        max={max}
        onChange={(e) => {
          if (e.target.value === "") return;
          const v = +e.target.value;
          if (
            Number.isFinite(v) &&
            (min === undefined || v >= min) &&
            (max === undefined || v <= max)
          )
            editor.set({ [key]: v });
        }}
      />
    </Field>
  );
  return (
    <aside
      className="inspector"
      id="design-inspector"
      aria-label="Design properties"
      hidden={collapsed}
    >
      <div className="inspector-tabs">
        <button
          className={tab === "properties" ? "selected" : ""}
          onClick={() => setTab("properties")}
        >
          <SlidersHorizontal size={15} /> Properties
        </button>
        <button
          className={tab === "layers" ? "selected" : ""}
          onClick={() => setTab("layers")}
        >
          <Layers size={15} /> Layers <span>{editor.objects.length}</span>
        </button>
      </div>
      {tab === "layers" ? (
        <div className="layers-panel">
          <p className="muted small">
            Front to back. Shift or Ctrl-click to select several.
          </p>
          <div className="layer-list">
            {[...editor.objects].reverse().map((layer, i) => (
              <div
                className={`layer-row ${editor.canvas.getActiveObjects().includes(layer) ? "selected" : ""}`}
                key={layer.id || i}
              >
                <button
                  className="layer-select"
                  aria-pressed={editor.canvas
                    .getActiveObjects()
                    .includes(layer)}
                  onClick={(e) =>
                    editor.select(layer, e.shiftKey || e.ctrlKey || e.metaKey)
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!editor.canvas.getActiveObjects().includes(layer))
                      editor.select(layer);
                    editor.onContextMenu?.({ x: e.clientX, y: e.clientY });
                  }}
                >
                  <span
                    className="layer-icon"
                    style={{
                      background:
                        typeof layer.fill === "string" ? layer.fill : "#ece8f5",
                    }}
                  >
                    {layer instanceof Textbox
                      ? "T"
                      : layer instanceof FabricImage
                        ? "▧"
                        : layer instanceof Group
                          ? "▦"
                          : "◇"}
                  </span>
                  <span>{layer.name || layer.type}</span>
                </button>
                <IconButton
                  icon={layer.lockMovementX ? LockKeyhole : UnlockKeyhole}
                  label={`${layer.lockMovementX ? "Unlock" : "Lock"} ${layer.name}`}
                  onClick={() => editor.lock(layer)}
                />
                <IconButton
                  icon={layer.visible ? Eye : EyeOff}
                  label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
                  onClick={() => editor.visibility(layer)}
                />
              </div>
            ))}
          </div>
          {!editor.objects.length && (
            <div className="empty">
              <Layers />
              <h3>A fresh canvas</h3>
              <p>Add text, shapes, or an image to begin.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="property-scroll">
          {!obj ? (
            <>
              <div className="property-section">
                <span className="eyebrow">YOUR CANVAS</span>
                <div className="page-dimension">
                  {editor.doc?.width} <span>×</span> {editor.doc?.height}{" "}
                  <small>px</small>
                </div>
              </div>
              <div className="property-section">
                <h4>Page background</h4>
                <div className="color-input">
                  <input
                    type="color"
                    aria-label="Page background"
                    value={
                      typeof editor.canvas.backgroundColor === "string" &&
                      editor.canvas.backgroundColor
                        ? editor.canvas.backgroundColor
                        : "#ffffff"
                    }
                    onChange={(e) => editor.background(e.target.value)}
                  />
                  <span>
                    {String(editor.canvas.backgroundColor).toUpperCase()}
                  </span>
                </div>
                <div className="swatches">
                  {colors.map((c) => (
                    <button
                      aria-label={`Background ${c}`}
                      title={c}
                      key={c}
                      style={{ background: c }}
                      onClick={() => editor.background(c)}
                    />
                  ))}
                </div>
              </div>
              <div className="property-section">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={editor.snap}
                    onChange={(e) => {
                      editor.snap = e.target.checked;
                      editor.notify();
                    }}
                  />{" "}
                  Snap to elements & spacing
                </label>
              </div>
            </>
          ) : (
            <>
              <div className="property-section selection-title">
                <span className="eyebrow">
                  {text
                    ? "TEXT"
                    : image
                      ? "IMAGE"
                      : obj instanceof Group
                        ? "GROUP"
                        : "ELEMENT"}
                </span>
                <input
                  className="object-name"
                  aria-label="Layer name"
                  value={
                    obj instanceof ActiveSelection
                      ? `${obj.getObjects().length} elements selected`
                      : obj.name || obj.type
                  }
                  readOnly={obj instanceof ActiveSelection}
                  onChange={(e) => editor.set({ name: e.target.value })}
                />
                <div className="mini-actions">
                  <IconButton
                    icon={Copy}
                    label="Duplicate element"
                    onClick={() => run(() => editor.duplicate())}
                  />
                  <IconButton
                    icon={obj.lockMovementX ? LockKeyhole : UnlockKeyhole}
                    label={
                      obj.lockMovementX ? "Unlock element" : "Lock element"
                    }
                    onClick={() => editor.lock()}
                  />
                  <IconButton
                    icon={FlipHorizontal2}
                    label="Flip horizontally"
                    onClick={() => editor.set({ flipX: !obj.flipX })}
                  />
                  <IconButton
                    icon={FlipVertical2}
                    label="Flip vertically"
                    onClick={() => editor.set({ flipY: !obj.flipY })}
                  />
                  <IconButton
                    icon={Trash2}
                    label="Delete element"
                    onClick={() => editor.remove()}
                  />
                </div>
              </div>
              {text && (
                <div className="property-section">
                  <h4>Typography</h4>
                  <Field label="Text content">
                    <textarea
                      aria-label="Text content"
                      value={text.text}
                      rows={3}
                      onChange={(e) => editor.set({ text: e.target.value })}
                    />
                  </Field>
                  <Field label="Font family">
                    <select
                      aria-label="Font family"
                      value={text.fontFamily}
                      onChange={(e) =>
                        editor.set({ fontFamily: e.target.value })
                      }
                    >
                      {fonts.map((f) => (
                        <option value={f} key={f}>{fontLabel(f)}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="field-grid">
                    {number("Font size", text.fontSize, "fontSize", 6, 1000)}
                    {number(
                      "Line height",
                      text.lineHeight,
                      "lineHeight",
                      0.5,
                      4,
                    )}
                  </div>
                  <div className="text-style-buttons">
                    <button
                      className={text.fontWeight === "bold" ? "active" : ""}
                      aria-label="Bold"
                      onClick={() =>
                        editor.set({
                          fontWeight:
                            text.fontWeight === "bold" ? "normal" : "bold",
                        })
                      }
                    >
                      <b>B</b>
                    </button>
                    <button
                      className={text.fontStyle === "italic" ? "active" : ""}
                      aria-label="Italic"
                      onClick={() =>
                        editor.set({
                          fontStyle:
                            text.fontStyle === "italic" ? "normal" : "italic",
                        })
                      }
                    >
                      <i>I</i>
                    </button>
                    <button
                      className={text.underline ? "active" : ""}
                      aria-label="Underline"
                      onClick={() => editor.set({ underline: !text.underline })}
                    >
                      <u>U</u>
                    </button>
                    <IconButton
                      icon={AlignLeft}
                      label="Align text left"
                      active={text.textAlign === "left"}
                      onClick={() => editor.set({ textAlign: "left" })}
                    />
                    <IconButton
                      icon={AlignCenter}
                      label="Align text center"
                      active={text.textAlign === "center"}
                      onClick={() => editor.set({ textAlign: "center" })}
                    />
                    <IconButton
                      icon={AlignRight}
                      label="Align text right"
                      active={text.textAlign === "right"}
                      onClick={() => editor.set({ textAlign: "right" })}
                    />
                  </div>
                  {number(
                    "Letter spacing",
                    text.charSpacing,
                    "charSpacing",
                    -200,
                    1500,
                  )}
                </div>
              )}
              {obj instanceof SolidObject && <div className="property-section"><h4>3D object</h4><button className="secondary full" disabled={obj.lockMovementX} onClick={onSolid}>Edit lettering, material & rotation</button></div>}
              {obj instanceof DeviceFrame && (
                <div className="property-section">
                  <h4>Device frame</h4>
                  <button
                    className="secondary full"
                    onClick={onFrame}
                    disabled={obj.lockMovementX}
                  >
                    Edit screen, perspective & motion
                  </button>
                </div>
              )}
              {isChart(obj) && (
                <div className="property-section">
                  <h4>Chart data</h4>
                  <button
                    className="secondary full"
                    onClick={onChart}
                    disabled={obj.lockMovementX}
                  >
                    Edit chart data & style
                  </button>
                </div>
              )}
              {obj instanceof PhotoFrame && (
                <div className="property-section">
                  <h4>Photo frame</h4>
                  <button
                    className="secondary full"
                    onClick={onPhotoFrame}
                    disabled={obj.lockMovementX}
                  >
                    Edit shape & crop photo
                  </button>
                </div>
              )}
              {!image &&
                !(obj instanceof DeviceFrame) &&
                !(obj instanceof SolidObject) &&
                !(obj instanceof PhotoFrame) &&
                !isChart(obj) && (
                  <div className="property-section">
                    <h4>{text ? "Text color" : "Fill color"}</h4>
                    {!text && <GraphicColor editor={editor} compact />}
                    <div className="color-input">
                      <input
                        type="color"
                        aria-label="Fill color"
                        value={
                          typeof paintColor === "string" &&
                          /^#[0-9a-f]{6}$/i.test(paintColor)
                            ? paintColor
                            : "#292432"
                        }
                        onChange={(e) => editor.set({ fill: e.target.value })}
                      />
                      <span>
                        {typeof paintColor === "string"
                          ? paintColor.toUpperCase()
                          : "MULTIPLE"}
                      </span>
                    </div>
                    <div className="swatches">
                      {colors.map((c) => (
                        <button
                          key={c}
                          title={c}
                          aria-label={`Fill ${c}`}
                          style={{ background: c }}
                          onClick={() => editor.set({ fill: c })}
                        />
                      ))}
                    </div>
                    <div className="field-grid">
                      <Field label="Border color">
                        <input
                          type="color"
                          aria-label="Border color"
                          value={
                            typeof obj.stroke === "string"
                              ? obj.stroke
                              : "#292432"
                          }
                          onChange={(e) =>
                            editor.set({
                              stroke: e.target.value,
                              strokeWidth: Math.max(1, obj.strokeWidth),
                            })
                          }
                        />
                      </Field>
                      {number(
                        "Border width",
                        obj.strokeWidth,
                        "strokeWidth",
                        0,
                        60,
                      )}
                    </div>
                  </div>
                )}
              {image && (
                <div className="property-section">
                  <h4>Edit image</h4>
                  <button
                    className="secondary full"
                    onClick={onPencil}
                    disabled={image.lockMovementX}
                  >
                    AI Pencil · edit a marked area
                  </button>
                  <button
                    className="secondary full"
                    onClick={onErase}
                    disabled={image.lockMovementX}
                  >
                    Magic Eraser
                  </button>
                  <button
                    className="primary full rebuild-image"
                    onClick={onRebuild}
                  >
                    Design with this image
                  </button>
                  <div className="filter-grid">
                    {["original", "mono", "warm", "vivid"].map((f) => (
                      <button key={f} onClick={() => editor.imageFilter(f)}>
                        {f}
                      </button>
                    ))}
                  </div>
                  <Field label="Brightness">
                    <input
                      type="range"
                      aria-label="Brightness"
                      min={-0.5}
                      max={0.5}
                      step={0.05}
                      defaultValue={0}
                      key={obj.id}
                      onChange={(e) => editor.brightness(+e.target.value)}
                    />
                  </Field>
                  <div className="stack-actions">
                    <button
                      className="secondary"
                      onClick={() => editor.crop(true)}
                    >
                      Crop to square
                    </button>
                    <button
                      className="text-button"
                      onClick={() => editor.crop(false)}
                    >
                      Reset crop
                    </button>
                  </div>
                </div>
              )}
              <div className="property-section">
                <h4>Position & size</h4>
                <div className="field-grid">
                  {number("X position", obj.left, "left")}
                  {number("Y position", obj.top, "top")}
                  <Field label="Width">
                    <input
                      type="number"
                      aria-label="Element width"
                      min={1}
                      value={Math.round(obj.getScaledWidth())}
                      onChange={(e) => {
                        if (+e.target.value > 0)
                          editor.set({
                            scaleX:
                              obj.scaleX *
                              (+e.target.value / obj.getScaledWidth()),
                          });
                      }}
                    />
                  </Field>
                  <Field label="Height">
                    <input
                      type="number"
                      aria-label="Element height"
                      min={1}
                      value={Math.round(obj.getScaledHeight())}
                      onChange={(e) => {
                        if (+e.target.value > 0)
                          editor.set({
                            scaleY:
                              obj.scaleY *
                              (+e.target.value / obj.getScaledHeight()),
                          });
                      }}
                    />
                  </Field>
                  {number("Rotation", obj.angle, "angle")}
                </div>
                <div className="align-buttons">
                  {["left", "center", "right", "top", "middle", "bottom"].map(
                    (a, i) => (
                      <button
                        key={a}
                        title={`Align to page ${a}`}
                        aria-label={`Align to page ${a}`}
                        onClick={() => editor.align(a)}
                      >
                        {["⊢", "↔", "⊣", "↥", "↕", "↧"][i]}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div className="property-section">
                <h4>Appearance</h4>
                {obj instanceof Rect && (
                  <div className="corner-controls">
                    <Field label="Corner roundness">
                      <div className="corner-inputs">
                        <input
                          aria-label="Corner roundness"
                          type="range"
                          min={0}
                          max={Math.floor(
                            Math.min(
                              obj.width * Math.abs(obj.scaleX),
                              obj.height * Math.abs(obj.scaleY),
                            ) / 2,
                          )}
                          value={Math.round(
                            Math.min(
                              obj.rx * Math.abs(obj.scaleX),
                              obj.ry * Math.abs(obj.scaleY),
                            ),
                          )}
                          onChange={(e) =>
                            editor.set({
                              rx: +e.target.value / Math.abs(obj.scaleX),
                              ry: +e.target.value / Math.abs(obj.scaleY),
                            })
                          }
                        />
                        <input
                          aria-label="Corner radius in pixels"
                          type="number"
                          min={0}
                          max={Math.floor(
                            Math.min(
                              obj.width * Math.abs(obj.scaleX),
                              obj.height * Math.abs(obj.scaleY),
                            ) / 2,
                          )}
                          value={Math.round(
                            Math.min(
                              obj.rx * Math.abs(obj.scaleX),
                              obj.ry * Math.abs(obj.scaleY),
                            ),
                          )}
                          onChange={(e) => {
                            if (e.target.value === "") return;
                            const radius = Math.max(
                              0,
                              Math.min(
                                +e.target.value,
                                Math.min(
                                  obj.width * Math.abs(obj.scaleX),
                                  obj.height * Math.abs(obj.scaleY),
                                ) / 2,
                              ),
                            );
                            editor.set({
                              rx: radius / Math.abs(obj.scaleX),
                              ry: radius / Math.abs(obj.scaleY),
                            });
                          }}
                        />
                      </div>
                    </Field>
                    <div className="corner-presets">
                      {[
                        ["Square", 0],
                        [
                          "Soft",
                          Math.min(
                            obj.width * Math.abs(obj.scaleX),
                            obj.height * Math.abs(obj.scaleY),
                          ) * 0.12,
                        ],
                        [
                          "Pill",
                          Math.min(
                            obj.width * Math.abs(obj.scaleX),
                            obj.height * Math.abs(obj.scaleY),
                          ) / 2,
                        ],
                      ].map(([label, radius]) => (
                        <button
                          key={String(label)}
                          onClick={() =>
                            editor.set({
                              rx: Number(radius) / Math.abs(obj.scaleX),
                              ry: Number(radius) / Math.abs(obj.scaleY),
                            })
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <Field
                  label={`Opacity · ${Math.round((appearance?.opacity ?? 1) * 100)}%`}
                >
                  <input
                    type="range"
                    aria-label="Opacity"
                    min={0}
                    max={1}
                    step={0.01}
                    value={appearance?.opacity ?? 1}
                    onChange={(e) => editor.set({ opacity: +e.target.value })}
                  />
                </Field>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={!!appearance?.shadow}
                    onChange={(e) => editor.shadow(e.target.checked)}
                  />{" "}
                  Drop shadow
                </label>
              </div>
              <div className="property-section">
                <h4>Arrange</h4>
                <div className="arrange-buttons">
                  <button onClick={() => editor.reorder("front")}>
                    <ArrowUpToLine size={16} /> To front
                  </button>
                  <button onClick={() => editor.reorder("back")}>
                    <ArrowDownToLine size={16} /> To back
                  </button>
                  <button onClick={() => editor.reorder("forward")}>
                    <ChevronUp size={16} /> Forward
                  </button>
                  <button onClick={() => editor.reorder("backward")}>
                    <ChevronDown size={16} /> Backward
                  </button>
                </div>
                {obj instanceof Group && (
                  <button
                    className="secondary full"
                    onClick={() => editor.group()}
                  >
                    {obj instanceof ActiveSelection
                      ? "Group selection"
                      : "Ungroup"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
