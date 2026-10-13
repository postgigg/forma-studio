import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { writeFile, mkdir } from "node:fs/promises";
import { saved } from "../scripts/qa-fixture.mjs";
import { createFrameService } from "../server/frames.mjs";

let website: Server, address: string;
test.beforeAll(async () => {
  const service = createFrameService({
    json: (res, status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    },
  });
  website = createServer(async (_req, res) => {
    if (await service.handle(_req, res, new URL(_req.url!, "http://127.0.0.1")))
      return;
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      `<!doctype html><html><head><title>Petal Studio — device capture proof</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#f2e9db;color:#343e38;font-family:Arial}nav{display:flex;justify-content:space-between;padding:28px 7%;font-size:16px;border-bottom:1px solid #d1c6b1}main{display:grid;grid-template-columns:1.2fr 1fr;gap:50px;padding:70px 7%}small{letter-spacing:3px}h1{font-family:Georgia;font-weight:400;font-size:76px;line-height:1.03;margin:26px 0}p{font-size:18px;line-height:1.6;max-width:390px}button{background:#435a4c;color:#fff;border:0;border-radius:40px;padding:18px 28px;margin-top:20px}article{background:#d4b29f;border-radius:180px 180px 20px 20px;min-height:520px;position:relative;display:grid;place-items:center}.flower{width:190px;height:190px;background:#efe2ae;border-radius:50%;box-shadow:80px 0 #e7c5b4,-80px 0 #e7c5b4,0 80px #e7c5b4,0 -80px #e7c5b4}.flower:after{content:'';width:58px;height:58px;background:#947550;border-radius:50%;display:block;margin:66px}footer{padding:20px 7%;font-size:13px}@media(max-width:600px){nav{font-size:13px;padding:24px}nav span{display:none}main{display:flex;flex-direction:column;padding:36px 24px;gap:24px}h1{font-size:49px;margin:16px 0}p{font-size:14px}article{min-height:270px}.flower{transform:scale(.65)}button{padding:13px 22px;margin:0}footer{font-size:11px}}</style></head><body><nav><b>petal studio.</b><span>OUR WORK　 THE STUDIO　 SAY HELLO ↗</span></nav><main><section><small>DESIGN, WITH FEELING.</small><h1>A little more<br>room to bloom.</h1><p>Thoughtful identities and digital experiences for people making something meaningful.</p><button>Explore our work ↗</button></section><article><div class="flower"></div></article></main><footer>INDEPENDENT CREATIVE STUDIO　 ·　 EST. 2026</footer></body></html>`,
    );
  });
  await new Promise<void>((resolve) => website.listen(0, "127.0.0.1", resolve));
  address = `http://127.0.0.1:${(website.address() as any).port}`;
  await mkdir(".local/proofs", { recursive: true });
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => website.close(() => resolve()));
});

test("real website captures render in five device frames; perspective, saved screens and 3D exports survive reload", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route('**/session',route=>route.fulfill({json:{ready:true,token:'isolated-capture-test'}}));
  await page.route("**/frames/capture", async (route) => {
    const response = await route.fetch({ url: address + "/frames/capture" });
    await route.fulfill({ response });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "New blank design", exact: true })
    .click();
  await page
    .getByLabel("Design name", { exact: true })
    .fill("Device frame proof");
  await page
    .getByRole("button", { name: "Create design", exact: true })
    .click();
  await page.getByRole("button", { name: "Frames", exact: true }).click();
  await page.getByRole("button", { name: /^MacBook 1440/ }).click();
  const captures = [];
  for (const [model, width, height] of [
    ["macbook", 1440, 900],
    ["laptop", 1440, 810],
    ["ipad", 834, 1146],
    ["tablet", 1024, 727],
    ["iphone", 390, 795],
  ] as const) {
    await page.getByLabel("Device model", { exact: true }).selectOption(model);
    await page.getByLabel("Website address", { exact: true }).fill(address);
    const pending = page.waitForResponse(
      (r) =>
        r.url().endsWith("/frames/capture") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", {
        name: /^(Render website|Refresh website screen)$/,
      })
      .click();
    const response = await pending;
    expect(response.status()).toBe(200);
    const captured = await response.json();
    expect(captured.width).toBe(width);
    expect(captured.height).toBe(height);
    expect(captured.title).toContain("Petal Studio");
    await expect(page.locator(".frame-captured")).toContainText("Petal Studio");
    await page.getByLabel("Device horizontal tilt").fill("-22");
    await page.getByLabel("Device vertical tilt").fill("9");
    await page.waitForTimeout(250);
    await page
      .locator(".frame-preview")
      .screenshot({ path: `.local/proofs/frame-${model}.png` });
    captures.push({ device: model, width, height, bytes: captured.src.length });
  }
  await page.getByLabel("Device 3D movement").selectOption("orbit");
  await page
    .getByRole("button", { name: "Add frame to design", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects.at(-1)?.type)
    .toBe("DeviceFrame");
  const before = (await saved(page)).pages[0].data.objects.at(-1);
  expect(before.frame.motion).toBe("orbit");
  expect(before.frame.tiltY).toBe(-22);
  expect(before.frame.src.startsWith("data:image/png;base64,")).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: /^Layers/ }).click();
  await page
    .locator(".layer-select")
    .filter({ hasText: "iPhone frame" })
    .click();
  await page.getByRole("button", { name: "Edit frame", exact: true }).click();
  await expect(page.getByLabel("Website address", { exact: true })).toHaveValue(
    address + "/",
  );
  await expect(page.getByLabel("Device 3D movement")).toHaveValue("orbit");
  await page.getByLabel("Device horizontal tilt").fill("20");
  await page
    .getByRole("button", { name: "Save frame changes", exact: true })
    .click();
  await expect
    .poll(
      async () => (await saved(page)).pages[0].data.objects.at(-1).frame.tiltY,
    )
    .toBe(20);
  await page.keyboard.press("Control+z");
  await expect
    .poll(
      async () => (await saved(page)).pages[0].data.objects.at(-1).frame.tiltY,
    )
    .toBe(-22);
  await page.getByRole("button", { name: "Animate", exact: true }).click();
  await expect(page.locator(".motion-canvas")).toHaveAttribute(
    "data-ready",
    "true",
  );
  const first = await page
    .getByLabel("Animated design preview")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.waitForTimeout(350);
  const second = await page
    .getByLabel("Animated design preview")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  expect(second === first).toBe(false);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await expect(page.locator(".presentation .motion-canvas")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(page.locator(".presentation .motion-canvas")).toHaveAttribute(
    "data-playing",
    "true",
  );
  const presentStart = await page
    .getByLabel("Animated design preview")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.waitForTimeout(350);
  expect(
    (await page
      .getByLabel("Animated design preview")
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())) ===
      presentStart,
  ).toBe(false);
  await page
    .getByRole("button", { name: "Close presentation", exact: true })
    .click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await expect(page.locator(".presentation .motion-canvas")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(page.locator(".presentation .motion-canvas")).toHaveAttribute(
    "data-playing",
    "false",
  );
  await page
    .getByRole("button", { name: "Close presentation", exact: true })
    .click();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const format of ["gif", "webm"]) {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByLabel("File type", { exact: true }).selectOption(format);
    await page.getByLabel("Animation resolution").selectOption("360");
    await page
      .getByLabel("Export animation", { exact: true })
      .selectOption("none");
    await page.getByLabel("Export animation duration").selectOption("1");
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    await (await pending).saveAs(`.local/device-motion.${format}`);
  }
  expect((await saved(page)).pages[0].data.objects.at(-1).frame).toEqual(
    before.frame,
  );
  await writeFile(
    ".local/device-proof.json",
    JSON.stringify(
      {
        captures,
        embedded: true,
        persisted: true,
        perspectiveUndo: true,
        motionFramesDiffer: true,
        presentationMotion: true,
        reducedMotion: true,
        runtimeErrors: errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});
