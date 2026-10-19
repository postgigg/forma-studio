import { Path, Control, Point, classRegistry, util } from "fabric";
import {
  roundedPath,
  validateConnector,
  type ConnectorData,
  type BoardPoint,
} from "../shared/whiteboard.mjs";
const xml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
function middle(points: BoardPoint[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
  let left = total / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= length && length)
      return {
        x: a.x + ((b.x - a.x) * left) / length,
        y: a.y + ((b.y - a.y) * left) / length,
      };
    left -= length;
  }
  return points[0];
}
export class BoardConnector extends Path {
  static type = "BoardConnector";
  connector: ConnectorData;
  routePoints: BoardPoint[];
  blocked = false;
  onEndpoint?: (end: "start" | "end", point: BoardPoint) => void;
  onBend?: (point: BoardPoint) => void;
  constructor(data: ConnectorData, options: Record<string, any> = {}) {
    const value = structuredClone(validateConnector(data));
    const points =
      Array.isArray(options.routePoints) &&
      options.routePoints.length >= 2 &&
      options.routePoints.length <= 400 &&
      options.routePoints.every(
        (p: BoardPoint) => Number.isFinite(p.x) && Number.isFinite(p.y),
      )
        ? options.routePoints
        : [value.start, value.end];
    super(
      roundedPath(
        points,
        value.style === "curve" ? 48 : value.style === "straight" ? 0 : 12,
      ),
      {
        ...options,
        fill: null,
        stroke: value.color,
        strokeWidth: value.width,
        strokeUniform: true,
        strokeLineCap: "round",
        strokeLineJoin: "round",
        objectCaching: false,
        lockMovementX: true,
        lockMovementY: true,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        perPixelTargetFind: true,
        padding: 12,
      },
    );
    this.connector = value;
    this.routePoints = points;
    this.blocked = Boolean(options.blocked);
    this.applyStyle();
    this.controls = Object.fromEntries(
      ["start", "bend", "end"].map((key) => [
        key,
        new Control({
          cursorStyle: key === "bend" ? "move" : "crosshair",
          sizeX: 12,
          sizeY: 12,
          touchSizeX: 26,
          touchSizeY: 26,
          actionName: "connector",
          positionHandler: () => {
            const p =
              key === "bend"
                ? this.connector.bend || middle(this.routePoints)
                : this.routePoints[
                    key === "start" ? 0 : this.routePoints.length - 1
                  ];
            // Connector points are in scene coordinates. Fabric's standard
            // control matrix cancels viewport scale for fixed-size handles;
            // applying that matrix to a scene distance misplaces them at zoom.
            return new Point(p.x, p.y).transform(this.getViewportTransform());
          },
          actionHandler: (_event, _transform, x, y) => {
            if (key === "bend") {
              this.connector.bend = { x, y };
              this.onBend?.({ x, y });
            } else this.onEndpoint?.(key as "start" | "end", { x, y });
            this.canvas?.requestRenderAll();
            return true;
          },
        }),
      ]),
    );
  }
  static async fromObject<T>(object: any, options: any = {}) {
    const { connector, type, ...props } = object;
    return new BoardConnector(
      connector,
      await util.enlivenObjectEnlivables(props, options),
    );
  }
  toObject(properties: any[] = []): any {
    return {
      ...super.toObject(properties),
      connector: structuredClone(this.connector),
      routePoints: structuredClone(this.routePoints),
      blocked: this.blocked,
    };
  }
  applyStyle() {
    const d = this.connector;
    this.set({
      stroke: this.blocked ? "#bd611c" : d.color,
      strokeWidth: d.width,
      strokeDashArray:
        d.pattern === "dashed"
          ? [d.width * 4, d.width * 2.5]
          : d.pattern === "dotted"
            ? [0.1, d.width * 2.5]
            : null,
    });
    this.dirty = true;
  }
  setRoute(points: BoardPoint[], blocked = false) {
    this.routePoints = points;
    this.blocked = blocked;
    this.set({ scaleX: 1, scaleY: 1, angle: 0, flipX: false, flipY: false });
    this._setPath(
      roundedPath(
        points,
        this.connector.style === "curve"
          ? 48
          : this.connector.style === "straight"
            ? 0
            : 12,
      ),
      true,
    );
    if (this.group)
      util.sendObjectToPlane(this, undefined, this.group.calcTransformMatrix());
    this.applyStyle();
    this.setCoords();
  }
  private heads() {
    const p = this.routePoints,
      d = this.connector;
    return [
      { kind: d.startHead, tip: p[0], from: p[1] },
      { kind: d.endHead, tip: p.at(-1)!, from: p.at(-2)! },
    ]
      .filter((h) => h.kind !== "none")
      .map((h) => {
        const angle = Math.atan2(h.tip.y - h.from.y, h.tip.x - h.from.x),
          size = 10 + d.width * 2;
        return {
          ...h,
          points: [
            h.tip,
            {
              x: h.tip.x - Math.cos(angle - 0.45) * size,
              y: h.tip.y - Math.sin(angle - 0.45) * size,
            },
            {
              x: h.tip.x - Math.cos(angle + 0.45) * size,
              y: h.tip.y - Math.sin(angle + 0.45) * size,
            },
          ],
        };
      });
  }
  _render(ctx: CanvasRenderingContext2D) {
    super._render(ctx);
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = this.blocked ? "#bd611c" : this.connector.color;
    for (const h of this.heads()) {
      ctx.beginPath();
      if (h.kind === "dot")
        ctx.arc(
          h.tip.x - this.pathOffset.x,
          h.tip.y - this.pathOffset.y,
          5 + this.connector.width,
          0,
          Math.PI * 2,
        );
      else
        h.points.forEach((p, i) =>
          i
            ? ctx.lineTo(p.x - this.pathOffset.x, p.y - this.pathOffset.y)
            : ctx.moveTo(p.x - this.pathOffset.x, p.y - this.pathOffset.y),
        );
      ctx.closePath();
      ctx.fill();
    }
    if (this.connector.label) {
      const p = middle(this.routePoints),
        label = this.connector.label;
      ctx.font = '500 22px "DM Sans"';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const width = ctx.measureText(label).width;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(
        p.x - this.pathOffset.x - width / 2 - 9,
        p.y - this.pathOffset.y - 16,
        width + 18,
        32,
      );
      ctx.fillStyle = this.connector.color;
      ctx.fillText(label, p.x - this.pathOffset.x, p.y - this.pathOffset.y);
    }
    ctx.restore();
  }
  _toSVG() {
    const parts = super._toSVG(),
      color = this.blocked ? "#bd611c" : this.connector.color;
    for (const h of this.heads()) {
      if (h.kind === "dot")
        parts.push(
          `<circle cx="${h.tip.x - this.pathOffset.x}" cy="${h.tip.y - this.pathOffset.y}" r="${5 + this.connector.width}" fill="${color}"/>`,
        );
      else
        parts.push(
          `<path d="M ${h.points.map((p) => `${p.x - this.pathOffset.x} ${p.y - this.pathOffset.y}`).join(" L ")} Z" fill="${color}" stroke="none"/>`,
        );
    }
    if (this.connector.label) {
      const p = middle(this.routePoints);
      parts.push(
        `<text x="${p.x - this.pathOffset.x}" y="${p.y - this.pathOffset.y}" text-anchor="middle" dominant-baseline="central" font-family="DM Sans" font-size="22" fill="${color}" stroke="white" stroke-width="6" paint-order="stroke">${xml(this.connector.label)}</text>`,
      );
    }
    return parts;
  }
}
classRegistry.setClass(BoardConnector);
