import {
  BaseBrush,
  Color,
  PencilBrush,
  Point,
  Shadow,
  type Canvas,
  type FabricObject,
} from "fabric";

export type DrawingTool =
  "pencil" | "marker" | "paintbrush" | "highlighter" | "eraser";
export const drawingTools = [
  { id: "pencil", name: "Pencil", size: 3, opacity: 100 },
  { id: "marker", name: "Marker", size: 14, opacity: 100 },
  { id: "paintbrush", name: "Paintbrush", size: 26, opacity: 85 },
  { id: "highlighter", name: "Highlighter", size: 34, opacity: 35 },
  { id: "eraser", name: "Stroke eraser", size: 24, opacity: 100 },
] as const;

type InkObject = FabricObject & { inkTool?: DrawingTool; name?: string };
// Erase only freehand ink. Sampling along the drag catches fast pointer moves;
// pixel tests avoid deleting a curved stroke just because its box was touched.
class StrokeEraser extends BaseBrush {
  private last?: Point;
  private changed = false;
  constructor(
    canvas: Canvas,
    private commit: () => void,
  ) {
    super(canvas);
  }
  _render() {}
  private erase(point: Point) {
    const canvas = this.canvas,
      originalTolerance = canvas.targetFindTolerance;
    canvas.setTargetFindTolerance(
      Math.max(1, (this.width * canvas.getZoom()) / 2),
    );
    try {
      const viewport = point.transform(canvas.viewportTransform);
      for (const object of canvas.getObjects() as InkObject[]) {
        if (
          object.type.toLowerCase() !== "path" ||
          (!object.inkTool && !/^Drawing\b/.test(object.name || "")) ||
          !object.visible ||
          object.lockMovementX
        )
          continue;
        const box = object.getBoundingRect(),
          radius = this.width / 2;
        if (
          point.x < box.left - radius ||
          point.x > box.left + box.width + radius ||
          point.y < box.top - radius ||
          point.y > box.top + box.height + radius
        )
          continue;
        if (!canvas.isTargetTransparent(object, viewport.x, viewport.y)) {
          canvas.remove(object);
          this.changed = true;
        }
      }
    } finally {
      canvas.setTargetFindTolerance(originalTolerance);
    }
    canvas.requestRenderAll();
  }
  onMouseDown(point: Point) {
    this.changed = false;
    this.last = point;
    this.erase(point);
  }
  onMouseMove(point: Point) {
    const from = this.last || point,
      count = Math.max(
        1,
        Math.ceil(from.distanceFrom(point) / Math.max(2, this.width / 3)),
      );
    for (let i = 1; i <= count; i++) this.erase(from.lerp(point, i / count));
    this.last = point;
  }
  onMouseUp() {
    this.last = undefined;
    if (this.changed) this.commit();
    this.changed = false;
    return false;
  }
}
export function drawingBrush(
  canvas: Canvas,
  tool: DrawingTool,
  color: string,
  size: number,
  opacity: number,
  commit: () => void,
) {
  if (tool === "eraser") {
    const brush = new StrokeEraser(canvas, commit);
    brush.width = size;
    return brush;
  }
  const brush = new PencilBrush(canvas);
  const ink = new Color(color);
  ink.setAlpha(Math.min(1, Math.max(0.1, opacity / 100)));
  brush.color = ink.toRgba();
  brush.width = size;
  brush.strokeLineCap =
    tool === "marker" || tool === "highlighter" ? "butt" : "round";
  brush.strokeLineJoin = tool === "marker" ? "bevel" : "round";
  if (tool === "paintbrush")
    brush.shadow = new Shadow({
      color: ink.toRgba(),
      blur: size * 0.14,
      affectStroke: true,
    });
  return brush;
}
