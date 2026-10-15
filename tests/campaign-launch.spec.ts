import { test, expect } from "@playwright/test";
for (const width of [1920, 390])
  test(`purple Campaigns button has a moving border and opens the studio at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(
      page.getByLabel("Design title", { exact: true }),
    ).toBeVisible();
    const button = page.getByRole("button", { name: "Campaigns", exact: true });
    await expect(button).toBeInViewport();
    const before = await button.boundingBox(),
      style = await button.evaluate((el) => ({
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundImage,
        border: getComputedStyle(el).borderTopWidth,
        angle: getComputedStyle(el).getPropertyValue("--campaign-border-angle"),
      }));
    expect(style.color).toBe("rgb(255, 255, 255)");
    expect(style.background).toContain("rgb(118, 75, 221)");
    expect(style.border).toBe("2px");
    await expect
      .poll(() =>
        button.evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--campaign-border-angle"),
        ),
      )
      .not.toBe(style.angle);
    expect(await button.boundingBox()).toEqual(before);
    await button.click();
    await expect(
      page.getByRole("dialog", { name: "Campaign studio", exact: true }),
    ).toBeVisible();
  });
test("reduced motion keeps the purple Campaigns button still", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const button = page.getByRole("button", { name: "Campaigns", exact: true });
  await expect(button).toBeEnabled();
  expect(await button.evaluate((el) => el.getAnimations().length)).toBe(0);
  await expect(button).toHaveCSS("color", "rgb(255, 255, 255)");
});
