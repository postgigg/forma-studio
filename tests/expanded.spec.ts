import { test, expect } from "@playwright/test";
import { saved, fixture } from "../scripts/qa-fixture.mjs";

test("occasion templates are distinct editable compositions; the library closes without a duplicate Design icon", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("YOUR STUDIO", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Hide library", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Show library", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Design", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByLabel("Template occasion").selectOption("Birthdays");
  await expect(page.locator(".template-card")).toHaveCount(10);
  await page
    .locator(".template-card")
    .filter({ hasText: "Make a wish cake party" })
    .click();
  await expect
    .poll(async () =>
      (await saved(page)).pages[0].data.objects
        .filter((o: any) => o.type === "Textbox")
        .map((o: any) => o.text)
        .join(" "),
    )
    .toContain("make\na wish");
  const first = (await saved(page)).pages[0].data.objects;
  expect(first.filter((o: any) => o.type === "Textbox").length).toBeGreaterThan(
    2,
  );
  expect(first.some((o: any) => o.type === "Path")).toBe(true);
  await page.getByLabel("Template occasion").selectOption("Business");
  await expect(page.locator(".template-card")).toHaveCount(10);
  await page
    .locator(".template-card")
    .filter({ hasText: "Monogram business card" })
    .click();
  await expect
    .poll(async () => JSON.stringify((await saved(page)).pages[0].data.objects))
    .toContain("ALEX MORGAN");
  await page.reload();
  await expect
    .poll(async () => JSON.stringify((await saved(page)).pages[0].data.objects))
    .toContain("ALEX MORGAN");
  await page.screenshot({ path: "test-results/occasion-library.png" });
});

test("rapid zoom repaints every frame and leaves editable layer coordinates intact", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Design title", { exact: true }).waitFor();
  const before = (await saved(page)).pages[0].data.objects;
  const proof = await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>(".lower-canvas")!,
      stage = document.querySelector(".canvas-stage")!;
    const blanks: number[] = [],
      mismatches: number[] = [];
    let frames = 0;
    const sample = () => {
      const ctx = canvas.getContext("2d")!,
        pixel = ctx.getImageData(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1,
          1,
        ).data;
      const bounds = canvas.getBoundingClientRect();
      if (pixel[3] === 0) blanks.push(frames);
      if (Math.abs(bounds.width - parseFloat(canvas.style.width)) > 1)
        mismatches.push(frames);
      frames++;
    };
    for (let i = 0; i < 50; i++) {
      const b = canvas.getBoundingClientRect();
      for (let j = 0; j < 3; j++)
        stage.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: i < 25 ? 28 : -28,
            clientX: b.left + b.width / 2,
            clientY: b.top + b.height / 2,
            bubbles: true,
            cancelable: true,
          }),
        );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => {
          sample();
          resolve();
        }),
      );
    }
    return { frames, blanks, mismatches };
  });
  expect(proof).toEqual({ frames: 50, blanks: [], mismatches: [] });
  expect((await saved(page)).pages[0].data.objects).toEqual(before);
  await page.getByLabel("Canvas zoom", { exact: true }).fill("9");
  await expect
    .poll(
      async () => (await page.locator(".upper-canvas").boundingBox())!.width,
    )
    .toBeCloseTo(97.2, 0);
});

test("transparent graphic gradient renders alpha and retains its opacity after reload", async ({
  page,
}) => {
  const design = structuredClone(fixture);
  design.name = "Transparent gradient";
  design.pages[0].data.objects = [
    {
      type: "Rect",
      id: "fade",
      name: "Fade rectangle",
      originX: "left",
      originY: "top",
      left: 100,
      top: 100,
      width: 800,
      height: 800,
      strokeWidth: 0,
      fill: "#754adb",
    },
  ];
  design.pages[0].data.background = "transparent";
  await page.goto("/");
  await page.getByLabel("Design title", { exact: true }).waitFor();
  await page
    .locator('input[type=file][accept=".json"]')
    .setInputFiles({
      name: "fade.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(design)),
    });
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    "Transparent gradient (imported)",
  );
  await page.getByRole("button", { name: /^Layers/ }).click();
  await page
    .locator(".layer-select")
    .filter({ hasText: "Fade rectangle" })
    .click();
  await page
    .getByRole("button", { name: "Graphic colors and gradient", exact: true })
    .first()
    .click();
  await page.getByRole("tab", { name: "Gradient", exact: true }).click();
  await page
    .getByRole("button", { name: "Fade to transparent", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply graphic gradient", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await saved(page)).pages[0].data.objects[0].fill.colorStops[1].color,
    )
    .toMatch(/00$/);
  const alpha = await page
    .locator(".lower-canvas")
    .evaluate((canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d")!,
        z = canvas.width / 1080;
      return [
        ctx.getImageData(120 * z, 400 * z, 1, 1).data[3],
        ctx.getImageData(880 * z, 400 * z, 1, 1).data[3],
      ];
    });
  expect(alpha[0]).toBeGreaterThan(220);
  expect(alpha[1]).toBeLessThan(30);
  await page.reload();
  await page.getByRole("button", { name: /^Layers/ }).click();
  await page
    .locator(".layer-select")
    .filter({ hasText: "Fade rectangle" })
    .click();
  await page
    .getByRole("button", { name: "Graphic colors and gradient", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Gradient end opacity")).toHaveValue("0");
});
