import { useEffect, useState } from "react";
import { Upload, RefreshCw } from "lucide-react";
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
  const [version,setVersion]=useState('');
  const desktop=window.formaDesktop;
  useEffect(()=>{let mounted=true;void desktop?.updateStatus?.().then(state=>{if(mounted)setVersion(state.currentVersion);}).catch(()=>{});return()=>{mounted=false;};},[desktop]);
  useEffect(() => setTab(initialTab), [initialTab]);
  return (
    <Modal title="Help & settings" onClose={onClose} wide>
      <div className="help-tabbar"><div className="help-tabs" role="tablist" aria-label="Help sections">
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
      {desktop?.checkForUpdates&&<div className="help-update-link"><span aria-label="Installed Forma version">{version?`Forma ${version}`:'Forma desktop'}</span><button className="secondary" onClick={()=>{onClose();void desktop.checkForUpdates().catch(()=>{});}}><RefreshCw size={15}/> Check for updates</button></div>}
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
