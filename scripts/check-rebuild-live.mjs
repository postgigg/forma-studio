import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge" });
const jobId =
  process.env.FORMA_AI_TEST_JOB || "3b2fa56d-8537-4b78-adbe-8d0809fad516";
mkdirSync(".local", { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1512, height: 982 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5186");
  await page.getByLabel("Design title", { exact: true }).waitFor();
  await page.getByRole("button", { name: "AI Designer", exact: true }).click();
  await page
    .getByLabel("Recent AI designs", { exact: true })
    .selectOption(jobId);
  await page
    .getByRole("button", { name: "Open editable design", exact: false })
    .waitFor({ timeout: 30000 });
  const data = await page
    .getByAltText("AI design preview", { exact: true })
    .getAttribute("src");
  writeFileSync(
    ".local/rebuild-reference.png",
    Buffer.from(data.split(",")[1], "base64"),
  );
  await page.getByRole("button", { name: "Uploads", exact: true }).click();
  await page
    .locator(
      'input[type=file][accept="image/png,image/jpeg,image/webp,image/gif"]',
    )
    .setInputFiles(".local/rebuild-reference.png");
  await page
    .getByRole("button", { name: "Rebuild in layers", exact: true })
    .click();
  await page
    .getByAltText("Reference for editable reconstruction", { exact: true })
    .waitFor();
  const started = page.waitForResponse(
    (r) => r.url().endsWith("/jobs") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Rebuild in editable layers", exact: true })
    .click();
  const response = await started;
  const job = await response.json();
  assert.equal(response.status(), 202, job.error);
  console.log("Live reference reconstruction started:", job.id);
  const open = page.getByRole("button", {
    name: "Open editable design",
    exact: false,
  });
  await open.waitFor({ timeout: 365000 });
  await open.click();
  await page.waitForTimeout(1000);
  const doc = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.open("forma-studio");
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction("workspace", "readonly")
            .objectStore("workspace")
            .getAll();
          read.onsuccess = () => {
            db.close();
            resolve(
              read.result
                .filter((d) => d?.pages)
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0],
            );
          };
        };
      }),
  );
  const objects = doc.pages[0].data.objects;
  assert.ok(
    objects.length >= 6,
    "The reconstruction must contain real independent objects.",
  );
  assert.ok(
    objects.filter((o) => o.type.toLowerCase() === "textbox").length >= 3,
    "Headlines and copy must be native text.",
  );
  assert.ok(
    objects.some((o) => o.text?.includes("LEAF & LIGHT")),
    "The visible brand must be preserved.",
  );
  assert.ok(
    objects.filter((o) => o.type.toLowerCase() === "image").length <
      objects.length / 2,
    "The result must not be tiled copies of the flat input.",
  );
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: ".local/rebuild-designer.png",
    fullPage: true,
  });
  await page
    .locator(".canvas-container")
    .screenshot({ path: ".local/rebuilt-output.png" });
  writeFileSync(
    ".local/rebuild-proof.json",
    JSON.stringify(
      {
        job: job.id,
        title: doc.name,
        width: doc.width,
        height: doc.height,
        layers: objects.length,
        textLayers: objects.filter((o) => o.type.toLowerCase() === "textbox")
          .length,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: flat image rebuilt into",
    objects.length,
    "independent layers, including editable text at",
    doc.width + "×" + doc.height + ".",
  );
} finally {
  await browser.close();
}
