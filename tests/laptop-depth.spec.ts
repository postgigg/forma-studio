import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { saved } from "../scripts/qa-fixture.mjs";

test("hinged laptop still renders and rotates without WebGL", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: any[]
    ) {
      if (kind.includes("webgl")) return null;
      return original.call(this, kind as any, ...args);
    } as typeof original;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Frames", exact: true }).click();
  await page.getByRole("button", { name: /^MacBook 1440/ }).click();
  await page
    .getByLabel("Upload device screen")
    .setInputFiles("public/photos/coast.jpg");
  const preview = page.getByLabel("Device frame preview");
  await expect
    .poll(() =>
      preview.evaluate((c: HTMLCanvasElement) => c.toDataURL().length),
    )
    .toBeGreaterThan(20000);
  const first = await preview.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.getByLabel("Laptop screen opening").fill("125");
  await expect
    .poll(() => preview.evaluate((c: HTMLCanvasElement) => c.toDataURL()))
    .not.toBe(first);
  await page.screenshot({ path: "test-results/laptop-software-render.png" });
});

test("older laptops gain a hinged screen; view edits, preview rotation and Undo retain the embedded screen", async ({
  page,
}) => {
  const src =
    "data:image/jpeg;base64," +
    (await readFile("public/photos/coast.jpg")).toString("base64");
  const legacy = {
    id: "legacy-laptop",
    name: "Legacy laptop",
    width: 1600,
    height: 1000,
    updatedAt: new Date().toISOString(),
    pages: [
      {
        id: "legacy-page",
        name: "Laptop",
        thumbnail: "",
        data: {
          background: "#ffffff",
          objects: [
            {
              type: "DeviceFrame",
              id: "laptop",
              name: "MacBook frame",
              left: 150,
              top: 90,
              width: 1905,
              height: 1270,
              scaleX: 0.65,
              scaleY: 0.65,
              frame: {
                device: "macbook",
                src,
                url: "",
                title: "Saved coast screen",
                capturedAt: new Date().toISOString(),
                finish: "silver",
                tiltX: 0,
                tiltY: 0,
                motion: "none",
              },
            },
          ],
        },
      },
    ],
  };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Design title", { exact: true }).waitFor();
  await page.locator('input[type=file][accept=".json"]').setInputFiles({
    name: "legacy-laptop.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    "Legacy laptop (imported)",
  );
  const edit = async () => {
    await page.getByRole("button", { name: /^Layers/ }).click();
    await page
      .locator(".layer-select")
      .filter({ hasText: "MacBook frame" })
      .click();
    await page.getByRole("button", { name: "Edit frame", exact: true }).click();
  };
  await edit();
  await expect(page.getByLabel("Laptop screen opening")).toHaveValue("108");
  const canvas = page.getByLabel("Device frame preview");
  await expect
    .poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL().length))
    .toBeGreaterThan(20000);
  const original = await canvas.evaluate((c: HTMLCanvasElement) =>
    c.toDataURL(),
  );
  await page.getByLabel("Laptop screen opening").fill("124");
  await expect
    .poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()))
    .not.toBe(original);
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 80,
    bounds.y + bounds.height / 2 - 45,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(page.getByLabel("Device horizontal tilt")).not.toHaveValue("0");
  await page
    .getByRole("button", { name: "Play 3D preview", exact: true })
    .click();
  await expect(page.getByLabel("Device 3D movement")).toHaveValue("orbit");
  const moving = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await expect
    .poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()))
    .not.toBe(moving);
  await page
    .getByRole("button", { name: "Pause 3D preview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save frame changes", exact: true })
    .click();
  await expect
    .poll(
      async () => (await saved(page)).pages[0].data.objects[0].frame.lidAngle,
    )
    .toBe(124);
  expect((await saved(page)).pages[0].data.objects[0].frame.src).toBe(src);
  await page.keyboard.press("Control+z");
  await expect
    .poll(
      async () => (await saved(page)).pages[0].data.objects[0].frame.lidAngle,
    )
    .toBe(108);
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(
      async () => (await saved(page)).pages[0].data.objects[0].frame.lidAngle,
    )
    .toBe(124);
  await page.reload();
  await edit();
  await expect(page.getByLabel("Laptop screen opening")).toHaveValue("124");
  await expect(page.getByLabel("Device 3D movement")).toHaveValue("orbit");
  await mkdir(".local/proofs", { recursive: true });
  await page.screenshot({ path: ".local/proofs/laptop-depth-saved.png" });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("File type", { exact: true }).selectOption("svg");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const svg = await readFile((await (await pending).path())!, "utf8");
  expect(svg).toContain("data:image/png;base64,");
  expect(errors).toEqual([]);
});
