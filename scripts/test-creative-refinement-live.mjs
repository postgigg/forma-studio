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
  runtime: path.resolve(".local/creative-qa"),
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
await mkdir(".local/proofs", { recursive: true });
await mkdir("docs/media", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1512, height: 982 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/session", (r) =>
    r.fulfill({ json: { ready: true, token: "isolated-creative-proof" } }),
  );
  let result;
  await page.route("**/refinements**", async (route) => {
    const original = new URL(route.request().url());
    const response = await route.fetch({ url: api + original.pathname });
    const value = await response.json();
    if (value.result) result = value.result;
    await route.fulfill({ response });
  });
  await page.goto(process.env.FORMA_TEST_URL || "http://127.0.0.1:5190");
  await page.getByLabel("Design title", { exact: true }).waitFor();
  const design = await page.evaluate(async () => {
    const { templates, templateObjects } = await import("/src/templates.ts");
    const t = templates.find((t) => /cinema/i.test(t.name));
    if (!t) throw Error("Cinema template missing");
    const objects = await templateObjects(t, t.width, t.height);
    return {
      id: crypto.randomUUID(),
      name: "Cinema under the stars · AI refinement demo",
      width: t.width,
      height: t.height,
      updatedAt: new Date().toISOString(),
      pages: [
        {
          id: crypto.randomUUID(),
          name: "Cinema under the stars",
          thumbnail: "",
          data: {
            background: t.background,
            objects: objects.map((o) => o.toObject()),
          },
        },
      ],
    };
  });
  await page
    .locator('input[type=file][accept=".json"]')
    .setInputFiles({
      name: "cinema.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(design)),
    });
  await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
    /Cinema under the stars/,
  );
  await page.locator(".upper-canvas").click({ position: { x: 15, y: 15 } });
  await page.keyboard.press("Control+a");
  const before = await saved(page);
  await page
    .getByRole("button", { name: "Improve with AI", exact: true })
    .click();
  await page
    .getByLabel("Selection refinement brief")
    .fill(
      "Add exactly 45 more stars throughout this cinema poster. Spread them organically across the top, both sides and bottom, with varied sizes and rotations, like a refined celestial scatter. Keep every existing word, film frame and date exactly. Protect the title and small print from overlap. Keep the night-sky palette. Make the result intentional, professional and beautifully balanced, not a row or a grid of stars.",
    );
  await page
    .getByRole("button", { name: "Generate refinement", exact: true })
    .click();
  const start = Date.now();
  let report = 0;
  while (
    !(await page
      .getByRole("button", { name: "Apply changes", exact: true })
      .count())
  ) {
    const error = page.locator(".refine-body [role=alert]");
    if (await error.count()) throw Error(await error.innerText());
    if (Date.now() - start > 540000) throw Error("Creative live test timeout");
    if (Date.now() - report > 15000) {
      console.log(await page.locator(".ai-progress").innerText());
      report = Date.now();
    }
    await page.waitForTimeout(1200);
  }
  expect(result.additions).toHaveLength(45);
  const stars = result.additions;
  expect(
    Math.max(...stars.map((s) => s.x)) - Math.min(...stars.map((s) => s.x)),
  ).toBeGreaterThan(design.width * 0.55);
  expect(
    Math.max(...stars.map((s) => s.y)) - Math.min(...stars.map((s) => s.y)),
  ).toBeGreaterThan(design.height * 0.55);
  await page.screenshot({ path: "docs/media/ai-refinement.png" });
  await writeFile(
    ".local/creative-refinement-result.json",
    JSON.stringify(result, null, 2),
  );
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects.length)
    .toBe(before.pages[0].data.objects.length + 45);
  const after = await saved(page);
  for (const original of before.pages[0].data.objects.filter((o) =>
    /text/i.test(o.type),
  ))
    expect(
      after.pages[0].data.objects.find((o) => o.id === original.id).text,
    ).toBe(original.text);
  await page.keyboard.press("Escape");
  await page
    .locator(".artboard")
    .screenshot({ path: "docs/media/cinema-ai-result.png" });
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects)
    .toEqual(before.pages[0].data.objects);
  expect(errors).toEqual([]);
  await writeFile(
    ".local/creative-refinement-proof.json",
    JSON.stringify(
      {
        realAI: true,
        addedStars: 45,
        spreadAcrossPoster: true,
        preservedText: true,
        singleUndo: true,
        runtimeErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: real AI added 45 editable stars across the poster, preserved text, one-step Undo.",
  );
} finally {
  service.shutdown();
  await browser.close();
  await new Promise((r) => server.close(r));
}
