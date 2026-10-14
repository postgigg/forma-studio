import { test, expect } from "@playwright/test";
import { smartGuides } from "../src/guides";

test("snapping finds object edges and equal horizontal and vertical spacing", () => {
  const row = [
    { left: 100, top: 200, width: 100, height: 100 },
    { left: 400, top: 200, width: 100, height: 100 },
  ];
  const after = smartGuides(
    { left: 704, top: 202, width: 100, height: 100 },
    row,
    1080,
    1080,
    8,
  );
  expect(after.x).toBe(-4);
  expect(after.y).toBe(-2);
  expect(after.guides.filter((g) => g.label).map((g) => g.label)).toEqual([
    "200",
    "200",
  ]);
  const between = smartGuides(
    { left: 298, top: 200, width: 100, height: 100 },
    [row[0], { ...row[1], left: 500 }],
    1080,
    1080,
    8,
  );
  expect(between.x).toBe(2);
  expect(between.guides.filter((g) => g.label).map((g) => g.label)).toEqual([
    "100",
    "100",
  ]);
  const column = row.map((b) => ({
    left: b.top,
    top: b.left,
    width: b.height,
    height: b.width,
  }));
  const below = smartGuides(
    { left: 202, top: 704, width: 100, height: 100 },
    column,
    1080,
    1080,
    8,
  );
  expect(below.y).toBe(-4);
  expect(below.guides.filter((g) => g.label).map((g) => g.label)).toEqual([
    "200",
    "200",
  ]);
  expect(
    smartGuides(
      { left: 720, top: 220, width: 100, height: 100 },
      row,
      1080,
      1080,
      8,
    ).guides,
  ).toHaveLength(0);
});

test("purple alignment and gap guides appear while dragging and clear on release", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New blank design", exact: true })
    .click();
  await page
    .getByLabel("Design name", { exact: true })
    .fill("Smart guides proof");
  await page
    .getByRole("button", { name: "Create design", exact: true })
    .click();
  await page.getByRole("button", { name: "Elements", exact: true }).click();
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  for (const [x, y] of [
    [100, 200],
    [400, 200],
    [710, 450],
  ]) {
    await page
      .getByRole("button", { name: "Add rectangle", exact: true })
      .click();
    await page.getByLabel("Element width", { exact: true }).fill("100");
    await page.getByLabel("Element height", { exact: true }).fill("100");
    await page.getByLabel("X position", { exact: true }).fill(String(x));
    await page.getByLabel("Y position", { exact: true }).fill(String(y));
  }
  const box = (await page.locator(".upper-canvas").boundingBox())!,
    z = box.width / 1080;
  await page.mouse.move(box.x + 760 * z, box.y + 500 * z);
  await page.mouse.down();
  await page.mouse.move(box.x + 754 * z, box.y + 252 * z, { steps: 15 });
  await expect(page.getByTestId("alignment-guides")).toBeVisible();
  await expect(page.locator('[data-guide="spacing"] text')).toHaveText([
    "200",
    "200",
  ]);
  await page.screenshot({ path: "test-results/smart-guides.png" });
  await page.mouse.up();
  await expect(page.getByTestId("alignment-guides")).toHaveCount(0);
  await expect(page.getByLabel("X position", { exact: true })).toHaveValue(
    "700",
  );
  await expect(page.getByLabel("Y position", { exact: true })).toHaveValue(
    "200",
  );
});

test("annotation cleanup, full library scrolling, and canvas-only wheel zoom", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 730 });
  await page.goto("/");
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    "A little growth",
  );
  await expect(
    page.getByRole("button", {
      name: "Hide properties and layers",
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Collapse sidebar", exact: true }),
  ).toHaveCount(0);
  for (const text of [
    "Room for possibility.",
    "A starting point, never a limit.",
    "Every great design begins",
  ])
    await expect(page.getByText(text, { exact: false })).toHaveCount(0);
  const library = page.getByRole("complementary", { name: "design library" });
  const before = (await page.locator(".upper-canvas").boundingBox())!.width;
  await library.hover();
  await page.mouse.wheel(0, 2000);
  await expect
    .poll(() => library.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(
    (await page.locator(".upper-canvas").boundingBox())!.width,
  ).toBeCloseTo(before);
  await library.evaluate((el) => (el.scrollTop = el.scrollHeight));
  const last = (await library.locator(".template-card").last().boundingBox())!,
    bounds = (await library.boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  await page.locator(".upper-canvas").hover();
  await page.mouse.wheel(0, 150);
  await expect
    .poll(
      async () => (await page.locator(".upper-canvas").boundingBox())!.width,
    )
    .toBeLessThan(before);
  await page.getByRole("button", { name: "AI Designer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "AI Designer", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("AI design brief")
    .fill("This brief should clear when starting another design.");
  await expect(page.getByRole("button", { name: "New AI design", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Results & history" }).click();
  await page
    .getByRole("button", { name: "New AI design", exact: true })
    .click();
  await expect(page.getByLabel("AI design brief")).toHaveValue("");
});

test("original sticker themes remain searchable alongside the branded editable graphics", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Elements", exact: true }).click();
  await expect(page.locator(".sticker-grid button")).toHaveCount(12);
  await page.getByLabel("Sticker theme").selectOption("Botanical");
  await expect(page.locator(".sticker-grid button")).toHaveCount(10);
  await page.getByLabel("Search elements").fill("tulip");
  await expect(page.locator(".sticker-grid button")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Add Blush tulip", exact: true })
    .click();
  await expect(page.locator(".selection-label")).toHaveText("Blush tulip");
  await page.getByLabel("Search elements").fill("");
  await page.getByRole("button", { name: "Graphics", exact: true }).click();
  await expect(page.locator(".graphic-grid button")).toHaveCount(24);
  await page.getByLabel("Graphic collection", { exact: true }).selectOption("Noir atelier");
  await expect(page.locator(".graphic-grid button")).toHaveCount(10);
  await page.getByLabel("Graphic collection", { exact: true }).selectOption("Studio essentials");
  await page
    .getByRole("button", { name: "Add Daydream cloud", exact: true })
    .click();
  await expect(page.getByLabel("Fill color", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/graphics-library.png" });
});
