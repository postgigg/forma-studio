import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePhotoBrief, pngDimensions } from "../server/photos.mjs";
test("photo requests validate length, format and style without treating prompts as commands", () => {
  const prompt = "A bottle beside a flower; $(echo example)";
  assert.equal(
    validatePhotoBrief({ prompt, format: "Square", style: "Studio product" })
      .prompt,
    prompt,
  );
  assert.throws(() =>
    validatePhotoBrief({
      prompt: "short",
      format: "Square",
      style: "Natural light",
    }),
  );
  assert.throws(() =>
    validatePhotoBrief({ prompt, format: "arbitrary", style: "Natural light" }),
  );
});
test("photo ingestion rejects arbitrary files and excessive dimensions", () => {
  assert.throws(() => pngDimensions(Buffer.from("not an image")));
  const data = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(data);
  data.writeUInt32BE(1024, 16);
  data.writeUInt32BE(1024, 20);
  assert.deepEqual(pngDimensions(data), { width: 1024, height: 1024 });
  data.writeUInt32BE(100000, 16);
  assert.throws(() => pngDimensions(data));
});
