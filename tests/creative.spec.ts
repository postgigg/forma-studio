import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { fixture, importFixture, saved } from "../scripts/qa-fixture.mjs";

async function importDesign(page: Page, design: any) {
  await page.goto("/");
  await page.getByLabel("Design title", { exact: true }).waitFor();
  await page
    .locator('input[type=file][accept=".json"]')
    .setInputFiles({
      name: "creative-proof.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(design)),
    });
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    design.name + " (imported)",
  );
  await expect
    .poll(
      async () => ((await saved(page)) as any)?.pages[0].data.objects.length,
    )
    .toBe(design.pages[0].data.objects.length);
}
async function objects(page: Page) {
  return ((await saved(page)) as any).pages[0].data.objects as any[];
}
async function selectLayer(page: Page, name: string) {
  await page.getByRole("button", { name: /^Layers/ }).click();
  await page.locator(".layer-select").filter({ hasText: name }).click();
}

test("highlighted words keep independent colors and weight; whole text accepts a gradient", async ({
  page,
}) => {
  const design = structuredClone(fixture);
  design.name = "Multicolor text proof";
  design.pages[0].data.objects = [
    {
      type: "Textbox",
      id: "text",
      name: "Styled words",
      originX: "left",
      originY: "top",
      left: 100,
      top: 300,
      width: 850,
      fontSize: 72,
      fontFamily: "Arial",
      fontWeight: "normal",
      fill: "#302639",
      text: "Warm words shine",
      strokeWidth: 0,
    },
  ];
  await importDesign(page, design);
  const canvas = page.locator(".upper-canvas"),
    b = (await canvas.boundingBox())!,
    z = b.width / 1080;
  await canvas.dblclick({ position: { x: 180 * z, y: 335 * z } });
  await page.keyboard.press("Control+a");
  await page.keyboard.press("ArrowLeft");
  for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "Quick bold", exact: true }).click();
  await page
    .getByRole("button", { name: "Text color and gradient", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "Text color" })).toContainText(
    "selected characters",
  );
  await page.getByLabel("Text fill color", { exact: true }).fill("#ec6a50");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect
    .poll(async () => JSON.stringify((await objects(page))[0].styles))
    .toContain("#ec6a50");
  let text = (await objects(page))[0];
  expect(text.fill).toBe("#302639");
  expect(text.fontWeight).toBe("normal");
  expect(text.styles[0]).toMatchObject({
    start: 0,
    end: 4,
    style: { fill: "#ec6a50", fontWeight: "bold" },
  });
  await page.reload();
  await selectLayer(page, "Styled words");
  await page
    .getByRole("button", { name: "Text color and gradient", exact: true })
    .click();
  await page.getByRole("tab", { name: "Gradient", exact: true }).click();
  await page
    .getByRole("button", { name: "Apply text gradient", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect
    .poll(async () => (await objects(page))[0].fill.type)
    .toBe("linear");
  text = (await objects(page))[0];
  expect(JSON.stringify(text.styles)).toContain("bold");
  expect(JSON.stringify(text.styles)).not.toContain("#ec6a50");
  await page.screenshot({ path: "test-results/multicolor-text-gradient.png" });
});

test("brand graphics support palette-color replacement, continuous gradients, and native reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Elements", exact: true }).click();
  await page.getByRole("button", { name: "Graphics", exact: true }).click();
  await page
    .getByLabel("Graphic collection", { exact: true })
    .selectOption("Noir atelier");
  await expect(page.locator(".graphic-grid button")).toHaveCount(10);
  await page.locator(".graphic-grid button").first().click();
  const original = (await objects(page)).at(-1);
  await expect
    .poll(async () => (await objects(page)).at(-1)?.type)
    .toBe("Group");
  await page
    .getByRole("button", { name: "Graphic colors and gradient", exact: true })
    .first()
    .click();
  const options = await page
    .getByLabel("Graphic color scope")
    .locator("option")
    .allTextContents();
  expect(options.length).toBeGreaterThan(2);
  const color = (await page
    .getByLabel("Graphic color scope")
    .locator("option")
    .nth(1)
    .getAttribute("value"))!;
  await page.getByLabel("Graphic color scope").selectOption(color);
  await page.getByLabel("Graphic fill color", { exact: true }).fill("#ff7755");
  await expect
    .poll(async () => JSON.stringify((await objects(page)).at(-1)))
    .toContain("#ff7755");
  await page.getByLabel("Graphic color scope").selectOption("all");
  await page.getByRole("tab", { name: "Gradient", exact: true }).click();
  await page
    .getByRole("button", { name: "Apply graphic gradient", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect
    .poll(async () => JSON.stringify((await objects(page)).at(-1)))
    .toContain("colorStops");
  const gradient = (await objects(page)).at(-1);
  expect(gradient.objects.length).toBeGreaterThan(1);
  await page.reload();
  expect(JSON.stringify((await objects(page)).at(-1))).toContain("colorStops");
  await page.screenshot({ path: "test-results/branded-graphic-gradient.png" });
});

test("Magic Eraser reviews a brush edit, preserves every unmarked pixel and unselected layer, and undoes once", async ({
  page,
}) => {
  let request: any;
  await page.route("http://127.0.0.1:5188/session", (route) =>
    route.fulfill({ json: { ready: true, token: "qa" } }),
  );
  await importFixture(page);
  await page
    .locator(".layer-select")
    .filter({ hasText: "Daisy photo" })
    .click();
  const baseline = await objects(page);
  const replacement = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 1024;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#cc6688";
    ctx.fillRect(0, 0, 1024, 1024);
    return c.toDataURL("image/png");
  });
  await page.route("http://127.0.0.1:5188/refinements", async (route) => {
    request = route.request().postDataJSON();
    await route.fulfill({
      json: {
        id: "qa-erase",
        status: "completed",
        stage: "Ready",
        elapsedSeconds: 1,
        result: {
          summary: "Background restored",
          edits: [],
          images: [{ id: "photo", src: replacement }],
        },
      },
    });
  });
  await page
    .getByRole("button", { name: "Magic Eraser", exact: true })
    .first()
    .click();
  const brush = page.getByLabel("Mark the area to erase");
  await expect(brush).toBeVisible();
  const b = (await brush.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.6, {
    steps: 8,
  });
  await page.mouse.up();
  await page
    .getByLabel("Magic Eraser instructions")
    .fill("Remove the marked detail");
  await page
    .getByRole("button", { name: "Erase with AI", exact: true })
    .click();
  await expect(page.getByAltText("Magic Eraser result")).toBeVisible();
  expect(request.nodes.map((n: any) => n.id)).toEqual(["photo"]);
  expect(request.eraser.id).toBe("photo");
  expect((await objects(page))[2].src).toBe(baseline[2].src);
  await page.screenshot({ path: "test-results/magic-eraser-review.png" });
  await page
    .getByRole("button", { name: "Apply erased photo", exact: true })
    .click();
  await expect
    .poll(async () => (await objects(page))[2].src)
    .not.toBe(baseline[2].src);
  const changed = await objects(page);
  expect(changed.filter((o) => o.id !== "photo")).toEqual(
    baseline.filter((o) => o.id !== "photo"),
  );
  const pixels = await page.evaluate(
    async ({ before, after, mask }) => {
      const read = async (src: string) => {
        const i = new Image();
        i.src = src;
        await i.decode();
        const c = document.createElement("canvas");
        c.width = i.width;
        c.height = i.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(i, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height).data;
      };
      const [a, b, m] = await Promise.all([
        read(before),
        read(after),
        read(mask),
      ]);
      let outsideChanges = 0,
        insideChanges = 0;
      for (let i = 0; i < a.length; i += 4) {
        const different = [0, 1, 2, 3].some((k) => a[i + k] !== b[i + k]);
        if (different) {
          if (m[i] === 0) outsideChanges++;
          else insideChanges++;
        }
      }
      return { outsideChanges, insideChanges };
    },
    {
      before: request.images[0].src,
      after: changed[2].src,
      mask: request.eraser.mask,
    },
  );
  expect(pixels.outsideChanges).toBe(0);
  expect(pixels.insideChanges).toBeGreaterThan(100);
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await objects(page))[2].src === baseline[2].src)
    .toBe(true);
});

test("GIF and WebM exports contain motion while the editable source stays unchanged", async ({
  page,
}) => {
  test.setTimeout(90000);
  await importFixture(page);
  const before = await objects(page);
  for (const format of ["gif", "webm"]) {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByLabel("File type", { exact: true }).selectOption(format);
    await page
      .getByLabel("Animation resolution", { exact: true })
      .selectOption("360");
    await page
      .getByLabel("Export animation", { exact: true })
      .selectOption("rise");
    await page
      .getByLabel("Export animation duration", { exact: true })
      .selectOption("1");
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    const download = await pending;
    await download.saveAs(`.local/motion-proof.${format}`);
    const bytes = await readFile((await download.path())!);
    expect(bytes.length).toBeGreaterThan(1000);
    if (format === "gif")
      expect(bytes.subarray(0, 6).toString()).toBe("GIF89a");
    else expect(bytes.subarray(0, 4).toString("hex")).toBe("1a45dfa3");
    expect(await objects(page)).toEqual(before);
  }
});

test("original fonts load and SVG embeds its bitmap and font assets", async ({
  page,
}) => {
  const design = structuredClone(fixture);
  design.name = "Portable SVG proof";
  design.pages[0].data.objects[0].objects[1].fontFamily = "Forma Deco";
  await importDesign(page, design);
  const fontChecks = await page.evaluate(async () => {
    const names = ["Forma Frame", "Forma Soft", "Forma Deco", "Forma Outline"];
    return Promise.all(
      names.map(async (name) => {
        const result = await document.fonts.load(`32px "${name}"`);
        return result.length;
      }),
    );
  });
  expect(fontChecks).toEqual([1, 1, 1, 1]);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("File type", { exact: true }).selectOption("svg");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const file = await pending;
  const svg = await readFile((await file.path())!, "utf8");
  expect(svg.includes("data:image/png;base64,")).toBe(true);
  expect(svg.includes("data:font/ttf;base64,")).toBe(true);
  expect(svg.includes('href="/elements/')).toBe(false);
  await file.saveAs(".local/portable-proof.svg");
});
