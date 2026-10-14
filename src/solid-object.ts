import { FabricObject, classRegistry, util } from "fabric";

export const solidShapes = ["text", "sphere", "cube", "ring", "capsule", "crystal", "star", "heart", "arch"] as const;
export type SolidShape = typeof solidShapes[number];
export interface SolidSettings {
  shape: SolidShape; text: string; font: "frame" | "soft" | "deco";
  color: string; material: "ceramic" | "metal" | "matte";
  depth: number; bevel: number; rotateX: number; rotateY: number; rotateZ: number;
  motion: "none" | "spin" | "rock";
}
export const defaultSolid = (shape: SolidShape = "text", text = "A"): SolidSettings => ({
  shape, text, font: "frame", color: "#754adb", material: "ceramic", depth: 38,
  bevel: 3, rotateX: 12, rotateY: -24, rotateZ: -5, motion: "none",
});
export function solidSettings(value: Partial<SolidSettings>): SolidSettings {
  const s = { ...defaultSolid(), ...value };
  if (!solidShapes.includes(s.shape) || !["frame", "soft", "deco"].includes(s.font) || !["ceramic", "metal", "matte"].includes(s.material) || !["none", "spin", "rock"].includes(s.motion)) throw new Error("Choose a supported 3D object and material.");
  if (typeof s.text !== "string" || !/^[A-Za-z0-9&!?+%#@ .-]{1,16}$/.test(s.text) || !s.text.trim()) throw new Error("Use 1–16 letters, numbers or supported punctuation.");
  if (!/^#[0-9a-f]{6}$/i.test(s.color)) throw new Error("Choose a valid object color.");
  if (!Number.isFinite(s.depth) || s.depth < 5 || s.depth > 100 || !Number.isFinite(s.bevel) || s.bevel < 0 || s.bevel > 8) throw new Error("Invalid 3D depth or bevel.");
  for (const key of ["rotateX", "rotateY", "rotateZ"] as const) if (!Number.isFinite(s[key]) || Math.abs(s[key]) > 180) throw new Error("Choose a rotation between -180° and 180°.");
  return s;
}
type Renderer = typeof import("./solid-renderer");
let backend: Promise<Renderer> | undefined;
export class SolidObject extends FabricObject {
  static type = "SolidObject";
  solid: SolidSettings;
  private renderer: Renderer;
  private bitmap = document.createElement("canvas");
  private rendered = "";
  private phase: number | null = null;
  constructor(solid: SolidSettings, renderer: Renderer, options: Record<string, unknown> = {}) {
    super({ ...options, width: 800, height: 640, fill: null, strokeWidth: 0, objectCaching: false });
    this.solid = solid; this.renderer = renderer;
    this.bitmap.width = 1200; this.bitmap.height = 960;
  }
  static async create(value: Partial<SolidSettings>, options: Record<string, unknown> = {}) {
    const s = solidSettings(value), renderer = await (backend ||= import("./solid-renderer"));
    await renderer.prepareSolid(s);
    return new SolidObject(s, renderer, options);
  }
  static async fromObject<T>(object: any, options: any = {}) {
    const { solid, type, ...props } = object;
    return SolidObject.create(solidSettings(solid), await util.enlivenObjectEnlivables(props, options));
  }
  toObject(properties: any[] = []): any { return { ...super.toObject(properties), solid: structuredClone(this.solid) }; }
  setMotionPhase(phase: number | null) { this.phase = phase; this.dirty = true; }
  _render(ctx: CanvasRenderingContext2D) {
    const phase = this.solid.motion === "none" ? null : this.phase;
    const key = JSON.stringify([this.solid, phase]);
    if (key !== this.rendered) { this.renderer.renderSolid(this.solid, this.bitmap, phase); this.rendered = key; }
    ctx.drawImage(this.bitmap, -this.width / 2, -this.height / 2, this.width, this.height);
  }
  _toSVG() {
    const output = document.createElement("canvas"); output.width = 1200; output.height = 960;
    const ctx = output.getContext("2d")!; ctx.translate(600, 480); ctx.scale(1.5, 1.5);
    const phase = this.phase; this.phase = null; this._render(ctx); this.phase = phase;
    return ["<image ", "COMMON_PARTS", ` x="-400" y="-320" width="800" height="640" href="${output.toDataURL("image/png")}" />\n`];
  }
}
classRegistry.setClass(SolidObject);
