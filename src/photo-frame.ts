import { FabricObject, classRegistry, util } from "fabric";
import { fonts } from "./types";
import catalog from "../shared/assets.json";

export const frameShapes = [
  "rounded",
  "circle",
  "heart",
  "star",
  "arch",
  "diamond",
  "hexagon",
  "rectangle",
  "letter",
] as const;
export type FrameShape = (typeof frameShapes)[number];
export interface PhotoMask {
  shape: FrameShape;
  letter: string;
  font: string;
  italic: boolean;
  bold: boolean;
  src: string;
  zoom: number;
  panX: number;
  panY: number;
}
export const defaultMask = (
  shape: FrameShape = "rounded",
  letter = "A",
): PhotoMask => ({
  shape,
  letter,
  font: "Arial",
  italic: false,
  bold: true,
  src: "",
  zoom: 1,
  panX: 0,
  panY: 0,
});
export function validateMask(value: PhotoMask) {
  if (
    !frameShapes.includes(value.shape) ||
    !fonts.includes(value.font) ||
    typeof value.letter !== "string" ||
    !value.letter.trim() ||
    value.letter.length > 12
  )
    throw new Error("Choose a frame shape and up to 12 letters.");
  if (
    typeof value.src !== "string" ||
    value.src.length > 28_000_000 ||
    (value.src &&
      !/^data:image\/(png|jpeg|webp|gif);base64,/.test(value.src) &&
      !catalog.some((a) => a.src === value.src))
  )
    throw new Error("Use an uploaded image or a Forma library photo.");
  if (
    !Number.isFinite(value.zoom) ||
    value.zoom < 1 ||
    value.zoom > 4 ||
    !Number.isFinite(value.panX) ||
    Math.abs(value.panX) > 1 ||
    !Number.isFinite(value.panY) ||
    Math.abs(value.panY) > 1
  )
    throw new Error("Invalid image crop.");
}
function maskPath(
  ctx: CanvasRenderingContext2D,
  m: PhotoMask,
  w: number,
  h: number,
) {
  ctx.fillStyle = "#000";
  ctx.beginPath();
  if (m.shape === "letter") {
    ctx.font = `${m.italic ? "italic " : ""}${m.bold ? 900 : 400} 600px "${m.font}"`;
    const measure = ctx.measureText(m.letter),
      tw = measure.actualBoundingBoxLeft + measure.actualBoundingBoxRight,
      th = measure.actualBoundingBoxAscent + measure.actualBoundingBoxDescent;
    const scale = Math.min(
      (w * 0.91) / Math.max(1, tw),
      (h * 0.91) / Math.max(1, th),
    );
    ctx.save();
    ctx.translate(
      (w - tw * scale) / 2 + measure.actualBoundingBoxLeft * scale,
      (h - th * scale) / 2 + measure.actualBoundingBoxAscent * scale,
    );
    ctx.scale(scale, scale);
    ctx.fillText(m.letter, 0, 0);
    ctx.restore();
    return;
  }
  if (m.shape === "rectangle") ctx.rect(0, 0, w, h);
  if (m.shape === "rounded") ctx.roundRect(0, 0, w, h, w * 0.12);
  if (m.shape === "circle")
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  if (m.shape === "arch") {
    ctx.moveTo(0, h);
    ctx.lineTo(0, w / 2);
    ctx.bezierCurveTo(0, -w / 6, w, -w / 6, w, w / 2);
    ctx.lineTo(w, h);
    ctx.closePath();
  }
  if (m.shape === "heart") {
    ctx.moveTo(w / 2, h * 0.96);
    ctx.bezierCurveTo(-w * 0.4, h * 0.37, w * 0.09, -h * 0.31, w / 2, h * 0.23);
    ctx.bezierCurveTo(w * 0.91, -h * 0.31, w * 1.4, h * 0.37, w / 2, h * 0.96);
    ctx.closePath();
  }
  if (m.shape === "diamond") {
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h / 2);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(0, h / 2);
    ctx.closePath();
  }
  if (m.shape === "hexagon" || m.shape === "star") {
    const count = m.shape === "star" ? 10 : 6;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2,
        r = m.shape === "star" && i % 2 ? 0.23 : 0.5;
      const x = w / 2 + Math.cos(a) * w * r,
        y = h / 2 + Math.sin(a) * h * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  ctx.fill();
}
function texture(mask: PhotoMask, image?: HTMLImageElement) {
  const out = document.createElement("canvas");
  out.width = out.height = 1200;
  const ctx = out.getContext("2d")!,
    w = out.width,
    h = out.height;
  if (image) {
    const s =
        Math.max(w / image.naturalWidth, h / image.naturalHeight) * mask.zoom,
      iw = image.naturalWidth * s,
      ih = image.naturalHeight * s;
    ctx.drawImage(
      image,
      (w - iw) / 2 + (mask.panX * (iw - w)) / 2,
      (h - ih) / 2 + (mask.panY * (ih - h)) / 2,
      iw,
      ih,
    );
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#dce5f4");
    sky.addColorStop(1, "#f3e9d7");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff6d6";
    ctx.beginPath();
    ctx.arc(w * 0.72, h * 0.28, w * 0.105, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#91ac96";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.75);
    ctx.quadraticCurveTo(w * 0.3, h * 0.19, w * 0.66, h);
    ctx.lineTo(0, h);
    ctx.fill();
    ctx.fillStyle = "#5d806f";
    ctx.beginPath();
    ctx.moveTo(w * 0.28, h);
    ctx.quadraticCurveTo(w * 0.67, h * 0.4, w, h * 0.72);
    ctx.lineTo(w, h);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "destination-in";
  maskPath(ctx, mask, w, h);
  ctx.globalCompositeOperation = "source-over";
  return out;
}
export class PhotoFrame extends FabricObject {
  static type = "PhotoFrame";
  photoMask: PhotoMask;
  private texture: HTMLCanvasElement;
  constructor(
    mask: PhotoMask,
    image?: HTMLImageElement,
    options: Record<string, unknown> = {},
  ) {
    super({
      ...options,
      width: 600,
      height: 600,
      fill: null,
      strokeWidth: 0,
      objectCaching: false,
    });
    this.photoMask = structuredClone(mask);
    this.texture = texture(mask, image);
  }
  static async create(mask: PhotoMask, options: Record<string, unknown> = {}) {
    validateMask(mask);
    await document.fonts.load(
      `${mask.italic ? "italic " : ""}${mask.bold ? 900 : 400} 600px "${mask.font}"`,
    );
    return new PhotoFrame(
      mask,
      mask.src ? await util.loadImage(mask.src) : undefined,
      options,
    );
  }
  static async fromObject<T>(object: any, options: any = {}) {
    const { photoMask, type, ...props } = object;
    validateMask(photoMask);
    await document.fonts.load(
      `${photoMask.italic ? "italic " : ""}${photoMask.bold ? 900 : 400} 600px "${photoMask.font}"`,
    );
    return new PhotoFrame(
      photoMask,
      photoMask.src ? await util.loadImage(photoMask.src, options) : undefined,
      await util.enlivenObjectEnlivables(props, options),
    );
  }
  toObject(properties: any[] = []): any {
    return {
      ...super.toObject(properties),
      photoMask: structuredClone(this.photoMask),
    };
  }
  _render(ctx: CanvasRenderingContext2D) {
    ctx.drawImage(
      this.texture,
      -this.width / 2,
      -this.height / 2,
      this.width,
      this.height,
    );
  }
  _toSVG() {
    return [
      "<image ",
      "COMMON_PARTS",
      ` x="${-this.width / 2}" y="${-this.height / 2}" width="${this.width}" height="${this.height}" href="${this.texture.toDataURL("image/png")}" />\n`,
    ];
  }
}
classRegistry.setClass(PhotoFrame);
