// Real model verification, using a separate worker and browser profile.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { aiEngine } from "../server/ai-engine.mjs";
const root = process.cwd(), folder = path.join(root, ".local", `professional-design-proof-${aiEngine.model}`);
mkdirSync(folder, { recursive: true });
const base = "http://127.0.0.1:5191", origin = "http://localhost:5186";
try { await fetch(base + "/health", { signal: AbortSignal.timeout(800) }); throw new Error("Port 5191 is already in use."); }
catch (e) { if (e.message.includes("already")) throw e; }
const child = spawn(process.execPath, ["server/designer.mjs"], {
  cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, FORMA_AI_PORT: "5191", FORMA_DATA_DIR: folder },
});
child.stdout.on("data", c => appendFileSync(path.join(folder, "worker.log"), c));
child.stderr.on("data", c => appendFileSync(path.join(folder, "worker.log"), c));
let token, browser;
const cases = [
  { id: "yard-sign", width: 1800, height: 1200, prompt: "Create a modern, highly legible yard sign for Petal & Stem, a neighborhood florist. Exact copy: PETAL & STEM / FRESH FLOWERS / OPEN TODAY. No other words. Use rich forest green, warm ivory and a coral accent. Create one deliberate botanical graphic using editable vector artwork. Strong readability from across the street; generous margins. Keep every word exactly as supplied.", designIntent: { outcome: "Help passing neighbors recognize a florist and visit today", message: "Fresh flowers, open today", preserve: "All three supplied lines exactly", avoid: "Tiny details, gradients, generic pills, invented contact information" }, brandContext: { name: "Petal & Stem", business: "Neighborhood florist", mission: "Make seasonal flowers an everyday pleasure", audience: "Passing neighbors", voice: "Warm, distinctive, confident" }, required: ["PETAL & STEM", "FRESH FLOWERS", "OPEN TODAY"] },
  { id: "birthday-poster", width: 1080, height: 1440, prompt: "Create an expressive, polished birthday poster with exact copy: MAYA TURNS 30 / SATURDAY, JUNE 12 / 7 PM / THE GARDEN ROOM. Use cobalt blue, butter yellow and vivid coral. Give the numeral 30 an unmistakable celebratory role, with a few intentional vector ribbons or stars and confident modern typography. Energetic grown-up celebration, not a generic greeting-card template. Do not add any other wording.", designIntent: { outcome: "Make friends feel excited to attend and remember the time and place", message: "Maya turns 30", preserve: "MAYA TURNS 30; SATURDAY, JUNE 12; 7 PM; THE GARDEN ROOM", avoid: "Sales CTA, gradients, stock photos, fake RSVP details, tiny type" }, required: ["MAYA", "30", "SATURDAY, JUNE 12", "7 PM", "THE GARDEN ROOM"] },
];
try {
  for (let i = 0; i < 50; i++) {
    try { const session = await (await fetch(base + "/session", { headers: { Origin: origin } })).json(); if (session.ready) { assert.equal(session.model, aiEngine.model); assert.equal(session.reasoningEffort, aiEngine.reasoningEffort); token = session.token; break; } } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  assert.ok(token, "Isolated worker must be authenticated");
  const headers = { Origin: origin, "X-Forma-Token": token, "Content-Type": "application/json" };
  browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1700, height: 1150 } });
  await page.goto(process.env.FORMA_TEST_URL || "http://127.0.0.1:5190");
  await page.getByLabel("Design title", { exact: true }).waitFor();
  for (const example of cases) {
    const { id, required, ...brief } = example;
    let result;
    const saved = path.join(folder, `${id}-proposal.json`);
    if (existsSync(saved)) result = JSON.parse(readFileSync(saved, "utf8"));
    else {
    const started = await fetch(base + "/jobs", { method: "POST", headers, body: JSON.stringify({ ...brief, pages: 1, style: "Art director’s choice" }) });
    const job = await started.json();
    assert.ok(started.ok, job.error);
    console.log(`Generating ${id}: ${job.id} · ${aiEngine.modelLabel} / ${aiEngine.reasoningEffort}`);
    writeFileSync(path.join(folder, `${id}-job.json`), JSON.stringify({ id: job.id }));
    for (let i = 0; i < 300; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const status = await (await fetch(`${base}/jobs/${job.id}`, { headers })).json();
      if (status.status === "failed") throw new Error(status.error);
      if (status.status === "completed") { result = status.result; break; }
      if (i % 15 === 0) console.log(`${id}: ${status.stage}`);
    }
    }
    assert.ok(result, "Generation must complete");
    const copy = result.pages.flatMap(p => p.elements.filter(e => e.type === "text").map(e => e.text)).join(" ").replace(/\s+/g, " ");
    for (const text of required) assert.ok(copy.includes(text), `${id}: missing required copy ${text}`);
    writeFileSync(path.join(folder, `${id}-proposal.json`), JSON.stringify(result, null, 2));
    const design = await page.evaluate(async proposal => { const { proposalToDesign } = await import("/src/ai.ts"); return proposalToDesign(proposal); }, result);
    writeFileSync(path.join(folder, `${id}.forma.json`), JSON.stringify(design));
    await page.locator('input[type=file][accept=".json"]').setInputFiles({ name: `${id}.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(design)) });
    await page.getByLabel("Design title", { exact: true }).filter({ visible: true }).waitFor();
    await page.waitForFunction(title => document.querySelector('[aria-label="Design title"]')?.value === title + " (imported)", result.title);
    await page.getByLabel("Canvas zoom preset", { exact: true }).selectOption("0.5");
    await page.locator(".lower-canvas").screenshot({ path: path.join(folder, `${id}.png`) });
    console.log(JSON.stringify({ id, title: result.title, layers: result.pages[0].elements.length, exactCopy: true, description: result.description }));
  }
} finally {
  await browser?.close();
  if (token) await fetch(base + "/shutdown", { method: "POST", headers: { Origin: origin, "X-Forma-Token": token } }).catch(() => {});
  else child.kill();
}
