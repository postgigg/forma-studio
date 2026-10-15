import { createStore, del, entries, get, set } from "idb-keyval";
import type { Asset, Design } from "./types";
import catalog from "../shared/assets.json";
import { validateFonts } from "./font-data";
import { validateDesignStyle, type DesignStyleProfile } from "../shared/design-style.mjs";
import {
  validateBrandContext,
  type BrandProfile,
} from "../shared/brand-context.mjs";
const db = createStore("forma-studio", "workspace");
let writes: Promise<unknown> = Promise.resolve();
export function saveDesign(design: Design) {
  const copy = structuredClone(design);
  writes = writes
    .catch(() => {})
    .then(() => set(`design:${copy.id}`, copy, db));
  return writes;
}
export async function allDesigns(): Promise<Design[]> {
  await writes.catch(() => {});
  return (await entries<string, Design>(db))
    .filter(([key]) => key.startsWith("design:"))
    .map(([, value]) => value)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function getDesign(id: string): Promise<Design | undefined> {
  await writes.catch(() => {});
  return get(`design:${id}`, db);
}
export async function deleteDesign(id: string) {
  await writes.catch(() => {});
  await del(`design:${id}`, db);
}
export const getAssets = async (): Promise<Asset[]> =>
  (await get("assets", db)) || [];
export const putAssets = (assets: Asset[]) => set("assets", assets, db);
export const getBrand = async (): Promise<string[]> =>
  (await get("brand", db)) || ["#754adb", "#292432", "#f7f2e8", "#d5e2cc"];
export const putBrand = (brand: string[]) => set("brand", brand, db);
export const getBrandProfile = async () =>
  validateBrandContext(await get("brand-profile", db));
export const getDesignStyle = async () => validateDesignStyle(await get("design-style", db));
export const putDesignStyle = (profile: DesignStyleProfile) => set("design-style", validateDesignStyle(profile), db);
export const putBrandProfile = (profile?: BrandProfile) =>
  set("brand-profile", profile || null, db);
export const getBrandLogo = async (): Promise<Asset | null> =>
  (await get("brand-logo", db)) || null;
export const putBrandLogo = (logo: Asset | null) => set("brand-logo", logo, db);
export function validateDesign(raw: unknown): asserts raw is Design {
  if (!raw || typeof raw !== "object")
    throw new Error("This is not a Forma design file.");
  const d = raw as Design;
  validateFonts(d.fonts);
  if (
    typeof d.name !== "string" ||
    !Number.isFinite(d.width) ||
    !Number.isFinite(d.height) ||
    d.width < 64 ||
    d.height < 64 ||
    d.width > 8000 ||
    d.height > 8000 ||
    !Array.isArray(d.pages) ||
    !d.pages.length ||
    d.pages.length > 100
  )
    throw new Error("Invalid design size or pages.");
  const walk = (value: unknown, depth = 0) => {
    if (depth > 40) throw new Error("This design is too deeply nested.");
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (key === "src" && typeof item === "string" && /^https?:/.test(item)) {
        const url = new URL(item);
        if (
          (url.origin === location.origin ||
            ["http://localhost:5186", "http://127.0.0.1:5186"].includes(
              url.origin,
            )) &&
          catalog.some((asset) => asset.src === url.pathname) &&
          !url.search &&
          !url.hash
        ) {
          (value as Record<string, unknown>)[key] = url.pathname;
          continue;
        }
      }
      if (
        key === "src" &&
        typeof item === "string" &&
        item !== "" &&
        !/^data:image\/(png|jpeg|webp|gif);base64,/.test(item) &&
        !catalog.some((asset) => asset.src === item)
      )
        throw new Error(
          "Design images must be embedded or included with Forma.",
        );
      walk(item, depth + 1);
    }
  };
  for (const page of d.pages) {
    if (
      page.motion &&
      (!["none", "fade", "rise", "stagger", "drift"].includes(
        page.motion.style,
      ) ||
        !Number.isFinite(page.motion.duration) ||
        page.motion.duration < 0.5 ||
        page.motion.duration > 6)
    )
      throw new Error("Invalid page animation.");
    if (
      !page ||
      typeof page.name !== "string" ||
      !page.data ||
      !Array.isArray(page.data.objects) ||
      page.data.objects.length > 1500
    )
      throw new Error("Invalid page contents.");
    walk(page.data);
  }
}
