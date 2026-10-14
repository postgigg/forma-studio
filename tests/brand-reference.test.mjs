import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  brandAffinity,
  brandDirection,
  validateBrandContext,
} from "../shared/brand-context.mjs";
import {
  validateBrief,
  designAssets,
  validateDesignAssets,
  validateProposal,
} from "../server/contract.mjs";
import {
  referenceDirection,
  validateReferenceUse,
} from "../server/reference.mjs";
import { validatePhotoBrief } from "../server/photos.mjs";
import { validateRefinement } from "../server/refinements.mjs";
import { pencilDirection } from "../server/pencil-direction.mjs";
const brand = {
  name: "Petal Studio",
  business: "Seasonal florist",
  mission: "Connect neighbors through locally grown flowers.",
  audience: "Gift buyers",
  voice: "Warm and botanical",
};
const src =
  "data:image/png;base64," +
  readFileSync(
    new URL("../public/elements/daisy-sticker.png", import.meta.url),
  ).toString("base64");
const input = {
  prompt: "Preserve the original image and add a restrained brand mark.",
  width: 1080,
  height: 1080,
  pages: 1,
};
const sample = JSON.parse(
  readFileSync(new URL("designer.fixture.json", import.meta.url), "utf8"),
);

test("brand mission persists through each validated AI brief and rejects malformed fields", () => {
  assert.equal(validateBrandContext({ name: "  " }), undefined);
  assert.deepEqual(
    validateBrandContext({
      ...brand,
      name: " Petal Studio ",
      unknown: "ignored",
    }),
    brand,
  );
  assert.throws(() => validateBrandContext({ mission: "x".repeat(1601) }));
  assert.throws(() => validateBrandContext({ mission: {} }));
  assert.deepEqual(
    validateBrief({ ...input, brandContext: brand }).brandContext,
    brand,
  );
  assert.deepEqual(
    validatePhotoBrief({
      prompt: input.prompt,
      format: "Square",
      style: "Natural light",
      brandContext: brand,
    }).brandContext,
    brand,
  );
  const refinement = {
    prompt: input.prompt,
    width: 1080,
    height: 1080,
    preview: src,
    nodes: [{ id: "photo", type: "Image", parentId: null }],
    images: [{ id: "photo", src }],
    brandContext: brand,
  };
  for (const edit of [
    {},
    { pencil: { id: "photo", mask: src } },
    { eraser: { id: "photo", mask: src } },
  ])
    assert.deepEqual(
      validateRefinement({ ...refinement, ...edit }).brandContext,
      brand,
    );
  assert.ok(
    brandAffinity("Botanical bouquet / floral petals", brand) >
      brandAffinity("Digital interface / laptop", brand),
  );
  assert.match(pencilDirection("Add one flower", brand), /Petal Studio/);
  assert.match(pencilDirection("Add one flower", brand), /inside the mask/);
  assert.match(brandDirection(brand, "erase"), /NEVER add branding/);
  assert.match(brandDirection(brand), /explicit current brief takes priority/);
});

test("reference photos default to original pixels and survive proposal validation and refinement", () => {
  const brief = validateBrief({ ...input, sourceImage: src });
  assert.equal(brief.referenceMode, "preserve");
  const assets = designAssets(brief);
  assert.equal(assets[0].src, src);
  assert.equal(assets[0].id, "reference-photo");
  const result = structuredClone(sample);
  result.pages[0].elements = [
    {
      ...result.pages[0].elements[0],
      type: "asset",
      asset: "reference-photo",
      x: 0,
      y: 0,
      width: result.width,
      height: result.height,
      opacity: 1,
    },
  ];
  result.extraAssets = assets;
  validateReferenceUse(validateProposal(result, assets), assets);
  const next = validateBrief({ ...input, previous: result });
  assert.equal(designAssets(next)[0].src, src);
  assert.deepEqual(validateDesignAssets(assets), assets);
  assert.match(referenceDirection("preserve", assets[0]), /NEVER redraw/);
  assert.equal(
    designAssets(
      validateBrief({ ...input, sourceImage: src, referenceMode: "rebuild" }),
    ).length,
    0,
  );
  assert.throws(() =>
    validateBrief({ ...input, sourceImage: src, referenceMode: "other" }),
  );
  assert.throws(() =>
    validateDesignAssets([
      { id: "reference-photo", src: "https://example.com/a.png" },
    ]),
  );
  assert.throws(() => validateDesignAssets([...assets, ...assets]));
  assert.throws(() => validateReferenceUse(sample, assets), /preserve/);
  result.pages[0].elements[0].width = 1;
  assert.throws(() => validateReferenceUse(result, assets), /preserve/);
});
