export interface BrandProfile {
  name: string;
  business: string;
  mission: string;
  audience: string;
  voice: string;
}
export const brandLimits: Record<keyof BrandProfile, number>;
export function validateBrandContext(value: unknown): BrandProfile | undefined;
export function brandDirection(
  value: unknown,
  task?: "design" | "pencil" | "erase",
): string;
export function brandAffinity(text: string, profile?: BrandProfile): number;
