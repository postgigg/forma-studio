// Run against an isolated Vite dev server. The editor reference is injected only
// into this browser response; no test hook is included in the product bundle.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { saved } from "../scripts/qa-fixture.mjs";
await mkdir(".local/whiteboard-qa", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true, args:["--use-gl=angle","--use-angle=swiftshader","--disable-gpu-compositing"] });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  acceptDownloads: true,
});
const errors = [],
  proof = {};
page.setDefaultTimeout(15000);
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/src/editor.ts*", async (route) => {
  const response = await route.fetch();
  let source = await response.text();
  assert.ok(source.includes("notify() {"));
  source = source.replace("notify() {", "notify() { window.__qaEditor=this;");
  await route.fulfill({ response, body: source });
});
async function hook() {
  await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await page.waitForFunction(() => window.__qaEditor?.ready);
  await page.evaluate(async () => {
    window.__qaFabric = await import(
      performance
        .getEntriesByType("resource")
        .find((r) => r.name.includes("/deps/fabric.js?v=")).name
    );
  });
}
async function scenePoint(x, y) {
  return page.evaluate(
    ({ x, y }) => {
      const e = window.__qaEditor,
        b = e.canvas.upperCanvasEl.getBoundingClientRect();
      return { x: b.left + x * e.zoom, y: b.top + y * e.zoom };
    },
    { x, y },
  );
}
async function drag(from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}
try {
  await page.goto(process.env.FORMA_TEST_URL || "http://127.0.0.1:5186/");
  await page.getByLabel("Design title", { exact: true }).waitFor();
  await hook();
  await page
    .getByRole("button", { name: "New blank design", exact: true })
    .click();
  await page.getByRole("button", { name: /^Whiteboard 4000/ }).click();
  await page
    .getByLabel("Design name", { exact: true })
    .fill("Whiteboard interaction proof");
  await page
    .getByRole("button", { name: "Create design", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sticky note", exact: true })
    .waitFor();
  assert.equal((await saved(page)).kind, "whiteboard");
  proof.creation = true;
  await page.getByRole("button", { name: "Container", exact: true }).click();
  await page
    .getByLabel("Board card text", { exact: true })
    .fill("CAMPAIGN PLAN");
  await page.getByRole("button", { name: "Sticky note", exact: true }).click();
  await page
    .getByLabel("Board card text", { exact: true })
    .fill("Clarify the audience");
  const first = await page.evaluate(() => {
    const e = window.__qaEditor,
      c = e.objects.find((o) => o.boardCard?.kind === "container"),
      s = e.objects.find((o) => o.boardCard?.kind === "sticky");
    return {
      container: c.toObject(),
      sticky: s.toObject(),
      parent: s.boardParentId,
      zoom: e.zoom,
    };
  });
  assert.equal(first.parent, first.container.id);
  assert.ok(first.zoom >= 0.6);
  const from = await page.evaluate(() => {
    const e = window.__qaEditor,
      c = e.objects.find((o) => o.boardCard?.kind === "container"),
      b = c.getBoundingRect();
    return { x: b.left + 100, y: b.top + 25 };
  });
  await drag(
    await scenePoint(from.x, from.y),
    await scenePoint(from.x + 80, from.y + 65),
  );
  const moved = await page.evaluate(() => {
    const e = window.__qaEditor;
    return {
      container: e.objects
        .find((o) => o.boardCard?.kind === "container")
        .toObject(),
      sticky: e.objects.find((o) => o.boardCard?.kind === "sticky").toObject(),
    };
  });
  assert.ok(Math.abs(moved.sticky.left - first.sticky.left - 80) < 3);
  assert.ok(Math.abs(moved.sticky.top - first.sticky.top - 65) < 3);
  proof.containerContentsFollow = true;
  await page.getByRole("button", { name: "Sticky note", exact: true }).click();
  await page
    .getByLabel("Board card text", { exact: true })
    .fill("Choose a strong visual direction");
  const cards = await page.evaluate(() =>
    window.__qaEditor.objects
      .filter((o) => o.boardCard?.kind === "sticky")
      .map((o) => o.getBoundingRect()),
  );
  assert.ok(cards[0].left !== cards[1].left || cards[0].top !== cards[1].top);
  proof.newCardsDoNotOverlap = true;
  // Put two notes and an obstruction in a clear, visible test area, then use real pointer controls.
  await page.evaluate(async () => {
    const e = window.__qaEditor;
    const { Rect } = window.__qaFabric;
    e.canvas.discardActiveObject();
    const sticky = e.objects.filter((o) => o.boardCard?.kind === "sticky");
    sticky[0].set({ left: 450, top: 500 });
    sticky[1].set({ left: 1550, top: 500 });
    e.objects
      .find((o) => o.boardCard?.kind === "container")
      .set({ left: 400, top: 400, scaleX: 1.4, scaleY: 1.2 });
    const obstruction = new Rect({
      left: 1020,
      top: 400,
      width: 220,
      height: 480,
      fill: "#d7e7ef",
      strokeWidth: 0,
    });
    e.nameObject(obstruction, "Reference image placeholder");
    e.canvas.add(obstruction);
    e.objects.forEach((o) => o.setCoords());
    e.commit();
  });
  await page
    .getByLabel("Canvas zoom preset", { exact: true })
    .selectOption("0.5");
  await page.evaluate(() => {
    const stage = document.querySelector(".canvas-stage");
    stage.scrollLeft = 0;
    stage.scrollTop = 100;
    window.__qaEditor.canvas.calcOffset();
  });
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await drag(await scenePoint(620, 625), await scenePoint(1720, 625));
  const connection = await page.evaluate(() => {
    const e = window.__qaEditor,
      c = e.objects.find((o) => o.connector);
    return c
      ? {
          id: c.id,
          data: c.connector,
          points: c.routePoints,
          blocked: c.blocked,
        }
      : null;
  });
  assert.ok(connection?.data.start.nodeId && connection.data.end.nodeId);
  assert.equal(connection.blocked, false);
  assert.ok(connection.points.length > 3);
  proof.pointerConnection = connection;
  await page
    .getByLabel("Connector label", { exact: true })
    .fill("Develop the idea");
  await page
    .getByLabel("Connector pattern", { exact: true })
    .selectOption("dashed");
  await page
    .getByLabel("Connector endHead", { exact: true })
    .selectOption("dot");
  const handle = await page.evaluate(() => {
    const c = window.__qaEditor.selected;
    return { x: c.oCoords.bend.x, y: c.oCoords.bend.y };
  });
  const canvasBox = await page.locator(".upper-canvas").boundingBox();
  await drag(
    { x: canvasBox.x + handle.x, y: canvasBox.y + handle.y },
    { x: canvasBox.x + handle.x, y: canvasBox.y + handle.y + 100 },
  );
  const bent = await page.evaluate(
    () => window.__qaEditor.objects.find((o) => o.connector).connector.bend,
  );
  assert.ok(bent);
  proof.bendHandle = bent;
  await page.getByRole("tab", { name: /Comments/ }).click();
  await page
    .getByLabel("New board comment", { exact: true })
    .fill("Check this connection before launch");
  await page
    .getByRole("button", { name: "Place comment on board", exact: true })
    .click();
  await page.mouse.click(
    (await scenePoint(620, 625)).x,
    (await scenePoint(620, 625)).y,
  );
  assert.equal((await saved(page)).pages[0].comments.length, 1);
  assert.ok((await saved(page)).pages[0].comments[0].nodeId);
  proof.commentPlacement = true;
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  assert.equal(await page.locator(".board-comment-pin").count(), 0);
  await page.getByRole("button", { name: "Reopen", exact: true }).click();
  assert.equal(await page.locator(".board-comment-pin").count(), 1);
  const before = await saved(page);
  await page.reload();
  await page.getByLabel("Design title", { exact: true }).waitFor();
  await hook();
  const after = await saved(page);
  assert.deepEqual(after.pages[0].comments, before.pages[0].comments);
  assert.deepEqual(
    after.pages[0].data.objects.find((o) => o.connector).connector,
    before.pages[0].data.objects.find((o) => o.connector).connector,
  );
  proof.persistence = true;
  await page.getByRole("tab", { name: "Build", exact: true }).click();
  await page.getByRole("button", { name: "Marker", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Marker", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page.evaluate(() => window.__qaEditor.drawingTool),
    "marker",
  );
  await drag(await scenePoint(700, 1000), await scenePoint(1100, 1100));
  assert.ok(
    (await saved(page)).pages[0].data.objects.some(
      (o) => o.inkTool === "marker",
    ),
  );
  proof.marker = true;
  await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await page
    .getByRole("button", { name: "Stroke eraser", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() => window.__qaEditor.drawingTool),
    "eraser",
  );
  await drag(await scenePoint(700, 1000), await scenePoint(1100, 1100));
  assert.equal(
    (await saved(page)).pages[0].data.objects.filter(
      (o) => o.inkTool === "marker",
    ).length,
    0,
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  assert.ok(
    (await saved(page)).pages[0].data.objects.some(
      (o) => o.inkTool === "marker",
    ),
  );
  proof.eraserUndo = true;
  await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await page.screenshot({
    path: ".local/whiteboard-qa/board.png",
    fullPage: true,
  });

  // Keyboard movement of a container should carry its contents, just like pointer movement.
  const keyboardBefore = await page.evaluate(() => {
    const e = window.__qaEditor,
      c = e.objects.find((o) => o.boardCard?.kind === "container"),
      n = e.objects.find((o) => o.boardParentId === c.id);
    e.canvas.setActiveObject(c);
    e.notify();
    return { container: c.getCenterPoint(), child: n?.getCenterPoint() };
  });
  await page.locator(".upper-canvas").focus();
  await page.keyboard.press("Shift+ArrowRight");
  const keyboardAfter = await page.evaluate(() => {
    const e = window.__qaEditor,
      c = e.objects.find((o) => o.boardCard?.kind === "container"),
      n = e.objects.find((o) => o.boardParentId === c.id);
    return { container: c.getCenterPoint(), child: n?.getCenterPoint() };
  });
  assert.ok(
    Math.abs(keyboardAfter.container.x - keyboardBefore.container.x - 10) < 0.1,
  );
  assert.ok(
    Math.abs(keyboardAfter.child.x - keyboardBefore.child.x - 10) < 0.1,
  );
  proof.keyboardContainer = true;
  await page.evaluate(async () => {
    const e = window.__qaEditor,
      { ActiveSelection } = window.__qaFabric;
    e.canvas.discardActiveObject();
    e.canvas.setActiveObject(
      new ActiveSelection(
        e.objects.filter((o) => o.boardCard?.kind === "sticky"),
        { canvas: e.canvas },
      ),
    );
    e.notify();
  });
  await page.getByRole("tab", { name: "Build", exact: true }).click();
  await page
    .getByRole("button", { name: "Connect two selected objects", exact: true })
    .click();
  assert.equal(
    (await saved(page)).pages[0].data.objects.filter((o) => o.connector).length,
    2,
  );
  proof.connectSelection = true;
  // Real resize handle, with an attached arrow following the changed bounds.
  const resizeBefore = await page.evaluate(() => {
    const e = window.__qaEditor,
      n = e.objects.find((o) => o.boardCard?.kind === "sticky");
    e.canvas.setActiveObject(n);
    e.board.focus(n.getCenterPoint());
    e.notify();
    return { id: n.id, bounds: n.getBoundingRect() };
  });
  await page.waitForTimeout(100);
  const corner = await page.evaluate(
      () => window.__qaEditor.selected.oCoords.br,
    ),
    cb = await page.locator(".upper-canvas").boundingBox();
  await drag(
    { x: cb.x + corner.x, y: cb.y + corner.y },
    { x: cb.x + corner.x + 50, y: cb.y + corner.y + 35 },
  );
  const resizeAfter = await page.evaluate((id) => {
    const e = window.__qaEditor,
      n = e.board.node(id);
    return {
      bounds: n.getBoundingRect(),
      endpoints: e.objects
        .filter((o) => o.connector)
        .map((o) => o.connector.start),
    };
  }, resizeBefore.id);
  assert.ok(resizeAfter.bounds.width > resizeBefore.bounds.width + 40);
  assert.ok(
    resizeAfter.endpoints.every(
      (p) =>
        Math.abs(p.x - (resizeAfter.bounds.left + resizeAfter.bounds.width)) <
        0.1,
    ),
  );
  proof.resizeAttachment = true;

  // Drag a real endpoint to a free spot, then reattach it to the original note.
  const endpointNode = await page.evaluate(() => {
    const e = window.__qaEditor,
      c = e.objects.find((o) => o.connector);
    e.canvas.setActiveObject(c);
    e.board.focus(c.connector.start);
    e.notify();
    return {
      id: c.connector.start.nodeId,
      point: { ...c.connector.start },
      center: e.board.node(c.connector.start.nodeId).getCenterPoint(),
    };
  });
  await page.waitForTimeout(100);
  let endpointControl = await page.evaluate(
      () => window.__qaEditor.selected.oCoords.start,
    ),
    endpointCanvas = await page.locator(".upper-canvas").boundingBox();
  const freePoint = await scenePoint(
    endpointNode.point.x - 80,
    endpointNode.point.y - 330,
  );
  await drag(
    {
      x: endpointCanvas.x + endpointControl.x,
      y: endpointCanvas.y + endpointControl.y,
    },
    freePoint,
  );
  assert.equal(
    await page.evaluate(
      () => window.__qaEditor.selected.connector.start.nodeId,
    ),
    undefined,
  );
  endpointControl = await page.evaluate(
    () => window.__qaEditor.selected.oCoords.start,
  );
  endpointCanvas = await page.locator(".upper-canvas").boundingBox();
  await drag(
    {
      x: endpointCanvas.x + endpointControl.x,
      y: endpointCanvas.y + endpointControl.y,
    },
    await scenePoint(endpointNode.center.x, endpointNode.center.y),
  );
  assert.equal(
    await page.evaluate(
      () => window.__qaEditor.selected.connector.start.nodeId,
    ),
    endpointNode.id,
  );
  proof.endpointHandles = true;
  // Group two attached nodes, then move and duplicate the group without losing identities.
  await page.evaluate(async () => {
    const e = window.__qaEditor,
      { ActiveSelection } = window.__qaFabric;
    e.canvas.discardActiveObject();
    e.canvas.setActiveObject(
      new ActiveSelection(
        e.objects.filter((o) => o.boardCard?.kind === "sticky"),
        { canvas: e.canvas },
      ),
    );
    e.notify();
  });
  await page.locator(".upper-canvas").focus();
  await page.keyboard.press("Control+g");
  const groupedBefore = await page.evaluate(() => {
    const e = window.__qaEditor;
    return {
      id: e.selected.id,
      bounds: e.board
        .node(e.objects.find((o) => o.connector).connector.start.nodeId)
        .getBoundingRect(),
    };
  });
  await page.keyboard.press("Shift+ArrowDown");
  const groupMoved = await page.evaluate(() => {
    const e = window.__qaEditor;
    return {
      bounds: e.board
        .node(e.objects.find((o) => o.connector).connector.start.nodeId)
        .getBoundingRect(),
      start: e.objects.find((o) => o.connector).connector.start,
    };
  });
  assert.ok(
    Math.abs(groupMoved.bounds.top - groupedBefore.bounds.top - 10) < 0.1,
  );
  assert.ok(groupMoved.start.nodeId);
  await page.keyboard.press("Control+d");
  await page.waitForTimeout(150);
  const ids = await page.evaluate(() =>
    window.__qaEditor.board.nodes().map((o) => o.id),
  );
  assert.equal(new Set(ids).size, ids.length);
  proof.groupAndDuplicate = true;
  // Copy a selection containing connectors as well as nodes.
  await page.evaluate(async () => {
    const e = window.__qaEditor,
      { ActiveSelection } = window.__qaFabric;
    e.canvas.discardActiveObject();
    e.canvas.setActiveObject(
      new ActiveSelection(e.objects, { canvas: e.canvas }),
    );
    e.notify();
  });
  await page.locator(".upper-canvas").focus();
  await page.keyboard.press("Control+d");
  await page.waitForFunction(
    () => window.__qaEditor.objects.filter((o) => o.connector).length === 4,
  );
  const selectedConnections = await page.evaluate(() => {
    const e = window.__qaEditor;
    return e.objects
      .filter((o) => o.connector)
      .map((o) => {
        const p = o.getPointByOrigin("center", "center");
        return {
          id: o.id,
          data: o.connector,
          pathOffset: o.pathOffset,
          center: o.getCenterPoint(),
          points: o.routePoints,
          group: !!o.group,
        };
      });
  });
  assert.equal(selectedConnections.length, 4);
  for (const c of selectedConnections) {
    const xs = c.points.map((p) => p.x),
      ys = c.points.map((p) => p.y);
    assert.ok(
      Math.abs(c.center.x - (Math.min(...xs) + Math.max(...xs)) / 2) < 5,
      JSON.stringify(c),
    );
    assert.ok(
      Math.abs(c.center.y - (Math.min(...ys) + Math.max(...ys)) / 2) < 5,
      JSON.stringify(c),
    );
  }
  proof.multiSelectionConnectorCopy = true;
  // Reset to a predictable simple board for free connector scaling, comment and SVG export checks.
  await page.evaluate(async () => {
    const e = window.__qaEditor,
      BoardConnector =
        window.__qaFabric.classRegistry.getClass("BoardConnector");
    e.canvas.discardActiveObject();
    e.canvas.remove(...e.objects);
    e.page.comments = [];
    const c = new BoardConnector({
      ...e.board.defaults,
      start: { x: 300, y: 300 },
      end: { x: 1600, y: 700 },
      bend: { x: 900, y: 100 },
      label: "Approved & ready",
      pattern: "dotted",
      endHead: "dot",
    });
    e.nameObject(c, "Approval connector");
    e.canvas.add(c);
    e.board.addComment("Export omits this private comment", { x: 400, y: 400 });
    e.commit();
    await e.addPage(true);
    e.resize(6000, 3900, true);
    await e.save();
  });
  const scaled = await saved(page),
    scaledConnector = scaled.pages[0].data.objects.find(
      (o) => o.connector,
    ).connector;
  assert.equal(scaledConnector.start.x, 450);
  assert.equal(scaledConnector.end.y, 1050);
  assert.equal(scaledConnector.bend.x, 1350);
  assert.equal(scaled.pages[0].comments[0].x, 600);
  assert.equal(scaled.pages.length, 2);
  assert.equal(
    scaled.pages[1].data.objects.find((o) => o.connector).connector.start.x,
    450,
  );
  assert.equal(scaled.pages[1].comments[0].x, 600);
  proof.scaleFreeConnections = true;
  proof.multiplePages = true;
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("File type", { exact: true }).selectOption("svg");
  let download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await (await download).saveAs(".local/whiteboard-qa/board.svg");
  const { readFile } = await import("node:fs/promises");
  const svg = await readFile(".local/whiteboard-qa/board.svg", "utf8");
  assert.ok(svg.includes("Approved &amp; ready"));
  assert.ok(svg.includes("<circle"));
  assert.ok(svg.includes("DM Sans"));
  assert.ok(!svg.includes("Export omits this private comment"));
  proof.svgExport = true;

  await page
    .getByLabel("Canvas zoom preset", { exact: true })
    .selectOption("1");
  await page.evaluate(() => {
    const stage = document.querySelector(".canvas-stage");
    stage.scrollLeft = 400;
    stage.scrollTop = 200;
    window.__qaEditor.canvas.calcOffset();
  });
  const panBefore = await page
    .locator(".canvas-stage")
    .evaluate((s) => ({ x: s.scrollLeft, y: s.scrollTop }));
  const stageBox = await page.locator(".canvas-stage").boundingBox();
  await page.locator(".upper-canvas").focus();
  await page.keyboard.down("Space");
  await page.mouse.move(stageBox.x + 250, stageBox.y + 250);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 210, stageBox.y + 210, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  const panAfter = await page
    .locator(".canvas-stage")
    .evaluate((s) => ({ x: s.scrollLeft, y: s.scrollTop }));
  assert.ok(panAfter.x - panBefore.x > 35 && panAfter.y - panBefore.y > 35);
  assert.equal(
    await page.evaluate(() => window.__qaEditor.board.panning),
    false,
  );
  proof.pan = true;
  proof.errors = errors;
  assert.deepEqual(errors, []);
  await writeFile(
    ".local/whiteboard-qa/proof.json",
    JSON.stringify(proof, null, 2),
  );
  console.log(JSON.stringify(proof));
} catch (e) {
  console.log(JSON.stringify({ errors }));
  await page.screenshot({
    path: ".local/whiteboard-qa/failure.png",
    fullPage: true,
  });
  await writeFile(
    ".local/whiteboard-qa/failure.txt",
    await page.locator("body").innerText(),
  );
  throw e;
} finally {
  await browser.close();
}
