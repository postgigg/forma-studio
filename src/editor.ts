import {
  ActiveSelection,
  Canvas,
  Circle,
  Ellipse,
  FabricImage,
  FabricObject,
  Group,
  Line,
  Path,
  PencilBrush,
  Polygon,
  Point,
  Rect,
  Shadow,
  StaticCanvas,
  Textbox,
  Triangle,
  filters,
} from "fabric";
import { allDesigns, saveDesign, validateDesign } from "./storage";
import { templateObjects, templates, type Template } from "./templates";
import { uid, fonts, type Design, type DesignPage } from "./types";
import { graphics, makeGraphic } from "./graphics";
import { smartGuides, type Guide } from "./guides";
import { portableSvg } from "./export-svg";
import "./device-frame";
import { PhotoFrame, type PhotoMask } from "./photo-frame";

export type DesignObject = FabricObject & { id?: string; name?: string };
FabricObject.customProperties = [
  "id",
  "name",
  "selectable",
  "evented",
  "lockMovementX",
  "lockMovementY",
  "lockScalingX",
  "lockScalingY",
  "lockRotation",
  "srcFromAttribute",
  "chart",
];
Object.assign(FabricObject.ownDefaults, {
  originX: "left",
  originY: "top",
  cornerColor: "#ffffff",
  cornerStrokeColor: "#754adb",
  borderColor: "#754adb",
  cornerStyle: "circle",
  transparentCorners: false,
  cornerSize: 10,
  borderScaleFactor: 1.4,
  padding: 3,
  objectCaching: false,
});
FabricImage.ownDefaults.srcFromAttribute = true;

export function download(data: string | Blob, filename: string) {
  const url = typeof data === "string" ? data : URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  if (data instanceof Blob) setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export class Editor {
  canvas: Canvas;
  doc!: Design;
  pageIndex = 0;
  zoom = 0.48;
  ready = false;
  busy = false;
  snap = true;
  guides: Guide[] = [];
  saveStatus = "Loading your studio…";
  history: string[] = [];
  historyIndex = -1;
  clipboard: FabricObject | null = null;
  private textRange: { object: Textbox; start: number; end: number } | null =
    null;
  onContextMenu?: (point: { x: number; y: number }) => void;
  onPhotoFrameEdit?: (frame: PhotoFrame) => void;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private textTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private onUpdate: () => void;
  private report: (message: string) => void;

  constructor(
    element: HTMLCanvasElement,
    onUpdate: () => void,
    report: (message: string) => void,
  ) {
    this.onUpdate = onUpdate;
    this.report = report;
    this.canvas = new Canvas(element, {
      preserveObjectStacking: true,
      selectionColor: "#754adb18",
      selectionBorderColor: "#754adb",
      fireRightClick: true,
      stopContextMenu: true,
      selectionKey: ["shiftKey", "ctrlKey", "metaKey"],
    });
    this.canvas.upperCanvasEl.tabIndex = 0;
    this.canvas.upperCanvasEl.setAttribute("aria-label", "Design canvas");
    this.canvas.on("contextmenu", ({ e, target }) => {
      e.preventDefault();
      if (!this.ready || this.busy) return;
      this.canvas.isDrawingMode = false;
      if (
        target &&
        target !== this.selected &&
        !this.canvas.getActiveObjects().includes(target)
      )
        this.select(target);
      else if (!target) this.deselect();
      const event = e as MouseEvent;
      this.onContextMenu?.({ x: event.clientX, y: event.clientY });
    });
    this.canvas.on("selection:created", () => this.notify());
    this.canvas.on("selection:updated", () => this.notify());
    this.canvas.on("selection:cleared", () => this.notify());
    this.canvas.on("text:selection:changed", ({ target }) => {
      if (target instanceof Textbox) {
        this.textRange =
          target.selectionEnd > target.selectionStart
            ? {
                object: target,
                start: target.selectionStart,
                end: target.selectionEnd,
              }
            : null;
        this.notify();
      }
    });
    this.canvas.on("selection:created", () => {
      this.textRange = null;
    });
    this.canvas.on("selection:updated", () => {
      this.textRange = null;
    });
    this.canvas.on("selection:cleared", () => {
      this.textRange = null;
    });
    this.canvas.on("mouse:dblclick", ({ target }) => {
      if (target instanceof PhotoFrame && !target.lockMovementX)
        this.onPhotoFrameEdit?.(target);
    });
    this.canvas.on("object:modified", ({ target, transform }) => {
      this.clearGuides();
      if (target instanceof FabricImage && transform?.action === "drag") {
        const point = target.getCenterPoint(),
          frame = this.photoFrameAt(point.x, point.y);
        if (frame) {
          void this.fillPhotoFrame(frame, target.getSrc(), target).catch(
            (e) => {
              this.commit();
              this.report(e.message);
            },
          );
          return;
        }
      }
      this.commit();
    });
    this.canvas.on("mouse:up", () => this.clearGuides());
    this.canvas.on("path:created", ({ path }) => {
      this.nameObject(path, "Drawing");
      this.commit();
    });
    this.canvas.on("text:changed", () => {
      clearTimeout(this.textTimer);
      this.textTimer = setTimeout(() => this.commit(), 350);
    });
    this.canvas.on("text:editing:exited", () => {
      clearTimeout(this.textTimer);
      this.commit();
    });
    this.canvas.on("object:moving", ({ target }) => {
      if (!this.snap || !this.doc) return;
      target.setCoords();
      const members = this.canvas.getActiveObjects();
      const others = this.objects
        .filter((o) => o !== target && o.visible && !members.includes(o))
        .map((o) => o.getBoundingRect())
        .filter(
          (b) =>
            b.width < this.doc.width * 0.98 ||
            b.height < this.doc.height * 0.98,
        );
      const result = smartGuides(
        target.getBoundingRect(),
        others,
        this.doc.width,
        this.doc.height,
        6 / this.zoom,
      );
      target.set({ left: target.left + result.x, top: target.top + result.y });
      target.setCoords();
      this.guides = result.guides;
      this.notify();
    });
  }
  clearGuides() {
    if (this.guides.length) {
      this.guides = [];
      this.notify();
    }
  }
  notify() {
    if (!this.disposed) this.onUpdate();
  }
  get selected() {
    return this.canvas.getActiveObject() as DesignObject | undefined;
  }
  get objects() {
    return this.canvas.getObjects() as DesignObject[];
  }
  get page() {
    return this.doc?.pages[this.pageIndex];
  }
  get canUndo() {
    return this.historyIndex > 0 && !this.busy;
  }
  get canRedo() {
    return this.historyIndex < this.history.length - 1 && !this.busy;
  }
  get drawing() {
    return this.canvas.isDrawingMode;
  }
  nameObject(object: FabricObject, name: string) {
    Object.assign(object, { id: uid(), name });
    return object;
  }

  async boot() {
    await Promise.all(fonts.map((f) => document.fonts.load(`16px "${f}"`)));
    const designs = await allDesigns();
    if (this.disposed) return;
    if (designs.length) await this.open(designs[0]);
    else await this.create("A little growth", 1080, 1080, templates[0]);
    this.ready = true;
    this.notify();
  }
  private capture() {
    if (!this.doc || !this.page) return;
    this.page.data = this.canvas.toObject();
    this.page.thumbnail = this.canvas.toDataURL({
      format: "png",
      multiplier: 200 / (this.doc.width * this.zoom),
      enableRetinaScaling: false,
    });
  }
  private async renderPage() {
    this.canvas.discardActiveObject();
    this.canvas.isDrawingMode = false;
    await this.canvas.loadFromJSON(this.page.data);
    this.setZoom(this.zoom);
    this.canvas.requestRenderAll();
  }
  async open(design: Design) {
    if (this.busy) return;
    if (this.doc) await this.save();
    this.busy = true;
    this.notify();
    try {
      this.doc = structuredClone(design);
      this.pageIndex = 0;
      await this.renderPage();
      this.history = [];
      this.historyIndex = -1;
      this.busy = false;
      this.commit();
    } finally {
      this.busy = false;
      this.notify();
    }
  }
  async create(
    name: string,
    width: number,
    height: number,
    template?: Template,
  ) {
    if (this.busy) return;
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 64 ||
      height < 64 ||
      width > 8000 ||
      height > 8000 ||
      width * height > 32000000
    )
      throw new Error(
        "Choose dimensions from 64 to 8,000 px, up to 32 megapixels.",
      );
    if (this.doc) await this.save();
    this.busy = true;
    this.notify();
    try {
      this.doc = {
        id: uid(),
        name: name.trim() || "Untitled design",
        width,
        height,
        pages: [this.blankPage()],
        updatedAt: new Date().toISOString(),
      };
      this.pageIndex = 0;
      this.canvas.clear();
      this.canvas.backgroundColor = template?.background || "#ffffff";
      this.setZoom(this.zoom);
      if (template)
        this.canvas.add(...(await templateObjects(template, width, height)));
      this.history = [];
      this.historyIndex = -1;
      this.busy = false;
      this.commit();
    } finally {
      this.busy = false;
      this.notify();
    }
  }
  private blankPage(): DesignPage {
    return {
      id: uid(),
      name: "Untitled page",
      data: { objects: [], background: "#ffffff" },
      thumbnail: "",
    };
  }
  commit() {
    if (this.busy || !this.doc || this.disposed) return;
    this.canvas.requestRenderAll();
    this.capture();
    const value = JSON.stringify({
      doc: { ...this.doc, updatedAt: "" },
      pageIndex: this.pageIndex,
    });
    if (this.history[this.historyIndex] !== value) {
      this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push(value);
      if (this.history.length > 50) this.history.shift();
      this.historyIndex = this.history.length - 1;
    }
    this.doc.updatedAt = new Date().toISOString();
    this.saveStatus = "Saving…";
    clearTimeout(this.saveTimer);
    void this.save().catch(() => {});
    this.notify();
  }
  async save() {
    if (!this.doc) return;
    clearTimeout(this.saveTimer);
    clearTimeout(this.textTimer);
    this.capture();
    const id = this.doc.id,
      version = this.doc.updatedAt;
    try {
      await saveDesign(this.doc);
      if (this.doc.id === id && this.doc.updatedAt === version)
        this.saveStatus = "Saved on this device";
    } catch (error) {
      this.saveStatus = "Save failed — export a backup";
      this.report(
        "Could not save on this device. Download a Forma file to keep your work.",
      );
      throw error;
    } finally {
      this.notify();
    }
  }
  async undo(redo = false) {
    if (this.busy || (redo ? !this.canRedo : !this.canUndo)) return;
    this.busy = true;
    clearTimeout(this.saveTimer);
    this.notify();
    try {
      this.historyIndex += redo ? 1 : -1;
      const state = JSON.parse(this.history[this.historyIndex]);
      this.doc = state.doc;
      this.pageIndex = state.pageIndex;
      await this.renderPage();
      this.doc.updatedAt = new Date().toISOString();
      await this.save();
    } finally {
      this.busy = false;
      this.notify();
    }
  }
  rename(name: string) {
    this.doc.name = name || "Untitled design";
    this.commit();
  }
  setZoom(zoom: number) {
    if (!this.doc) return;
    this.zoom = Math.min(2, Math.max(0.05, zoom));
    this.canvas.setDimensions({
      width: Math.round(this.doc.width * this.zoom),
      height: Math.round(this.doc.height * this.zoom),
    });
    this.canvas.setViewportTransform([this.zoom, 0, 0, this.zoom, 0, 0]);
    // Resizing a canvas clears its bitmap. Repaint in the same frame so rapid
    // wheel/slider events cannot expose a blank canvas between deferred renders.
    this.canvas.renderAll();
    this.notify();
  }
  fit(width: number, height: number) {
    if (this.doc)
      this.setZoom(
        Math.min(
          (width - 100) / this.doc.width,
          (height - 110) / this.doc.height,
          1,
        ),
      );
  }
  add(object: FabricObject, name: string, x?: number, y?: number) {
    if (this.busy) return;
    this.nameObject(object, name);
    object.set({
      left: x ?? (this.doc.width - object.getScaledWidth()) / 2,
      top: y ?? (this.doc.height - object.getScaledHeight()) / 2,
    });
    this.canvas.add(object);
    this.canvas.setActiveObject(object);
    this.commit();
  }
  replaceObject(existing: FabricObject, replacement: FabricObject) {
    if (this.busy || !this.objects.includes(existing as DesignObject)) return;
    const index = this.objects.indexOf(existing as DesignObject);
    replacement.set({
      left: existing.left,
      top: existing.top,
      scaleX: (existing.scaleX * existing.width) / replacement.width,
      scaleY: (existing.scaleY * existing.height) / replacement.height,
      angle: existing.angle,
      skewX: existing.skewX,
      skewY: existing.skewY,
      flipX: existing.flipX,
      flipY: existing.flipY,
      opacity: existing.opacity,
      shadow: existing.shadow,
      originX: existing.originX,
      originY: existing.originY,
    });
    Object.assign(replacement, {
      id: (existing as DesignObject).id,
      name: (existing as DesignObject).name,
    });
    this.canvas.discardActiveObject();
    this.canvas.remove(existing);
    this.canvas.insertAt(index, replacement);
    this.canvas.setActiveObject(replacement);
    replacement.setCoords();
    this.commit();
  }
  async addPhotoFrame(mask: PhotoMask, x?: number, y?: number) {
    const doc = this.doc.id,
      page = this.page.id,
      frame = await PhotoFrame.create(mask);
    if (this.busy || this.doc.id !== doc || this.page.id !== page) return;
    frame.scale((Math.min(this.doc.width, this.doc.height) * 0.38) / 600);
    this.add(
      frame,
      mask.shape === "letter"
        ? `Letter ${mask.letter} frame`
        : `${mask.shape} photo frame`,
      x,
      y,
    );
  }
  photoFrameAt(x: number, y: number) {
    return [...this.objects]
      .reverse()
      .find(
        (o): o is PhotoFrame =>
          o instanceof PhotoFrame &&
          o.visible &&
          !o.lockMovementX &&
          o.containsPoint(new Point(x, y)),
      );
  }
  async fillPhotoFrame(frame: PhotoFrame, src: string, source?: FabricImage) {
    const doc = this.doc.id,
      page = this.page.id,
      baseline = JSON.stringify(frame.photoMask);
    const replacement = await PhotoFrame.create({
      ...frame.photoMask,
      src,
      zoom: 1,
      panX: 0,
      panY: 0,
    });
    if (
      this.busy ||
      this.doc.id !== doc ||
      this.page.id !== page ||
      !this.objects.includes(frame) ||
      JSON.stringify(frame.photoMask) !== baseline ||
      frame.lockMovementX
    )
      throw new Error("The photo frame changed. Drop the image again.");
    if (source) {
      if (!this.objects.includes(source)) return;
      this.canvas.remove(source);
    }
    this.replaceObject(frame, replacement);
  }
  addText(
    kind: "heading" | "subheading" | "body" = "heading",
    x?: number,
    y?: number,
  ) {
    const size = Math.min(this.doc.width, this.doc.height) / 1080;
    const text =
      kind === "heading"
        ? "Add a heading"
        : kind === "subheading"
          ? "Add a subheading"
          : "Your story starts here. Add a little body text.";
    this.add(
      new Textbox(text, {
        width: this.doc.width * 0.65,
        fontSize:
          (kind === "heading" ? 84 : kind === "subheading" ? 48 : 28) * size,
        fontFamily: "Arial",
        fontWeight: kind === "heading" ? "bold" : "normal",
        fill: "#292432",
        lineHeight: 1.2,
      }),
      text,
      x,
      y,
    );
  }
  addShape(kind: string, x?: number, y?: number) {
    const unit = Math.min(this.doc.width, this.doc.height) * 0.22;
    const options = { fill: "#b6a3eb", strokeWidth: 0 };
    let obj: FabricObject;
    if (kind === "circle") obj = new Circle({ radius: unit / 2, ...options });
    else if (kind === "ellipse")
      obj = new Ellipse({ rx: unit * 0.65, ry: unit * 0.4, ...options });
    else if (kind === "triangle")
      obj = new Triangle({ width: unit, height: unit, ...options });
    else if (kind === "line")
      obj = new Line([0, 0, unit * 1.5, 0], {
        stroke: "#292432",
        strokeWidth: 5,
      });
    else if (kind === "star") {
      const points = Array.from({ length: 10 }, (_, i) => {
        const a = (i * Math.PI) / 5 - Math.PI / 2,
          r = i % 2 ? unit * 0.23 : unit * 0.5;
        return { x: unit / 2 + Math.cos(a) * r, y: unit / 2 + Math.sin(a) * r };
      });
      obj = new Polygon(points, options);
    } else if (kind === "heart") {
      obj = new Path(
        "M 50 90 C -20 45 0 -10 50 25 C 100 -10 120 45 50 90 Z",
        options,
      );
      obj.scaleToWidth(unit);
    } else if (kind === "arrow") {
      obj = new Path(
        "M 0 30 L 65 30 L 65 0 L 110 50 L 65 100 L 65 70 L 0 70 Z",
        options,
      );
      obj.scaleToWidth(unit);
    } else
      obj = new Rect({
        width: unit,
        height: unit,
        rx: kind === "rounded" ? unit * 0.15 : 0,
        ry: kind === "rounded" ? unit * 0.15 : 0,
        ...options,
      });
    this.add(obj, kind[0].toUpperCase() + kind.slice(1), x, y);
  }
  async addImage(src: string, name: string, x?: number, y?: number) {
    const frame =
      x !== undefined && y !== undefined
        ? this.photoFrameAt(x, y)
        : this.selected instanceof PhotoFrame
          ? this.selected
          : undefined;
    if (frame && !frame.lockMovementX) {
      await this.fillPhotoFrame(frame, src);
      return;
    }
    const docId = this.doc.id,
      pageId = this.page.id;
    const img = await FabricImage.fromURL(src);
    if (this.doc.id !== docId || this.page.id !== pageId || this.busy) return;
    img.scale(
      Math.min(
        (this.doc.width * 0.65) / img.width,
        (this.doc.height * 0.65) / img.height,
        1,
      ),
    );
    this.add(img, name, x, y);
  }
  addGraphic(id: string, x?: number, y?: number, palette?: string[]) {
    const graphic = graphics.find((g) => g.id === id);
    if (!graphic) return;
    const object = makeGraphic(id, undefined, palette);
    object.scaleToWidth(Math.min(this.doc.width, this.doc.height) * 0.25);
    this.add(object, graphic.name, x, y);
  }
  set(properties: Record<string, unknown>) {
    if (!this.selected || this.busy) return;
    const selected = this.selected;
    if (
      selected instanceof Textbox &&
      this.hasTextRange &&
      Object.keys(properties).every((key) =>
        [
          "fill",
          "stroke",
          "strokeWidth",
          "fontFamily",
          "fontSize",
          "fontWeight",
          "fontStyle",
          "underline",
          "linethrough",
          "charSpacing",
        ].includes(key),
      )
    ) {
      selected.setSelectionStyles(
        properties,
        this.textRange!.start,
        this.textRange!.end,
      );
      selected.dirty = true;
      selected.initDimensions();
      selected.setCoords();
      this.commit();
      return;
    }
    if (selected instanceof Textbox)
      for (const key of Object.keys(properties))
        if (
          [
            "fill",
            "stroke",
            "strokeWidth",
            "fontFamily",
            "fontSize",
            "fontWeight",
            "fontStyle",
            "underline",
            "linethrough",
            "charSpacing",
          ].includes(key)
        )
          selected.removeStyle(key as never);
    const appearance: Record<string, unknown> = {};
    const transforms = { ...properties };
    for (const key of [
      "fill",
      "stroke",
      "strokeWidth",
      ...(selected instanceof ActiveSelection ? ["opacity", "shadow"] : []),
    ]) {
      if (key in transforms && selected instanceof Group) {
        appearance[key] = transforms[key];
        delete transforms[key];
      }
    }
    const paint = Object.fromEntries(
      Object.entries(appearance).filter(([key]) =>
        ["fill", "stroke", "strokeWidth"].includes(key),
      ),
    );
    const effects = Object.fromEntries(
      Object.entries(appearance).filter(([key]) =>
        ["opacity", "shadow"].includes(key),
      ),
    );
    const recolor = (
      object: FabricObject,
      properties: Record<string, unknown>,
    ) => {
      const next = { ...properties };
      if (
        "fill" in next &&
        !object.fill &&
        object.stroke &&
        !(object instanceof Group)
      ) {
        next.stroke = next.fill;
        delete next.fill;
      }
      object.set(next);
    };
    const apply = (object: FabricObject) => {
      if (object instanceof Group) object.getObjects().forEach(apply);
      else if (!(object instanceof FabricImage)) recolor(object, paint);
      object.setCoords();
    };
    if (selected instanceof Group && Object.keys(appearance).length)
      selected.getObjects().forEach((object) => {
        apply(object);
        object.set(effects);
      });
    recolor(selected, transforms);
    this.selected.setCoords();
    this.commit();
  }
  get hasTextRange() {
    return (
      this.selected instanceof Textbox &&
      this.textRange?.object === this.selected &&
      this.textRange.end > this.textRange.start
    );
  }
  textStyle(key: string) {
    const object = this.selected;
    if (!(object instanceof Textbox)) return undefined;
    const style = this.hasTextRange
      ? object.getSelectionStyles(
          this.textRange!.start,
          this.textRange!.end,
          true,
        )[0]
      : null;
    return (
      (style as Record<string, unknown> | undefined)?.[key] ??
      (object as unknown as Record<string, unknown>)[key]
    );
  }
  select(object: FabricObject, additive = false) {
    this.canvas.isDrawingMode = false;
    if (additive) {
      const current = this.canvas.getActiveObjects();
      const next = current.includes(object)
        ? current.filter((o) => o !== object)
        : [...current, object];
      this.canvas.discardActiveObject();
      if (next.length === 1) this.canvas.setActiveObject(next[0]);
      else if (next.length > 1)
        this.canvas.setActiveObject(
          new ActiveSelection(next, { canvas: this.canvas }),
        );
    } else this.canvas.setActiveObject(object);
    this.canvas.requestRenderAll();
    this.notify();
  }
  selectAll() {
    this.canvas.discardActiveObject();
    const objects = this.objects.filter((o) => o.visible && !o.lockMovementX);
    if (objects.length === 1) this.canvas.setActiveObject(objects[0]);
    else if (objects.length > 1)
      this.canvas.setActiveObject(
        new ActiveSelection(objects, { canvas: this.canvas }),
      );
    this.canvas.requestRenderAll();
    this.notify();
  }
  selectRect(
    rect: { left: number; top: number; width: number; height: number },
    additive = false,
  ) {
    const previous = additive ? this.canvas.getActiveObjects() : [];
    this.canvas.discardActiveObject();
    const hits = this.objects.filter((o) => {
      if (!o.visible || o.lockMovementX || !o.selectable) return false;
      o.setCoords();
      const b = o.getBoundingRect();
      return (
        b.left <= rect.left + rect.width &&
        b.left + b.width >= rect.left &&
        b.top <= rect.top + rect.height &&
        b.top + b.height >= rect.top
      );
    });
    const objects = [...new Set([...previous, ...hits])];
    if (objects.length === 1) this.canvas.setActiveObject(objects[0]);
    else if (objects.length > 1)
      this.canvas.setActiveObject(
        new ActiveSelection(objects, { canvas: this.canvas }),
      );
    this.canvas.requestRenderAll();
    this.notify();
  }
  deselect() {
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.notify();
  }
  background(color: string) {
    this.canvas.backgroundColor = color;
    this.commit();
  }
  remove() {
    if (this.busy) return;
    const objects = this.canvas.getActiveObjects();
    this.canvas.discardActiveObject();
    this.canvas.remove(...objects);
    this.commit();
  }
  async copy() {
    if (this.selected) {
      this.clipboard = await this.selected.clone();
      this.report("Copied. Press Ctrl+V to paste.");
      this.notify();
    }
  }
  async cut() {
    const selection = this.selected;
    if (!selection || this.busy) return;
    await this.copy();
    if (this.selected === selection) this.remove();
  }
  async paste() {
    if (!this.clipboard || this.busy) return;
    const clone = await this.clipboard.clone();
    this.canvas.discardActiveObject();
    clone.set({ left: clone.left + 24, top: clone.top + 24 });
    if (clone instanceof ActiveSelection) {
      clone.canvas = this.canvas;
      clone.getObjects().forEach((o) => {
        this.nameObject(o, (o as DesignObject).name || "Copy");
        this.canvas.add(o);
      });
      clone.setCoords();
    } else {
      this.nameObject(clone, (clone as DesignObject).name || "Copy");
      this.canvas.add(clone);
    }
    this.canvas.setActiveObject(clone);
    this.clipboard = await clone.clone();
    this.commit();
  }
  async duplicate() {
    if (!this.selected) return;
    this.clipboard = await this.selected.clone();
    await this.paste();
  }
  group() {
    const selection = this.selected;
    if (selection instanceof ActiveSelection) {
      const objects = selection.getObjects();
      this.canvas.discardActiveObject();
      this.canvas.remove(...objects);
      const group = new Group(objects);
      this.nameObject(group, "Group");
      this.canvas.add(group);
      this.canvas.setActiveObject(group);
      this.commit();
    } else if (selection instanceof Group) {
      const objects = selection.removeAll();
      this.canvas.remove(selection);
      this.canvas.add(...objects);
      this.canvas.setActiveObject(
        new ActiveSelection(objects, { canvas: this.canvas }),
      );
      this.commit();
    }
  }
  lock(object = this.selected) {
    if (!object) return;
    const objects =
      object instanceof ActiveSelection ? object.getObjects() : [object];
    const locked = !objects.some((o) => o.lockMovementX);
    for (const item of new Set([object, ...objects]))
      item.set({
        lockMovementX: locked,
        lockMovementY: locked,
        lockScalingX: locked,
        lockScalingY: locked,
        lockRotation: locked,
      });
    this.commit();
  }
  visibility(object: DesignObject) {
    object.set("visible", !object.visible);
    if (!object.visible) this.deselect();
    this.commit();
  }
  reorder(direction: "front" | "back" | "forward" | "backward") {
    const obj = this.selected;
    if (!obj) return;
    const selected = this.canvas.getActiveObjects();
    const objects = this.objects.filter((o) => selected.includes(o));
    if (direction === "back" || direction === "forward") objects.reverse();
    for (const object of objects) {
      if (direction === "front") this.canvas.bringObjectToFront(object);
      if (direction === "back") this.canvas.sendObjectToBack(object);
      if (direction === "forward") this.canvas.bringObjectForward(object);
      if (direction === "backward") this.canvas.sendObjectBackwards(object);
    }
    this.commit();
  }
  align(where: string) {
    const obj = this.selected;
    if (!obj) return;
    const b = obj.getBoundingRect();
    if (where === "left") obj.left -= b.left;
    if (where === "center")
      obj.left += this.doc.width / 2 - b.left - b.width / 2;
    if (where === "right") obj.left += this.doc.width - b.left - b.width;
    if (where === "top") obj.top -= b.top;
    if (where === "middle")
      obj.top += this.doc.height / 2 - b.top - b.height / 2;
    if (where === "bottom") obj.top += this.doc.height - b.top - b.height;
    obj.setCoords();
    this.commit();
  }
  shadow(enabled: boolean) {
    this.set({
      shadow: enabled
        ? new Shadow({ color: "#00000030", blur: 24, offsetX: 8, offsetY: 12 })
        : null,
    });
  }
  imageFilter(name: string) {
    const obj = this.selected;
    if (!(obj instanceof FabricImage)) return;
    obj.filters =
      name === "mono"
        ? [new filters.Grayscale()]
        : name === "warm"
          ? [new filters.Sepia()]
          : name === "vivid"
            ? [
                new filters.Saturation({ saturation: 0.35 }),
                new filters.Contrast({ contrast: 0.1 }),
              ]
            : [];
    obj.applyFilters();
    this.commit();
  }
  brightness(value: number) {
    const obj = this.selected;
    if (!(obj instanceof FabricImage)) return;
    obj.filters = obj.filters.filter((f) => f.type !== "Brightness");
    obj.filters.push(new filters.Brightness({ brightness: value }));
    obj.applyFilters();
    this.commit();
  }
  crop(square: boolean) {
    const obj = this.selected;
    if (!(obj instanceof FabricImage)) return;
    const size = obj.getOriginalSize();
    const side = Math.min(size.width, size.height);
    obj.set(
      square
        ? {
            cropX: (size.width - side) / 2,
            cropY: (size.height - side) / 2,
            width: side,
            height: side,
          }
        : { cropX: 0, cropY: 0, width: size.width, height: size.height },
    );
    obj.setCoords();
    this.commit();
  }
  draw(enabled: boolean, color = "#754adb", width = 8) {
    this.canvas.isDrawingMode = enabled;
    if (enabled) {
      this.canvas.discardActiveObject();
      const brush = new PencilBrush(this.canvas);
      brush.color = color;
      brush.width = width;
      this.canvas.freeDrawingBrush = brush;
    }
    this.notify();
  }
  async applyTemplate(t: Template) {
    if (this.busy) return;
    this.busy = true;
    this.notify();
    try {
      const objects = await templateObjects(t, this.doc.width, this.doc.height);
      this.canvas.clear();
      this.canvas.backgroundColor = t.background;
      this.canvas.add(...objects);
      this.page.name = t.name;
      this.busy = false;
      this.commit();
    } finally {
      this.busy = false;
      this.notify();
    }
  }
  async changePage(index: number) {
    if (
      this.busy ||
      index === this.pageIndex ||
      index < 0 ||
      index >= this.doc.pages.length
    )
      return;
    this.capture();
    this.busy = true;
    this.notify();
    try {
      this.pageIndex = index;
      await this.renderPage();
    } finally {
      this.busy = false;
      this.notify();
    }
  }
  async addPage(duplicate = false) {
    if (this.busy) return;
    if (this.doc.pages.length >= 100)
      throw new Error("A design can contain up to 100 pages.");
    this.capture();
    const page = duplicate ? structuredClone(this.page) : this.blankPage();
    page.id = uid();
    if (duplicate) page.name += " copy";
    this.doc.pages.splice(this.pageIndex + 1, 0, page);
    await this.changePage(this.pageIndex + 1);
    this.commit();
  }
  async removePage() {
    if (this.doc.pages.length === 1 || this.busy) return;
    this.busy = true;
    this.doc.pages.splice(this.pageIndex, 1);
    this.pageIndex = Math.min(this.pageIndex, this.doc.pages.length - 1);
    try {
      await this.renderPage();
    } finally {
      this.busy = false;
      this.commit();
    }
  }
  movePage(offset: number) {
    const next = this.pageIndex + offset;
    if (next < 0 || next >= this.doc.pages.length) return;
    this.capture();
    [this.doc.pages[next], this.doc.pages[this.pageIndex]] = [
      this.doc.pages[this.pageIndex],
      this.doc.pages[next],
    ];
    this.pageIndex = next;
    this.commit();
  }
  resize(width: number, height: number, scaleContent: boolean) {
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 64 ||
      height < 64 ||
      width > 8000 ||
      height > 8000 ||
      width * height > 32000000
    )
      throw new Error("Use a size from 64 to 8,000 px, up to 32 megapixels.");
    this.canvas.discardActiveObject();
    this.capture();
    if (scaleContent) {
      const sx = width / this.doc.width,
        sy = height / this.doc.height;
      this.doc.pages.forEach((page) => {
        const items = page.data.objects as Record<string, number>[];
        items.forEach((o) => {
          o.left *= sx;
          o.top *= sy;
          o.scaleX = (o.scaleX ?? 1) * sx;
          o.scaleY = (o.scaleY ?? 1) * sy;
        });
      });
      this.objects.forEach((o) => {
        o.set({
          left: o.left * sx,
          top: o.top * sy,
          scaleX: o.scaleX * sx,
          scaleY: o.scaleY * sy,
        });
        o.setCoords();
      });
    }
    this.doc.width = width;
    this.doc.height = height;
    this.setZoom(this.zoom);
    this.commit();
  }
  async importDesign(file: File) {
    if (file.size > 75 * 1024 * 1024)
      throw new Error("Design files must be under 75 MB.");
    const data: unknown = JSON.parse(await file.text());
    validateDesign(data);
    data.id = uid();
    data.name += " (imported)";
    await this.open(data);
  }
  async export(
    format: "png" | "jpeg" | "svg" | "pdf" | "json",
    scale = 1,
    transparent = false,
    allPages = false,
  ) {
    await this.save();
    const file = this.doc.name.replace(/[^a-z0-9 _-]/gi, "").trim() || "design";
    if (format === "json") {
      download(
        new Blob([JSON.stringify(this.doc)], { type: "application/json" }),
        `${file}.forma.json`,
      );
      return;
    }
    if (this.doc.width * this.doc.height * scale * scale > 64000000)
      throw new Error(
        "This export is too large. Choose a smaller export scale.",
      );
    const canvas = new StaticCanvas(undefined, {
      width: this.doc.width,
      height: this.doc.height,
      enableRetinaScaling: false,
    });
    try {
      const pages = allPages || format === "pdf" ? this.doc.pages : [this.page];
      if (format === "pdf") {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({
          orientation:
            this.doc.width > this.doc.height ? "landscape" : "portrait",
          unit: "px",
          format: [this.doc.width, this.doc.height],
          hotfixes: ["px_scaling"],
        });
        for (let i = 0; i < pages.length; i++) {
          await canvas.loadFromJSON(pages[i].data);
          canvas.renderAll();
          if (i)
            pdf.addPage(
              [this.doc.width, this.doc.height],
              this.doc.width > this.doc.height ? "landscape" : "portrait",
            );
          pdf.addImage(
            canvas.toDataURL({ format: "png", multiplier: scale }),
            "PNG",
            0,
            0,
            this.doc.width,
            this.doc.height,
          );
        }
        pdf.save(`${file}.pdf`);
      } else {
        for (let i = 0; i < pages.length; i++) {
          await canvas.loadFromJSON(pages[i].data);
          if (transparent && format !== "jpeg") canvas.backgroundColor = "";
          canvas.renderAll();
          const suffix = pages.length > 1 ? `-${i + 1}` : "";
          if (format === "svg")
            download(
              new Blob([await portableSvg(canvas)], { type: "image/svg+xml" }),
              `${file}${suffix}.svg`,
            );
          else
            download(
              canvas.toDataURL({ format, quality: 0.95, multiplier: scale }),
              `${file}${suffix}.${format === "jpeg" ? "jpg" : format}`,
            );
        }
      }
    } finally {
      await canvas.dispose();
    }
  }
  async presentationImages() {
    this.capture();
    const canvas = new StaticCanvas(undefined, {
      width: this.doc.width,
      height: this.doc.height,
    });
    const images: string[] = [];
    try {
      for (const page of this.doc.pages) {
        await canvas.loadFromJSON(page.data);
        canvas.renderAll();
        images.push(
          canvas.toDataURL({
            format: "png",
            multiplier: Math.min(1, 1600 / this.doc.width),
          }),
        );
      }
    } finally {
      await canvas.dispose();
    }
    return images;
  }
  keyboard(event: KeyboardEvent) {
    const el = event.target as HTMLElement;
    if (
      el.closest(
        'input,textarea,select,[contenteditable="true"],[role="dialog"],[role="menu"]',
      ) ||
      (this.selected instanceof Textbox && this.selected.isEditing) ||
      !this.ready ||
      this.busy
    )
      return;
    const modifier = event.ctrlKey || event.metaKey,
      key = event.key.toLowerCase();
    if (
      (event.shiftKey && event.key === "F10") ||
      event.key === "ContextMenu"
    ) {
      event.preventDefault();
      const box = this.canvas.upperCanvasEl.getBoundingClientRect();
      this.onContextMenu?.({
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      });
      return;
    }
    if (modifier && ["z", "y", "c", "x", "v", "d", "a", "s", "g"].includes(key))
      event.preventDefault();
    if (modifier && key === "z") {
      void this.undo(event.shiftKey);
      return;
    }
    if (modifier && key === "y") {
      void this.undo(true);
      return;
    }
    if (modifier && key === "c") {
      void this.copy();
      return;
    }
    if (modifier && key === "x") {
      void this.cut();
      return;
    }
    if (modifier && key === "v") {
      void this.paste();
      return;
    }
    if (modifier && key === "d") {
      void this.duplicate();
      return;
    }
    if (modifier && key === "s") {
      void this.save().catch(() => {});
      return;
    }
    if (modifier && key === "g") {
      this.group();
      return;
    }
    if (modifier && key === "a") {
      this.selectAll();
      return;
    }
    if (key === "delete" || key === "backspace") {
      event.preventDefault();
      this.remove();
      return;
    }
    if (key === "escape") {
      this.draw(false);
      this.deselect();
      return;
    }
    if (
      this.selected &&
      !this.selected.lockMovementX &&
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      this.set({
        left:
          this.selected.left +
          (event.key === "ArrowLeft"
            ? -step
            : event.key === "ArrowRight"
              ? step
              : 0),
        top:
          this.selected.top +
          (event.key === "ArrowUp"
            ? -step
            : event.key === "ArrowDown"
              ? step
              : 0),
      });
      return;
    }
    if (!modifier && key === "t") this.addText();
    if (!modifier && key === "r") this.addShape("rectangle");
    if (!modifier && key === "c") this.addShape("circle");
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.saveTimer);
    clearTimeout(this.textTimer);
    void this.canvas.dispose();
  }
}
