export interface BoardPoint {
  x: number;
  y: number;
  side?: "auto" | "top" | "right" | "bottom" | "left";
}
export interface BoardEndpoint extends BoardPoint {
  nodeId?: string;
}
export interface BoardBox {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface ConnectorData {
  start: BoardEndpoint;
  end: BoardEndpoint;
  style: "elbow" | "curve" | "straight";
  pattern: "solid" | "dashed" | "dotted";
  color: string;
  width: number;
  startHead: "none" | "arrow" | "dot";
  endHead: "none" | "arrow" | "dot";
  label: string;
  bend?: BoardPoint;
}
export const boardColors: string[];
export function validateConnector(value: unknown): ConnectorData;
export function validateBoard(design: import("../src/types").Design): void;
export function anchor(
  box: BoardBox,
  toward: BoardPoint,
  side?: BoardPoint["side"],
): BoardPoint;
export function segmentHits(
  a: BoardPoint,
  b: BoardPoint,
  box: BoardBox,
): boolean;
export function routeConnector(
  start: BoardPoint,
  end: BoardPoint,
  obstacles?: BoardBox[],
  bend?: BoardPoint,
  style?: string,
): { points: BoardPoint[]; blocked: boolean };
export function roundedPath(points: BoardPoint[], radius?: number): string;
