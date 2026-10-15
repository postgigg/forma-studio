import { test, expect, type Page } from "@playwright/test";
import { saved } from "../scripts/qa-fixture.mjs";
async function blank(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New blank design", exact: true })
    .click();
  await page
    .getByLabel("Design name", { exact: true })
    .fill("Drawing tools proof");
  await page
    .getByRole("button", { name: "Create design", exact: true })
    .click();
  await page.getByRole("button", { name: "Draw", exact: true }).click();
}
async function line(
  page: Page,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const b = (await page.locator(".upper-canvas").boundingBox())!;
  await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * x2, b.y + b.height * y2, { steps: 20 });
  await page.mouse.up();
}
test("four ink tools preserve their appearance and editable layers after reload", async ({
  page,
}) => {
  await blank(page);
  for (const [i, name] of [
    "Pencil",
    "Marker",
    "Paintbrush",
    "Highlighter",
  ].entries()) {
    await page.getByRole("button", { name, exact: true }).click();
    await page
      .getByRole("button", { name: "Ink #754adb", exact: true })
      .click();
    await line(page, 0.2, 0.2 + i * 0.15, 0.75, 0.2 + i * 0.15);
    await expect
      .poll(async () => (await saved(page)).pages[0].data.objects.length)
      .toBe(i + 1);
  }
  const before = (await saved(page)).pages[0].data.objects;
  expect(before.map((o: any) => o.inkTool)).toEqual([
    "pencil",
    "marker",
    "paintbrush",
    "highlighter",
  ]);
  expect(before.map((o: any) => o.strokeWidth)).toEqual([3, 14, 26, 34]);
  expect(before.at(-1).stroke).toBe("rgba(117,74,219,0.35)");
  expect(before[1].strokeLineCap).toBe("butt");
  expect(before[2].shadow.blur).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Back to selecting", exact: true })
    .click();
  await page.reload();
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects)
    .toEqual(before);
});
test("stroke eraser removes only ink and a single Undo restores the entire gesture", async ({
  page,
}) => {
  await blank(page);
  await page.getByRole("button", { name: "Pencil", exact: true }).click();
  await line(page, 0.2, 0.3, 0.75, 0.3);
  await line(page, 0.2, 0.5, 0.75, 0.5);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByRole("button", { name: "Add a heading", exact: true })
    .click();
  const before = (await saved(page)).pages[0].data.objects;
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  await page
    .getByRole("button", { name: "Stroke eraser", exact: true })
    .click();
  await line(page, 0.5, 0.2, 0.5, 0.65);
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects.length)
    .toBe(1);
  expect((await saved(page)).pages[0].data.objects[0].type).toBe("Textbox");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects)
    .toEqual(before);
  await page.reload();
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  await page
    .getByRole("button", { name: "Stroke eraser", exact: true })
    .click();
  await line(page, 0.5, 0.2, 0.5, 0.65);
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects.length)
    .toBe(1);
});
test("local workspace exposes no Forma sign-in or account controls", async ({
  page,
}) => {
  const authRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/auth/v1/")) authRequests.push(r.url());
  });
  await page.goto("/");
  await expect(page.getByLabel("Design title", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Your account", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "My designs", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /sign in|create account|my account/i }),
  ).toHaveCount(0);
  expect(authRequests).toEqual([]);
});

test("double-click opens element properties from a collapsed sidebar or Layers tab", async ({
  page,
}) => {
  await blank(page);
  await page.getByRole("button", { name: "Marker", exact: true }).click();
  await line(page, 0.2, 0.4, 0.75, 0.4);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Layers/ }).click();
  await page
    .getByRole("button", { name: "Hide properties and layers", exact: true })
    .click();
  const b = (await page.locator(".upper-canvas").boundingBox())!;
  await page.mouse.dblclick(b.x + b.width * 0.5, b.y + b.height * 0.4);
  await expect(
    page.getByRole("complementary", { name: "Design properties" }),
  ).toBeVisible();
  await expect(page.getByLabel("X position", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Layers/ }).click();
  const next = (await page.locator(".upper-canvas").boundingBox())!;
  await page.mouse.dblclick(
    next.x + next.width * 0.5,
    next.y + next.height * 0.4,
  );
  await expect(page.getByLabel("X position", { exact: true })).toBeVisible();
});
