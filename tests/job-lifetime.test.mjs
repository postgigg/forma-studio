import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
let worker,
  stops = 0;
mock.module("node:child_process", {
  namedExports: {
    spawn(file) {
      if (file === "taskkill") {
        stops++;
        queueMicrotask(() => worker.emit("close", 1));
        return new EventEmitter();
      }
      worker = new EventEmitter();
      worker.stdout = new EventEmitter();
      worker.stderr = new EventEmitter();
      worker.stdin = new Writable({
        write(chunk, encoding, done) {
          done();
        },
      });
      worker.pid = 12345;
      worker.exitCode = null;
      worker.kill = () => {
        stops++;
        queueMicrotask(() => worker.emit("close", 1));
      };
      return worker;
    },
  },
});
const { runCodex } = await import("../server/codex-runner.mjs");
test("a worker remains alive beyond both former deadlines and can still finish normally", async (t) => {
  const workspace = mkdtempSync(path.resolve(".local/lifetime-proof-"));
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  let settled = false;
  const result = runCodex({
    codex: "fake-local-worker",
    workspace,
    prompt: "Create a considered composition",
    schema: { type: "object" },
  });
  result.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  t.mock.timers.tick(12 * 60 * 1000);
  await Promise.resolve();
  assert.equal(stops, 0);
  assert.equal(settled, false);
  writeFileSync(
    path.join(workspace, "answer.json"),
    JSON.stringify({ completed: true }),
  );
  worker.emit("close", 0);
  assert.deepEqual(await result, { completed: true });
});
test("explicit cancellation still stops a long-running worker", async (t) => {
  const workspace = mkdtempSync(path.resolve(".local/cancel-proof-")),
    controller = new AbortController();
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const result = runCodex({
    codex: "fake-local-worker",
    workspace,
    prompt: "Continue until finished",
    schema: { type: "object" },
    signal: controller.signal,
  });
  const rejection = assert.rejects(result, /Cancelled/);
  // The shared execution gate grants the worker its turn asynchronously.
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(20 * 60 * 1000);
  controller.abort();
  await rejection;
  assert.equal(stops, 1);
});
