import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile, copyFile } from "node:fs/promises";

// Uses the isolated Vite preview to build original, editable example documents.
// Captures the real application in a fresh browser context; no user projects are read.
const base = process.env.FORMA_DOCS_URL || "http://127.0.0.1:5190";
await mkdir("docs/media", { recursive: true });
await mkdir("docs/examples", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.goto(base);
  await page.getByLabel("Design title", { exact: true }).waitFor();
  const examples = await page.evaluate(async () => {
    const { templates, templateObjects } = await import("/src/templates.ts");
    const { makeChart, defaultChart } = await import("/src/charts.ts");
    const { PhotoFrame, defaultMask } = await import("/src/photo-frame.ts");
    const { Textbox, Rect, StaticCanvas } = await import(
      (await (await fetch("/src/editor.ts")).text()).match(
        /from [\"']([^\"']*\/fabric[^\"']*)[\"']/,
      )[1]
    );
    const make = (name, width, height, background, objects) => ({
      id: crypto.randomUUID(),
      name,
      width,
      height,
      updatedAt: "2026-10-12T12:00:00.000Z",
      pages: [
        {
          id: crypto.randomUUID(),
          name: "Page 1",
          thumbnail: "",
          data: {
            version: "7.4.0",
            background,
            objects: objects.map((o, i) => {
              Object.assign(o, {
                id: crypto.randomUUID(),
                name: o.name || `Layer ${i + 1}`,
              });
              return o.toObject();
            }),
          },
        },
      ],
    });
    const type = (text, x, y, width, size, color, font = "Arial") =>
      new Textbox(text, {
        left: x,
        top: y,
        width,
        fontSize: size,
        fontFamily: font,
        fill: color,
        strokeWidth: 0,
      });
    const occasion = templates.find((t) => t.id === "occasion-001");
    const birthday = make(
      "Make a wish · birthday invitation",
      1080,
      1080,
      occasion.background,
      await templateObjects(occasion, 1080, 1080),
    );
    const chart = makeChart({
      ...defaultChart("bar"),
      title: "Small studio. Growing impact.",
      subtitle: "Revenue by channel · thousands of dollars",
      labels: ["Social", "Search", "Direct", "Referral"],
      series: [
        { name: "2026", color: "#754adb", values: [42, 68, 56, 92] },
        { name: "2025", color: "#91a187", values: [32, 48, 46, 65] },
      ],
    });
    chart.set({ left: 74, top: 292, scaleX: 1.15, scaleY: 1.15 });
    chart.name = "Revenue chart";
    const business = make(
      "Studio growth · quarterly report",
      1280,
      1100,
      "#eee9f7",
      [
        type("FORMA / STUDIO NOTES", 78, 55, 700, 18, "#655772"),
        type(
          "Good things\nare taking shape.",
          74,
          105,
          900,
          64,
          "#302a42",
          "Georgia",
        ),
        chart,
        type("2026 QUARTERLY REVIEW", 78, 1041, 650, 16, "#655772"),
      ],
    );
    const letter = await PhotoFrame.create({
      ...defaultMask("letter", "A"),
      font: "Georgia",
      italic: true,
      src: "/photos/coast.jpg",
      zoom: 1.12,
      panX: 0.2,
    });
    letter.set({ left: 315, top: 165, scaleX: 1.13, scaleY: 1.13 });
    letter.name = "Alpine photo letter";
    const travel = make(
      "Alpine days · letter photo frame",
      1080,
      1080,
      "#efece1",
      [
        new Rect({
          left: 52,
          top: 52,
          width: 976,
          height: 976,
          fill: "transparent",
          stroke: "#b1b8a9",
          strokeWidth: 1,
        }),
        type("THE SLOW TRAVEL JOURNAL", 90, 100, 860, 22, "#4f695e"),
        letter,
        type("Alpine\ndays.", 91, 398, 520, 116, "#31483f", "Georgia"),
        type("A LITTLE FURTHER FROM THE EVERYDAY", 95, 857, 900, 18, "#4f695e"),
        type(
          "FRESH AIR. STILL WATER. ROOM TO BREATHE.",
          95,
          910,
          880,
          16,
          "#4f695e",
        ),
      ],
    );
    const output = [];
    for (const [slug, doc] of [
      ["birthday-invitation", birthday],
      ["quarterly-report", business],
      ["alpine-photo-frame", travel],
    ]) {
      const canvas = new StaticCanvas(document.createElement("canvas"), {
        width: doc.width,
        height: doc.height,
        enableRetinaScaling: false,
      });
      await canvas.loadFromJSON(doc.pages[0].data);
      canvas.renderAll();
      const image = canvas.toDataURL({
        format: "png",
        multiplier: Math.min(1, 800 / doc.width),
      });
      doc.pages[0].thumbnail = canvas.toDataURL({
        format: "png",
        multiplier: 200 / doc.width,
      });
      output.push({ slug, doc, image });
      await canvas.dispose();
    }
    return output;
  });
  for (const { slug, doc, image } of examples) {
    await writeFile(`docs/examples/${slug}.json`, JSON.stringify(doc, null, 2));
    await writeFile(
      `docs/media/${slug}.png`,
      Buffer.from(image.split(",")[1], "base64"),
    );
  }
  const open = async (index) => {
    const item = examples[index];
    await page
      .locator('input[type=file][accept=".json"]')
      .setInputFiles({
        name: item.slug + ".json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(item.doc)),
      });
    await expect(page.getByLabel("Design title", { exact: true })).toHaveValue(
      item.doc.name + " (imported)",
    );
    await page.getByLabel("Design title", { exact: true }).fill(item.doc.name);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(500);
  };
  await open(0);
  await page.getByLabel("Template occasion").selectOption("Birthdays");
  await page.screenshot({ path: "docs/media/studio-overview.png" });
  await open(2);
  await page.getByRole("button", { name: "Elements", exact: true }).click();
  await page.getByRole("button", { name: "Photo frames", exact: true }).click();
  await page.screenshot({ path: "docs/media/photo-frames.png" });
  await open(1);
  await page.getByRole("button", { name: "Charts", exact: true }).click();
  await page.screenshot({ path: "docs/media/chart-design.png" });
  await page.getByRole("button", { name: "Elements", exact: true }).click();
  await page.getByRole("button", { name: "Graphics", exact: true }).click();
  await page.getByLabel("Graphic collection").selectOption("All collections");
  await page.screenshot({ path: "docs/media/elements-library.png" });
  await copyFile(".local/device-motion.gif", "docs/media/device-motion.gif");
  await copyFile(
    ".local/proofs/frame-macbook.png",
    "docs/media/device-macbook.png",
  );
  await copyFile(
    ".local/proofs/frame-iphone.png",
    "docs/media/device-iphone.png",
  );
  console.log(
    "Captured real editor screens and three editable demo projects under docs/.",
  );
} finally {
  await browser.close();
}
