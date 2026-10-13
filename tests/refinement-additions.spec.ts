import { test, expect } from "@playwright/test";
import { importFixture, saved } from "../scripts/qa-fixture.mjs";
test("AI additions stay editable, preserve unselected objects, and undo with their associated refinement", async ({
  page,
}) => {
  await page.route("**/session", (route) =>
    route.fulfill({ json: { ready: true, token: "qa" } }),
  );
  const additions = Array.from({ length: 45 }, (_, i) => ({
    kind: "star",
    name: `Star ${i + 1}`,
    x: 30 + (i % 9) * 115,
    y: 25 + Math.floor(i / 9) * 220,
    width: 12,
    height: 12,
    angle: i * 3,
    fill: "#bf9762",
    stroke: null,
    strokeWidth: 0,
    opacity: 0.8,
    text: null,
    font: null,
    fontSize: null,
    path: null,
  }));
  await page.route("**/refinements", (route) =>
    route.fulfill({
      json: {
        id: "qa-additions",
        status: "completed",
        stage: "Ready",
        elapsedSeconds: 1,
        result: {
          summary: "Added 45 stars.",
          edits: [{ id: "panel-a", fill: "#eee0ca" }],
          images: [],
          additions,
          designNotes: ["Kept the existing wording and groups."],
        },
      },
    }),
  );
  await importFixture(page);
  const before = (await saved(page)).pages[0].data.objects;
  await page
    .getByRole("button", { name: "Improve with AI", exact: true })
    .click();
  await page
    .getByLabel("Selection refinement brief")
    .fill("Add 45 more stars across this selected design.");
  await page.getByLabel("Refinement creative direction").selectOption("bold");
  await page
    .getByRole("button", { name: "Generate refinement", exact: true })
    .click();
  await expect(page.locator(".refine-additions")).toHaveText(
    "45 new editable elements",
  );
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects.length)
    .toBe(before.length + 45);
  const after = (await saved(page)).pages[0].data.objects;
  expect(after.filter((o: any) => o.type === "Polygon")).toHaveLength(45);
  expect(after.find((o: any) => o.id === "untouched")).toEqual(
    before.find((o: any) => o.id === "untouched"),
  );
  expect(after.filter((o: any) => o.type === "Group")).toHaveLength(2);
  expect(
    after
      .find((o: any) => o.id === "group-a")
      .objects.find((o: any) => o.id === "title").text,
  ).toBe(
    before
      .find((o: any) => o.id === "group-a")
      .objects.find((o: any) => o.id === "title").text,
  );
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects)
    .toEqual(before);
});
test("rectangle corner radius respects scaled pixel dimensions, persists and undoes", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New blank design", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create design", exact: true })
    .click();
  await page.getByRole("button", { name: "Elements", exact: true }).click();
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page
    .getByRole("button", { name: "Add rectangle", exact: true })
    .click();
  await page.getByLabel("Element width", { exact: true }).fill("500");
  await page.getByLabel("Element height", { exact: true }).fill("240");
  await page.getByLabel("Corner radius in pixels").fill("40");
  await expect
    .poll(async () => {
      const o = (await saved(page)).pages[0].data.objects[0];
      return Math.round(o.rx * o.scaleX);
    })
    .toBe(40);
  await expect(page.getByLabel("Corner roundness")).toHaveValue("40");
  await page.getByRole("button", { name: "Pill", exact: true }).click();
  await expect(page.getByLabel("Corner radius in pixels")).toHaveValue("120");
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => {
      const o = (await saved(page)).pages[0].data.objects[0];
      return Math.round(o.rx * o.scaleX);
    })
    .toBe(40);
  await page.reload();
  await page.getByRole("button", { name: /^Layers/ }).click();
  await page.locator(".layer-select").filter({ hasText: "Rectangle" }).click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(page.getByLabel("Corner radius in pixels")).toHaveValue("40");
});
