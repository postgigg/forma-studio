import {
  Ellipse,
  FabricImage,
  FabricObject,
  Line,
  Rect,
  StaticCanvas,
  Textbox,
  Triangle,
} from "fabric";
import assets from "../shared/assets.json";
import { makeGraphic } from "./graphics";
import { fonts, uid, type Design } from "./types";
import { getDesignStyle } from "./storage";
import type { CreativeDirection, QualityReview } from './CreativeDirection';
export interface DesignElement {
  type: "text" | "rect" | "ellipse" | "triangle" | "line" | "asset" | "graphic";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  opacity: number;
  radius: number;
  text: string;
  font: string;
  fontSize: number;
  fontWeight: "normal" | "bold";
  align: "left" | "center" | "right";
  asset: string;
  imageFit?: 'contain' | 'cover';
  imagePositionX?: number;
  imagePositionY?: number;
}
export interface Proposal {
  creativeDirection?: CreativeDirection;
  qualityReview?: QualityReview;
  extraAssets?: { id: string; src: string; name: string; category: string }[];
  title: string;
  description: string;
  palette: string[];
  width: number;
  height: number;
  pages: { name: string; background: string; elements: DesignElement[] }[];
}
export interface DesignJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  stage: string;
  elapsedSeconds: number;
  result: Proposal | null;
  error: string | null;
}
export interface RebuildReference {
  id: string;
  data: string;
  name: string;
  width: number;
  height: number;
}
const endpoint = window.formaDesktop?.aiEndpoint || "http://127.0.0.1:5188";
export class DesignerRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "DesignerRequestError";
    this.status = status;
  }
}
// Status reads are retried by their owning view without resubmitting a job.
export async function designerRequest(
  route: string,
  token?: string,
  options: RequestInit = {},
) {
  if (!["localhost", "127.0.0.1"].includes(location.hostname))
    throw new Error(
      "AI Designer is available in your local Forma installation.",
    );
  // One submission path covers design, photos, refinement, Pencil and Eraser.
  // An explicit snapshot (including null) wins for resumable campaign batches.
  if (
    options.method === "POST" &&
    ["/jobs", "/photos", "/refinements"].includes(route) &&
    typeof options.body === "string"
  ) {
    const body = JSON.parse(options.body);
    if (!Object.hasOwn(body, "designProfile")) {
      const profile = await getDesignStyle();
      if (profile?.enabled)
        options = {
          ...options,
          body: JSON.stringify({ ...body, designProfile: profile }),
        };
    }
  }
  const response = await fetch(endpoint + route, {
    ...options,
    headers: {
      ...(token ? { "X-Forma-Token": token } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    signal: options.signal || AbortSignal.timeout(10000),
  });
  const value = await response.json();
  if (!response.ok)
    throw new DesignerRequestError(
      value.error || "The local designer could not complete that request.",
      response.status,
    );
  if (/^\/jobs(?:\/[^/?]+)?(?:\?|$)/.test(route) && value?.id &&
    ["queued", "running", "completed", "failed", "cancelled"].includes(value.status)) {
    window.dispatchEvent(new CustomEvent("forma:designer-activity", {
      detail: { id: value.id, status: value.status, stage: value.stage || "Designing" },
    }));
  }
  return value;
}
export function isTransientDesignerError(error: unknown) {
  return (
    (error instanceof TypeError &&
      /fetch|network|load failed/i.test(error.message)) ||
    (error instanceof DOMException &&
      ["TimeoutError", "AbortError"].includes(error.name)) ||
    (error instanceof DesignerRequestError &&
      (error.status === 408 || error.status >= 500))
  );
}
export async function proposalToDesign(proposal: Proposal): Promise<Design> {
  await Promise.all(fonts.map((f) => document.fonts.load(`16px "${f}"`)));
  const design: Design = {
    id: uid(),
    name: proposal.title,
    width: proposal.width,
    height: proposal.height,
    updatedAt: new Date().toISOString(),
    aiDirection: proposal.creativeDirection,
    aiReview: proposal.qualityReview,
    pages: [],
  };
  const canvas = new StaticCanvas(undefined, {
    width: design.width,
    height: design.height,
    enableRetinaScaling: false,
  });
  try {
    for (const page of proposal.pages) {
      canvas.clear();
      canvas.backgroundColor = page.background;
      for (const element of page.elements) {
        let object: FabricObject;
        const common = {
          left: element.x,
          top: element.y,
          angle: element.rotation,
          fill: element.fill,
          opacity: element.opacity,
          strokeWidth: 0,
        };
        if (element.type === "text") {
          const text = new Textbox(element.text, {
            ...common,
            width: Math.max(element.width, 10),
            fontFamily: fonts.includes(element.font) ? element.font : "Arial",
            fontSize: element.fontSize,
            fontWeight: element.fontWeight,
            textAlign: element.align,
            lineHeight: 1.12,
            splitByGrapheme: false,
          });
          while (text.height > element.height && text.fontSize > 12) {
            text.set("fontSize", text.fontSize - 1);
          }
          object = text;
        } else if (element.type === "ellipse")
          object = new Ellipse({
            ...common,
            rx: element.width / 2,
            ry: element.height / 2,
          });
        else if (element.type === "triangle")
          object = new Triangle({
            ...common,
            width: element.width,
            height: element.height,
          });
        else if (element.type === "line")
          object = new Line([0, 0, element.width, element.height], {
            ...common,
            left: element.x + Math.min(0, element.width),
            top: element.y + Math.min(0, element.height),
            stroke: element.fill,
            strokeWidth: Math.max(1, element.radius),
          });
        else if (element.type === "asset") {
          const asset = [...assets, ...(proposal.extraAssets || [])].find(
            (a) => a.id === element.asset,
          );
          if (!asset)
            throw new Error("An image in the proposed design is unavailable.");
          const img = await FabricImage.fromURL(asset.src);
          const w = img.width,
            h = img.height;
          if (
            asset.category === "AI stickers" ||
            asset.category === "Brand logo" ||
            (asset.category === "Campaign image" && element.imageFit !== 'cover') ||
            asset.id === 'reference-photo' || element.imageFit === 'contain'
          ) {
            const scale = Math.min(element.width / w, element.height / h);
            img.set({
              ...common,
              scaleX: scale,
              scaleY: scale,
              left: element.x + (element.width - w * scale) / 2,
              top: element.y + (element.height - h * scale) / 2,
            });
          } else {
            const scale = Math.max(element.width / w, element.height / h);
            const cropWidth = element.width / scale,
              cropHeight = element.height / scale;
            img.set({
              ...common,
              cropX: (w - cropWidth) * (element.imagePositionX ?? .5),
              cropY: (h - cropHeight) * (element.imagePositionY ?? .5),
              width: cropWidth,
              height: cropHeight,
              scaleX: scale,
              scaleY: scale,
            });
          }
          object = img;
        } else if (element.type === "graphic") {
          object = makeGraphic(element.asset, element.fill);
          object.set({
            ...common,
            scaleX: element.width / Math.max(1, object.width),
            scaleY: element.height / Math.max(1, object.height),
          });
        } else
          object = new Rect({
            ...common,
            width: element.width,
            height: element.height,
            rx: element.radius,
            ry: element.radius,
          });
        Object.assign(object, { id: uid(), name: element.name });
        canvas.add(object);
      }
      canvas.renderAll();
      design.pages.push({
        id: uid(),
        name: page.name,
        data: canvas.toObject(),
        thumbnail: canvas.toDataURL({
          format: "png",
          multiplier: Math.min(1, 1200 / design.width),
        }),
      });
    }
  } finally {
    await canvas.dispose();
  }
  return design;
}
