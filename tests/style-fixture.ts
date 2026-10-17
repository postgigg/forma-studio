import { expect, type Page } from "@playwright/test";
export const personalStyle = {
  styles: ["minimal", "editorial"],
  enabled: true,
  density: "airy",
  typography: "sans",
  colorMood: "brand",
  details: "Quiet layouts with confident typography and original photography.",
  avoid: "Tiny decorative labels, generic gradients and crowded layouts.",
  preferences: ["confident-type", "generous-space"],
  avoidances: ["random-shapes", "filler-labels"],
};
export const styleBrand = {
  name: "Petal Studio",
  business: "A neighborhood florist selling seasonal bouquets.",
  mission: "Connect neighbors through thoughtful locally grown flowers.",
  audience: "Local gift buyers",
  voice: "Warm, natural and botanical",
};
export async function openBrandSetup(page: Page, step = 0) {
  const setup = page.getByRole("button", { name: "Set up brand and style", exact: true });
  if (!await setup.isVisible()) await page.getByRole("button", { name: "Brand", exact: true }).click();
  await setup.click();
  for (let i = 0; i < step; i++) await page.getByRole("button", { name: "Continue", exact: true }).click();
}
export async function configureStyle(page: Page) {
  await openBrandSetup(page);
  await page
    .getByRole("button", { name: "Editorial design style", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  for (const name of ["Confident typography", "Generous breathing room", "Random decoration", "Tiny filler labels"])
    await page.getByRole("button", { name, exact: true }).click();
  await page.getByLabel("Personal design details").fill(personalStyle.details);
  await page.getByLabel("Personal design dislikes").fill(personalStyle.avoid);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  for (const [key, label] of Object.entries({
    name: "Company name",
    business: "What your business does",
    mission: "Mission statement",
    audience: "Who you serve",
    voice: "Brand visual style & voice",
  }))
    await page
      .getByLabel(label, { exact: true })
      .fill(styleBrand[key as keyof typeof styleBrand]);
  await page
    .getByRole("button", { name: "Save brand & style", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Brand & style", exact: true }),
  ).toHaveCount(0);
}
