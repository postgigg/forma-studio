import {
  ActiveSelection,
  FabricImage,
  FabricObject,
  Group,
  StaticCanvas,
  filters,
  util,
  Polygon,
  Rect,
  Ellipse,
  Textbox,
  Line,
  Path,
} from "fabric";
import type { Editor, DesignObject } from "./editor";
import { fonts, uid } from "./types";
import {
  validateAdditions,
  type AddedElement,
} from "../shared/refinement-additions.mjs";

type Serialized = Record<string, any>;
export interface SelectionSnapshot {
  documentId: string;
  pageId: string;
  width: number;
  height: number;
  background: unknown;
  roots: Serialized[];
  baseline: { id: string; json: string }[];
  nodes: Serialized[];
  images: { id: string; src: string }[];
  preview: string;
}
export interface RefinementResult {
  summary: string;
  edits: Serialized[];
  images: { id: string; src: string }[];
  additions?: AddedElement[];
  designNotes?: string[];
}
export interface RefinementJob {
  id: string;
  status: string;
  stage: string;
  error: string | null;
  result: RefinementResult | null;
  elapsedSeconds: number;
}
export interface RefinedSelection {
  roots: Serialized[];
  preview: string;
  summary: string;
  addedIds?: string[];
  designNotes?: string[];
}
const numbers = [
  "left",
  "top",
  "scaleX",
  "scaleY",
  "angle",
  "width",
  "opacity",
  "strokeWidth",
  "fontSize",
];
const strings = [
  "fill",
  "stroke",
  "text",
  "fontFamily",
  "fontWeight",
  "textAlign",
];
const walk = (objects: FabricObject[], fn: (o: FabricObject) => void) =>
  objects.forEach((o) => {
    fn(o);
    if (o instanceof Group) walk(o.getObjects(), fn);
  });
async function renderSelection(
  snapshot: Pick<SelectionSnapshot, "width" | "height" | "background">,
  roots: Serialized[],
  fn?: (canvas: StaticCanvas) => Promise<void>,
) {
  const canvas = new StaticCanvas(undefined, {
    width: snapshot.width,
    height: snapshot.height,
    enableRetinaScaling: false,
  });
  try {
    await Promise.all(fonts.map((f) => document.fonts.load(`16px "${f}"`)));
    await canvas.loadFromJSON({
      background: snapshot.background,
      objects: roots,
    });
    if (fn) await fn(canvas);
    canvas.renderAll();
    return {
      roots: canvas.toObject().objects as Serialized[],
      preview: canvas.toDataURL({
        format: "png",
        multiplier: Math.min(
          1,
          1400 / Math.max(snapshot.width, snapshot.height),
        ),
      }),
    };
  } finally {
    await canvas.dispose();
  }
}
export async function captureSelection(
  editor: Editor,
): Promise<SelectionSnapshot> {
  const selected = editor.canvas.getActiveObjects() as DesignObject[];
  if (!selected.length)
    throw new Error("Select the elements or groups you want to improve.");
  if (selected.some((o) => o.lockMovementX))
    throw new Error("Unlock the selected layers before refining them.");
  const ids = new Set(selected.map((o) => o.id));
  const serialized = editor.canvas.toObject().objects as Serialized[];
  const roots = structuredClone(serialized.filter((o) => ids.has(o.id)));
  const snapshot: SelectionSnapshot = {
    documentId: editor.doc.id,
    pageId: editor.page.id,
    width: editor.doc.width,
    height: editor.doc.height,
    background: editor.canvas.backgroundColor,
    roots,
    baseline: roots.map((o) => ({ id: o.id, json: JSON.stringify(o) })),
    nodes: [],
    images: [],
    preview: "",
  };
  function inventory(
    object: Serialized,
    parentId: string | null,
    index: number,
  ) {
    object.id ||= `${parentId || "selection"}:${index}`;
    const node: Serialized = {
      id: object.id,
      parentId,
      type: object.type,
      name: object.name || object.type,
    };
    for (const key of [...numbers, ...strings, "height"])
      if (typeof object[key] === "string" || typeof object[key] === "number")
        node[key] = object[key];
    snapshot.nodes.push(node);
    object.objects?.forEach((child: Serialized, i: number) =>
      inventory(child, object.id, i),
    );
  }
  roots.forEach((o, i) => inventory(o, null, i));
  if (snapshot.nodes.length > 200)
    throw new Error(
      "Refine up to 200 layers at a time. Select a smaller group.",
    );
  const rendered = await renderSelection(snapshot, roots, async (canvas) => {
    walk(canvas.getObjects(), (object) => {
      if (object instanceof FabricImage && snapshot.images.length < 4) {
        snapshot.images.push({
          id: (object as DesignObject).id!,
          src: object.toDataURL({
            format: "png",
            withoutTransform: true,
            enableRetinaScaling: false,
            multiplier: Math.min(
              1,
              1600 / Math.max(object.width, object.height),
            ),
          }),
        });
      }
    });
  });
  snapshot.preview = rendered.preview;
  return snapshot;
}
export async function makeRefinedSelection(
  snapshot: SelectionSnapshot,
  result: RefinementResult,
): Promise<RefinedSelection> {
  const additions = validateAdditions(
      result.additions,
      snapshot.width,
      snapshot.height,
      fonts,
    ),
    addedIds: string[] = [];
  const rendered = await renderSelection(
    snapshot,
    snapshot.roots,
    async (canvas) => {
      const byId = new Map<string, FabricObject>();
      walk(canvas.getObjects(), (o) => {
        byId.set((o as DesignObject).id!, o);
      });
      for (const replacement of result.images || []) {
        const object = byId.get(replacement.id);
        if (
          !(object instanceof FabricImage) ||
          !/^data:image\/png;base64,/.test(replacement.src)
        )
          throw new Error("An edited image did not match your selection.");
        const width = object.width,
          height = object.height,
          sx = object.scaleX,
          sy = object.scaleY;
        await object.setSrc(replacement.src);
        const scale = Math.max(width / object.width, height / object.height);
        object.set({
          cropX: (object.width - width / scale) / 2,
          cropY: (object.height - height / scale) / 2,
          width: width / scale,
          height: height / scale,
          scaleX: sx * scale,
          scaleY: sy * scale,
        });
        object.filters = [];
        object.applyFilters();
      }
      for (const edit of result.edits) {
        const object = byId.get(edit.id);
        if (!object)
          throw new Error("A proposed edit is outside your selection.");
        const props: Serialized = {};
        for (const key of numbers)
          if (edit[key] != null && Number.isFinite(edit[key]))
            props[key] = edit[key];
        for (const key of strings)
          if (edit[key] != null && typeof edit[key] === "string")
            props[key] = edit[key];
        object.set(props);
        if (object instanceof FabricImage) {
          for (const [key, Constructor] of [
            ["brightness", filters.Brightness],
            ["contrast", filters.Contrast],
            ["saturation", filters.Saturation],
          ] as const)
            if (edit[key] != null) {
              object.filters = object.filters.filter(
                (f) => f.type.toLowerCase() !== key,
              );
              object.filters.push(new Constructor({ [key]: edit[key] }));
            }
          object.applyFilters();
        }
        object.setCoords();
      }
      function layout(object: FabricObject) {
        if (object instanceof Group) {
          object.getObjects().forEach(layout);
          object.triggerLayout();
        }
        object.setCoords();
      }
      canvas.getObjects().forEach(layout);
      for (const addition of additions) {
        const object = makeAddedElement(addition),
          id = uid();
        Object.assign(object, { id, name: addition.name });
        addedIds.push(id);
        canvas.add(object);
      }
    },
  );
  return {
    ...rendered,
    summary: result.summary,
    addedIds,
    designNotes: result.designNotes,
  };
}
function makeAddedElement(a: AddedElement): FabricObject {
  const options = {
    left: a.x,
    top: a.y,
    angle: a.angle,
    fill: a.fill,
    stroke: a.stroke,
    strokeWidth: a.strokeWidth,
    opacity: a.opacity,
  };
  if (a.kind === "text")
    return new Textbox(a.text!, {
      ...options,
      width: a.width,
      fontFamily: a.font!,
      fontSize: a.fontSize!,
    });
  if (a.kind === "rect")
    return new Rect({ ...options, width: a.width, height: a.height });
  if (a.kind === "ellipse")
    return new Ellipse({ ...options, rx: a.width / 2, ry: a.height / 2 });
  if (a.kind === "line")
    return new Line([0, 0, a.width, a.height], {
      ...options,
      stroke: a.stroke || a.fill,
      strokeWidth: a.strokeWidth || 2,
    });
  if (a.kind === "path") {
    const object = new Path(a.path!, options);
    object.set({
      scaleX: a.width / object.width,
      scaleY: a.height / object.height,
    });
    return object;
  }
  const count = a.kind === "star" ? 10 : 8,
    points = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2,
        r = i % 2 ? (a.kind === "star" ? 0.23 : 0.13) : 0.5;
      return {
        x: a.width * (0.5 + Math.cos(angle) * r),
        y: a.height * (0.5 + Math.sin(angle) * r),
      };
    });
  const object = new Polygon(points, options);
  object.set({
    scaleX: a.width / object.width,
    scaleY: a.height / object.height,
  });
  return object;
}
export async function applyRefinement(
  editor: Editor,
  snapshot: SelectionSnapshot,
  candidate: RefinedSelection,
) {
  if (
    editor.busy ||
    editor.doc.id !== snapshot.documentId ||
    editor.page.id !== snapshot.pageId
  )
    throw new Error(
      "Return to the original page before applying this refinement.",
    );
  const current = editor.canvas.toObject().objects as Serialized[];
  for (const baseline of snapshot.baseline)
    if (
      JSON.stringify(current.find((o) => o.id === baseline.id)) !==
      baseline.json
    )
      throw new Error(
        "The selected content changed while AI was working. Start a new refinement to keep your latest edits.",
      );
  const replacements = await util.enlivenObjects<FabricObject>(candidate.roots);
  if (editor.objects.length + (candidate.addedIds?.length || 0) > 1500)
    throw new Error(
      "This page would exceed 1,500 layers. Refine a smaller composition.",
    );
  // Recheck after asynchronous image/font loading, before the first mutation.
  const check = editor.canvas.toObject().objects as Serialized[];
  if (
    editor.doc.id !== snapshot.documentId ||
    editor.page.id !== snapshot.pageId ||
    snapshot.baseline.some(
      (b) => JSON.stringify(check.find((o) => o.id === b.id)) !== b.json,
    )
  )
    throw new Error("The selected content changed. Start a new refinement.");
  editor.canvas.discardActiveObject();
  const positions = snapshot.baseline.map((b) =>
    editor.objects.findIndex((o) => o.id === b.id),
  );
  positions.forEach((index, i) => {
    const original = editor.objects[index];
    editor.canvas.remove(original);
    editor.canvas.insertAt(index, replacements[i]);
  });
  const added = new Set(candidate.addedIds || []),
    newObjects = replacements.filter((o) => added.has((o as DesignObject).id!));
  if (newObjects.length)
    editor.canvas.insertAt(Math.max(...positions) + 1, ...newObjects);
  editor.canvas.setActiveObject(
    replacements.length === 1
      ? replacements[0]
      : new ActiveSelection(replacements, { canvas: editor.canvas }),
  );
  editor.canvas.requestRenderAll();
  editor.commit();
}
