import {
  ActiveSelection,
  Group,
  Rect,
  Textbox,
  Pattern,
  Point,
  util,
  type FabricObject,
  type TMat2D,
} from "fabric";
import type { Editor, DesignObject } from "./editor";
import { uid, type BoardComment } from "./types";
import { BoardConnector } from "./board-connector";
import {
  anchor,
  routeConnector,
  type BoardPoint,
  type BoardBox,
  type ConnectorData,
} from "../shared/whiteboard.mjs";
export interface BoardCard {
  kind: "sticky" | "container";
  text: string;
  color: string;
}
export type BoardObject = DesignObject & {
  boardCard?: BoardCard;
  boardParentId?: string;
};
const client = (event: Event) => {
  const e =
    (event as TouchEvent).touches?.[0] ||
    (event as TouchEvent).changedTouches?.[0] ||
    (event as MouseEvent);
  return { x: e.clientX, y: e.clientY };
};
const defaults = (): Omit<ConnectorData, "start" | "end"> => ({
  style: "elbow",
  pattern: "solid",
  color: "#754adb",
  width: 4,
  startHead: "none",
  endHead: "arrow",
  label: "",
});
export class WhiteboardController {
  connecting = false;
  panning = false;
  commenting = false;
  selectedComment: string | null = null;
  private commentDraft = "";
  defaults = defaults();
  private draft: BoardConnector | null = null;
  private startNode: BoardObject | null = null;
  private keyup = (event: KeyboardEvent) => {
    if (event.code === "Space" && this.panning) this.mode("select");
  };
  private blur = () => {
    if (this.panning || this.connecting || this.commenting) this.mode("select");
  };
  private pan?: { x: number; y: number; left: number; top: number };
  private positions = new Map<string, BoardPoint>();
  private frame = 0;
  private refreshing = false;
  private planes = new WeakMap<BoardConnector, TMat2D>();
  private routes = new WeakMap<
    BoardConnector,
    { key: string; points: BoardPoint[]; blocked: boolean }
  >();
  constructor(private editor: Editor) {
    const canvas = editor.canvas;
    window.addEventListener("keyup", this.keyup);
    window.addEventListener("blur", this.blur);
    canvas.on("mouse:down", (event) => {
      if ("button" in event.e && event.e.button !== 0) return;
      if (this.commenting) {
        const point = canvas.getScenePoint(event.e),
          node = this.hit(point.x, point.y);
        this.addComment(this.commentDraft, point, node);
        this.mode("select");
        return;
      }
      if (this.panning) {
        const stage = canvas.upperCanvasEl.closest(
          ".canvas-stage",
        ) as HTMLElement | null;
        if (stage) {
          const p = client(event.e);
          this.pan = {
            x: p.x,
            y: p.y,
            left: stage.scrollLeft,
            top: stage.scrollTop,
          };
        }
        return;
      }
      if (!this.connecting || !editor.doc) return;
      const point = canvas.getScenePoint(event.e),
        node = this.hit(point.x, point.y);
      this.startNode = node || null;
      const start = {
        x: point.x,
        y: point.y,
        ...(node?.id ? { nodeId: node.id, side: "auto" as const } : {}),
      };
      this.draft = new BoardConnector(
        { ...this.defaults, start, end: { x: point.x + 1, y: point.y + 1 } },
        { selectable: false, evented: false, excludeFromExport: true },
      );
      canvas.add(this.draft);
    });
    canvas.on("mouse:move", (event) => {
      if (this.pan) {
        const stage = canvas.upperCanvasEl.closest(
          ".canvas-stage",
        ) as HTMLElement | null;
        if (stage) {
          const p = client(event.e);
          stage.scrollLeft = this.pan.left - (p.x - this.pan.x);
          stage.scrollTop = this.pan.top - (p.y - this.pan.y);
        }
        return;
      }
      if (!this.draft) return;
      const point = canvas.getScenePoint(event.e),
        node = this.hit(point.x, point.y);
      this.draft.connector.end = {
        x: point.x,
        y: point.y,
        ...(node?.id && node !== this.startNode
          ? { nodeId: node.id, side: "auto" as const }
          : {}),
      };
      this.route(this.draft);
      canvas.requestRenderAll();
    });
    canvas.on("mouse:up", () => {
      this.pan = undefined;
      if (!this.draft) return;
      const connector = this.draft;
      this.draft = null;
      if (
        Math.hypot(
          connector.connector.end.x - connector.connector.start.x,
          connector.connector.end.y - connector.connector.start.y,
        ) < 12
      ) {
        canvas.remove(connector);
        canvas.requestRenderAll();
        return;
      }
      connector.set({
        selectable: true,
        evented: true,
        excludeFromExport: false,
      });
      editor.nameObject(connector, "Smart connector");
      this.mode("select");
      canvas.setActiveObject(connector);
      editor.commit();
      editor.onShowProperties?.();
    });
    canvas.on("object:moving", () => this.moving(true));
    for (const type of ["object:scaling", "object:rotating"] as const)
      canvas.on(type, () => this.moving(false));
    for (const type of ["selection:created", "selection:updated"] as const)
      canvas.on(type, () => this.refresh(false));
  }
  get active() {
    return this.editor.doc?.kind === "whiteboard";
  }
  enable() {
    this.editor.doc.kind = "whiteboard";
    this.editor.page.boardGrid ||= "plain";
    this.editor.commit();
  }
  async create() {
    this.mode("select");
    await this.editor.create("Untitled whiteboard", 4000, 2600);
    this.enable();
    this.grid("dots");
    this.editor.setZoom(0.3);
  }
  mode(mode: "select" | "connect" | "pan" | "comment") {
    const canvas = this.editor.canvas;
    this.editor.draw(false);
    this.connecting = mode === "connect";
    this.panning = mode === "pan";
    this.commenting = mode === "comment";
    this.pan = undefined;
    canvas.discardActiveObject();
    canvas.selection = mode === "select";
    canvas.skipTargetFind = mode !== "select";
    canvas.defaultCursor =
      mode === "pan"
        ? "grab"
        : mode === "connect" || mode === "comment"
          ? "crosshair"
          : "default";
    if (this.draft) {
      canvas.remove(this.draft);
      this.draft = null;
    }
    this.editor.notify();
    canvas.requestRenderAll();
  }
  hit(x: number, y: number): BoardObject | undefined {
    return [...this.editor.objects]
      .reverse()
      .find(
        (o) =>
          o.visible &&
          !(o instanceof BoardConnector) &&
          !o.inkTool &&
          o.evented &&
          o.containsPoint(new Point(x, y)),
      ) as BoardObject | undefined;
  }
  private allNodes() {
    const nodes: BoardObject[] = [];
    const visit = (objects: FabricObject[]) =>
      objects.forEach((object) => {
        nodes.push(object as BoardObject);
        if (object instanceof Group && !(object instanceof ActiveSelection))
          visit(object.getObjects());
      });
    visit(this.editor.objects);
    return nodes;
  }
  nodes() {
    return this.allNodes().filter(
      (o) => o.id && !(o instanceof BoardConnector),
    );
  }
  node(id?: string) {
    return id ? this.allNodes().find((o) => o.id === id) : undefined;
  }
  private obstacles() {
    return this.allNodes()
      .filter(
        (o) =>
          o.visible &&
          !(o instanceof BoardConnector) &&
          !o.inkTool &&
          o.width > 6 &&
          o.height > 6,
      )
      .map((o) => o.getBoundingRect());
  }
  private route(
    connector: BoardConnector,
    obstacles: BoardBox[] = this.obstacles(),
  ) {
    const d = connector.connector,
      start = this.node(d.start.nodeId),
      end = this.node(d.end.nodeId);
    const startToward = end ? end.getCenterPoint() : d.end,
      endToward = start ? start.getCenterPoint() : d.start;
    const a = start
        ? anchor(start.getBoundingRect(), startToward, d.start.side)
        : d.start,
      b = end ? anchor(end.getBoundingRect(), endToward, d.end.side) : d.end;
    d.start = { ...d.start, x: a.x, y: a.y };
    d.end = { ...d.end, x: b.x, y: b.y };
    const key = JSON.stringify([a, b, obstacles, d.bend, d.style]),
      cached = this.routes.get(connector),
      route =
        cached?.key === key
          ? cached
          : routeConnector(a, b, obstacles, d.bend, d.style);
    this.routes.set(connector, { key, ...route });
    connector.setRoute(route.points, route.blocked);
    connector.onBend = () => {
      this.route(connector);
      this.editor.notify();
    };
    connector.onEndpoint = (which, point) => {
      const target = this.hit(point.x, point.y),
        other = d[which === "start" ? "end" : "start"];
      d[which] = {
        ...point,
        ...(target?.id && target.id !== other.nodeId
          ? { nodeId: target.id, side: "auto" as const }
          : {}),
      };
      this.route(connector);
      this.editor.notify();
    };
  }
  refresh(membership = true) {
    if (this.refreshing || !this.editor.doc) return;
    this.refreshing = true;
    try {
      if (membership && this.active) this.membership();
      const nodes = this.allNodes(),
        ids = new Set(nodes.map((o) => o.id)),
        obstacles = this.obstacles();
      for (const object of this.editor.objects) {
        if (!(object instanceof BoardConnector) || object === this.draft)
          continue;
        for (const end of [object.connector.start, object.connector.end])
          if (end.nodeId && !ids.has(end.nodeId)) {
            delete end.nodeId;
            delete end.side;
          }
        this.route(object, obstacles);
        if (object.group)
          this.planes.set(object, [...object.group.calcTransformMatrix()]);
      }
      for (const object of nodes)
        if (object.id && object.boardCard?.kind === "container")
          this.positions.set(object.id, object.getCenterPoint());
      for (const comment of this.editor.page?.comments || []) {
        const node = this.node(comment.nodeId);
        if (node) {
          const b = node.getBoundingRect();
          comment.x = b.left + b.width;
          comment.y = b.top;
        } else if (comment.nodeId) delete comment.nodeId;
      }
    } finally {
      this.refreshing = false;
    }
  }
  private moving(moveContents: boolean) {
    const selection = this.editor.canvas.getActiveObjects();
    for (const item of selection) {
      if (!(item instanceof BoardConnector) || !item.group) continue;
      const now = item.group.calcTransformMatrix(),
        before = this.planes.get(item);
      if (before) {
        const delta = util.multiplyTransformMatrices(
          now,
          util.invertTransform(before),
        );
        for (const p of [
          !item.connector.start.nodeId ? item.connector.start : undefined,
          !item.connector.end.nodeId ? item.connector.end : undefined,
          item.connector.bend,
        ])
          if (p) {
            const next = new Point(p.x, p.y).transform(delta);
            p.x = next.x;
            p.y = next.y;
          }
      }
      this.planes.set(item, [...now]);
    }
    for (const container of this.allNodes().filter(
      (o) => o.id && o.boardCard?.kind === "container",
    )) {
      const before = this.positions.get(container.id!),
        now = container.getCenterPoint();
      if (moveContents && before && (before.x !== now.x || before.y !== now.y))
        for (const item of this.editor.objects as BoardObject[]) {
          if (item.boardParentId !== container.id || selection.includes(item))
            continue;
          item.set({
            left: item.left + now.x - before.x,
            top: item.top + now.y - before.y,
          });
          item.setCoords();
        }
      this.positions.set(container.id!, now);
    }
    // One route pass per animation frame; final commit performs an immediate pass.
    if (!this.frame)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.refresh(false);
        this.editor.canvas.requestRenderAll();
        this.editor.notify();
      });
  }
  translateContents() {
    this.moving(true);
  }
  private membership() {
    const containers = (this.editor.objects as BoardObject[]).filter(
      (o) => o.boardCard?.kind === "container",
    );
    for (const object of this.editor.objects as BoardObject[]) {
      if (
        object instanceof BoardConnector ||
        object.boardCard?.kind === "container"
      )
        continue;
      const box = object.getBoundingRect(),
        parents = containers
          .filter((c) => {
            const b = c.getBoundingRect();
            return (
              box.left >= b.left + 8 &&
              box.top >= b.top + 55 &&
              box.left + box.width <= b.left + b.width - 8 &&
              box.top + box.height <= b.top + b.height - 8
            );
          })
          .sort((a, b) => a.width * a.height - b.width * b.height);
      if (parents[0]) object.boardParentId = parents[0].id;
      else delete object.boardParentId;
    }
  }
  private visibleCenter() {
    const canvas = this.editor.canvas.upperCanvasEl.getBoundingClientRect(),
      stage = this.editor.canvas.upperCanvasEl
        .closest(".canvas-stage")
        ?.getBoundingClientRect();
    return stage
      ? {
          x:
            ((Math.max(canvas.left, stage.left) +
              Math.min(canvas.right, stage.right)) /
              2 -
              canvas.left) /
            this.editor.zoom,
          y:
            ((Math.max(canvas.top, stage.top) +
              Math.min(canvas.bottom, stage.bottom)) /
              2 -
              canvas.top) /
            this.editor.zoom,
        }
      : { x: this.editor.doc.width / 2, y: this.editor.doc.height / 2 };
  }
  focus(point: BoardPoint) {
    window.dispatchEvent(
      new CustomEvent("forma:board-focus", { detail: point }),
    );
  }
  private cardPosition(w: number, h: number, parent?: BoardObject) {
    const doc = this.editor.doc,
      box = parent?.getBoundingRect(),
      center = box
        ? {
            x: box.left + box.width / 2,
            y: box.top + 55 + (box.height - 55) / 2,
          }
        : this.visibleCenter();
    const obstacles = this.editor.objects
      .filter(
        (o) => !(o instanceof BoardConnector) && !o.inkTool && o !== parent,
      )
      .map((o) => o.getBoundingRect());
    const clamp = (x: number, y: number) => ({
      x: Math.max(8, Math.min(doc.width - w - 8, x)),
      y: Math.max(8, Math.min(doc.height - h - 8, y)),
    });
    const origin = clamp(center.x - w / 2, center.y - h / 2);
    for (let r = 0; r < 18; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const p = clamp(origin.x + dx * (w + 36), origin.y + dy * (h + 36));
          if (
            !obstacles.some(
              (b) =>
                p.x < b.left + b.width + 16 &&
                p.x + w + 16 > b.left &&
                p.y < b.top + b.height + 16 &&
                p.y + h + 16 > b.top,
            )
          )
            return p;
        }
    return origin;
  }
  addCard(kind: "sticky" | "container") {
    const selected = this.editor.selected as BoardObject | undefined,
      parent =
        kind === "sticky" && selected?.boardCard?.kind === "container"
          ? selected
          : undefined;
    this.mode("select");
    const scale = kind === "sticky" ? { w: 340, h: 250 } : { w: 620, h: 430 },
      text = kind === "sticky" ? "Write your idea" : "Container title",
      color = kind === "sticky" ? "#fff0a6" : "#f4f0fb",
      position = this.cardPosition(scale.w, scale.h, parent);
    const box = new Rect({
      left: 0,
      top: 0,
      width: scale.w,
      height: scale.h,
      rx: kind === "sticky" ? 3 : 16,
      ry: kind === "sticky" ? 3 : 16,
      fill: color,
      stroke: kind === "container" ? "#b9acd0" : "#e5d595",
      strokeWidth: 2,
    });
    const title = new Textbox(text, {
      left: 26,
      top: kind === "sticky" ? 25 : 17,
      width: scale.w - 52,
      fontFamily: "DM Sans",
      fontSize: kind === "sticky" ? 27 : 28,
      fontWeight: kind === "container" ? 650 : 400,
      fill: "#292432",
      lineHeight: 1.2,
      editable: true,
    });
    const card = new Group([box, title], {
      left: position.x,
      top: position.y,
      subTargetCheck: true,
    });
    (card as BoardObject).boardCard = { kind, text, color };
    this.editor.nameObject(
      card,
      kind === "sticky" ? "Sticky note" : "Container",
    );
    this.editor.canvas.add(card);
    if (kind === "container") this.editor.canvas.sendObjectToBack(card);
    this.editor.canvas.setActiveObject(card);
    this.editor.commit();
    this.editor.onShowProperties?.();
    this.focus(card.getCenterPoint());
    return card;
  }
  editCard(card: BoardObject, patch: Partial<BoardCard>) {
    const data = card.boardCard;
    if (!data || !(card instanceof Group)) return;
    const next = { ...data, ...patch };
    (card as BoardObject).boardCard = next;
    const box = card.getObjects()[0] as Rect,
      title = card.getObjects()[1] as Textbox;
    title.set({ text: next.text });
    box.set({ fill: next.color });
    if (next.kind === "sticky") {
      box.set({ height: Math.max(250, title.height + 55) });
      card.triggerLayout();
    }
    card.setCoords();
    this.editor.commit();
  }
  connectSelection() {
    const objects = this.editor.canvas
      .getActiveObjects()
      .filter((o) => !(o instanceof BoardConnector));
    if (objects.length !== 2) throw new Error("Select two objects to connect.");
    this.mode("select");
    const [a, b] = objects.map((o) => o as BoardObject),
      start = a.getCenterPoint(),
      end = b.getCenterPoint();
    const connector = new BoardConnector({
      ...this.defaults,
      start: { ...start, nodeId: a.id, side: "auto" },
      end: { ...end, nodeId: b.id, side: "auto" },
    });
    this.editor.nameObject(connector, "Smart connector");
    this.editor.canvas.add(connector);
    this.editor.canvas.setActiveObject(connector);
    this.editor.commit();
    this.editor.onShowProperties?.();
    return connector;
  }
  editConnector(connector: BoardConnector, patch: Partial<ConnectorData>) {
    connector.connector = { ...connector.connector, ...patch };
    this.editor.commit();
  }
  placeComment(text: string) {
    if (!text.trim()) return;
    if ((this.editor.page.comments?.length || 0) >= 200)
      throw new Error("Use up to 200 comments per board.");
    this.commentDraft = text;
    this.mode("comment");
  }
  addComment(text: string, point?: BoardPoint, target?: BoardObject) {
    if (this.editor.liveAccess === 'view') throw new Error('This session is view only.');
    const value = text.trim();
    if (!value) return;
    if ((this.editor.page.comments?.length || 0) >= 200)
      throw new Error("Use up to 200 comments per board.");
    const node = point ? target : this.editor.selected,
      box = node?.getBoundingRect(),
      center = point || this.visibleCenter();
    const comment: BoardComment = {
      id: uid(),
      text: value.slice(0, 4000),
      x: box ? box.left + box.width : center.x,
      y: box?.top ?? center.y,
      resolved: false,
      createdAt: new Date().toISOString(),
      ...(this.editor.liveAuthor ? {authorId:this.editor.liveAuthor.id,authorName:this.editor.liveAuthor.name} : {}),
      ...(node?.id ? { nodeId: node.id } : {}),
    };
    (this.editor.page.comments ||= []).push(comment);
    this.selectedComment = comment.id;
    this.editor.commit();
  }
  reviewPoint(point: BoardPoint) {
    const node=this.hit(point.x,point.y);
    if(this.commenting&&this.editor.liveAccess==='comment'){
      this.addComment(this.commentDraft,point,node);this.mode('select');
    }else if(node)this.editor.select(node);else this.editor.deselect();
  }
  commentPoint(comment: BoardComment) {
    const node = this.node(comment.nodeId);
    if (node) {
      const b = node.getBoundingRect();
      return { x: b.left + b.width, y: b.top };
    }
    return comment;
  }
  grid(style: "dots" | "plain") {
    this.editor.page.boardGrid = style;
    if (style === "dots") {
      const tile = document.createElement("canvas");
      tile.width = tile.height = 40;
      const ctx = tile.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 40, 40);
      ctx.fillStyle = "#d8d1e3";
      ctx.beginPath();
      ctx.arc(20, 20, 1.3, 0, Math.PI * 2);
      ctx.fill();
      this.editor.canvas.backgroundColor = new Pattern({
        source: tile,
        repeat: "repeat",
      });
    } else this.editor.canvas.backgroundColor = "#ffffff";
    this.editor.commit();
  }
  reidentifyClone(clone: FabricObject) {
    const nodes: BoardObject[] = [],
      visit = (o: FabricObject) => {
        nodes.push(o as BoardObject);
        if (o instanceof Group) o.getObjects().forEach(visit);
      };
    visit(clone);
    const ids = new Map<string, string>();
    for (const node of nodes)
      if (node.id) {
        const next = uid();
        ids.set(node.id, next);
        node.id = next;
      }
    for (const node of nodes) {
      if (node instanceof BoardConnector) {
        for (const end of [node.connector.start, node.connector.end])
          if (end.nodeId && ids.has(end.nodeId))
            end.nodeId = ids.get(end.nodeId);
        for (const p of [
          node.connector.start,
          node.connector.end,
          node.connector.bend,
        ])
          if (p) {
            p.x += 24;
            p.y += 24;
          }
      }
      const parent = (node as BoardObject).boardParentId;
      if (parent && ids.has(parent))
        (node as BoardObject).boardParentId = ids.get(parent);
    }
  }
  scaleContent(sx: number, sy: number) {
    const scale = (d: ConnectorData) => {
      for (const point of [d.start, d.end, d.bend])
        if (point) {
          point.x *= sx;
          point.y *= sy;
        }
    };
    for (const page of this.editor.doc.pages) {
      for (const c of page.comments || []) {
        c.x *= sx;
        c.y *= sy;
      }
      const visit = (objects: any[]) =>
        objects.forEach((o) => {
          if (o.connector) scale(o.connector);
          if (o.objects) visit(o.objects);
        });
      visit(page.data.objects as any[]);
    }
    for (const object of this.allNodes())
      if (object instanceof BoardConnector) scale(object.connector);
    this.positions.clear();
  }
  destroy() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener("keyup", this.keyup);
    window.removeEventListener("blur", this.blur);
  }
}
