import { test, expect, type Page } from "@playwright/test";
import { saved } from "../scripts/qa-fixture.mjs";

async function setup(page: Page, count = 4) {
  await page.goto("/");
  await expect(page.getByLabel("Design title", { exact: true })).toBeVisible();
  const fixture = {
    id: "page-order-proof",
    name: "Page order proof",
    width: 1080,
    height: 1080,
    updatedAt: new Date().toISOString(),
    aiJobId: "original-ai-job",
    campaignId: "campaign-proof",
    folderId: "folder-proof",
    pages: Array.from({ length: count }, (_, i) => ({
      id: `page-${i + 1}`,
      name: `Chapter ${i + 1}`,
      thumbnail: "",
      motion: { style: i % 2 ? "rise" : "fade", duration: 2 + (i % 3) },
      data: {
        background: ["#f4ecd8", "#ded4f4", "#d5e2cc", "#f0b8a4"][i % 4],
        objects: [
          {
            type: "Textbox",
            id: `title-${i}`,
            name: "Chapter title",
            text: `CHAPTER ${i + 1}`,
            left: 100,
            top: 300,
            width: 850,
            fontSize: 110,
            fontFamily: "Arial",
            fill: "#292432",
          },
        ],
      },
    })),
  };
  await page
    .locator('input[type=file][accept=".json"]')
    .setInputFiles({
      name: "page-order.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    "Page order proof (imported)",
  );
  if (
    await page
      .getByRole("button", { name: "Show page thumbnails", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Show page thumbnails", exact: true })
      .click();
  await expect(page.locator("[data-page-id]")).toHaveCount(count);
}
const order = async (page: Page) =>
  (await saved(page)).pages.map((p: any) => p.id);
async function drag(page: Page, from: number, to: number, after = false) {
  const a = (await page.locator("[data-page-id]").nth(from).boundingBox())!;
  const b = (await page.locator("[data-page-id]").nth(to).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    b.x + b.width * (after ? 0.85 : 0.15),
    b.y + b.height / 2,
    { steps: 12 },
  );
  await expect(page.locator(".page-drag-preview")).toBeVisible();
  await page.mouse.up();
}

test("dragging preserves active content, animation and campaign identity with Undo, Redo and reload", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Go to page 2", exact: true }).click();
  await expect(page.locator('[data-page-id="page-2"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  // Saving a current edit establishes the page data to compare after movement.
  await page
    .getByLabel("Design title", { exact: true })
    .fill("Page order edited");
  const before = await saved(page);
  await drag(page, 3, 0);
  await expect
    .poll(() => order(page))
    .toEqual(["page-4", "page-1", "page-2", "page-3"]);
  await expect(page.locator('[data-page-id="page-2"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  const after = await saved(page);
  for (const p of before.pages)
    expect(after.pages.find((q: any) => q.id === p.id)).toEqual(p);
  expect([after.aiJobId, after.campaignId, after.folderId]).toEqual([
    "original-ai-job",
    "campaign-proof",
    "folder-proof",
  ]);
  await page.keyboard.press("Control+z");
  await expect
    .poll(() => order(page))
    .toEqual(["page-1", "page-2", "page-3", "page-4"]);
  await expect(page.locator('[data-page-id="page-2"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(() => order(page))
    .toEqual(["page-4", "page-1", "page-2", "page-3"]);
  await drag(page, 0, 3, true);
  await expect
    .poll(() => order(page))
    .toEqual(["page-1", "page-2", "page-3", "page-4"]);
  await page.reload();
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    "Page order edited",
  );
  await expect(page.locator("[data-page-id]")).toHaveCount(4);
  expect(await order(page)).toEqual(["page-1", "page-2", "page-3", "page-4"]);
});

test("click, no-op, Escape, outside drop and keyboard moves keep page order predictable", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Go to page 3", exact: true }).click();
  await expect(page.locator('[data-page-id="page-3"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  await drag(page, 1, 1);
  expect(await order(page)).toEqual(["page-1", "page-2", "page-3", "page-4"]);
  const first = (await page.locator("[data-page-id]").first().boundingBox())!;
  await page.mouse.move(first.x + 20, first.y + 20);
  await page.mouse.down();
  await page.mouse.move(first.x + 150, first.y + 20);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".page-drag-preview")).toHaveCount(0);
  await page.mouse.move(first.x + 20, first.y + 20);
  await page.mouse.down();
  await page.mouse.move(first.x + 150, first.y - 160);
  await page.mouse.up();
  expect(await order(page)).toEqual(["page-1", "page-2", "page-3", "page-4"]);
  const focused = page.locator('[data-page-id="page-1"]');
  await focused.focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect
    .poll(() => order(page))
    .toEqual(["page-2", "page-1", "page-3", "page-4"]);
  await expect(focused).toBeFocused();
  await expect(page.locator('[data-page-id="page-3"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("dragging near the edge scrolls through a long page strip", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 850 });
  await setup(page, 16);
  const first = (await page.locator("[data-page-id]").first().boundingBox())!,
    strip = (await page.locator(".page-thumbnails").boundingBox())!;
  await page.mouse.move(first.x + 20, first.y + 20);
  await page.mouse.down();
  await page.mouse.move(strip.x + strip.width - 8, first.y + 20, { steps: 10 });
  await expect
    .poll(() =>
      page.locator(".page-thumbnails").evaluate((el) => el.scrollLeft),
    )
    .toBeGreaterThan(500);
  await page.mouse.up();
  await expect
    .poll(async () => (await order(page)).indexOf("page-1"))
    .toBeGreaterThan(6);
});

test.describe("touch page ordering", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test("touch drag reorders thumbnails without switching the displayed page", async ({
    page,
    context,
  }) => {
    await setup(page, 3);
    const a = (await page.locator("[data-page-id]").nth(2).boundingBox())!,
      b = (await page.locator("[data-page-id]").first().boundingBox())!;
    const session = await context.newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: a.x + a.width / 2, y: a.y + a.height / 2 }],
    });
    for (let i = 1; i <= 12; i++)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: a.x + a.width / 2 + ((b.x + 8 - a.x - a.width / 2) * i) / 12,
            y: a.y + a.height / 2,
          },
        ],
      });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() => order(page))
      .toEqual(["page-3", "page-1", "page-2"]);
    await expect(page.locator('[data-page-id="page-1"]')).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
