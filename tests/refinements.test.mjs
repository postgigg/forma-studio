import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateRefinement,
  validateRefinementResult,
} from "../server/refinements.mjs";
const src =
  "data:image/png;base64," +
  readFileSync(
    new URL("../public/elements/daisy-sticker.png", import.meta.url),
  ).toString("base64");
const brief = {
  prompt: "Improve spacing and remove the marked subject.",
  width: 1080,
  height: 1080,
  nodes: [
    { id: "group", type: "Group", parentId: null },
    {
      id: "title",
      type: "Textbox",
      parentId: "group",
      text: "Keep this wording",
    },
    { id: "photo", type: "Image", parentId: null },
  ],
  images: [{ id: "photo", src }],
  preview: src,
};
const result = {
  summary: "Refined selected content",
  edits: [{ id: "title", fontSize: 42, fill: "#302439" }],
  imageEdits: [],
};
const star = (i = 0) => ({
  kind: "star",
  name: `Star ${i + 1}`,
  x: 10 + (i % 9) * 100,
  y: 20 + Math.floor(i / 9) * 180,
  width: 14,
  height: 14,
  angle: 0,
  fill: "#eedd99",
  stroke: null,
  strokeWidth: 0,
  opacity: 1,
  text: null,
  font: null,
  fontSize: null,
  path: null,
});
test("creative refinements support real additions, exact requested counts and valid page bounds", () => {
  const input = {
    ...brief,
    prompt: "Add 45 more stars throughout the design.",
  };
  const output = {
    ...result,
    edits: [],
    additions: Array.from({ length: 45 }, (_, i) => star(i)),
    designNotes: ["Distributed across the composition."],
  };
  assert.equal(validateRefinementResult(output, input).additions.length, 45);
  assert.throws(
    () =>
      validateRefinementResult(
        { ...output, additions: output.additions.slice(1) },
        input,
      ),
    /exactly 45/,
  );
  assert.throws(
    () =>
      validateRefinementResult(
        { ...output, additions: [{ ...star(), x: 1100 }] },
        brief,
      ),
    /inside/,
  );
  assert.throws(
    () =>
      validateRefinementResult(
        {
          ...output,
          additions: [{ ...star(), fill: "url(https://example.com)" }],
        },
        brief,
      ),
    /color/,
  );
  assert.throws(
    () =>
      validateRefinementResult(
        {
          ...output,
          additions: [
            {
              ...star(),
              kind: "text",
              text: "hello",
              font: "Unknown",
              fontSize: 30,
            },
          ],
        },
        brief,
      ),
    /text/,
  );
});
test("selection refinement accepts existing nested layers and rejects unknown or repeated targets", () => {
  const clean = validateRefinement(brief);
  assert.equal(clean.nodes[1].parentId, "group");
  assert.equal(validateRefinementResult(result, clean).edits[0].fontSize, 42);
  assert.throws(
    () =>
      validateRefinementResult(
        { ...result, edits: [{ id: "unselected", left: 50 }] },
        clean,
      ),
    /outside/,
  );
  assert.throws(
    () =>
      validateRefinementResult(
        {
          ...result,
          edits: [
            { id: "title", left: 50 },
            { id: "title", left: 60 },
          ],
        },
        clean,
      ),
    /outside/,
  );
  assert.throws(
    () =>
      validateRefinement({ ...brief, nodes: [...brief.nodes, brief.nodes[0]] }),
    /layer/,
  );
});
test("refinement rejects invalid geometry, unsupported fonts and photo edits outside the supplied selection", () => {
  for (const edit of [
    { id: "title", scaleX: -1 },
    { id: "title", opacity: 2 },
    { id: "photo", width: 10 },
    { id: "photo", fontSize: 30 },
    { id: "title", fontFamily: "Missing face" },
    { id: "title", fill: "url(http://external)" },
    { id: "title", brightness: 0.3 },
  ])
    assert.throws(() =>
      validateRefinementResult({ ...result, edits: [edit] }, brief),
    );
  assert.throws(
    () =>
      validateRefinementResult(
        {
          ...result,
          imageEdits: [{ id: "unselected", prompt: "Remove the background" }],
        },
        brief,
      ),
    /photo/,
  );
  assert.throws(
    () => validateRefinementResult({ ...result, edits: [] }, brief),
    /No changes/,
  );
});
test("Magic Eraser requires exactly one existing photo and a mask with the same dimensions", () => {
  const input = {
    ...brief,
    nodes: [brief.nodes[2]],
    eraser: { id: "photo", mask: src },
  };
  assert.equal(validateRefinement(input).eraser.id, "photo");
  assert.throws(
    () => validateRefinement({ ...input, nodes: brief.nodes }),
    /one selected photo/,
  );
  assert.throws(
    () =>
      validateRefinement({ ...input, eraser: { id: "another", mask: src } }),
    /one selected photo/,
  );
  const bytes = Buffer.from(src.split(",")[1], "base64");
  bytes.writeUInt32BE(512, 16);
  assert.throws(
    () =>
      validateRefinement({
        ...input,
        eraser: {
          id: "photo",
          mask: "data:image/png;base64," + bytes.toString("base64"),
        },
      }),
    /match/,
  );
});
