import { test, expect, type Page, type Download } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Design } from "../src/types";

async function savedDesign(page: Page): Promise<Design> {
  return page.evaluate(
    () =>
      new Promise<Design>((resolve, reject) => {
        const request = indexedDB.open("forma-studio");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction("workspace", "readonly")
            .objectStore("workspace")
            .getAll();
          read.onsuccess = () => {
            const docs = read.result
              .filter((d: any) => d?.pages)
              .sort((a: any, b: any) => b.updatedAt.localeCompare(a.updatedAt));
            db.close();
            resolve(docs[0]);
          };
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
        };
      }),
  );
}
async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    "A little growth",
  );
  await expect
    .poll(async () => !!(await savedDesign(page))?.pages?.[0]?.data?.objects)
    .toBeTruthy();
}
async function blank(page: Page, name = "Test design", w = 1080, h = 1080) {
  await page.getByRole("button", { name: "My designs", exact: true }).click();
  await page.getByRole("button", { name: "New design", exact: true }).click();
  await page.getByLabel("Design name", { exact: true }).fill(name);
  await page.getByLabel("Width (px)", { exact: true }).fill(String(w));
  await page.getByLabel("Height (px)", { exact: true }).fill(String(h));
  await page
    .getByRole("button", { name: "Create design", exact: true })
    .click();
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    name,
  );
  await expect.poll(async () => (await savedDesign(page))?.name).toBe(name);
}
async function exported(page: Page, type: string): Promise<Buffer> {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("File type", { exact: true }).selectOption(type);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const item = await downloaded;
  const file = await item.path();
  expect(file).toBeTruthy();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return readFile(file!);
}
async function canvasClick(
  page: Page,
  x: number,
  y: number,
  options: {
    button?: "left" | "right";
    modifiers?: ("Shift" | "Control")[];
  } = {},
) {
  const canvas = page.locator(".upper-canvas");
  const box = (await canvas.boundingBox())!;
  await canvas.click({
    position: { x: (x * box.width) / 1080, y: (y * box.height) / 1080 },
    ...options,
  });
}
test("right-click preserves multiple selection and provides group, duplicate, delete, and undo actions", async ({
  page,
}) => {
  await ready(page);
  await blank(page, "Context actions");
  await page.getByRole("button", { name: "Elements", exact: true }).click();
  await page
    .getByRole("button", { name: "Add rectangle", exact: true })
    .click();
  await page.getByLabel("X position", { exact: true }).fill("100");
  await page.getByLabel("Y position", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Add circle", exact: true }).click();
  await page.getByLabel("X position", { exact: true }).fill("650");
  await page.getByLabel("Y position", { exact: true }).fill("650");
  await canvasClick(page, 200, 200);
  await canvasClick(page, 750, 750, { modifiers: ["Shift"] });
  await expect(page.locator(".selection-label")).toHaveText("2 selected");
  await canvasClick(page, 200, 200, { button: "right" });
  const menu = page.getByRole("menu", { name: "Selection actions" });
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("2 elements selected");
  await page.screenshot({ path: "test-results/selection-menu.png" });
  await menu
    .getByRole("menuitem", { name: "Group selection", exact: false })
    .click();
  await expect
    .poll(
      async () =>
        ((await savedDesign(page)).pages[0].data.objects as any[]).length,
    )
    .toBe(1);
  let objects = (await savedDesign(page)).pages[0].data.objects as any[];
  expect(objects[0].objects).toHaveLength(2);
  await canvasClick(page, 200, 200, { button: "right" });
  await menu.getByRole("menuitem", { name: "Ungroup", exact: false }).click();
  await expect
    .poll(
      async () =>
        ((await savedDesign(page)).pages[0].data.objects as any[]).length,
    )
    .toBe(2);
  objects = (await savedDesign(page)).pages[0].data.objects as any[];
  expect(objects[0].left).toBeCloseTo(100);
  expect(objects[1].left).toBeCloseTo(650);
  await page.keyboard.press("Shift+F10");
  await menu.getByRole("menuitem", { name: "Duplicate", exact: false }).click();
  await expect
    .poll(
      async () =>
        ((await savedDesign(page)).pages[0].data.objects as any[]).length,
    )
    .toBe(4);
  await canvasClick(page, 200, 200, { button: "right" });
  await expect(menu).toContainText("2 elements selected");
  await menu
    .getByRole("menuitem", { name: "Delete selection", exact: false })
    .click();
  await expect
    .poll(
      async () =>
        ((await savedDesign(page)).pages[0].data.objects as any[]).length,
    )
    .toBe(2);
  await page.keyboard.press("Control+z");
  await expect
    .poll(
      async () =>
        ((await savedDesign(page)).pages[0].data.objects as any[]).length,
    )
    .toBe(4);
});
test("supports Ctrl-click, layer multi-selection, drag-box selection, and persistent locking", async ({
  page,
}) => {
  await ready(page);
  await blank(page, "Multiple selection");
  await page.getByRole("button", { name: "Elements", exact: true }).click();
  for (const [shape, x, y] of [
    ["rectangle", 100, 100],
    ["circle", 650, 650],
  ] as const) {
    await page
      .getByRole("button", { name: `Add ${shape}`, exact: true })
      .click();
    await page.getByLabel("X position", { exact: true }).fill(String(x));
    await page.getByLabel("Y position", { exact: true }).fill(String(y));
  }
  await canvasClick(page, 200, 200);
  await canvasClick(page, 750, 750, { modifiers: ["Control"] });
  await expect(page.locator(".selection-label")).toHaveText("2 selected");
  await page.keyboard.press("Escape");
  const box = (await page.locator(".upper-canvas").boundingBox())!,
    z = box.width / 1080;
  await page.mouse.move(box.x + 50 * z, box.y + 50 * z);
  await page.mouse.down();
  await page.mouse.move(box.x + 950 * z, box.y + 950 * z, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".selection-label")).toHaveText("2 selected");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Layers/ }).click();
  await page.locator(".layer-select").filter({ hasText: "Rectangle" }).click();
  await page
    .locator(".layer-select")
    .filter({ hasText: "Circle" })
    .click({ modifiers: ["Shift"] });
  await expect(page.locator(".layer-row.selected")).toHaveCount(2);
  await page
    .locator(".layer-select")
    .filter({ hasText: "Rectangle" })
    .click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Selection actions" });
  await expect(menu).toContainText("2 elements selected");
  await menu
    .getByRole("menuitem", { name: "Lock selection", exact: true })
    .click();
  await expect
    .poll(async () =>
      ((await savedDesign(page)).pages[0].data.objects as any[]).every(
        (o) => o.lockMovementX,
      ),
    )
    .toBe(true);
  await page.reload();
  await page.getByRole("button", { name: /^Layers/ }).click();
  await expect(
    page.getByRole("button", { name: "Unlock Rectangle", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Unlock Circle", exact: true }),
  ).toBeVisible();
});
test("adds generated transparent stickers and editable graphics, persists them, and reimports their project", async ({
  page,
}) => {
  await ready(page);
  await blank(page, "Sticker collection");
  await page.getByRole("button", { name: "Elements", exact: true }).click();
  await expect(page.locator(".sticker-grid img")).toHaveCount(12);
  for (const name of [
    "Clay daisy",
    "Pearl ribbon",
    "Paper botanicals",
    "Hello sunshine",
  ]) {
    await page
      .getByRole("button", { name: `Add ${name}`, exact: true })
      .click();
    await expect(page.locator(".selection-label")).toHaveText(name);
  }
  const alpha = await page.evaluate(async () => {
    const image = new Image();
    image.src = "/elements/daisy-sticker.png";
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return {
      corner: ctx.getImageData(0, 0, 1, 1).data[3],
      center: ctx.getImageData(image.width / 2, image.height / 2, 1, 1).data[3],
    };
  });
  expect(alpha.corner).toBe(0);
  expect(alpha.center).toBeGreaterThan(240);
  await page.getByLabel('Graphic collection').selectOption('Studio essentials');
  await page
    .getByRole("button", { name: "Add Soft sparkle", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        ((await savedDesign(page)).pages[0].data.objects as any[]).length,
    )
    .toBe(5);
  const json = JSON.parse((await exported(page, "json")).toString());
  expect(
    json.pages[0].data.objects.filter(
      (o: any) => o.type.toLowerCase() === "image",
    ),
  ).toHaveLength(4);
  await page.screenshot({ path: "test-results/elements-library.png" });
  await page.reload();
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    "Sticker collection",
  );
  json.name = "Reimported stickers";
  await page.locator('input[type=file][accept=".json"]').setInputFiles({
    name: "stickers.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(json)),
  });
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    "Reimported stickers (imported)",
  );
  await expect
    .poll(
      async () =>
        ((await savedDesign(page)).pages[0].data.objects as any[]).length,
    )
    .toBe(5);
});
test("opens a real completed Codex job as editable layers without replacing the previous design", async ({
  page,
}) => {
  const jobId = process.env.FORMA_AI_TEST_JOB;
  test.skip(
    !jobId,
    "Set FORMA_AI_TEST_JOB to a completed local Codex job ID for the live integration check.",
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.evaluate(
    (id) => sessionStorage.setItem("forma:ai-job", id!),
    jobId,
  );
  await page.getByRole("button", { name: "AI Designer", exact: true }).click();
  const open = page.getByRole("button", {
    name: "Open editable design",
    exact: false,
  });
  await expect(open).toBeVisible({ timeout: 30000 });
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    "A little growth",
  );
  await open.click();
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    /LEAF & LIGHT/,
  );
  await expect
    .poll(
      async () =>
        ((await savedDesign(page)).pages[0].data.objects as any[])?.length,
    )
    .toBeGreaterThan(8);
  await page.screenshot({
    path: "test-results/ai-designer.png",
    fullPage: true,
  });
  await page
    .locator(".canvas-container")
    .screenshot({ path: "test-results/ai-output.png" });
  await page.getByRole("button", { name: /^Layers/ }).click();
  await page
    .locator(".layer-select")
    .filter({ hasText: "Brand masthead" })
    .click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await page
    .getByLabel("Text content", { exact: true })
    .fill("MY EDITABLE BRAND");
  await expect
    .poll(async () =>
      ((await savedDesign(page)).pages[0].data.objects as any[]).some(
        (o) => o.text === "MY EDITABLE BRAND",
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "My designs", exact: true }).click();
  await expect(
    page.locator(".project-card").filter({ hasText: "A little growth" }),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});
test("annotation: visible zoom controls change the canvas, keyboard and wheel zoom work, and crossed-out tips are removed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 730 });
  await ready(page);
  await expect(page.getByText("Made to move", { exact: true })).toHaveCount(0);
  const canvas = page.locator(".upper-canvas"),
    before = (await canvas.boundingBox())!.width;
  await page
    .getByRole("button", { name: "Zoom canvas out", exact: true })
    .click();
  await expect
    .poll(async () => (await canvas.boundingBox())!.width)
    .toBeLessThan(before * 0.85);
  await page
    .getByLabel("Canvas zoom preset", { exact: true })
    .selectOption("0.25");
  await expect
    .poll(async () => (await canvas.boundingBox())!.width)
    .toBeCloseTo(270, 0);
  await canvas.focus();
  await page.keyboard.press("Control+-");
  await expect
    .poll(async () => (await canvas.boundingBox())!.width)
    .toBeCloseTo(216, 0);
  await page.keyboard.press("Control+0");
  await expect
    .poll(async () => (await canvas.boundingBox())!.width)
    .toBeGreaterThan(216);
  const fitted = (await canvas.boundingBox())!.width;
  await canvas.hover();
  await page.mouse.wheel(0, 160);
  await expect
    .poll(async () => (await canvas.boundingBox())!.width)
    .toBeLessThan(fitted);
  expect(
    (await page.locator(".workspace-footer").boundingBox())!.y,
  ).toBeLessThan(730);
});
test("opens a complete editor without runtime errors and renders editable template layers", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  const doc = await savedDesign(page);
  expect(doc.pages[0].data.objects).toHaveLength(13);
  await page.getByRole("button", { name: /^Layers/ }).click();
  await page.locator(".layer-select").filter({ hasText: "Headline" }).click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(page.getByLabel("Text content", { exact: true })).toHaveValue(
    "Make room\nfor a little\ngrowth.",
  );
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "test-results/editor-desktop.png",
    fullPage: true,
  });
});
test("edits text, drags, resizes, rotates, undoes, redoes, and restores after reload", async ({
  page,
}) => {
  await ready(page);
  await blank(page, "Persisted typography");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByRole("button", { name: "Add a heading", exact: true })
    .click();
  await page
    .getByLabel("Text content", { exact: true })
    .fill("Something worth making");
  await page.getByLabel("Font family", { exact: true }).selectOption("Georgia");
  await page.getByLabel("Font size", { exact: true }).fill("70");
  await page.getByLabel("Rotation", { exact: true }).fill("12");
  await page
    .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
    .click();
  await page.getByRole("button", { name: /^Layers/ }).click();
  await page
    .locator(".layer-select")
    .filter({ hasText: "Add a heading" })
    .click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(page.getByLabel("Rotation", { exact: true })).toHaveValue("0");
  await page
    .getByRole("button", { name: "Redo (Ctrl+Shift+Z)", exact: true })
    .click();
  await page.getByRole("button", { name: /^Layers/ }).click();
  await page
    .locator(".layer-select")
    .filter({ hasText: "Add a heading" })
    .click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(page.getByLabel("Rotation", { exact: true })).toHaveValue("12");
  await page.getByLabel("Rotation", { exact: true }).fill("0");
  await page.getByLabel("Element width", { exact: true }).fill("500");
  const before = +(await page
    .getByLabel("X position", { exact: true })
    .inputValue());
  const top = +(await page
    .getByLabel("Y position", { exact: true })
    .inputValue());
  const canvas = (await page.locator(".upper-canvas").boundingBox())!;
  const z = canvas.width / 1080;
  await page.mouse.move(
    canvas.x + (before + 40) * z,
    canvas.y + (top + 30) * z,
  );
  await page.mouse.down();
  await page.mouse.move(
    canvas.x + (before + 160) * z,
    canvas.y + (top + 120) * z,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        +(await page.getByLabel("X position", { exact: true }).inputValue()),
    )
    .toBeGreaterThan(before + 80);
  await expect
    .poll(
      async () =>
        ((await savedDesign(page)).pages[0].data.objects as any[])[0]?.text,
    )
    .toBe("Something worth making");
  const doc = await savedDesign(page);
  expect((doc.pages[0].data.objects as any[])[0].fontFamily).toBe("Georgia");
  await page.reload();
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    "Persisted typography",
  );
  expect(
    ((await savedDesign(page)).pages[0].data.objects as any[])[0].left,
  ).toBeGreaterThan(before + 80);
});
test("groups elements, preserves their positions, and supports clipboard, layers, and deletion undo", async ({
  page,
}) => {
  await ready(page);
  await blank(page, "Layers and groups");
  await page.getByRole("button", { name: "Elements", exact: true }).click();
  await page
    .getByRole("button", { name: "Add rectangle", exact: true })
    .click();
  await page.getByLabel("X position", { exact: true }).fill("100");
  await page.getByLabel("Y position", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Add circle", exact: true }).click();
  await page.getByLabel("X position", { exact: true }).fill("500");
  await page
    .getByRole("button", { name: "Hide properties and layers", exact: true })
    .focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+g");
  await expect
    .poll(
      async () =>
        ((await savedDesign(page)).pages[0].data.objects as any[])?.length,
    )
    .toBe(1);
  let grouped = ((await savedDesign(page)).pages[0].data.objects as any[])[0];
  expect(grouped.type.toLowerCase()).toBe("group");
  expect(grouped.objects).toHaveLength(2);
  await page.keyboard.press("Control+g");
  await expect
    .poll(
      async () =>
        ((await savedDesign(page)).pages[0].data.objects as any[])?.length,
    )
    .toBe(2);
  const objects = (await savedDesign(page)).pages[0].data.objects as any[];
  expect(objects[0].left).toBeCloseTo(100);
  expect(objects[1].left).toBeCloseTo(500);
  await page.keyboard.press("Control+d");
  await expect
    .poll(
      async () =>
        ((await savedDesign(page)).pages[0].data.objects as any[])?.length,
    )
    .toBe(4);
  await page.keyboard.press("Delete");
  await expect
    .poll(
      async () =>
        ((await savedDesign(page)).pages[0].data.objects as any[])?.length,
    )
    .toBe(2);
  await page.keyboard.press("Control+z");
  await expect
    .poll(
      async () =>
        ((await savedDesign(page)).pages[0].data.objects as any[])?.length,
    )
    .toBe(4);
});
test("uploads real images, crops, filters, and keeps image data after reopening", async ({
  page,
}) => {
  await ready(page);
  await blank(page, "Image project");
  await page.getByRole("button", { name: "Uploads", exact: true }).click();
  await page
    .locator('input[type=file][accept^="image/"]')
    .setInputFiles(path.resolve("public/photos/plants.jpg"));
  await expect(
    page.getByRole("button", { name: "Crop to square", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Crop to square", exact: true })
    .click();
  await page.getByRole("button", { name: "mono", exact: true }).click();
  await expect
    .poll(
      async () =>
        ((await savedDesign(page)).pages[0].data.objects as any[])[0]?.filters
          ?.length,
    )
    .toBe(1);
  const object = ((await savedDesign(page)).pages[0].data.objects as any[])[0];
  expect(object.src).toMatch(/^data:image\/jpeg;base64,/);
  expect(object.width).toBe(object.height);
  expect(object.filters[0].type).toBe("Grayscale");
  await page.reload();
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    "Image project",
  );
  await page.getByRole("button", { name: "Uploads", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add plants.jpg", exact: true }),
  ).toBeVisible();
  const png = await exported(page, "png");
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1080);
});
test("manages multiple pages and creates valid PNG, JPG, SVG, PDF, and editable exports", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("button", { name: "Duplicate page", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Apply The creative edit template",
      exact: true,
    })
    .click();
  await page.getByLabel("Page name", { exact: true }).fill("Second page");
  await expect.poll(async () => (await savedDesign(page)).pages.length).toBe(2);
  await page
    .getByRole("button", { name: "Move page earlier", exact: true })
    .click();
  await expect
    .poll(async () => (await savedDesign(page)).pages[0].name)
    .toBe("Second page");
  const png = await exported(page, "png");
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(png.readUInt32BE(16)).toBe(1080);
  const jpg = await exported(page, "jpeg");
  expect(jpg.subarray(0, 2).toString("hex")).toBe("ffd8");
  const svg = await exported(page, "svg");
  expect(svg.toString()).toContain("<svg");
  const svgText = await page.evaluate(
    (source) =>
      new DOMParser()
        .parseFromString(source, "image/svg+xml")
        .documentElement.textContent?.replace(/\s+/g, ""),
    svg.toString(),
  );
  expect(svgText).toContain("Ideas");
  const pdf = await exported(page, "pdf");
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(2);
  const json = await exported(page, "json");
  const doc = JSON.parse(json.toString());
  expect(doc.pages).toHaveLength(2);
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page
    .getByRole("button", { name: "Import a Forma design file", exact: true })
    .click();
  await page.locator('input[type=file][accept=".json"]').setInputFiles({
    name: "roundtrip.forma.json",
    mimeType: "application/json",
    buffer: json,
  });
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    "A little growth (imported)",
  );
  await expect.poll(async () => (await savedDesign(page)).pages.length).toBe(2);
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Presentation" }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByAltText("Slide 2")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("draws editable strokes and saves brand colors", async ({ page }) => {
  await ready(page);
  await blank(page, "Drawing");
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  await page
    .getByRole("button", { name: "Start drawing", exact: true })
    .click();
  const b = (await page.locator(".upper-canvas").boundingBox())!;
  await page.mouse.move(b.x + 60, b.y + 60);
  await page.mouse.down();
  await page.mouse.move(b.x + 130, b.y + 110, { steps: 8 });
  await page.mouse.move(b.x + 200, b.y + 60, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await expect
    .poll(async () =>
      (
        (await savedDesign(page)).pages[0].data.objects as any[]
      )[0]?.type.toLowerCase(),
    )
    .toBe("path");
  await page.getByRole("button", { name: "Brand", exact: true }).click();
  await page
    .getByRole("button", { name: "Add brand color", exact: true })
    .click();
  await expect(
    page.getByLabel("Edit brand color 5", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    "Drawing",
  );
  await page.getByRole("button", { name: "Brand", exact: true }).click();
  await expect(
    page.getByLabel("Edit brand color 5", { exact: true }),
  ).toBeVisible();
});
test("small screens retain canvas, library toggle, and element properties", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await expect(page.locator(".asset-panel")).toHaveCount(0);
  await expect(page.locator(".upper-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByRole("button", { name: "Add a heading", exact: true })
    .click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByRole("button", { name: "Show properties and layers", exact: true })
    .click();
  await expect(page.getByLabel("Text content", { exact: true })).toBeVisible();
  await page.getByLabel("Text content", { exact: true }).fill("Made on mobile");
  await expect
    .poll(async () =>
      ((await savedDesign(page)).pages[0].data.objects as any[]).some(
        (o) => o.text === "Made on mobile",
      ),
    )
    .toBeTruthy();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/editor-mobile.png",
    fullPage: true,
  });
});
test("annotation: sidebar collapses, retains selection and tab, remembers preference, and has no toolbar slogan", async ({
  page,
}) => {
  await ready(page);
  await expect(
    page.getByText("Let’s make something great.", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^Layers/ }).click();
  await page.locator(".layer-select").filter({ hasText: "Headline" }).click();
  const width = (await page.locator(".canvas-stage").boundingBox())!.width;
  await page
    .getByRole("button", { name: "Hide properties and layers", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Design properties" }),
  ).toHaveCount(0);
  const show = page.getByRole("button", {
    name: "Show properties and layers",
    exact: true,
  });
  await expect(show).toHaveAttribute("aria-expanded", "false");
  expect(
    (await page.locator(".canvas-stage").boundingBox())!.width,
  ).toBeGreaterThan(width + 200);
  await show.click();
  await expect(page.locator(".layer-row.selected")).toContainText("Headline");
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(page.getByLabel("Text content", { exact: true })).toHaveValue(
    "Make room\nfor a little\ngrowth.",
  );
  await page
    .getByRole("button", { name: "Hide properties and layers", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Show properties and layers",
      exact: true,
    }),
  ).toBeVisible();
});
