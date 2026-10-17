import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ActiveSelection, FabricImage, Group } from "fabric";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Group as GroupIcon,
  LockKeyhole,
  Scissors,
  Sparkles,
  SquareDashedMousePointer,
  Trash2,
  Ungroup,
  UnlockKeyhole,
} from "lucide-react";
import { Editor, type DesignObject } from "./editor";
import { commandKey, isMac, shortcut } from "./platform";

export function SelectionMenu({
  editor,
  point,
  onClose,
  run,
  onRebuild,
  onImprove,
  onErase,
  onPencil,
}: {
  editor: Editor;
  point: { x: number; y: number };
  onClose: () => void;
  run: (fn: () => unknown) => void;
  onRebuild: () => void;
  onImprove: () => void;
  onErase: () => void;
  onPencil: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(point);
  const selected = editor.selected;
  const multiple = selected instanceof ActiveSelection;
  const group = selected instanceof Group && !multiple;
  const count = editor.canvas.getActiveObjects().length;
  const locked = editor.canvas.getActiveObjects().some((o) => o.lockMovementX);
  useLayoutEffect(() => {
    const menu = ref.current!;
    const bounds = menu.getBoundingClientRect();
    setPosition({
      x: Math.max(8, Math.min(point.x, innerWidth - bounds.width - 8)),
      y: Math.max(8, Math.min(point.y, innerHeight - bounds.height - 8)),
    });
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (e: PointerEvent) => {
      if (!menu.contains(e.target as Node)) onClose();
    };
    const resize = () => onClose();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", resize);
    };
  }, [point, onClose]);
  const act = (fn: () => unknown) => {
    run(fn);
    onClose();
    editor.canvas.upperCanvasEl.focus({ preventScroll: true });
  };
  const items = [
    {
      label: "Copy",
      icon: Copy,
      shortcut: shortcut('C'),
      action: () => editor.copy(),
      disabled: !selected,
    },
    {
      label: "Cut",
      icon: Scissors,
      shortcut: shortcut('X'),
      action: () => editor.cut(),
      disabled: !selected,
    },
    {
      label: "Paste",
      icon: ClipboardPaste,
      shortcut: shortcut('V'),
      action: () => editor.paste(),
      disabled: !editor.clipboard,
    },
    {
      label: "Duplicate",
      icon: CopyPlus,
      shortcut: shortcut('D'),
      action: () => editor.duplicate(),
      disabled: !selected,
    },
  ];
  return createPortal(
    <div
      ref={ref}
      className="selection-menu"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="Selection actions"
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          onClose();
          editor.canvas.upperCanvasEl.focus({ preventScroll: true });
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const buttons = Array.from(
            ref.current!.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          );
          const current = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const index =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (current +
                    (e.key === "ArrowDown" ? 1 : -1) +
                    buttons.length) %
                  buttons.length;
          buttons[index]?.focus();
        }
      }}
    >
      <div className="menu-selection-title">
        {multiple
          ? `${count} elements selected`
          : group
            ? "Group selected"
            : (selected as DesignObject)?.name || "Page actions"}
      </div>
      {items.map(({ label, icon: Icon, shortcut, action, disabled }) => (
        <button
          role="menuitem"
          key={label}
          disabled={disabled}
          onClick={() => act(action)}
        >
          <Icon size={16} />
          <span>{label}</span>
          <kbd>{shortcut}</kbd>
        </button>
      ))}
      <div role="separator" />
      {selected && (
        <button
          role="menuitem"
          onClick={() => act(onImprove)}
          disabled={locked}
        >
          <Sparkles size={16} />
          <span>Improve with AI</span>
        </button>
      )}
      {selected instanceof FabricImage && (
        <>
          <button
            role="menuitem"
            onClick={() => act(onPencil)}
            disabled={locked}
          >
            <Sparkles size={16} />
            <span>AI Pencil</span>
          </button>
          <button
            role="menuitem"
            onClick={() => act(onErase)}
            disabled={locked}
          >
            <Sparkles size={16} />
            <span>Magic Eraser</span>
          </button>
        </>
      )}
      {selected instanceof FabricImage && (
        <button role="menuitem" onClick={() => act(onRebuild)}>
          <GroupIcon size={16} />
          <span>Design with this image</span>
        </button>
      )}
      {(multiple || group) && (
        <button role="menuitem" onClick={() => act(() => editor.group())}>
          {multiple ? <GroupIcon size={16} /> : <Ungroup size={16} />}
          <span>{multiple ? "Group selection" : "Ungroup"}</span>
          <kbd>{shortcut('G')}</kbd>
        </button>
      )}
      {selected && (
        <>
          <button role="menuitem" onClick={() => act(() => editor.lock())}>
            {locked ? <UnlockKeyhole size={16} /> : <LockKeyhole size={16} />}
            <span>{locked ? "Unlock selection" : "Lock selection"}</span>
          </button>
          <div role="separator" />
          <div className="menu-caption">Arrange</div>
          <div className="menu-arrange">
            {(
              [
                { label: "Bring to front", icon: ArrowUpToLine, dir: "front" },
                { label: "Bring forward", icon: ChevronUp, dir: "forward" },
                { label: "Send backward", icon: ChevronDown, dir: "backward" },
                { label: "Send to back", icon: ArrowDownToLine, dir: "back" },
              ] as const
            ).map(({ label, icon: Icon, dir }) => (
              <button
                role="menuitem"
                aria-label={label}
                title={label}
                key={dir}
                onClick={() => act(() => editor.reorder(dir))}
              >
                <Icon size={17} />
              </button>
            ))}
          </div>
          <div className="menu-caption">Align selection to page</div>
          <div className="menu-arrange menu-align">
            {(
              [
                { label: "left", icon: AlignLeft },
                { label: "center", icon: AlignCenter },
                { label: "right", icon: AlignRight },
                { label: "top", icon: ArrowUpToLine },
                { label: "middle", icon: AlignCenter },
                { label: "bottom", icon: ArrowDownToLine },
              ] as const
            ).map(({ label, icon: Icon }) => (
              <button
                role="menuitem"
                aria-label={`Align selection ${label}`}
                title={`Align ${label}`}
                key={label}
                disabled={locked}
                onClick={() => act(() => editor.align(label))}
              >
                <Icon
                  size={16}
                  className={label === "middle" ? "rotate-icon" : ""}
                />
              </button>
            ))}
          </div>
          <div role="separator" />
        </>
      )}
      <button role="menuitem" onClick={() => act(() => editor.selectAll())}>
        <SquareDashedMousePointer size={16} />
        <span>Select all</span>
        <kbd>{shortcut('A')}</kbd>
      </button>
      {selected && (
        <button
          role="menuitem"
          className="danger"
          onClick={() => act(() => editor.remove())}
        >
          <Trash2 size={16} />
          <span>Delete selection</span>
          <kbd>{isMac ? '⌫' : 'Del'}</kbd>
        </button>
      )}
      <div className="menu-hint">Shift / {commandKey}-click to select several</div>
    </div>,
    document.body,
  );
}
