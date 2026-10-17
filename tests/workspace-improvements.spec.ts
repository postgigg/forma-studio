import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { saved } from "../scripts/qa-fixture.mjs";
import { openBrandSetup, personalStyle, styleBrand } from "./style-fixture";

async function profiles(page: Page) {
  return page.evaluate(async () => {
    const modulePath = "/src/storage.ts", storage = await import(modulePath);
    return { brand: await storage.getBrandProfile(), style: await storage.getDesignStyle() };
  });
}

test("legacy brand and taste share one editor; cancel and a failed combined save preserve both records", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Design title", { exact: true }).waitFor();
  await page.evaluate(async ({ brand, style }) => {
    const modulePath = "/src/storage.ts", storage = await import(modulePath);
    await storage.putBrandProfile(brand); await storage.putDesignStyle(style);
  }, { brand: styleBrand, style: personalStyle });
  await page.reload();
  await expect(page.getByRole("button", { name: "Your style", exact: true })).toHaveCount(0);
  await openBrandSetup(page, 2);
  await expect(page.getByLabel("Company name", { exact: true })).toHaveCount(1);
  await expect(page.getByLabel("Company name", { exact: true })).toHaveValue(styleBrand.name);
  await expect(page.getByLabel("Mission statement", { exact: true })).toHaveValue(styleBrand.mission);
  await expect(page.getByLabel("Use personal design preferences")).toHaveCount(1);
  const before = await profiles(page);
  await page.getByLabel("Company name", { exact: true }).fill("Unsaved draft");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  expect(await profiles(page)).toEqual(before);
  await openBrandSetup(page, 2);
  await page.getByLabel("Company name", { exact: true }).fill("Must roll back");
  await page.getByLabel("Use personal design preferences").uncheck();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    (window as any).restoreBrandPut = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function(value, key) {
      if (key === "design-style") throw new DOMException("Simulated storage quota", "QuotaExceededError");
      return put.call(this, value, key);
    };
  });
  await page.getByRole("button", { name: "Save brand & style", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Simulated storage quota");
  await page.evaluate(() => (window as any).restoreBrandPut());
  expect(await profiles(page)).toEqual(before);
  await expect(page.getByRole("dialog", { name: "Brand & style", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save brand & style", exact: true }).click();
  expect((await profiles(page)).brand.name).toBe("Must roll back");
  expect((await profiles(page)).style.enabled).toBe(false);
});

test("Campaigns sits beside design actions and the collapsed header preserves canvas, actions and restore", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Design title", { exact: true }).waitFor();
  const campaigns = page.locator(".header-actions").getByRole("button", { name: "Campaigns", exact: true });
  await expect(campaigns).toHaveCount(1);
  expect(await page.locator(".header-actions > button").evaluateAll(buttons => buttons.map(button => button.getAttribute("aria-label") || button.textContent?.trim()))).toEqual(["Campaigns", "New blank design", "Present", "Export"]);
  await campaigns.click();
  await expect(page.getByRole("dialog", { name: "Campaign studio", exact: true })).toBeVisible();
  await page.getByRole("dialog", { name: "Campaign studio", exact: true }).getByRole("button", { name: "Close dialog", exact: true }).click();
  const before = await saved(page), height = (await page.locator(".canvas-stage").boundingBox())!.height;
  await page.getByRole("button", { name: "Hide top bar", exact: true }).click();
  await expect(page.locator("#studio-header")).toBeHidden();
  expect((await page.locator(".canvas-stage").boundingBox())!.height).toBeGreaterThan(height + 60);
  expect((await saved(page)).pages[0].data).toEqual(before.pages[0].data);
  await page.getByRole("button", { name: "Design actions", exact: true }).click();
  const actions = page.getByRole("dialog", { name: "Design actions", exact: true });
  for (const name of ["My designs", "Campaigns", "Export", "Present", "New blank design"])
    await expect(actions.getByRole("button", { name, exact: true })).toBeEnabled();
  await actions.getByLabel("Design title", { exact: true }).fill("Compact workspace");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Show top bar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show top bar", exact: true }).click();
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue("Compact workspace");
  await expect(page.getByRole("button", { name: "Hide top bar", exact: true })).toBeFocused();
  for (const width of [1440, 1366, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(campaigns).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const bounds = (await campaigns.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: "test-results/header-actions-v1.6.1.png", animations: "disabled" });
});

for (const terminal of ["completed", "failed", "cancelled"]) test(`AI rail tracks work outside its panel and stops on ${terminal}`, async ({ page }) => {
  let status = "running", posts = 0, summaries = 0;
  const proposal = JSON.parse(readFileSync("tests/designer.fixture.json", "utf8"));
  await page.route("**/session", route => route.fulfill({ json: { ready: true, token: "rail-test" } }));
  await page.route("**/jobs", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    posts++; return route.fulfill({ json: { id: "rail-job", status: "running", stage: "Building your composition" } });
  });
  await page.route("**/jobs/rail-job**", route => {
    const summary = new URL(route.request().url()).searchParams.has("summary");
    if (summary) summaries++;
    return route.fulfill({ json: { id: "rail-job", status, stage: "Building your composition", elapsedSeconds: 800, result: summary ? null : proposal } });
  });
  await page.goto("/");
  const rail = page.getByRole("button", { name: "AI Designer", exact: true });
  await rail.click();
  await page.getByLabel("AI design brief").fill("Design a considered botanical launch poster for local flower buyers.");
  await page.getByRole("button", { name: "Create my design", exact: true }).click();
  await expect(rail).toHaveAttribute("aria-busy", "true");
  await page.getByRole("button", { name: "Elements", exact: true }).click();
  await expect(rail.locator(".designer-rail-spinner")).toBeVisible();
  await expect.poll(() => summaries).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await rail.locator("svg").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  status = terminal;
  await expect(rail).toHaveAttribute("aria-busy", "false");
  expect(posts).toBe(1);
});

test("advanced charts use real numeric geometry, signed stacks, validation and lossless XY CSV", async ({ page }) => {
  await page.goto("/");
  const proof = await page.evaluate(async () => {
    const modulePath = "/src/charts.ts", charts = await import(modulePath);
    const data = charts.defaultChart("scatter");
    data.labels = ["A", "B", "C"]; data.xValues = [0, 10, 100];
    data.series = [{ name: "Y", color: "#754adb", values: [5, 5, 5] }];
    const scatter = charts.makeChart(data), points = scatter.getObjects().filter((node: any) => node.type === "circle");
    const ratio = (points[1].left - points[0].left) / (points[2].left - points[0].left);
    const roundTrip = charts.importChartCSV(charts.chartCSV(data), data);
    const simple = charts.importChartCSV("X,Y\n-20,4\n10,8\n200,3", data);
    const stacked = charts.defaultChart("stacked-bar");
    stacked.labels = ["A", "B"]; stacked.showValues = false;
    stacked.series = [{ name: "A", color: "#754adb", values: [80, -40] }, { name: "B", color: "#668266", values: [70, -30] }];
    const group = charts.makeChart(stacked), rectangles = group.getObjects().filter((node: any) => node.type === "rect" && node.height > 20 && node.width < 400);
    const first = rectangles.filter((node: any) => node.fill === "#754adb"), second = rectangles.filter((node: any) => node.fill === "#668266");
    const invalid = charts.defaultChart("radar"); invalid.series[0].values[0] = -1;
    let radarError = ""; try { charts.makeChart(invalid); } catch (e) { radarError = (e as Error).message; }
    return { ratio, roundTrip, data, simple, radarError, positiveJoin: Math.abs(second[0].top + second[0].height - first[0].top), negativeJoin: Math.abs(first[1].top + first[1].height - second[1].top), svg: scatter.toSVG() };
  });
  expect(proof.ratio).toBeCloseTo(.1, 8);
  expect(proof.roundTrip).toEqual(proof.data);
  expect(proof.simple.xValues).toEqual([-20, 10, 200]);
  expect(proof.simple.series[0].values).toEqual([4, 8, 3]);
  expect(proof.positiveJoin).toBeLessThan(.001); expect(proof.negativeJoin).toBeLessThan(.001);
  expect(proof.radarError).toContain("non-negative"); expect(proof.svg).toContain("<circle");
});

test("all four advanced chart types save, reopen and retain X values through row and style edits", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New blank design", exact: true }).click();
  await page.getByLabel("Design name", { exact: true }).fill("Advanced data story");
  await page.getByRole("button", { name: "Create design", exact: true }).click();
  await page.getByRole("button", { name: "Charts", exact: true }).click();
  for (const name of ["Horizontal bar", "Stacked bar", "Radar", "Scatter"]) {
    await page.getByRole("button", { name: new RegExp(`^${name} chart`) }).click();
    await expect(page.getByRole("button", { name: "Add chart to design", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Add chart to design", exact: true }).click();
  }
  await expect.poll(async () => (await saved(page)).pages[0].data.objects.length).toBe(4);
  await page.getByRole("button", { name: "Edit data", exact: true }).click();
  await page.getByLabel("Row 1 X value", { exact: true }).fill("-40");
  await page.getByLabel("Chart style", { exact: true }).selectOption("bar");
  await page.getByRole("button", { name: "Remove row 2", exact: true }).click();
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  await page.getByLabel("Chart style", { exact: true }).selectOption("scatter");
  await expect(page.getByLabel("Row 1 X value", { exact: true })).toHaveValue("-40");
  await expect(page.getByLabel("Row 2 X value", { exact: true })).toHaveValue("60");
  await page.getByRole("button", { name: "Save chart changes", exact: true }).click();
  await expect.poll(async () => (await saved(page)).pages[0].data.objects.at(-1).chart.xValues).toEqual([-40,60,100,4]);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await saved(page)).pages[0].data.objects.at(-1).chart.xValues).toEqual([10,25,60,100]);
  await page.reload();
  await page.getByRole("button", { name: /^Layers/ }).click();
  await page.locator(".layer-select").filter({ hasText: "scatter chart" }).click();
  await page.getByRole("button", { name: "Edit data", exact: true }).click();
  await expect(page.getByLabel("Row 2 X value", { exact: true })).toHaveValue("25");
  await page.screenshot({ path: "test-results/advanced-chart-editor.png", animations: "disabled" });
});
