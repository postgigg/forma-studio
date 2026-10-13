import fontCatalog from "../shared/fonts.json";
export type CanvasData = Record<string, unknown>;
export interface PageMotion { style: 'none'|'fade'|'rise'|'stagger'|'drift'; duration: number }
export interface DesignPage {
  id: string;
  name: string;
  data: CanvasData;
  thumbnail: string;
  motion?: PageMotion;
}
export interface Design {
  id: string;
  name: string;
  width: number;
  height: number;
  pages: DesignPage[];
  updatedAt: string;
}
export interface Asset {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
}
export const uid = () => crypto.randomUUID();
export const colors = [
  "#292432",
  "#ffffff",
  "#f7f2e8",
  "#d5e2cc",
  "#668266",
  "#dce2ff",
  "#b6a3eb",
  "#754adb",
  "#f0b8a4",
  "#e9c360",
  "#e2798c",
  "#5486a0",
];
export const fonts: string[] = fontCatalog;
export const presets = [
  { name: "Instagram post", width: 1080, height: 1080, category: "Social" },
  { name: "Instagram story", width: 1080, height: 1920, category: "Social" },
  { name: "Presentation", width: 1920, height: 1080, category: "Presentation" },
  { name: "A4 document", width: 794, height: 1123, category: "Print" },
  { name: "Poster", width: 1200, height: 1600, category: "Print" },
  { name: "YouTube thumbnail", width: 1280, height: 720, category: "Social" },
  { name: "Business card", width: 1050, height: 600, category: "Print" },
  { name: "Facebook cover", width: 1640, height: 924, category: "Social" },
];
