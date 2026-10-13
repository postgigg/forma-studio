import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { saved } from "../scripts/qa-fixture.mjs";

test("an existing canvas photo can be dragged into a frame with one-step Undo", async ({
  page,
}) => {
  await blank(page, "Canvas photo drop");
  await page.getByRole("button", { name: "Elements", exact: true }).click();
  await page.getByRole("button", { name: "Photo frames", exact: true }).click();
  await page
    .getByRole("button", { name: "Add circle photo frame", exact: true })
    .click();
  await page.getByLabel("X position", { exact: true }).fill("100");
  await page.getByLabel("Y position", { exact: true }).fill("100");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Photos", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Somewhere by the water Somewhere by the water",
      exact: true,
    })
    .click();
  await page.getByLabel("Element width", { exact: true }).fill("160");
  await page.getByLabel("Element height", { exact: true }).fill("120");
  await page.getByLabel("X position", { exact: true }).fill("700");
  await page.getByLabel("Y position", { exact: true }).fill("700");
  const before = (await saved(page)).pages[0].data.objects,
    r = (await page.locator(".upper-canvas").boundingBox())!,
    z = r.width / 1080,
    f = before[0];
  await page.mouse.move(r.x + 780 * z, r.y + 760 * z);
  await page.mouse.down();
  await page.mouse.move(
    r.x + (f.left + (f.width * f.scaleX) / 2) * z,
    r.y + (f.top + (f.height * f.scaleY) / 2) * z,
    { steps: 20 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects.length)
    .toBe(1);
  expect((await saved(page)).pages[0].data.objects[0].photoMask.src).toBe(
    "/photos/coast.jpg",
  );
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects)
    .toEqual(before);
});

async function blank(page: Page, name: string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New blank design", exact: true })
    .click();
  await page.getByLabel("Design name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Create design", exact: true })
    .click();
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    name,
  );
}
const proof = async (page: Page, name: string) => {
  const dir = process.env.FORMA_DOCS ? "docs/media" : ".local/proofs";
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png` });
};
test("chart data, CSV, all five styles, validation, persistence and one-step Undo", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await blank(page, "Studio growth · quarterly report");
  await page.getByRole("button", { name: "Charts", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Bar chart Compare values and trends",
      exact: true,
    })
    .click();
  await page.getByLabel("Chart title").fill("Small studio. Growing impact.");
  await page
    .getByLabel("Chart subtitle")
    .fill("Revenue by channel · thousands of dollars");
  await page.getByRole("button", { name: "Paste CSV", exact: true }).click();
  await page
    .getByLabel("CSV data")
    .fill(
      'Category,2026,2025\n"Email, search",42,32\nSocial,68,48\nDirect,56,46\nReferrals,92,65',
    );
  await page.getByRole("button", { name: "Use CSV data" }).click();
  await expect(page.getByLabel("Category 1", { exact: true })).toHaveValue(
    "Email, search",
  );
  for (const type of ["bar", "line", "area", "pie", "donut"]) {
    await page.getByLabel("Chart style").selectOption(type);
    await expect(
      page.getByRole("button", { name: "Add chart to design" }),
    ).toBeEnabled();
    await expect(
      page.getByLabel("Row 2 series 2", { exact: true }),
    ).toHaveValue("48");
  }
  await page.getByLabel("Row 1 series 1", { exact: true }).fill("-20");
  await expect(page.getByRole("alert")).toContainText("non-negative");
  await expect(
    page.getByRole("button", { name: "Add chart to design" }),
  ).toBeDisabled();
  await page.getByLabel("Chart style").selectOption("bar");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("Row 1 series 1", { exact: true }).fill("42");
  await proof(page, "chart-editor");
  await page.getByRole("button", { name: "Add chart to design" }).click();
  await expect
    .poll(
      async () =>
        (await saved(page)).pages[0].data.objects.at(-1)?.chart?.labels[0],
    )
    .toBe("Email, search");
  const baseline = (await saved(page)).pages[0].data.objects.at(-1);
  expect(baseline.objects.length).toBeGreaterThan(15);
  await page.getByRole("button", { name: "Edit data", exact: true }).click();
  await page.getByLabel("Row 2 series 1", { exact: true }).fill("120");
  await page.getByRole("button", { name: "Save chart changes" }).click();
  await expect
    .poll(
      async () =>
        (await saved(page)).pages[0].data.objects.at(-1).chart.series[0]
          .values[1],
    )
    .toBe(120);
  await page.keyboard.press("Control+z");
  await expect
    .poll(
      async () =>
        (await saved(page)).pages[0].data.objects.at(-1).chart.series[0]
          .values[1],
    )
    .toBe(68);
  await page.reload();
  await page.getByRole("button", { name: /^Layers/ }).click();
  await page.locator(".layer-select").filter({ hasText: "bar chart" }).click();
  await page.getByRole("button", { name: "Edit data", exact: true }).click();
  await expect(page.getByLabel("Category 1", { exact: true })).toHaveValue(
    "Email, search",
  );
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const file = await downloaded;
  const contents = await readFile((await file.path())!, "utf8");
  expect(contents).toContain('"Email, search","42","32"');
  expect(errors).toEqual([]);
});
test("letter and shape placeholders accept photo drops, crop, save, Undo, reopen and export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await blank(page, "Alpine letters · photo frames");
  await page.getByRole("button", { name: "Elements", exact: true }).click();
  await page.getByRole("button", { name: "Photo frames", exact: true }).click();
  await page.getByLabel("Letter frame font").selectOption("Georgia");
  await page.getByLabel("Italic letters").check();
  await page
    .getByRole("button", { name: "Add letter A photo frame", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await saved(page)).pages[0].data.objects.at(-1)?.photoMask?.letter,
    )
    .toBe("A");
  const frame = (await saved(page)).pages[0].data.objects.at(-1),
    r = (await page.locator(".upper-canvas").boundingBox())!,
    zoom = r.width / 1080;
  const transfer = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.setData(
      "application/x-forma",
      JSON.stringify({ type: "photo", src: "/photos/coast.jpg" }),
    );
    return d;
  });
  await page.locator(".canvas-stage").dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: r.x + (frame.left + (frame.width * frame.scaleX) / 2) * zoom,
    clientY: r.y + (frame.top + (frame.height * frame.scaleY) / 2) * zoom,
  });
  await expect
    .poll(
      async () =>
        (await saved(page)).pages[0].data.objects.at(-1)?.photoMask?.src,
    )
    .toBe("/photos/coast.jpg");
  expect((await saved(page)).pages[0].data.objects).toHaveLength(1);
  await page
    .getByRole("button", { name: "Crop photo frame", exact: true })
    .click();
  await page.getByLabel("Photo crop zoom").fill("1.65");
  await page.getByLabel("Photo horizontal position").fill("0.4");
  await proof(page, "photo-frame-crop");
  await page
    .getByRole("button", { name: "Save photo frame", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await saved(page)).pages[0].data.objects.at(-1).photoMask.zoom,
    )
    .toBe(1.65);
  await page.keyboard.press("Control+z");
  await expect
    .poll(
      async () =>
        (await saved(page)).pages[0].data.objects.at(-1).photoMask.zoom,
    )
    .toBe(1);
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(
      async () =>
        (await saved(page)).pages[0].data.objects.at(-1).photoMask.zoom,
    )
    .toBe(1.65);
  await page.reload();
  await page.getByRole("button", { name: /^Layers/ }).click();
  await page
    .locator(".layer-select")
    .filter({ hasText: "Letter A frame" })
    .click();
  await page
    .getByRole("button", { name: "Crop photo frame", exact: true })
    .click();
  await expect(page.getByLabel("Photo frame font")).toHaveValue("Georgia");
  await expect(page.getByLabel("Italic", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Photo crop zoom")).toHaveValue("1.65");
  await page.getByLabel("Photo frame shape").selectOption("heart");
  await page
    .getByRole("button", { name: "Save photo frame", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await saved(page)).pages[0].data.objects.at(-1).photoMask.shape,
    )
    .toBe("heart");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("File type", { exact: true }).selectOption("svg");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  expect(await readFile((await (await downloaded).path())!, "utf8")).toContain(
    "data:image/png;base64,",
  );
  expect(errors).toEqual([]);
});
test("area selection can begin outside the page and over objects without moving artwork", async ({
  page,
}) => {
  await blank(page, "Area selection proof");
  await page.getByRole("button", { name: "Elements", exact: true }).click();
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  for (const [shape, x, y] of [
    ["rectangle", 100, 120],
    ["circle", 440, 120],
  ] as const) {
    await page
      .getByRole("button", { name: `Add ${shape}`, exact: true })
      .click();
    await page.getByLabel("X position", { exact: true }).fill(String(x));
    await page.getByLabel("Y position", { exact: true }).fill(String(y));
  }
  await page.keyboard.press("Escape");
  const before = (await saved(page)).pages[0].data.objects;
  const rect = (await page.locator(".upper-canvas").boundingBox())!,
    z = rect.width / 1080;
  await page.mouse.move(rect.x - 12, rect.y + 25 * z);
  await page.mouse.down();
  await page.mouse.move(rect.x + 820 * z, rect.y + 440 * z, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator(".selection-label")).toContainText("2 selected");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Select area", exact: true }).click();
  await page.mouse.move(rect.x + 120 * z, rect.y + 140 * z);
  await page.mouse.down();
  await page.mouse.move(rect.x + 820 * z, rect.y + 440 * z, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator(".selection-label")).toContainText("2 selected");
  await proof(page, "area-selection");
  expect((await saved(page)).pages[0].data.objects).toEqual(before);
});
