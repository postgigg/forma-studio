import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Editor } from "./editor";
import { IconButton } from "./ui";

type Drag = {
  id: string;
  pointer: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  gap: number;
  active: boolean;
};

export function PageThumbnails({
  editor,
  run,
}: {
  editor: Editor;
  run: (action: () => unknown) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const gesture = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, announce] = useState("");
  const pages = editor.doc.pages;
  const designId = editor.doc.id;

  const locate = (value: Drag): Drag => {
    const items = [
      ...(strip.current?.querySelectorAll<HTMLElement>("[data-page-id]") || []),
    ];
    const gap = items.findIndex((item) => {
      const box = item.getBoundingClientRect();
      return value.x < box.left + box.width / 2;
    });
    return { ...value, gap: gap < 0 ? items.length : gap };
  };
  const cancel = () => {
    if (gesture.current?.active) suppressClick.current = true;
    gesture.current = null;
    setDrag(null);
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && gesture.current) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        announce("Page move cancelled.");
      }
    };
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", cancel);
    };
  }, []);
  useEffect(() => {
    cancel();
  }, [designId, editor.busy]);
  useEffect(() => {
    if (!drag?.active) return;
    let frame = 0;
    const scroll = () => {
      const el = strip.current,
        current = gesture.current;
      if (!el || !current?.active) return;
      const box = el.getBoundingClientRect();
      const within = current.y >= box.top - 35 && current.y <= box.bottom + 35;
      const speed = !within
        ? 0
        : current.x < box.left + 36
          ? -Math.min(16, (box.left + 36 - current.x) / 3)
          : current.x > box.right - 36
            ? Math.min(16, (current.x - box.right + 36) / 3)
            : 0;
      const before = el.scrollLeft;
      el.scrollLeft += speed;
      if (before !== el.scrollLeft) {
        gesture.current = locate(current);
        setDrag(gesture.current);
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [drag?.active]);

  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    const active =
      current.active ||
      Math.hypot(
        event.clientX - current.startX,
        event.clientY - current.startY,
      ) > 7;
    gesture.current = locate({
      ...current,
      x: event.clientX,
      y: event.clientY,
      active,
    });
    if (active) {
      event.preventDefault();
      suppressClick.current = true;
      setDrag(gesture.current);
    }
  };
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    const box = strip.current!.getBoundingClientRect();
    const inside =
      event.clientX >= box.left - 12 &&
      event.clientX <= box.right + 12 &&
      event.clientY >= box.top - 35 &&
      event.clientY <= box.bottom + 35;
    if (current.active && inside) {
      const gap = locate({
        ...current,
        x: event.clientX,
        y: event.clientY,
      }).gap;
      const from = pages.findIndex((page) => page.id === current.id);
      const to = gap > from ? gap - 1 : gap;
      if (from >= 0 && from !== to) {
        run(() => editor.reorderPage(current.id, to));
        announce(
          `Page ${from + 1} moved to position ${to + 1} of ${pages.length}.`,
        );
      }
    }
    cancel();
  };
  const source = drag?.active
    ? pages.find((page) => page.id === drag.id)
    : undefined;
  const from = pages.findIndex((page) => page.id === drag?.id);
  const showMarker = !!source && drag!.gap !== from && drag!.gap !== from + 1;

  return (
    <>
      <div
        className={`page-thumbnails ${source ? "reordering" : ""}`}
        ref={strip}
        role="group"
        aria-label="Design pages"
      >
        {pages.map((page, i) => (
          <button
            className={`page-thumb ${editor.pageIndex === i ? "selected" : ""} ${source?.id === page.id ? "drag-source" : ""} ${showMarker && drag!.gap === i ? "drop-before" : ""} ${showMarker && drag!.gap === pages.length && i === pages.length - 1 ? "drop-after" : ""}`}
            key={page.id}
            data-page-id={page.id}
            aria-label={`Go to page ${i + 1}`}
            aria-current={editor.pageIndex === i ? "page" : undefined}
            aria-describedby="page-order-help"
            title={`Page ${i + 1}: ${page.name}. Drag to reorder.`}
            disabled={editor.busy}
            onPointerDown={(event) => {
              if (event.button !== 0 || !event.isPrimary || editor.busy) return;
              suppressClick.current = false;
              gesture.current = {
                id: page.id,
                pointer: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                x: event.clientX,
                y: event.clientY,
                gap: i,
                active: false,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={cancel}
            onLostPointerCapture={cancel}
            onClick={(event) => {
              if (suppressClick.current && event.detail !== 0) {
                suppressClick.current = false;
                return;
              }
              run(() => editor.changePage(i));
            }}
            onKeyDown={(event) => {
              if (
                !event.altKey ||
                !["ArrowLeft", "ArrowRight"].includes(event.key)
              )
                return;
              event.preventDefault();
              event.stopPropagation();
              const to = i + (event.key === "ArrowLeft" ? -1 : 1);
              if (to < 0 || to >= pages.length) return;
              run(() => editor.reorderPage(page.id, to));
              announce(
                `Page ${i + 1} moved to position ${to + 1} of ${pages.length}.`,
              );
            }}
          >
            <img
              src={page.thumbnail || undefined}
              alt={`Page ${i + 1}`}
              draggable={false}
            />
            <span>{i + 1}</span>
          </button>
        ))}
        <button
          className="page-thumb new-page"
          aria-label="Add blank page"
          disabled={editor.busy}
          onClick={() => run(() => editor.addPage())}
        >
          <Plus size={21} />
        </button>
      </div>
      <div className="page-order">
        <IconButton
          icon={ChevronLeft}
          label="Move page earlier"
          disabled={editor.busy || editor.pageIndex === 0}
          onClick={() => run(() => editor.movePage(-1))}
        />
        <IconButton
          icon={ChevronRight}
          label="Move page later"
          disabled={editor.busy || editor.pageIndex === pages.length - 1}
          onClick={() => run(() => editor.movePage(1))}
        />
      </div>
      <span className="page-order-sr" id="page-order-help">
        Drag to reorder pages. Or focus a page and press Alt plus Left or Right
        Arrow.
      </span>
      <span className="page-order-sr" role="status" aria-live="polite">
        {announcement}
      </span>
      {source &&
        createPortal(
          <div
            className="page-drag-preview"
            aria-hidden="true"
            style={{ left: drag!.x, top: drag!.y }}
          >
            <img src={source.thumbnail || undefined} alt="" />
            <span>{from + 1}</span>
          </div>,
          document.body,
        )}
    </>
  );
}
