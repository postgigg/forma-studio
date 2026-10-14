import { test, expect } from "@playwright/test";
import { saved } from "../scripts/qa-fixture.mjs";
import { readFileSync } from "node:fs";
const studioTemplates: { name: string }[] = JSON.parse(
  readFileSync("shared/templates-studio.json", "utf8"),
);

test("150 additional compositions apply at native size, undo and survive reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("262 editable templates")).toBeVisible();
  expect(studioTemplates).toHaveLength(150);
  expect(new Set(studioTemplates.map((t) => t.name)).size).toBe(150);
  const before = await saved(page);
  await page.getByLabel("Template occasion").selectOption("Yard signs");
  await expect(page.locator(".template-card")).toHaveCount(24);
  await page.getByLabel("Use template dimensions").check();
  await page
    .getByRole("button", {
      name: "Apply School fundraiser · car wash template",
      exact: true,
    })
    .click();
  await expect.poll(async () => (await saved(page)).width).toBe(1200);
  await expect.poll(async () => (await saved(page)).height).toBe(900);
  const sign = await saved(page);
  expect(
    sign.pages[0].data.objects.some(
      (o: any) => o.text === "CAR\nWASH" && o.fontSize > 100,
    ),
  ).toBe(true);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await saved(page)).width).toBe(before.width);
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects)
    .toEqual(before.pages[0].data.objects);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await saved(page)).width).toBe(1200);
  await page.getByLabel("Template occasion").selectOption("Business cards");
  await expect(page.locator(".template-card")).toHaveCount(24);
  await page
    .getByRole("button", {
      name: "Apply Software studio · bracket mark template",
      exact: true,
    })
    .click();
  await expect
    .poll(async () => JSON.stringify((await saved(page)).pages[0].data.objects))
    .toContain("STACKFIELD");
  const card = await saved(page);
  expect(card.width / card.height).toBe(1.75);
  await page.reload();
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects)
    .toEqual(card.pages[0].data.objects);
});

test("a four-page pitch is one undoable edit and keeps existing other pages", async ({
  page,
}) => {
  await page.goto("/");
  const before = await saved(page);
  await page.getByLabel("Template occasion").selectOption("Business pitches");
  await expect(page.locator(".template-card")).toHaveCount(24);
  await expect(
    page.getByRole("button", { name: "Use 4-page deck" }),
  ).toHaveCount(6);
  await page.getByLabel("Use template dimensions").check();
  await page.getByRole("button", { name: "Use 4-page deck" }).first().click();
  await expect.poll(async () => (await saved(page)).pages.length).toBe(4);
  const deck = await saved(page);
  expect([deck.width, deck.height]).toEqual([1600, 900]);
  expect(new Set(deck.pages.map((p: any) => p.name)).size).toBe(4);
  expect(
    deck.pages.every((p: any) =>
      p.data.objects.some((o: any) => o.type === "Textbox"),
    ),
  ).toBe(true);
  await expect(page.getByLabel("Use template dimensions")).toBeDisabled();
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await saved(page)).pages.length).toBe(1);
  expect((await saved(page)).width).toBe(before.width);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await saved(page)).pages.length).toBe(4);
  await page.getByRole("button", { name: "Use 4-page deck" }).nth(1).click();
  await expect.poll(async () => (await saved(page)).pages.length).toBe(7);
  expect((await saved(page)).pages.slice(4)).toEqual(deck.pages.slice(1));
  await page.reload();
  await expect.poll(async () => (await saved(page)).pages.length).toBe(7);
});
