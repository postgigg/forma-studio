import { useState } from "react";
import {
  Eraser,
  Highlighter,
  MousePointer2,
  Paintbrush,
  Pencil,
  PenTool,
} from "lucide-react";
import { Editor } from "./editor";
import { colors } from "./types";
import { drawingTools, type DrawingTool } from "./drawing";
import {Color} from 'fabric';
import "./drawing.css";
const icons = {
  pencil: Pencil,
  marker: PenTool,
  paintbrush: Paintbrush,
  highlighter: Highlighter,
  eraser: Eraser,
};
export function DrawingPanel({
  editor,
  brand,
}: {
  editor: Editor;
  brand: string[];
}) {
  const [tool, setTool] = useState<DrawingTool>(()=>editor.drawingTool);
  const [ink, setInk] = useState(()=>editor.drawing?'#'+new Color(editor.canvas.freeDrawingBrush?.color||'#764bdd').toHex():'#764bdd');
  const [settings, setSettings] = useState<
    Record<string, { size: number; opacity: number }>
  >(() =>
    Object.fromEntries(
      drawingTools.map((t) => [t.id, { size: editor.drawing&&t.id===editor.drawingTool?editor.canvas.freeDrawingBrush?.width||t.size:t.size, opacity: t.opacity }]),
    ),
  );
  const current = settings[tool],
    definition = drawingTools.find((t) => t.id === tool)!;
  const activate = (
    nextTool = tool,
    color = ink,
    size = current.size,
    opacity = current.opacity,
  ) => editor.draw(true, color, size, nextTool, opacity);
  const change = (key: "size" | "opacity", value: number) => {
    setSettings({ ...settings, [tool]: { ...current, [key]: value } });
    if (editor.drawing)
      activate(
        tool,
        ink,
        key === "size" ? value : current.size,
        key === "opacity" ? value : current.opacity,
      );
  };
  const chooseColor = (color: string) => {
    setInk(color);
    if (editor.drawing) activate(tool, color);
  };
  return (
    <div className="drawing-panel">
      <div className="drawing-tools" role="group" aria-label="Drawing tools">
        {drawingTools.map((t) => {
          const Icon = icons[t.id];
          return (
            <button
              key={t.id}
              aria-label={t.name}
              aria-pressed={tool === t.id}
              onClick={() => {
                setTool(t.id);
                const s = settings[t.id];
                activate(t.id, ink, s.size, s.opacity);
              }}
            >
              <Icon size={25} strokeWidth={1.6} />
              <span>{t.name}</span>
            </button>
          );
        })}
      </div>
      <div className="drawing-sample" aria-hidden="true">
        <svg viewBox="0 0 260 105">
          <path
            d="M25 72 C55 12 87 12 118 55 S180 100 230 28"
            fill="none"
            stroke={tool === "eraser" ? "#beb4c9" : ink}
            strokeWidth={Math.min(38, current.size)}
            strokeLinecap={
              tool === "marker" || tool === "highlighter" ? "butt" : "round"
            }
            opacity={tool === "eraser" ? 0.3 : current.opacity / 100}
          />
        </svg>
        <span>{definition.name}</span>
      </div>
      {tool !== "eraser" && (
        <>
          <label className="drawing-color">
            <span>Ink color</span>
            <input
              type="color"
              aria-label="Drawing ink color"
              value={ink}
              onChange={(e) => chooseColor(e.target.value)}
            />
            <code>{ink.toUpperCase()}</code>
          </label>
          <div
            className="drawing-swatches"
            role="group"
            aria-label="Drawing colors"
          >
            {[...new Set([...brand, ...colors])].map((color) => (
              <button
                key={color}
                aria-label={`Ink ${color}`}
                aria-pressed={ink.toLowerCase() === color.toLowerCase()}
                style={{ background: color }}
                onClick={() => chooseColor(color)}
              />
            ))}
          </div>
        </>
      )}
      <label className="drawing-range">
        <span>
          {tool === "eraser" ? "Eraser size" : "Brush size"}
          <output>{current.size} px</output>
        </span>
        <input
          type="range"
          aria-label={tool === "eraser" ? "Eraser size" : "Drawing brush size"}
          min={1}
          max={80}
          value={current.size}
          onChange={(e) => change("size", +e.target.value)}
        />
      </label>
      {tool !== "eraser" && (
        <label className="drawing-range">
          <span>
            Opacity<output>{current.opacity}%</output>
          </span>
          <input
            type="range"
            aria-label="Drawing opacity"
            min={10}
            max={100}
            value={current.opacity}
            onChange={(e) => change("opacity", +e.target.value)}
          />
        </label>
      )}
      <button
        className={editor.drawing ? "secondary full" : "primary full"}
        onClick={() => (editor.drawing ? editor.draw(false) : activate())}
      >
        {editor.drawing ? <MousePointer2 size={17} /> : <Pencil size={17} />}
        {editor.drawing
          ? "Back to selecting"
          : tool === "eraser"
            ? "Start erasing"
            : "Start drawing"}
      </button>
      <p className="muted small">
        {tool === "eraser"
          ? "Drag across drawing strokes to remove them. Each drag is one Undo step."
          : "Each stroke is an editable layer. Choose a tool to draw; press Escape to select."}
      </p>
    </div>
  );
}
