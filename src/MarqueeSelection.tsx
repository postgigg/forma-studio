import { useEffect, useState, type RefObject } from "react";
import type { Editor } from "./editor";

export function MarqueeSelection({
  editor,
  stage,
  active,
  onComplete,
}: {
  editor: Editor;
  stage: RefObject<HTMLDivElement | null>;
  active: boolean;
  onComplete: () => void;
}) {
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let start: {
      x: number;
      y: number;
      additive: boolean;
      id: number;
      doc: string;
      page: string;
    } | null = null;
    const down = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.button !== 0 ||
        editor.busy ||
        editor.drawing ||
        target.closest("button,input,.page-caption") ||
        (!active &&
          target !== el &&
          !target.classList.contains("artboard-area"))
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      start = {
        x: e.clientX,
        y: e.clientY,
        additive: e.shiftKey || e.ctrlKey || e.metaKey,
        id: e.pointerId,
        doc: editor.doc.id,
        page: editor.page.id,
      };
      el.setPointerCapture(e.pointerId);
      setBox({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      e.preventDefault();
      setBox({
        left: Math.min(start.x, e.clientX),
        top: Math.min(start.y, e.clientY),
        width: Math.abs(e.clientX - start.x),
        height: Math.abs(e.clientY - start.y),
      });
    };
    const end = (e: PointerEvent) => {
      if (!start) return;
      const s = start;
      start = null;
      setBox(null);
      if (el.hasPointerCapture(s.id)) el.releasePointerCapture(s.id);
      if (
        s.doc === editor.doc.id &&
        s.page === editor.page.id &&
        !editor.busy
      ) {
        const r = editor.canvas.upperCanvasEl.getBoundingClientRect();
        if (Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y) > 5)
          editor.selectRect(
            {
              left: (Math.min(s.x, e.clientX) - r.left) / editor.zoom,
              top: (Math.min(s.y, e.clientY) - r.top) / editor.zoom,
              width: Math.abs(e.clientX - s.x) / editor.zoom,
              height: Math.abs(e.clientY - s.y) / editor.zoom,
            },
            s.additive,
          );
        else if (!s.additive) editor.deselect();
      }
      onComplete();
    };
    const cancel = () => {
      if (start && el.hasPointerCapture(start.id))
        el.releasePointerCapture(start.id);
      start = null;
      setBox(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancel();
        onComplete();
      }
    };
    el.addEventListener("pointerdown", down, true);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      cancel();
      el.removeEventListener("pointerdown", down, true);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [editor, stage, active, onComplete]);
  return box ? <div className="stage-marquee" style={box} /> : null;
}
