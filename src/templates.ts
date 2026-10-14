import {
  Circle,
  Ellipse,
  Rect,
  Textbox,
  Triangle,
  FabricImage,
  type FabricObject,
  util,
} from "fabric";
import { uid } from "./types";
import occasionTemplates from "../shared/templates-occasions.json";
import studioTemplates from "../shared/templates-studio.json";
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
export const templates: Template[] = [
  {
    id: "botanical",
    name: "A little growth",
    category: "Social",
    background: "#f6f1e7",
    accent: "#d3dfc5",
    ink: "#344936",
    headline: "Make room\nfor a little\ngrowth.",
    subtitle: "SLOW DAYS. FRESH PERSPECTIVES.",
    font: "Georgia",
    layout: "botanical",
  },
  {
    id: "studio",
    name: "The creative edit",
    category: "Social",
    background: "#dfe1fa",
    accent: "#ff8f6b",
    ink: "#332456",
    headline: "Ideas\nin full\ncolor.",
    subtitle: "THE CREATIVE EDIT / VOL. 01",
    font: "Arial",
    layout: "bold",
  },
  {
    id: "coast",
    name: "Somewhere slow",
    category: "Social",
    background: "#eae6de",
    accent: "#7499ab",
    ink: "#fffdf6",
    headline: "Somewhere\nslow.",
    subtitle: "A LITTLE FURTHER FROM THE EVERYDAY",
    font: "Georgia",
    layout: "photo",
    photo: "/photos/coast.jpg",
  },
  {
    id: "launch",
    name: "Something new",
    category: "Social",
    background: "#2e2a38",
    accent: "#d6ed9e",
    ink: "#f5f2e8",
    headline: "GOOD\nTHINGS\nAHEAD.",
    subtitle: "A NEW CHAPTER STARTS HERE",
    font: "Arial",
    layout: "bold",
  },
  {
    id: "editorial",
    name: "Less, but better",
    category: "Print",
    background: "#f5ede3",
    accent: "#b24a36",
    ink: "#3e3933",
    headline: "Less,\nbut better.",
    subtitle: "AN EXERCISE IN INTENTIONAL LIVING",
    font: "Georgia",
    layout: "minimal",
  },
  {
    id: "weekend",
    name: "Weekend club",
    category: "Social",
    background: "#ffcbbb",
    accent: "#d35538",
    ink: "#983b27",
    headline: "THE\nWEEKEND\nCLUB",
    subtitle: "MEET YOU OUTSIDE · SATURDAY, 10 AM",
    font: "Arial",
    layout: "bold",
  },
  {
    id: "pitch",
    name: "A fresh perspective",
    category: "Presentation",
    background: "#e7ecde",
    accent: "#879b7e",
    ink: "#334d39",
    headline: "A fresh\nperspective.",
    subtitle: "YOUR NEXT BIG IDEA STARTS HERE",
    font: "Georgia",
    layout: "minimal",
  },
  {
    id: "coffee",
    name: "Morning ritual",
    category: "Print",
    background: "#efe1ca",
    accent: "#b49575",
    ink: "#513b2e",
    headline: "Good days\nstart slow.",
    subtitle: "THE MORNING RITUAL / DAILY AT 8",
    font: "Georgia",
    layout: "botanical",
  },
  {
    id: "sale",
    name: "The summer edit",
    category: "Social",
    background: "#fff19b",
    accent: "#92b6eb",
    ink: "#2b3985",
    headline: "HELLO,\nSUNSHINE.",
    subtitle: "THE SUMMER EDIT · UP TO 30% OFF",
    font: "Arial",
    layout: "bold",
  },
  {
    id: "invite",
    name: "An evening together",
    category: "Print",
    background: "#ded1e4",
    accent: "#a786b6",
    ink: "#54355e",
    headline: "An evening\ntogether.",
    subtitle: "GOOD COMPANY. GREAT CONVERSATION.",
    font: "Georgia",
    layout: "minimal",
  },
  {
    id: "interior",
    name: "Spaces to be",
    category: "Presentation",
    background: "#c5b3a2",
    accent: "#6d5748",
    ink: "#ffffff",
    headline: "Spaces\nto be.",
    subtitle: "THOUGHTFULLY DESIGNED. BEAUTIFULLY LIVED.",
    font: "Georgia",
    layout: "photo",
    photo: "/photos/interior.jpg",
  },
  {
    id: "notes",
    name: "Field notes",
    category: "Print",
    background: "#eef0e7",
    accent: "#bfd1a8",
    ink: "#425444",
    headline: "FIELD\nNOTES",
    subtitle: "OBSERVATIONS FROM A SLOWER LIFE",
    font: "Arial",
    layout: "botanical",
  },
];
function named<T extends FabricObject>(object: T, name: string): T {
  Object.assign(object, { id: uid(), name });
  return object;
}
templates.push(...(occasionTemplates as Template[]));
templates.unshift(...(studioTemplates as Template[]));
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
        const image = await FabricImage.fromURL(layer.src),
          fill = Math.max(
            layer.width / image.width,
            layer.height / image.height,
          );
        image.set({
          left: layer.left,
          top: layer.top,
          width: layer.width / fill,
          height: layer.height / fill,
          cropX: (image.width - layer.width / fill) / 2,
          cropY: (image.height - layer.height / fill) / 2,
          scaleX: fill,
          scaleY: fill,
          strokeWidth: 0,
        });
        object = image;
      } else
        [object] = await util.enlivenObjects<FabricObject>([
          structuredClone(layer),
        ]);
      if (object instanceof Textbox && layer.boxHeight) {
        while (object.height > layer.boxHeight && object.fontSize > 16)
          object.set("fontSize", object.fontSize - 1);
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
