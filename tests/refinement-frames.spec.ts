import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { fixture, saved } from "../scripts/qa-fixture.mjs";
import {
  validateRefinement,
  validateRefinementResult,
} from "../server/refinements.mjs";

test("mixed frame, text, photo and chart refinement previews, applies, saves and undoes without losing content", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const src =
    "data:image/jpeg;base64," +
    (await readFile("public/photos/coast.jpg")).toString("base64");
  const design: any = structuredClone(fixture);
  design.name = "Mixed frame refinement";
  design.pages[0].data.objects[0].objects.push({
    type: "PhotoFrame",
    id: "letter-frame",
    name: "Photo letter B",
    left: 40,
    top: -80,
    scaleX: 0.2,
    scaleY: 0.2,
    photoMask: {
      shape: "letter",
      letter: "B",
      font: "Georgia",
      italic: true,
      bold: true,
      src,
      zoom: 1.4,
      panX: 0.2,
      panY: -0.1,
    },
  });
  design.pages[0].data.objects[1].objects.push({
    type: "DeviceFrame",
    id: "device-frame",
    name: "Screen frame",
    left: 10,
    top: -50,
    scaleX: 0.13,
    scaleY: 0.13,
    frame: {
      device: "ipad",
      src,
      url: "",
      title: "Coast screen",
      capturedAt: "",
      finish: "silver",
      tiltX: 10,
      tiltY: -15,
      motion: "none",
    },
  });
  await page.route("**/session", (route) =>
    route.fulfill({ json: { ready: true, token: "mixed-qa" } }),
  );
  let failure = 400;
  let submitted: any;
  await page.route("**/refinements", async (route) => {
    if (failure)
      return route.fulfill({
        status: failure,
        json: {
          error:
            failure === 400
              ? "Select a smaller composition."
              : "Reconnect the local designer and retry.",
        },
      });
    try {
      submitted = validateRefinement(route.request().postDataJSON());
      const output = validateRefinementResult(
        {
          summary: "Balanced the selected frames and typography.",
          edits: [
            { id: "letter-frame", scaleX: 0.25, scaleY: 0.25, angle: -4 },
            { id: "device-frame", opacity: 0.8, angle: 6 },
            { id: "title", fill: "#214a55" },
          ],
          imageEdits: [],
          additions: [],
        },
        submitted,
      );
      await route.fulfill({
        json: {
          id: "mixed-qa",
          status: "completed",
          stage: "Ready",
          elapsedSeconds: 1,
          result: { ...output, images: [] },
        },
      });
    } catch (error) {
      await route.fulfill({
        status: 400,
        json: { error: (error as Error).message },
      });
    }
  });
  await page.goto("/");
  await page.getByLabel("Design title", { exact: true }).waitFor();
  await page.locator('input[type=file][accept=".json"]').setInputFiles({
    name: "mixed.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(design)),
  });
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    "Mixed frame refinement (imported)",
  );
  await page.getByRole("button", { name: "Charts", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Bar chart Compare values and trends",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Add chart to design", exact: true })
    .click();
  await expect
    .poll(
      async () => (await saved(page)).pages[0].data.objects.at(-1)?.chart?.type,
    )
    .toBe("bar");
  await page.getByRole("button", { name: /^Layers/ }).click();
  for (const [index, name] of [
    "Headline group",
    "Details group",
    "Daisy photo",
    "bar chart",
  ].entries())
    await page
      .locator(".layer-select")
      .filter({ hasText: name })
      .click(index ? { modifiers: ["Control"] } : {});
  const before = (await saved(page)).pages[0].data.objects;
  await page
    .getByRole("button", { name: "Improve with AI", exact: true })
    .click();
  await page
    .getByLabel("Selection refinement brief")
    .fill(
      "Make this feel more premium. Preserve the wording, chart data, photo crop and screen content.",
    );
  const generate = page.getByRole("button", {
    name: "Generate refinement",
    exact: true,
  });
  await generate.click();
  await expect(page.getByRole("alert")).toContainText(
    "Select a smaller composition",
  );
  await expect(
    page.getByRole("button", { name: "Reconnect", exact: true }),
  ).toHaveCount(0);
  failure = 403;
  await generate.click();
  await expect(
    page.getByRole("button", { name: "Reconnect", exact: true }),
  ).toBeVisible();
  await expect(generate).toBeDisabled();
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  failure = 0;
  await generate.click();
  await expect(page.getByAltText("AI refinement preview")).toBeVisible();
  expect(
    submitted.nodes.some(
      (n: any) => n.type === "PhotoFrame" && n.parentId === "group-a",
    ),
  ).toBe(true);
  expect(
    submitted.nodes.some(
      (n: any) => n.type === "DeviceFrame" && n.parentId === "group-b",
    ),
  ).toBe(true);
  expect((await saved(page)).pages[0].data.objects).toEqual(before);
  await mkdir(".local/proofs", { recursive: true });
  await page.screenshot({ path: ".local/proofs/mixed-refinement-preview.png" });
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  const child = (objects: any[], group: string, id: string) =>
    objects.find((o) => o.id === group).objects.find((o: any) => o.id === id);
  await expect
    .poll(
      async () =>
        child(
          (await saved(page)).pages[0].data.objects,
          "group-a",
          "letter-frame",
        ).scaleX,
    )
    .toBe(0.25);
  const after = (await saved(page)).pages[0].data.objects;
  expect(child(after, "group-a", "letter-frame").photoMask).toEqual(
    child(before, "group-a", "letter-frame").photoMask,
  );
  expect(child(after, "group-b", "device-frame").frame).toEqual(
    child(before, "group-b", "device-frame").frame,
  );
  expect(after.find((o: any) => o.chart).chart).toEqual(
    before.find((o: any) => o.chart).chart,
  );
  expect(after.find((o: any) => o.id === "untouched")).toEqual(
    before.find((o: any) => o.id === "untouched"),
  );
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects)
    .toEqual(before);
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects)
    .toEqual(after);
  await page.reload();
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects)
    .toEqual(after);
  expect(errors).toEqual([]);
});
