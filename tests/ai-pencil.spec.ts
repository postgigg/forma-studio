import { test, expect } from "@playwright/test";
import { importFixture, saved } from "../scripts/qa-fixture.mjs";

test("AI Pencil sends a filled region and intent, previews before applying, preserves outside pixels and undoes", async ({
  page,
}) => {
  await page.route("**/session", (route) =>
    route.fulfill({ json: { ready: true, token: "qa" } }),
  );
  await importFixture(page);
  await page
    .locator(".layer-select")
    .filter({ hasText: "Daisy photo" })
    .click();
  let brief: any;
  await page.route("**/refinements", async (route) => {
    brief = route.request().postDataJSON();
    const src = await page.evaluate(async (source) => {
      const im = new Image();
      im.src = source;
      await im.decode();
      const c = document.createElement("canvas");
      c.width = im.width;
      c.height = im.height;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#308899";
      ctx.fillRect(0, 0, c.width, c.height);
      return c.toDataURL("image/png");
    }, brief.images[0].src);
    await route.fulfill({
      json: {
        id: "qa-pencil",
        status: "completed",
        stage: "Ready",
        elapsedSeconds: 1,
        result: {
          summary: "Targeted edit preview.",
          edits: [],
          images: [{ id: brief.pencil.id, src }],
        },
      },
    });
  });
  const before = (await saved(page)).pages[0].data.objects;
  await page.getByRole("button", { name: "AI Pencil", exact: true }).click();
  const paint = page.getByLabel("Mark the area to edit");
  await expect(paint).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate targeted edit" }),
  ).toBeDisabled();
  const r = (await paint.boundingBox())!;
  await page.mouse.move(r.x + r.width * 0.23, r.y + r.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.73, r.y + r.height * 0.65, {
    steps: 12,
  });
  await page.mouse.up();
  await page
    .getByLabel("AI Pencil instructions")
    .fill("Add a shark here, matching the illustration style and lighting.");
  await page.getByRole("button", { name: "Generate targeted edit" }).click();
  await expect(
    page.getByRole("button", { name: "Apply targeted edit" }),
  ).toBeVisible();
  expect(brief.eraser).toBeUndefined();
  expect(brief.pencil.id).toBe("photo");
  expect(brief.prompt).toContain("Add a shark");
  expect((await saved(page)).pages[0].data.objects).toEqual(before);
  const afterImage = await page
    .getByAltText("AI Pencil result")
    .getAttribute("src");
  const pixels = await page.evaluate(
    async ({ before, after, mask }) => {
      const read = async (src: string) => {
        const im = new Image();
        im.src = src;
        await im.decode();
        const c = document.createElement("canvas");
        c.width = im.width;
        c.height = im.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(im, 0, 0);
        return {
          data: ctx.getImageData(0, 0, c.width, c.height).data,
          width: c.width,
          height: c.height,
        };
      };
      const [a, b, m] = await Promise.all([
        read(before),
        read(after!),
        read(mask),
      ]);
      let outside = 0,
        inside = 0,
        marked = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        if (m.data[i] > 0) marked++;
        if ([0, 1, 2, 3].some((k) => a.data[i + k] !== b.data[i + k]))
          m.data[i] === 0 ? outside++ : inside++;
      }
      return {
        outside,
        inside,
        marked,
        center:
          m.data[
            (Math.floor(m.height * 0.475) * m.width +
              Math.floor(m.width * 0.48)) *
              4
          ],
      };
    },
    { before: brief.images[0].src, after: afterImage, mask: brief.pencil.mask },
  );
  expect(pixels.outside).toBe(0);
  expect(pixels.inside).toBeGreaterThan(500);
  expect(pixels.center).toBe(255);
  await page.getByRole("button", { name: "Apply targeted edit" }).click();
  await expect
    .poll(
      async () =>
        (await saved(page)).pages[0].data.objects.find(
          (o: any) => o.id === "photo",
        ).src,
    )
    .not.toBe(before.find((o: any) => o.id === "photo").src);
  expect(
    (await saved(page)).pages[0].data.objects.filter(
      (o: any) => o.id !== "photo",
    ),
  ).toEqual(before.filter((o: any) => o.id !== "photo"));
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await saved(page)).pages[0].data.objects)
    .toEqual(before);
});
