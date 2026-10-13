import test from "node:test";
import assert from "node:assert/strict";
import { validateCapture } from "../server/frames.mjs";
test("frame capture accepts explicit web pages and local development sites with known device sizes", () => {
  assert.equal(
    validateCapture({ url: "example.com", device: "macbook" }).url,
    "https://example.com/",
  );
  assert.equal(
    validateCapture({ url: "localhost:5186", device: "iphone" }).url,
    "http://localhost:5186/",
  );
  assert.deepEqual(
    validateCapture({ url: "https://example.com", device: "iphone" }).device
      .viewport,
    { width: 390, height: 795 },
  );
});
test("frame capture rejects file, script, credential-bearing addresses and arbitrary device definitions", () => {
  for (const url of [
    "file:///C:/Users/exont/test.html",
    "javascript:alert(1)",
    "data:text/html,test",
    "https://name:password@example.com",
    "ftp://example.com",
  ])
    assert.throws(() => validateCapture({ url, device: "macbook" }));
  assert.throws(() =>
    validateCapture({ url: "https://example.com", device: "unknown" }),
  );
  assert.throws(() =>
    validateCapture({
      url: "https://example.com/" + "a".repeat(2100),
      device: "ipad",
    }),
  );
});
