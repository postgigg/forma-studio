import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await browser.newPage();
  for (const [width, height] of [
    [1512, 982],
    [1536, 730],
    [1000, 700],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("http://localhost:5186");
    await page.getByLabel("Design title", { exact: true }).waitFor();
    await page.waitForTimeout(700);
    console.log(
      JSON.stringify(
        await page.evaluate(() =>
          Object.fromEntries(
            [
              ".studio-app",
              ".workspace-shell",
              ".editor-main",
              ".canvas-stage",
              ".workspace-footer",
            ].map((s) => {
              const box = document.querySelector(s).getBoundingClientRect();
              return [
                s,
                {
                  top: box.top,
                  height: box.height,
                  bottom: box.bottom,
                  viewport: innerHeight,
                },
              ];
            }),
          ),
        ),
      ),
    );
  }
} finally {
  await browser.close();
}
