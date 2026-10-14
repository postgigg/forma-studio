import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("public/3d", { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await browser.newPage(); await page.goto("http://127.0.0.1:5190");
  const entries = await page.evaluate(async () => {
    const { solidCatalog } = await import("/src/Solids.tsx");
    const { prepareSolid, renderSolid } = await import("/src/solid-renderer.ts");
    const c = document.createElement("canvas"); c.width = 300; c.height = 240;
    const result = [];
    for (const item of solidCatalog) { await prepareSolid(item.settings); renderSolid(item.settings, c); result.push({ id: item.id, image: c.toDataURL("image/webp", 0.9) }); }
    return result;
  });
  for (const item of entries) writeFileSync(`public/3d/${item.id}.webp`, Buffer.from(item.image.split(",")[1], "base64"));
  console.log(`Rendered ${entries.length} original 3D letters, numbers and objects.`);
} finally { await browser.close(); }
