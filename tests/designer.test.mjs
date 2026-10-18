import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import desktopPlatform from '../desktop/platform.cjs';
import { validateBrief, validateProposal } from "../server/contract.mjs";
const sample = JSON.parse(
  readFileSync(new URL("./designer.fixture.json", import.meta.url), "utf8"),
);
test("accepts signed line endpoints from a real Codex design, but rejects negative shape sizes", () => {
  assert.equal(
    validateProposal(structuredClone(sample)).pages[0].elements.length,
    12,
  );
  const invalid = structuredClone(sample);
  invalid.pages[0].elements[0].height = -10;
  assert.throws(() => validateProposal(invalid), /bounds/);
});
test("rejects oversized briefs, invalid geometry, external assets, and unsupported typography", () => {
  assert.throws(() =>
    validateBrief({
      prompt: "a".repeat(6001),
      width: 1080,
      height: 1080,
      pages: 1,
    }),
  );
  assert.throws(() =>
    validateBrief({
      prompt: "A botanical design",
      width: 9000,
      height: 1080,
      pages: 1,
    }),
  );
  for (const patch of [
    { x: Infinity },
    { opacity: 2 },
    { font: "arbitrary font" },
    { type: "asset", asset: "https://evil.example/image.png" },
  ]) {
    const invalid = structuredClone(sample);
    Object.assign(invalid.pages[0].elements[0], patch);
    assert.throws(() => validateProposal(invalid));
  }
});
test("local worker rejects missing credentials and foreign web origins without revealing its session token", { timeout: 45000 }, async t => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const runtime = await mkdtemp(path.join(tmpdir(), 'forma-worker-test-'));
  const worker = spawn(process.execPath, [path.join(root, 'server/designer.mjs')], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORMA_DATA_DIR: runtime, FORMA_AI_PORT: '0', FORMA_CODEX_BIN: desktopPlatform.bundledCodexPath(root) },
  });
  t.after(async () => {
    if (worker.exitCode === null && worker.signalCode === null) { const stopped = once(worker, 'exit'); worker.kill(); await stopped; }
    await rm(runtime, { recursive: true, force: true });
  });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('The isolated test worker did not start. ' + output)), 35000);
    worker.stdout.on('data', chunk => {
      output += chunk;
      const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
    worker.stderr.on('data', chunk => { output += chunk; });
    worker.once('error', error => { clearTimeout(timeout); reject(error); });
    worker.once('exit', code => { clearTimeout(timeout); reject(new Error(`The test worker exited with ${code}. ${output}`)); });
  });
  assert.equal((await fetch(base + "/session")).status, 403);
  assert.equal(
    (
      await fetch(base + "/session", {
        headers: { Origin: "https://unrelated.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/jobs", {
        method: "POST",
        headers: {
          Origin: "http://localhost:5186",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/jobs", {
        method: "POST",
        headers: {
          Origin: "http://localhost:5186",
          "X-Forma-Token": "x".repeat(64),
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  const session = await fetch(base + "/session", {
    headers: { Origin: "http://localhost:5186" },
  }).then((r) => r.json());
  assert.match(session.token, /^[a-f0-9]{64}$/);
  const missing = await fetch(
    base + "/jobs/00000000-0000-0000-0000-000000000000",
    {
      headers: {
        Origin: "http://localhost:5186",
        "X-Forma-Token": session.token,
      },
    },
  );
  assert.equal(missing.status, 404);
});
