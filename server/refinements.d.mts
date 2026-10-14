import type { RefinementResult } from "../src/refinement";

export interface RefinementBrief {
  prompt: string;
  brandContext?: import("../shared/brand-context.mjs").BrandProfile;
  direction: "precise" | "balanced" | "bold";
  width: number;
  height: number;
  nodes: {
    id: string;
    type: string;
    parentId: string | null;
    [property: string]: unknown;
  }[];
  images: { id: string; src: string }[];
  preview: string;
}
export function validateRefinement(value: unknown): RefinementBrief;
export function validateRefinementResult(
  value: unknown,
  brief: RefinementBrief,
): Omit<RefinementResult, "images"> & {
  imageEdits: { id: string; prompt: string }[];
};
