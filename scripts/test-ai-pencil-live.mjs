import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRefinementService } from "../server/refinements.mjs";
import { saved } from "./qa-fixture.mjs";
const codex =
  process.env.FORMA_CODEX_BIN ||
  path.join(
    process.env.APPDATA,
    "npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe",
  );
const service = createRefinementService({
  codex,
  runtime: path.resolve(".local/pencil-qa"),
  authenticated: true,
  json: (res, status, data) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  },
});
const server = createServer(async (req, res) => {
  if (!(await service.handle(req, res, new URL(req.url, "http://localhost"))))
    res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const api = `http://127.0.0.1:${server.address().port}`;
await mkdir("docs/media", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1512, height: 982 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/session", (r) =>
    r.fulfill({ json: { ready: true, token: "isolated-pencil" } }),
  );
  let request;
  await page.route("**/refinements**", async (route) => {
    if (route.request().method() === "POST")
      request = route.request().postDataJSON();
    const response = await route.fetch({
      url: api + new URL(route.request().url()).pathname,
    });
    await route.fulfill({ response });
  });
  await page.goto("http://127.0.0.1:5190");
  await page
    .getByRole("button", { name: "New blank design", exact: true })
    .click();
  await page
    .getByLabel("Design name", { exact: true })
    .fill("A little ocean · AI Pencil demo");
  await page.getByLabel("Width (px)", { exact: true }).fill("960");
  await page.getByLabel("Height (px)", { exact: true }).fill("640");
  await page
    .getByRole("button", { name: "Create design", exact: true })
    .click();
  const src = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 960;
    c.height = 640;
    const x = c.getContext("2d");
    x.fillStyle = "#d7eee8";
    x.fillRect(0, 0, 960, 640);
    x.fillStyle = "#ffe3a1";
    x.beginPath();
    x.arc(788, 114, 58, 0, Math.PI * 2);
    x.fill();
    for (const [i, color] of [
      "#84c9cb",
      "#55aaad",
      "#328f99",
      "#267984",
    ].entries()) {
      x.fillStyle = color;
      x.beginPath();
      x.moveTo(0, 170 + i * 105);
      for (let p = 0; p < 6; p++)
        x.bezierCurveTo(
          p * 190 + 40,
          125 + i * 105,
          p * 190 + 125,
          212 + i * 105,
          p * 190 + 190,
          170 + i * 105,
        );
      x.lineTo(960, 640);
      x.lineTo(0, 640);
      x.fill();
    }
    x.strokeStyle = "#c8ebe1";
    x.lineWidth = 4;
    x.lineCap = "round";
    for (let i = 0; i < 16; i++) {
      const px = 50 + ((i * 137) % 900),
        py = 240 + ((i * 83) % 330);
      x.beginPath();
      x.moveTo(px, py);
      x.quadraticCurveTo(px + 22, py - 10, px + 46, py);
      x.stroke();
    }
    x.fillStyle = "#f3c388";
    x.beginPath();
    x.moveTo(689, 233);
    x.lineTo(820, 233);
    x.lineTo(795, 257);
    x.lineTo(714, 257);
    x.fill();
    x.fillStyle = "#fff3dc";
    x.beginPath();
    x.moveTo(751, 135);
    x.lineTo(751, 223);
    x.lineTo(690, 223);
    x.closePath();
    x.fill();
    x.strokeStyle = "#345362";
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(758, 131);
    x.lineTo(758, 237);
    x.stroke();
    return c.toDataURL("image/png");
  });
  await page.locator("input[type=file]").evaluateAll(() => {});
  await page.getByRole("button", { name: "Uploads", exact: true }).click();
  await page
    .locator('input[type=file][accept*="image"]')
    .first()
    .setInputFiles({
      name: "ocean-illustration.png",
      mimeType: "image/png",
      buffer: Buffer.from(src.split(",")[1], "base64"),
    });
  await expect(page.locator(".selection-label")).toContainText(
    "ocean-illustration",
  );
  await page.getByLabel("Element width", { exact: true }).fill("960");
  await page.getByLabel("X position", { exact: true }).fill("0");
  await page.getByLabel("Y position", { exact: true }).fill("0");
  const before = (await saved(page)).pages[0].data.objects;
  await page.getByRole("button", { name: "AI Pencil", exact: true }).click();
  const canvas = page.getByLabel("Mark the area to edit");
  const r = await canvas.boundingBox();
  await page.mouse.move(r.x + r.width * 0.12, r.y + r.height * 0.39);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.66, r.y + r.height * 0.84, {
    steps: 20,
  });
  await page.mouse.up();
  await page
    .getByLabel("AI Pencil instructions")
    .fill(
      "Add one elegant friendly shark swimming toward the left in this marked ocean region, viewed from the side just under the surface. Match the existing flat illustrated style, soft teal palette, simple clean vector-like shapes and gentle lighting. Keep the shark fully within the marked region. Preserve the sailboat, sun, waves and everything outside the marked area.",
    );
  await page.screenshot({ path: "docs/media/ai-pencil-marking.png" });
  await page.getByRole("button", { name: "Generate targeted edit" }).click();
  const started = Date.now();
  let report = 0;
  while (
    !(await page.getByRole("button", { name: "Apply targeted edit" }).count())
  ) {
    const error = page.locator("[role=alert]");
    if (await error.count()) throw Error(await error.innerText());
    if (Date.now() - started > 540000)
      throw Error("Pencil live test timed out");
    if (Date.now() - report > 15000) {
      console.log(await page.locator(".ai-progress").innerText());
      report = Date.now();
    }
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: "docs/media/ai-pencil-review.png" });
  const after = await page.getByAltText("AI Pencil result").getAttribute("src");
  await writeFile(
    "docs/media/ai-pencil-ocean.png",
    Buffer.from(after.split(",")[1], "base64"),
  );
  const pixels = await page.evaluate(
    async ({ before, after, mask }) => {
      const data = async (src) => {
        const i = new Image();
        i.src = src;
        await i.decode();
        const c = document.createElement("canvas");
        c.width = i.width;
        c.height = i.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(i, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height).data;
      };
      const [a, b, m] = await Promise.all([
        data(before),
        data(after),
        data(mask),
      ]);
      let outside = 0,
        inside = 0;
      for (let i = 0; i < a.length; i += 4)
        if ([0, 1, 2, 3].some((k) => a[i + k] !== b[i + k]))
          m[i] === 0 ? outside++ : inside++;
      return { outside, inside };
    },
    { before: request.images[0].src, after, mask: request.pencil.mask },
  );
  expect(pixels.outside).toBe(0);
  expect(pixels.inside).toBeGreaterThan(1000);
  await page.getByRole("button", { name: "Apply targeted edit" }).click();
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects[0].src)
    .not.toBe(before[0].src);
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects)
    .toEqual(before);
  expect(errors).toEqual([]);
  await writeFile(
    ".local/pencil-proof.json",
    JSON.stringify(
      {
        realAI: true,
        outsideChangedPixels: pixels.outside,
        insideChangedPixels: pixels.inside,
        reviewedBeforeApply: true,
        singleUndo: true,
        runtimeErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: real targeted AI edit, unchanged pixels outside mask, review/apply/Undo.",
  );
} finally {
  service.shutdown();
  await browser.close();
  await new Promise((r) => server.close(r));
}
