import {
  Circle,
  Ellipse,
  Rect,
  Textbox,
  Triangle,
  FabricImage,
  Group,
  type FabricObject,
  util,
} from "fabric";
import { uid } from "./types";
import modernTemplates from "../shared/templates-modern.json";
import { templatePhoto } from "./template-media";
import { makeChart } from "./charts";
import { SolidObject } from "./solid-object";

export type Template = {
  id: string;
  name: string;
  category: string;
  background: string;
  accent: string;
  ink: string;
  headline: string;
  subtitle: string;
  font: string;
  layout: "botanical" | "bold" | "minimal" | "photo" | "custom";
  photo?: string;
  occasion?: string;
  width?: number;
  height?: number;
  thumbnail?: string;
  composition?: Record<string, any>[];
  format?: string;
  deckIds?: string[];
};
export const templates: Template[] = modernTemplates as Template[];
function named<T extends FabricObject>(object: T, name: string): T {
  Object.assign(object, { id: uid(), name });
  return object;
}


export async function templateObjects(t: Template, w: number, h: number) {
  if (t.composition) {
    await Promise.all(
      [
        ...new Set(
          t.composition
            .filter((o) => o.type === "Textbox")
            .map((o) => o.fontFamily),
        ),
      ].map((font) => document.fonts.load(`32px "${font}"`)),
    );
    const scale = Math.min(w / t.width!, h / t.height!),
      dx = (w - t.width! * scale) / 2,
      dy = (h - t.height! * scale) / 2;
    const result: FabricObject[] = [];
    for (const layer of t.composition) {
      let object: FabricObject;
      if (layer.type === "Photo") {
        object = await templatePhoto(layer);
      } else if (layer.type === "Chart" || layer.type === "Solid" || layer.type === "Artwork") {
        object = layer.type === "Chart" ? makeChart(layer.chart) : layer.type === "Solid" ? await SolidObject.create(layer.solid)
          : new Group(await util.enlivenObjects<FabricObject>(structuredClone(layer.objects)), {subTargetCheck: true, interactive: false});
        const factor = Math.min(layer.width / object.width, layer.height / object.height);
        object.set({ left: layer.left + (layer.width - object.width * factor) / 2,
          top: layer.top + (layer.height - object.height * factor) / 2,
          scaleX: factor, scaleY: factor });
      } else
        [object] = await util.enlivenObjects<FabricObject>([
          structuredClone(layer),
        ]);
      if (object instanceof Textbox && layer.boxHeight) {
        // Fabric expands a Textbox to its longest word. Fit both axes, including
        // email addresses and deliberate headline line breaks, before placing it.
        while ((object.height > layer.boxHeight || object.width > layer.width + 1) && object.fontSize > 16) {
          object.set({ fontSize: object.fontSize - 1, width: layer.width });
          object.initDimensions();
        }
      }
      object.set({
        left: dx + object.left * scale,
        top: dy + object.top * scale,
        scaleX: object.scaleX * scale,
        scaleY: object.scaleY * scale,
      });
      named(object, layer.name);
      result.push(object);
    }
    return result;
  }
  const s = Math.min(w, h) / 1080;
  const objects: FabricObject[] = [];
  const text = (
    value: string,
    options: Record<string, unknown>,
    name: string,
  ) =>
    named(
      new Textbox(value, {
        fontFamily: t.font,
        fill: t.ink,
        left: w * 0.09,
        top: h * 0.22,
        width: w * 0.83,
        fontSize: 105 * s,
        lineHeight: 1.02,
        ...options,
      }),
      name,
    );
  if (t.layout === "photo" && t.photo) {
    const image = await FabricImage.fromURL(t.photo);
    const scale = Math.max(w / image.width, h / image.height);
    image.set({
      left: (w - image.width * scale) / 2,
      top: (h - image.height * scale) / 2,
      scaleX: scale,
      scaleY: scale,
    });
    objects.push(
      named(image, "Cover photograph"),
      named(
        new Rect({
          left: 0,
          top: 0,
          width: w,
          height: h,
          fill: "#162c2d",
          opacity: 0.25,
        }),
        "Photo overlay",
      ),
    );
  }
  if (t.layout === "botanical") {
    objects.push(
      named(
        new Rect({
          left: w * 0.55,
          top: h * 0.17,
          width: w * 0.45,
          height: h * 0.83,
          rx: w * 0.24,
          ry: w * 0.24,
          fill: t.accent,
        }),
        "Organic backdrop",
      ),
    );
    objects.push(
      named(
        new Ellipse({
          left: w * 0.66,
          top: h * 0.69,
          rx: 110 * s,
          ry: 110 * s,
          fill: "#b77350",
        }),
        "Terracotta vase",
      ),
    );
    objects.push(
      named(
        new Rect({
          left: w * 0.697,
          top: h * 0.665,
          width: 140 * s,
          height: 60 * s,
          fill: "#bc805d",
          rx: 10 * s,
          ry: 10 * s,
        }),
        "Vase rim",
      ),
    );
    objects.push(
      named(
        new Rect({
          left: w * 0.756,
          top: h * 0.34,
          width: 6 * s,
          height: h * 0.34,
          fill: t.ink,
          angle: -3,
        }),
        "Stem",
      ),
    );
    [
      [0.66, 0.32, -38, 63, 130],
      [0.73, 0.39, 32, 64, 137],
      [0.64, 0.45, -50, 52, 112],
      [0.75, 0.5, 34, 59, 110],
      [0.68, 0.56, -40, 49, 90],
    ].forEach(([x, y, angle, rx, ry], i) =>
      objects.push(
        named(
          new Ellipse({
            left: w * x,
            top: h * y,
            rx: rx * s,
            ry: ry * s,
            angle,
            fill: i % 2 ? "#658261" : t.ink,
            originX: "center",
            originY: "center",
          }),
          `Leaf ${i + 1}`,
        ),
      ),
    );
    objects.push(
      text(
        t.headline,
        {
          top: h * 0.245,
          width: w * 0.63,
          fontSize: 102 * s,
          lineHeight: 1.07,
        },
        "Headline",
      ),
    );
    objects.push(
      text(
        "A little care.\nA whole lot of possibility.",
        {
          top: h * 0.69,
          width: w * 0.5,
          fontFamily: "Arial",
          fontSize: 25 * s,
          lineHeight: 1.5,
        },
        "Description",
      ),
    );
  } else if (t.layout === "bold") {
    objects.push(
      named(
        new Circle({
          left: w * 0.63,
          top: h * 0.46,
          radius: 190 * s,
          fill: t.accent,
        }),
        "Accent circle",
      ),
    );
    objects.push(
      named(
        new Triangle({
          left: w * 0.72,
          top: h * 0.1,
          width: 105 * s,
          height: 115 * s,
          angle: 20,
          fill: t.ink,
        }),
        "Accent triangle",
      ),
    );
    objects.push(
      text(
        t.headline,
        {
          top: h * 0.23,
          fontWeight: "bold",
          fontSize: 137 * s,
          lineHeight: 0.98,
          charSpacing: -45,
        },
        "Headline",
      ),
    );
  } else {
    objects.push(
      text(t.headline, { top: h * 0.29, fontSize: 132 * s }, "Headline"),
    );
    objects.push(
      named(
        new Rect({
          left: w * 0.09,
          top: h * 0.75,
          width: w * 0.82,
          height: 2 * s,
          fill: t.ink,
        }),
        "Divider",
      ),
    );
    objects.push(
      text(
        "Discover a different kind of everyday.\nMade with intention. Made for you.",
        {
          top: h * 0.79,
          fontSize: 25 * s,
          fontFamily: "Arial",
          lineHeight: 1.5,
        },
        "Description",
      ),
    );
  }
  objects.push(
    text(
      t.subtitle,
      {
        top: h * 0.083,
        fontFamily: "Arial",
        fontSize: 18 * s,
        charSpacing: 145,
      },
      "Eyebrow",
    ),
  );
  objects.push(
    text(
      "STUDIO / 01",
      {
        top: h * 0.935,
        fontFamily: "Arial",
        fontSize: 16 * s,
        charSpacing: 130,
      },
      "Footer",
    ),
  );
  return objects;
}
