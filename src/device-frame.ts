import { FabricObject, classRegistry, util } from "fabric";
import deviceCatalog from "../shared/devices.json";
import { projectDevice } from "./device-projection";

export const devices = deviceCatalog;
export interface FrameSettings {
  device: string;
  src: string;
  url: string;
  title: string;
  capturedAt: string;
  finish: "silver" | "graphite" | "gold";
  tiltX: number;
  tiltY: number;
  motion: "none" | "orbit" | "rock" | "float";
}
export const defaultFrame = (device = "macbook"): FrameSettings => ({
  device,
  src: "",
  url: "",
  title: "",
  capturedAt: "",
  finish: "silver",
  tiltX: 0,
  tiltY: 0,
  motion: "none",
});
export function frameSettings(raw: Partial<FrameSettings>): FrameSettings {
  const result = { ...defaultFrame(), ...raw };
  if (!devices.some((d) => d.id === result.device))
    throw new Error("Unsupported device frame.");
  if (
    typeof result.src !== "string" ||
    result.src.length > 28_000_000 ||
    (result.src && !/^data:image\/(png|jpeg|webp);base64,/.test(result.src))
  )
    throw new Error("Frame screens must be embedded images.");
  for (const key of ["tiltX", "tiltY"] as const)
    if (!Number.isFinite(result[key]) || Math.abs(result[key]) > 45)
      throw new Error("Invalid frame perspective.");
  if (
    !["silver", "graphite", "gold"].includes(result.finish) ||
    !["none", "orbit", "rock", "float"].includes(result.motion)
  )
    throw new Error("Invalid frame appearance.");
  for (const key of ["url", "title", "capturedAt"] as const)
    if (typeof result[key] !== "string")
      throw new Error("Invalid frame details.");
  return result;
}
function rounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | CanvasGradient,
) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function surface(settings: FrameSettings, image?: HTMLImageElement) {
  const d = devices.find((d) => d.id === settings.device)!;
  const canvas = document.createElement("canvas");
  canvas.width = d.width;
  canvas.height = d.height;
  const ctx = canvas.getContext("2d")!,
    [sx, sy, sw, sh] = d.screen;
  const metal = ctx.createLinearGradient(0, 0, d.width, d.height);
  const finishes = {
    silver: ["#edf0f3", "#949ba4", "#e1e6eb"],
    graphite: ["#555b64", "#171c24", "#656c74"],
    gold: ["#f4e6cc", "#b5966a", "#eee0c2"],
  } as const;
  finishes[settings.finish].forEach((c, i) => metal.addColorStop(i / 2, c));
  if (d.kind === "laptop") {
    rounded(ctx, sx - 24, 6, sw + 48, sh + sy + 33, 30, metal);
    rounded(ctx, sx - 20, 10, sw + 40, sh + sy + 25, 27, "#13171e");
    ctx.fillStyle = "#303540";
    ctx.beginPath();
    ctx.arc(d.width / 2, sy / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    const bottom = sh + sy + 31;
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.moveTo(sx - 24, bottom);
    ctx.lineTo(sx + sw + 24, bottom);
    ctx.lineTo(d.width - 6, d.height - 30);
    ctx.quadraticCurveTo(d.width / 2, d.height + 12, 6, d.height - 30);
    ctx.closePath();
    ctx.fill();
    rounded(
      ctx,
      d.width * 0.4,
      bottom + 6,
      d.width * 0.2,
      12,
      6,
      settings.finish === "graphite" ? "#333943" : "#b4bbc3",
    );
    ctx.strokeStyle = "rgba(255,255,255,.58)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, d.height - 30);
    ctx.lineTo(d.width - 18, d.height - 30);
    ctx.stroke();
  } else {
    rounded(ctx, 0, 0, d.width, d.height, d.kind === "phone" ? 78 : 49, metal);
    rounded(
      ctx,
      6,
      6,
      d.width - 12,
      d.height - 12,
      d.kind === "phone" ? 72 : 43,
      "#121720",
    );
  }
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(
    sx,
    sy,
    sw,
    sh,
    d.kind === "phone" ? 58 : d.kind === "tablet" ? 16 : 8,
  );
  ctx.clip();
  if (image) {
    const ratio = Math.max(sw / image.naturalWidth, sh / image.naturalHeight);
    // Cover crop from the top keeps the website header visible.
    ctx.drawImage(
      image,
      sx + (sw - image.naturalWidth * ratio) / 2,
      sy,
      image.naturalWidth * ratio,
      image.naturalHeight * ratio,
    );
  } else {
    const gradient = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
    gradient.addColorStop(0, "#e7e0f2");
    gradient.addColorStop(1, "#f5ede2");
    ctx.fillStyle = gradient;
    ctx.fillRect(sx, sy, sw, sh);
    const margin = sw * 0.09;
    ctx.fillStyle = "#51446c";
    ctx.font = `600 ${sw * 0.055}px Arial`;
    ctx.fillText("Your next big idea.", sx + margin, sy + sh * 0.38);
    ctx.font = `${sw * 0.024}px Arial`;
    ctx.fillText("A website. A beautiful frame.", sx + margin, sy + sh * 0.48);
    rounded(
      ctx,
      sx + margin,
      sy + sh * 0.57,
      sw * 0.33,
      sh * 0.075,
      sh * 0.03,
      "#776094",
    );
    ctx.fillStyle = "#ffffff";
    ctx.font = `${sw * 0.024}px Arial`;
    ctx.fillText("Make it yours", sx + margin + sw * 0.045, sy + sh * 0.618);
  }
  ctx.restore();
  if (d.kind === "phone") {
    rounded(ctx, d.width * 0.345, sy + 14, d.width * 0.31, 31, 16, "#11151b");
    rounded(
      ctx,
      d.width * 0.35,
      d.height - 35,
      d.width * 0.3,
      6,
      3,
      "rgba(20,24,30,.75)",
    );
  } else if (d.kind === "tablet") {
    ctx.fillStyle = "#343a44";
    ctx.beginPath();
    ctx.arc(d.width / 2, 18, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}
type Vertex = { x: number; y: number };
function triangle(
  ctx: CanvasRenderingContext2D,
  texture: HTMLCanvasElement,
  s: Vertex[],
  p: Vertex[],
) {
  const [s0, s1, s2] = s,
    [p0, p1, p2] = p;
  const det =
    s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  const solve = (v: number[]) => [
    (v[0] * (s1.y - s2.y) + v[1] * (s2.y - s0.y) + v[2] * (s0.y - s1.y)) / det,
    (v[0] * (s2.x - s1.x) + v[1] * (s0.x - s2.x) + v[2] * (s1.x - s0.x)) / det,
    (v[0] * (s1.x * s2.y - s2.x * s1.y) +
      v[1] * (s2.x * s0.y - s0.x * s2.y) +
      v[2] * (s0.x * s1.y - s1.x * s0.y)) /
      det,
  ];
  const [a, c, e] = solve(p.map((v) => v.x)),
    [b, d, f] = solve(p.map((v) => v.y));
  ctx.save();
  ctx.beginPath();
  // Subpixel overlap avoids hairline seams between perspective triangles.
  const center = { x: (p0.x + p1.x + p2.x) / 3, y: (p0.y + p1.y + p2.y) / 3 };
  p.forEach((v, i) => {
    const dx = v.x - center.x,
      dy = v.y - center.y,
      n = Math.hypot(dx, dy) || 1;
    const x = v.x + (dx / n) * 4,
      y = v.y + (dy / n) * 4;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(texture, 0, 0);
  ctx.restore();
}
export class DeviceFrame extends FabricObject {
  static type = "DeviceFrame";
  frame: FrameSettings;
  private texture: HTMLCanvasElement;
  private phase: number | null = null;
  constructor(
    frame: FrameSettings,
    image?: HTMLImageElement,
    options: Record<string, unknown> = {},
  ) {
    const d = devices.find((d) => d.id === frame.device)!;
    super({
      width: Math.ceil(d.width * 1.38),
      height: Math.ceil(d.height * 1.38),
      ...options,
      fill: null,
      strokeWidth: 0,
      objectCaching: false,
    });
    this.frame = frame;
    this.texture = surface(frame, image);
  }
  static async create(
    value: Partial<FrameSettings>,
    options: Record<string, unknown> = {},
  ) {
    const frame = frameSettings(value),
      image = frame.src ? await util.loadImage(frame.src) : undefined;
    return new DeviceFrame(frame, image, options);
  }
  static async fromObject<T>(object: any, options: any = {}) {
    const { frame, type, ...props } = object;
    const settings = frameSettings(frame),
      image = settings.src
        ? await util.loadImage(settings.src, options)
        : undefined;
    const enlivened = await util.enlivenObjectEnlivables(props, options);
    return new DeviceFrame(settings, image, enlivened);
  }
  toObject(properties: any[] = []): any {
    return {
      ...super.toObject(properties),
      frame: structuredClone(this.frame),
    };
  }
  setMotionPhase(value: number | null) {
    this.phase = value;
    this.dirty = true;
  }
  _render(ctx: CanvasRenderingContext2D) {
    const texture = this.texture,
      w = texture.width,
      h = texture.height;
    let x = this.frame.tiltX,
      y = this.frame.tiltY,
      lift = 0;
    if (this.phase !== null) {
      const t = this.phase * Math.PI * 2;
      if (this.frame.motion === "orbit") {
        x += Math.sin(t) * 8;
        y += Math.cos(t) * 16;
      }
      if (this.frame.motion === "rock") y += Math.sin(t) * 18;
      if (this.frame.motion === "float") {
        x += Math.sin(t) * 5;
        lift = -Math.sin(t) * h * 0.025;
      }
    }
    if (
      projectDevice(
        ctx,
        texture,
        this.width,
        this.height,
        x,
        y,
        lift,
        this.frame.finish === "graphite",
      )
    )
      return;
    const rx = (x * Math.PI) / 180,
      ry = (y * Math.PI) / 180,
      depth = Math.max(w, h) * 2.8;
    const project = (u: number, v: number, z = 0): Vertex => {
      const a = u - w / 2,
        b = v - h / 2,
        by = b * Math.cos(rx) - z * Math.sin(rx),
        bz = b * Math.sin(rx) + z * Math.cos(rx);
      const ax = a * Math.cos(ry) + bz * Math.sin(ry),
        az = -a * Math.sin(ry) + bz * Math.cos(ry),
        scale = depth / (depth + az);
      return { x: ax * scale, y: by * scale + lift };
    };
    ctx.save();
    const cols = 10,
      rows = 10;
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const u = (col * w) / cols,
          v = (row * h) / rows,
          du = w / cols,
          dv = h / rows;
        const points = [
            { x: u, y: v },
            { x: u + du, y: v },
            { x: u + du, y: v + dv },
            { x: u, y: v + dv },
          ],
          mapped = points.map((p) => project(p.x, p.y));
        triangle(
          ctx,
          texture,
          [points[0], points[1], points[2]],
          [mapped[0], mapped[1], mapped[2]],
        );
        triangle(
          ctx,
          texture,
          [points[0], points[2], points[3]],
          [mapped[0], mapped[2], mapped[3]],
        );
      }
    ctx.restore();
  }
  _toSVG() {
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(this.width / 2, this.height / 2);
    const phase = this.phase;
    this.phase = null;
    this._render(ctx);
    this.phase = phase;
    return [
      "<image ",
      "COMMON_PARTS",
      ` x="${-this.width / 2}" y="${-this.height / 2}" width="${this.width}" height="${this.height}" href="${canvas.toDataURL("image/png")}" />\n`,
    ];
  }
}
classRegistry.setClass(DeviceFrame);
