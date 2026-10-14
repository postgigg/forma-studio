import { useEffect, useState } from "react";
import type { Editor } from "./editor";
import type { FabricObject } from "fabric";

export function RotationReadout({ editor }: { editor: Editor }) {
  const [value, setValue] = useState<{ x: number; y: number; degrees: number } | null>(null);
  useEffect(() => {
    const update = ({ target }: { target: FabricObject }) => {
      target.setCoords();
      const handle = target.oCoords?.mtr;
      if (!handle) return;
      const degrees = (Math.round((((target.angle % 360) + 360) % 360) * 10) / 10) % 360;
      setValue({ x: handle.x + 16, y: handle.y + 10, degrees });
    };
    const clear = () => setValue(null);
    const stop = [editor.canvas.on("object:rotating", update), editor.canvas.on("mouse:up", clear), editor.canvas.on("selection:cleared", clear), editor.canvas.on("object:modified", clear)];
    return () => stop.forEach(off => off());
  }, [editor]);
  return value && <output className="rotation-readout" aria-label="Rotation angle" aria-live="off" style={{ left: value.x, top: value.y }}>{value.degrees}°</output>;
}
