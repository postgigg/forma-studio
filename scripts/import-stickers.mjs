import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { pngDimensions } from "../server/photos.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entries = JSON.parse(
  readFileSync(path.join(root, ".local/sticker-imports.json"), "utf8"),
);
if (entries.length !== 100)
  throw new Error("Expected exactly 100 individually generated stickers.");
const catalog = JSON.parse(
  readFileSync(path.join(root, "shared/assets.json"), "utf8"),
);
const hashes = new Set(),
  proof = [];
for (const entry of entries) {
  if (!/^sticker-\d{3}$/.test(entry.id))
    throw new Error("Invalid sticker identifier.");
  const bytes = readFileSync(entry.source),
    dimensions = pngDimensions(bytes),
    hash = createHash("sha256").update(bytes).digest("hex");
  if (hashes.has(hash)) throw new Error(`Duplicate image: ${entry.id}`);
  hashes.add(hash);
  const destination = path.join(root, "public/elements", entry.id + ".png");
  if (
    existsSync(destination) &&
    createHash("sha256").update(readFileSync(destination)).digest("hex") !==
      hash
  )
    throw new Error(`Existing asset would be overwritten: ${entry.id}`);
  copyFileSync(entry.source, destination);
  if (!catalog.some((a) => a.id === entry.id))
    catalog.push({
      id: entry.id,
      name: entry.name,
      category: "AI stickers",
      theme: entry.theme,
      src: `/elements/${entry.id}.png`,
      description: `${entry.prompt.match(/Subject: (.*?)\. Style:/)?.[1] || entry.name}; ${entry.theme}; individually AI-generated transparent sticker.`,
    });
  proof.push({
    id: entry.id,
    name: entry.name,
    theme: entry.theme,
    file: `public/elements/${entry.id}.png`,
    ...dimensions,
    bytes: bytes.length,
    sha256: hash,
  });
}
writeFileSync(
  path.join(root, "shared/assets.json"),
  JSON.stringify(catalog, null, 2) + "\n",
);
writeFileSync(
  path.join(root, "shared/sticker-provenance.json"),
  JSON.stringify(
    {
      generator: "Built-in image_gen",
      promptSet: "shared/sticker-prompts.json",
      transparentBackground: true,
      uniqueFiles: hashes.size,
      assets: proof,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Imported ${proof.length} unique generated PNGs (${(proof.reduce((n, p) => n + p.bytes, 0) / 1048576).toFixed(1)} MB); ${catalog.filter((a) => a.category === "AI stickers").length} total stickers.`,
);
