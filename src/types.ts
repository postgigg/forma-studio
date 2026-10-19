import fontCatalog from "../shared/fonts.json";
import type { StoredFont } from "./font-data";
import type { CreativeDirection, QualityReview } from './CreativeDirection';
export type CanvasData = Record<string, unknown>;
export interface AudioClip {id:string;name:string;src:string;duration:number;start:number;end:number;offset:number;volume:number;rate?:number;waveform?:number[]}
export interface PageMotion {
  style: "none" | "fade" | "rise" | "stagger" | "drift";
  duration: number;
}
export interface BoardComment {id:string;text:string;x:number;y:number;nodeId?:string;resolved:boolean;createdAt:string;authorId?:string;authorName?:string}
export interface DesignPage {
  id: string;
  name: string;
  data: CanvasData;
  thumbnail: string;
  motion?: PageMotion;
  audio?: AudioClip[];
  comments?: BoardComment[];
  boardGrid?: "dots"|"plain";
}
export interface Design {
  kind?: "design"|"whiteboard";
  id: string;
  name: string;
  width: number;
  height: number;
  pages: DesignPage[];
  updatedAt: string;
  fonts?: StoredFont[];
  aiJobId?: string;
  aiDirection?: CreativeDirection;
  aiReview?: QualityReview;
  campaignId?: string;
  folderId?: string;
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
  "#1448d8",
  "#16427d",
  "#162747",
  "#2346a1",
  "#00a7b5",
  "#124b37",
  "#d1e65b",
  "#ffdd29",
  "#f46a2b",
  "#df4e34",
  "#761b2d",
  "#ff74ac",
  "#68354d",
  "#bdb4fa",
  "#30226e",
  "#d8a52e",
  "#f2ddb7",
  "#f2d9dd",
  "#b9e0e5",
  "#e1e8c8",
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
