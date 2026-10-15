export type DesignStyleId =
  "minimal" | "editorial" | "bold" | "organic" | "playful" | "classic";
export interface DesignStyleProfile {
  styles: DesignStyleId[];
  enabled: boolean;
  density: "airy" | "balanced" | "rich";
  typography: "sans" | "serif" | "mixed";
  colorMood: "brand" | "monochrome" | "warm" | "cool" | "vibrant";
  details: string;
  avoid: string;
}
export const designStyles: {
  id: DesignStyleId;
  name: string;
  description: string;
}[];
export const styleOptions: {
  density: DesignStyleProfile["density"][];
  typography: DesignStyleProfile["typography"][];
  colorMood: DesignStyleProfile["colorMood"][];
};
export function validateDesignStyle(
  value: unknown,
): DesignStyleProfile | undefined;
export function personalStyleDirection(value: unknown, task?: string): string;
