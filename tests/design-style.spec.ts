import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { configureStyle, personalStyle, styleBrand } from "./style-fixture";

test("onboarding saves taste and mission, can be edited, and supports a persistent global opt out", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Design title", { exact: true })).toBeVisible();
  await configureStyle(page);
  await page.reload();
  await page.getByRole("button", { name: "Brand", exact: true }).click();
  await expect(
    page.getByLabel("Mission statement", { exact: true }),
  ).toHaveValue(styleBrand.mission);
  await expect(
    page.getByLabel("Use personal design preferences"),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Edit design preferences", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Minimal design style", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Editorial design style", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Bold design style", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Classic design style", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("up to three");
  await page
    .getByRole("button", { name: "Bold design style", exact: true })
    .click();
  await page.locator(".style-onboarding-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({
    path: "test-results/personal-style-desktop.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Personal design details")).toHaveValue(
    personalStyle.details,
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByLabel("Style onboarding Mission statement", { exact: true }),
  ).toHaveValue(styleBrand.mission);
  await page
    .getByRole("button", { name: "Save my design direction", exact: true })
    .click();
  await page.getByLabel("Use personal design preferences").uncheck();
  let brief: any;
  await page.route("**/session", (r) =>
    r.fulfill({ json: { ready: true, token: "style-test" } }),
  );
  await page.route("**/jobs", (r) =>
    r.request().method() === "GET"
      ? r.fulfill({ json: [] })
      : ((brief = r.request().postDataJSON()),
        r.fulfill({ status: 400, json: { error: "Captured" } })),
  );
  await page.getByRole("button", { name: "AI Designer", exact: true }).click();
  await page
    .getByLabel("AI design brief")
    .fill("Create a considered flower shop poster.");
  await page
    .getByRole("button", { name: "Create my design", exact: true })
    .click();
  await expect.poll(() => !!brief).toBe(true);
  expect(brief.designProfile).toBeUndefined();
  expect(brief.brandContext.mission).toBe(styleBrand.mission);
  await page.reload();
  await page.getByRole("button", { name: "Brand", exact: true }).click();
  await expect(
    page.getByLabel("Use personal design preferences"),
  ).not.toBeChecked();
});
test("style onboarding fits a phone with readable choices and reachable navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByLabel("Design title", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Your design style", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "What feels like you?", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .getByRole("dialog", { name: "Your design style", exact: true })
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/personal-style-phone.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save my design direction", exact: true }),
  ).toBeInViewport();
});
test("a design reported beyond six minutes survives a lost status read and completes without resubmission", async ({
  page,
}) => {
  const sample = JSON.parse(
    readFileSync("tests/designer.fixture.json", "utf8"),
  );
  let posts = 0,
    reads = 0;
  let body: any;
  await page.route("**/session", (r) =>
    r.fulfill({ json: { ready: true, token: "lifetime-test" } }),
  );
  await page.route("**/jobs", (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: [] });
    posts++;
    body = r.request().postDataJSON();
    return r.fulfill({
      json: {
        id: "long-design",
        status: "running",
        stage: "Composing",
        elapsedSeconds: 721,
      },
    });
  });
  await page.route("**/jobs/long-design", (r) => {
    reads++;
    if (reads === 2) return r.abort("failed");
    return r.fulfill({
      json: {
        id: "long-design",
        status: reads < 3 ? "running" : "completed",
        stage: reads < 3 ? "Composing" : "Ready",
        elapsedSeconds: 730,
        result:
          reads < 3
            ? null
            : { ...sample, width: body.width, height: body.height },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "AI Designer", exact: true }).click();
  await page
    .getByLabel("AI design brief")
    .fill("Design a thoughtful flower shop campaign poster.");
  await page
    .getByRole("button", { name: "Create my design", exact: true })
    .click();
  await expect(page.locator(".ai-progress")).toContainText("730s");
  await expect(page.getByText(/Reconnecting to the designer/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open editable design", exact: true }),
  ).toBeVisible();
  expect(posts).toBe(1);
  expect(reads).toBeGreaterThanOrEqual(3);
});
