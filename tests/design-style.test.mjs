import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateDesignStyle,
  personalStyleDirection,
} from "../shared/design-style.mjs";
import { brandDirection } from "../shared/brand-context.mjs";
import { validateBrief } from "../server/contract.mjs";
import { validatePhotoBrief } from "../server/photos.mjs";
import { validateRefinement } from "../server/refinements.mjs";
import { refinementDirection } from "../server/refinement-direction.mjs";
import { pencilDirection } from "../server/pencil-direction.mjs";
const profile = {
  styles: ["minimal", "editorial"],
  enabled: true,
  density: "airy",
  typography: "sans",
  colorMood: "brand",
  details: "Original photography, confident typography.",
  avoid: "Clutter and tiny decorative labels.",
};
const brand = {
  name: "Petal Studio",
  business: "Florist",
  mission: "Connect neighbors through seasonal flowers.",
  audience: "Gift buyers",
  voice: "Warm and natural",
};
const src =
  "data:image/png;base64," +
  readFileSync(
    new URL("../public/elements/daisy-sticker.png", import.meta.url),
  ).toString("base64");
const input = {
  prompt: "Create a seasonal flowers campaign poster",
  width: 1080,
  height: 1350,
  pages: 1,
  designProfile: profile,
  brandContext: brand,
};
test("personal preferences are bounded and retained in every AI contract alongside the business mission", () => {
  assert.equal(validateDesignStyle(null), undefined);
  assert.deepEqual(
    validateDesignStyle({ ...profile, unknown: "drop" }),
    profile,
  );
  for (const patch of [
    { styles: [] },
    { styles: ["minimal", "minimal"] },
    { styles: ["unrecognized"] },
    { styles: ["minimal", "editorial", "bold", "classic"] },
    { density: "random" },
    { details: "x".repeat(801) },
    { enabled: "yes" },
  ])
    assert.throws(() => validateDesignStyle({ ...profile, ...patch }));
  assert.deepEqual(validateBrief(input).designProfile, profile);
  assert.equal(
    validateBrief({ ...input, designProfile: { ...profile, enabled: false } })
      .designProfile,
    undefined,
  );
  assert.deepEqual(
    validatePhotoBrief({ ...input, format: "Portrait", style: "Natural light" })
      .designProfile,
    profile,
  );
  for (const edit of [
    {},
    { pencil: { id: "photo", mask: src } },
    { eraser: { id: "photo", mask: src } },
  ]) {
    const brief = validateRefinement({
      ...input,
      preview: src,
      nodes: [{ id: "photo", type: "Image", parentId: null }],
      images: [{ id: "photo", src }],
      ...edit,
    });
    assert.deepEqual(brief.designProfile, profile);
    assert.deepEqual(brief.brandContext, brand);
  }
});
test("personal style combines with brand intent without overriding current instructions or broadening masked edits", () => {
  const design = brandDirection(brand, "design", profile);
  assert.match(design, /PERSONAL DESIGN PREFERENCES/);
  assert.match(design, /Connect neighbors/);
  assert.match(design, /required brand assets, colors and facts second/);
  assert.match(
    brandDirection(undefined, "design", profile),
    /PERSONAL DESIGN PREFERENCES/,
  );
  assert.equal(personalStyleDirection({ ...profile, enabled: false }), "");
  assert.match(
    brandDirection(brand, "erase", profile),
    /must not restyle the photo or add anything/,
  );
  assert.match(
    pencilDirection("Add one matching flower", brand, undefined, profile),
    /all pixels outside it/,
  );
  assert.match(
    refinementDirection({ ...input, images: [], nodes: [] }, ["Arial"]),
    /PERSONAL DESIGN PREFERENCES/,
  );
});
