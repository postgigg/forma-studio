import { Group, type FabricObject, type StaticCanvas } from "fabric";
import { DeviceFrame } from "./device-frame";
import type { PageMotion } from "./types";
export function savedDeviceMotion(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const item = value as {
    type?: string;
    frame?: { motion?: string };
    objects?: unknown[];
  };
  return (
    (item.type === "DeviceFrame" &&
      !!item.frame?.motion &&
      item.frame.motion !== "none") ||
    !!item.objects?.some(savedDeviceMotion)
  );
}
export function prepareMotion(canvas: StaticCanvas) {
  const layers = canvas.getObjects().map((object) => ({
    object,
    left: object.left,
    top: object.top,
    opacity: object.opacity,
    scaleX: object.scaleX,
    scaleY: object.scaleY,
  }));
  const order = [...layers].sort((a, b) => a.top - b.top || a.left - b.left);
  return layers.map((layer) => ({ ...layer, order: order.indexOf(layer) }));
}
type MotionLayers = ReturnType<typeof prepareMotion>;
export function deviceMotion(object: FabricObject, phase: number | null) {
  if (object instanceof DeviceFrame) object.setMotionPhase(phase);
  if (object instanceof Group)
    object.getObjects().forEach((child) => deviceMotion(child, phase));
}
export function hasDeviceMotion(object: FabricObject): boolean {
  return object instanceof DeviceFrame
    ? object.frame.motion !== "none"
    : object instanceof Group && object.getObjects().some(hasDeviceMotion);
}
export function motionLength(motion: PageMotion, count: number) {
  return (
    Math.min(6, Math.max(0.5, motion.duration)) * 1000 +
    (motion.style === "stagger"
      ? Math.min(600, Math.max(0, count - 1) * 65)
      : 0) +
    700
  );
}
export function drawMotion(
  layers: MotionLayers,
  motion: PageMotion,
  elapsed: number,
  width: number,
  height: number,
  loop = false,
) {
  const duration = Math.min(6, Math.max(0.5, motion.duration)) * 1000,
    total = motionLength(motion, layers.length);
  const exit =
    loop && motion.style !== "none"
      ? Math.min(1, Math.max(0, (total - elapsed) / 350))
      : 1;
  for (const layer of layers) {
    deviceMotion(layer.object, elapsed / total);
    const delay =
      motion.style === "stagger"
        ? layer.order * Math.min(65, 600 / Math.max(1, layers.length))
        : 0;
    const t =
      motion.style === "none"
        ? 1
        : Math.min(1, Math.max(0, (elapsed - delay) / duration));
    const eased = 1 - Math.pow(1 - t, 3),
      zoom = motion.style === "drift" ? 1 + (1 - eased) * 0.045 : 1;
    const lift = ["rise", "stagger"].includes(motion.style)
      ? (1 - eased) * height * 0.035
      : 0;
    layer.object.set({
      left: width / 2 + (layer.left - width / 2) * zoom,
      top: height / 2 + (layer.top - height / 2) * zoom + lift,
      scaleX: layer.scaleX * zoom,
      scaleY: layer.scaleY * zoom,
      opacity:
        layer.opacity *
        (motion.style === "none" ? 1 : Math.min(1, t * 2.2)) *
        exit,
    } as Partial<FabricObject>);
  }
}
