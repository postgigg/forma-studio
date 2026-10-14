import { useEffect, useRef, useState } from "react";
import { Box, Play, Pause, RotateCcw } from "lucide-react";
import { SolidObject, defaultSolid, solidShapes, type SolidSettings, type SolidShape } from "./solid-object";
import type { Editor } from "./editor";
import { Modal } from "./ui";
import "./solids.css";

export const solidSwatches = ["#754adb", "#e7674d", "#d5a343", "#327062", "#e9c5cf", "#2a54ae"];
export const solidCatalog = [
  ...Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789").map((text, i) => ({ id: `glyph-${text.toLowerCase()}`, label: `3D ${text}`, group: /[0-9]/.test(text) ? "Numbers" : "Letters", settings: { ...defaultSolid("text", text), color: solidSwatches[i % solidSwatches.length] } })),
  ...solidShapes.filter(shape => shape !== "text").map((shape, i) => ({ id: shape, label: shape[0].toUpperCase() + shape.slice(1), group: "Objects", settings: { ...defaultSolid(shape), color: solidSwatches[(i + 2) % solidSwatches.length] } })),
];
export function SolidLibrary({ onChoose }: { onChoose: (settings: SolidSettings) => void }) {
  const [category, setCategory] = useState("Letters");
  return <aside className="asset-panel solid-library" aria-label="3D object library">
    <div className="panel-heading"><h2>3D objects</h2><Box size={20} /></div>
    <p className="modal-description">Turn an idea into something with depth. Rotate real shapes, letters and numbers to find your angle.</p>
    <button className="primary full" onClick={() => onChoose(defaultSolid("text", "FORMA"))}>Create 3D lettering</button>
    <div className="solid-tabs" aria-label="3D categories">{["Letters", "Numbers", "Objects"].map(name => <button key={name} aria-pressed={name === category} onClick={() => setCategory(name)}>{name}</button>)}</div>
    <div className="solid-grid">{solidCatalog.filter(item => item.group === category).map(item => <button key={item.id} aria-label={`Add ${item.label}`} onClick={() => onChoose(structuredClone(item.settings))}><img src={`/3d/${item.id}.webp`} alt="" loading="lazy" /><span>{item.label}</span></button>)}</div>
    <p className="small muted">Original Forma lettering · 360° rotation · Ceramic, metal & matte finishes · Still or animated exports</p>
  </aside>;
}
const wrapped = (n: number) => Math.round((((n + 180) % 360) + 360) % 360 - 180);
export function SolidDialog({ editor, initial, existing, onClose, notify }: { editor: Editor; initial: SolidSettings; existing?: SolidObject; onClose: () => void; notify: (message: string) => void }) {
  const [settings, setSettings] = useState(() => structuredClone(existing?.solid || initial));
  const [playing, setPlaying] = useState(false), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null), drag = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);
  const destination = useRef({ doc: editor.doc.id, page: editor.page.id, baseline: JSON.stringify(existing?.solid) });
  const update = (patch: Partial<SolidSettings>) => setSettings(current => ({ ...current, ...patch }));
  useEffect(() => {
    let stopped = false, request = 0;
    void SolidObject.create(settings).then(model => {
      if (stopped || !preview.current) return;
      setError(""); const canvas = preview.current, ctx = canvas.getContext("2d")!, start = performance.now();
      canvas.width = 1200; canvas.height = 960;
      const draw = (time: number) => {
        if (stopped) return;
        ctx.clearRect(0, 0, 1200, 960); ctx.save(); ctx.translate(600, 480); ctx.scale(1.5, 1.5);
        model.solid = { ...settings, motion: playing && settings.motion === "none" ? "rock" : settings.motion };
        model.setMotionPhase(playing ? (time - start) / 6000 : null); model._render(ctx); ctx.restore();
        if (playing) request = requestAnimationFrame(draw);
      }; draw(start);
    }).catch(e => { if (!stopped) setError(e.message); });
    return () => { stopped = true; cancelAnimationFrame(request); };
  }, [settings, playing]);
  const save = async () => {
    setSaving(true); setError("");
    try {
      const object = await SolidObject.create(settings);
      if (editor.doc.id !== destination.current.doc || editor.page.id !== destination.current.page) throw new Error("The page changed. Reopen the 3D editor on the destination page.");
      if (existing) {
        if (!editor.objects.includes(existing) || existing.lockMovementX || JSON.stringify(existing.solid) !== destination.current.baseline) throw new Error("This object changed or is locked. Reopen it before applying.");
        existing.solid = object.solid; existing.dirty = true; editor.commit();
      } else {
        object.scale(Math.min(editor.doc.width * 0.7 / 800, editor.doc.height * 0.7 / 640));
        editor.add(object, settings.shape === "text" ? `3D ${settings.text}` : `3D ${settings.shape}`);
      }
      notify(existing ? "3D object updated. Undo restores its previous settings." : "3D object added. Double-click it to change its angle, material or lettering."); onClose();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  return <Modal title={existing ? "Edit 3D object" : "Create 3D object"} wide className="solid-modal" onClose={onClose}>
    <div className="solid-editor">
      <div className="solid-preview">
        <div className="solid-preview-caption"><strong>{settings.shape === "text" ? "Lettering in three dimensions" : "A new perspective"}</strong><span>Drag to rotate</span></div>
        <canvas ref={preview} aria-label="3D object preview" tabIndex={0}
          onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY, rx: settings.rotateX, ry: settings.rotateY }; e.currentTarget.setPointerCapture(e.pointerId); setPlaying(false); }}
          onPointerMove={e => { const d = drag.current; if (d) update({ rotateX: wrapped(d.rx + (e.clientY - d.y) * 0.6), rotateY: wrapped(d.ry + (e.clientX - d.x) * 0.6) }); }}
          onPointerUp={e => { drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
          onPointerCancel={() => { drag.current = null; }}
          onKeyDown={e => { const n = e.shiftKey ? 15 : 1; if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); update(e.key.includes("Left") || e.key.includes("Right") ? { rotateY: wrapped(settings.rotateY + (e.key === "ArrowRight" ? n : -n)) } : { rotateX: wrapped(settings.rotateX + (e.key === "ArrowDown" ? n : -n)) }); } }} />
        <div className="solid-preview-actions"><button className="secondary" onClick={() => update({ rotateX: 0, rotateY: 0, rotateZ: 0 })}><RotateCcw size={14} />Front</button><button className="secondary" onClick={() => update({ rotateX: 12, rotateY: -24, rotateZ: -5 })}>Three-quarter</button><button className="secondary" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={14} /> : <Play size={14} />}{playing ? "Pause preview" : "Play 3D preview"}</button></div>
        <p>Drag or use arrow keys · Shift for larger turns</p>
      </div>
      <div className="solid-settings">
        <label className="field"><span>Object</span><select aria-label="3D shape" value={settings.shape} onChange={e => update({ shape: e.target.value as SolidShape })}>{solidShapes.map(shape => <option key={shape} value={shape}>{shape === "text" ? "Letters & numbers" : shape[0].toUpperCase() + shape.slice(1)}</option>)}</select></label>
        {settings.shape === "text" && <><label className="field"><span>Letters or numbers</span><input aria-label="3D lettering" value={settings.text} maxLength={16} onChange={e => update({ text: e.target.value })} /></label><label className="field"><span>Letterform</span><select aria-label="3D font" value={settings.font} onChange={e => update({ font: e.target.value as SolidSettings["font"] })}><option value="frame">Forma Frame</option><option value="soft">Forma Soft</option><option value="deco">Forma Deco</option></select></label></>}
        <div className="field-grid"><label className="field"><span>Material</span><select aria-label="3D material" value={settings.material} onChange={e => update({ material: e.target.value as SolidSettings["material"] })}><option value="ceramic">Glazed ceramic</option><option value="metal">Brushed metal</option><option value="matte">Matte clay</option></select></label><label className="field"><span>Color</span><input type="color" aria-label="3D color" value={settings.color} onChange={e => update({ color: e.target.value })} /></label></div>
        <div className="solid-swatches">{solidSwatches.map(color => <button key={color} style={{ background: color }} aria-label={`3D color ${color}`} onClick={() => update({ color })} />)}</div>
        {["text", "star", "heart", "arch"].includes(settings.shape) && <>{([ ["depth", "Depth", 5, 100], ["bevel", "Bevel", 0, 8] ] as const).map(([key, label, min, max]) => <label className="field" key={key}><span>{label} · {settings[key]}</span><input type="range" aria-label={`3D ${label.toLowerCase()}`} min={min} max={max} value={settings[key]} onChange={e => update({ [key]: +e.target.value })} /></label>)}</>}
        <h4>Rotation</h4>{([ ["rotateX", "Tilt X"], ["rotateY", "Turn Y"], ["rotateZ", "Roll Z"] ] as const).map(([key, label]) => <label className="field solid-rotation" key={key}><span>{label}<input type="number" aria-label={`3D ${label} degrees`} min={-180} max={180} value={settings[key]} onChange={e => update({ [key]: Math.min(180, Math.max(-180, +e.target.value)) })} /><b>°</b></span><input type="range" aria-label={`3D ${label}`} min={-180} max={180} value={settings[key]} onChange={e => update({ [key]: +e.target.value })} /></label>)}
        <label className="field"><span>Animation</span><select aria-label="3D animation" value={settings.motion} onChange={e => update({ motion: e.target.value as SolidSettings["motion"] })}><option value="none">Still</option><option value="spin">Full turn</option><option value="rock">Gentle rotation</option></select></label><p className="small muted">Animations play in Present and GIF / WebM exports. JSON keeps every 3D setting editable.</p>
      </div>
    </div>
    {error && <p role="alert" className="ai-error">{error}</p>}
    <div className="modal-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving || !!error} onClick={() => void save()}>{saving ? "Saving…" : existing ? "Apply 3D changes" : "Add 3D object"}</button></div>
  </Modal>;
}
