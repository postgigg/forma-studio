import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { Modal } from "./ui";
import { DesktopAI } from "./DesktopAI";
import { commandKey, shortcut } from "./platform";
export function Help({
  initialTab = "shortcuts",
  onClose,
  onImport,
}: {
  initialTab?: "shortcuts" | "ai";
  onClose: () => void;
  onImport: () => void;
}) {
  const [tab, setTab] = useState(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);
  return (
    <Modal title="Help & settings" onClose={onClose} wide>
      <div className="help-tabs" role="tablist" aria-label="Help sections">
        <button
          role="tab"
          aria-selected={tab === "shortcuts"}
          onClick={() => setTab("shortcuts")}
        >
          Editor shortcuts
        </button>
        <button
          role="tab"
          aria-selected={tab === "ai"}
          onClick={() => setTab("ai")}
        >
          AI accounts & models
        </button>
      </div>
      {tab === "ai" ? (
        <DesktopAI />
      ) : (
        <>
          <h3>Keyboard shortcuts</h3>
          <div className="shortcut-list">
            {[
              ["Undo", shortcut("Z")],
              ["Redo", shortcut("Shift+Z")],
              ["Copy / paste", shortcut("C / V")],
              ["Duplicate", shortcut("D")],
              ["Select all", shortcut("A")],
              ["Group / ungroup", shortcut("G")],
              ["Save on this device", shortcut("S")],
              ["Add text / rectangle / circle", "T / R / C"],
              ["Move an element", "Arrow keys"],
              ["Move 10 pixels", "Shift + Arrow"],
              ["Delete selected", "Delete / Backspace"],
              ["Deselect / stop drawing", "Escape"],
              ["Pan a whiteboard", "Space + drag"],
            ].map(([label, key]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
          <button className="secondary full" onClick={onImport}>
            <Upload size={17} />
            Import a Forma design file
          </button>
          <p className="muted small">
            Shift or {commandKey}-click elements or layers to select several.
            Drag a selection box to select an area. Right-click for editing
            actions, or press Shift+F10. Work saves on this device.
          </p>
        </>
      )}
    </Modal>
  );
}
