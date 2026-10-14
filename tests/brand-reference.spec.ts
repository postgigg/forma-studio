import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { importFixture, saved } from "../scripts/qa-fixture.mjs";
const brand = {
  name: "Petal Studio",
  business: "A neighborhood florist selling seasonal bouquets.",
  mission: "Connect neighbors through thoughtful locally grown flowers.",
  audience: "Local gift buyers",
  voice: "Warm, natural and botanical",
};
const intent = { outcome: "Invite neighbors to visit the flower shop", message: "Seasonal flowers, thoughtfully chosen", preserve: "Exact business name and original photography", avoid: "Generic gradients and unrelated decorations" };

test("brand profile survives reload, ranks related artwork and reaches every AI request with an opt out", async ({
  page,
}) => {
  await page.route("**/session", (r) =>
    r.fulfill({ json: { ready: true, token: "qa" } }),
  );
  const requests: Record<string, any[]> = {};
  await page.route("**/health", r => r.fulfill({ json: { ready: true, modelLabel: "GPT-6 Astra", reasoningEffort: "max" } }));
  const fillIntent = async () => {
    await page.locator(".design-intent summary").click();
    for (const [key, label] of Object.entries({ outcome: "Desired outcome", message: "Main message", preserve: "Keep unchanged", avoid: "Avoid" }))
      await page.getByLabel(label, { exact: true }).fill(intent[key as keyof typeof intent]);
  };
  for (const endpoint of ["jobs", "photos", "refinements"])
    await page.route("**/" + endpoint, async (r) => {
      if (r.request().method() === "GET") return r.fulfill({ json: [] });
      (requests[endpoint] ||= []).push(r.request().postDataJSON());
      await r.fulfill({
        status: 400,
        json: { error: "Test request captured" },
      });
    });
  await importFixture(page);
  await page.getByRole("button", { name: "Brand", exact: true }).click();
  for (const [key, label] of Object.entries({
    name: "Company name",
    business: "What your business does",
    mission: "Mission statement",
    audience: "Who you serve",
    voice: "Visual style & voice",
  }))
    await page
      .getByLabel(label, { exact: true })
      .fill(brand[key as keyof typeof brand]);
  await page.getByRole("button", { name: "Save brand profile" }).click();
  await expect(
    page.getByText("Brand profile saved on this device."),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Brand", exact: true }).click();
  await expect(page.getByLabel("Mission statement")).toHaveValue(brand.mission);
  await page.screenshot({ path: "test-results/brand-mission.png" });
  await page.getByRole("button", { name: "Elements", exact: true }).click();
  await expect(
    page.getByLabel("Prioritize artwork for my business"),
  ).toBeChecked();
  await expect(page.locator(".sticker-grid button").first()).toHaveAttribute(
    "aria-label",
    /flower|bloom|blossom|botanical|petal|bouquet|floral|leaf/i,
  );
  await page.getByRole("button", { name: /^Layers/ }).click();
  await page
    .locator(".layer-select")
    .filter({ hasText: "Headline group" })
    .click();
  await page
    .getByRole("button", { name: "Improve with AI", exact: true })
    .click();
  await page
    .getByLabel("Selection refinement brief")
    .fill("Refine the spacing and add relevant botanical artwork.");
  await fillIntent();
  await page
    .getByRole("button", { name: "Generate refinement", exact: true })
    .click();
  await expect.poll(() => requests.refinements?.length).toBe(1);
  expect(requests.refinements[0].brandContext).toEqual(brand);
  expect(requests.refinements[0].designIntent).toEqual(intent);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page
    .locator(".layer-select")
    .filter({ hasText: "Daisy photo" })
    .click();
  for (const pencil of [true, false]) {
    await page
      .getByRole("button", {
        name: pencil ? "AI Pencil" : "Magic Eraser",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog");
    const canvas = page.getByLabel(
      pencil ? "Mark the area to edit" : "Mark the area to erase",
    );
    const b = (await canvas.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.65, b.y + b.height * 0.65, {
      steps: 8,
    });
    await page.mouse.up();
    await page
      .getByLabel(
        pencil ? "AI Pencil instructions" : "Magic Eraser instructions",
      )
      .fill(
        pencil
          ? "Add a matching small flower inside the marked region."
          : "Remove the marked object and restore the surrounding background.",
      );
    if (pencil) await fillIntent();
    await dialog
      .getByRole("button", {
        name: pencil ? "Generate targeted edit" : "Erase with AI",
        exact: true,
      })
      .click();
    await expect.poll(() => requests.refinements?.length).toBe(pencil ? 2 : 3);
    expect(requests.refinements.at(-1).brandContext).toEqual(brand);
    expect(requests.refinements.at(-1).designIntent).toEqual(pencil ? intent : undefined);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  }
  await page.getByRole("button", { name: "Photos", exact: true }).click();
  await page.locator(".photo-creator > summary").click();
  await page
    .getByLabel("AI photo prompt")
    .fill("A seasonal bouquet on the counter in warm window light.");
  await fillIntent();
  await page
    .getByRole("button", { name: "Generate photo", exact: true })
    .click();
  await expect.poll(() => requests.photos?.length).toBe(1);
  expect(requests.photos[0].brandContext).toEqual(brand);
  expect(requests.photos[0].designIntent).toEqual(intent);
  await page.getByRole("button", { name: "AI Designer", exact: true }).click();
  await page
    .getByLabel("AI design brief")
    .fill("Design a seasonal shop opening poster with flowers.");
  await expect(page.getByRole("button", { name: "New AI design", exact: true })).toHaveCount(0);
  await fillIntent();
  await expect(page.getByLabel("AI engine")).toContainText("GPT-6 Astra · Maximum reasoning");
  await page
    .getByRole("button", { name: "Create my design", exact: true })
    .click();
  await expect.poll(() => requests.jobs?.length).toBe(1);
  expect(requests.jobs[0].brandContext).toEqual(brand);
  expect(requests.jobs[0].designIntent).toEqual(intent);
  await page.getByLabel("Use brand context").uncheck();
  await page
    .getByRole("button", { name: "Create my design", exact: true })
    .click();
  await expect.poll(() => requests.jobs?.length).toBe(2);
  expect(requests.jobs[1].brandContext).toBeUndefined();
  await page.reload();
  await page.getByRole("button", { name: "AI Designer", exact: true }).click();
  await page.locator(".design-intent summary").click();
  await expect(page.getByLabel("Desired outcome")).toHaveValue(intent.outcome);
  await page.getByRole("tab", { name: "Results & history" }).click();
  await page.getByRole("button", { name: "New AI design", exact: true }).click();
  await expect(page.getByLabel("Desired outcome")).toHaveValue("");
});

test("image design defaults to preserved pixels and opens an independently editable photo and text", async ({
  page,
}) => {
  await page.route("**/session", (r) =>
    r.fulfill({ json: { ready: true, token: "qa" } }),
  );
  let brief: any, result: any;
  const sample = JSON.parse(
    readFileSync("tests/designer.fixture.json", "utf8"),
  );
  await page.route("**/jobs", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: [] });
    brief = r.request().postDataJSON();
    result = {
      ...sample,
      title: "Preserved photo proof",
      width: brief.width,
      height: brief.height,
      extraAssets: [
        {
          id: "reference-photo",
          name: "Original reference image",
          category: "Photos",
          src: brief.sourceImage,
        },
      ],
      pages: [
        {
          name: "Photo and type",
          background: "#ffffff",
          elements: [
            {
              ...sample.pages[0].elements[0],
              type: "asset",
              name: "Original reference image",
              asset: "reference-photo",
              x: 0,
              y: 0,
              width: brief.width,
              height: brief.height,
            },
            {
              ...sample.pages[0].elements.find((e: any) => e.type === "text"),
              text: "Seasonal stems",
              x: 60,
              y: 60,
              width: 500,
              height: 100,
            },
          ],
        },
      ],
    };
    await r.fulfill({
      json: { id: "preserve-proof", status: "completed", result },
    });
  });
  await page.route("**/jobs/preserve-proof", (r) =>
    r.fulfill({ json: { id: "preserve-proof", status: "completed", result } }),
  );
  await importFixture(page);
  await page
    .locator(".layer-select")
    .filter({ hasText: "Daisy photo" })
    .click();
  await page.getByRole("button", { name: /^Properties/ }).click();
  await page
    .getByRole("button", { name: "Design with this image", exact: true })
    .click();
  await expect(page.getByLabel("Reference treatment")).toHaveValue("preserve");
  await page.getByLabel("Reference treatment").selectOption("rebuild");
  await expect(
    page.getByRole("button", { name: "Rebuild simple artwork", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Reference treatment").selectOption("preserve");
  await page
    .getByRole("complementary", { name: "AI Designer", exact: true })
    .getByRole("button", { name: "Design with this image", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open editable design", exact: false })
    .click();
  expect(brief.referenceMode).toBe("preserve");
  await expect
    .poll(async () => (await saved(page)).name)
    .toBe("Preserved photo proof");
  const doc = await saved(page);
  expect(
    doc.pages[0].data.objects.find((o: any) => o.type === "Image").src,
  ).toBe(brief.sourceImage);
  expect(
    doc.pages[0].data.objects.find((o: any) => o.type === "Textbox").text,
  ).toBe("Seasonal stems");
  await page.reload();
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects)
    .toEqual(doc.pages[0].data.objects);
});
