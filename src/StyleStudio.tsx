import { useEffect, useRef, useState } from 'react';
import { Color, FabricImage, FabricObject, Group, StaticCanvas, Textbox } from 'fabric';
import { Editor } from './editor';
import { Modal } from './ui';
import './style-studio.css';
export const stylePalettes = [
  { id: 'electric', name: 'Electric', colors: ['#ff633e', '#171719', '#d9ff59', '#f5f3ed'] },
  { id: 'editorial', name: 'Editorial', colors: ['#e9eddd', '#263d32', '#a9b798', '#faf7ef'] },
  { id: 'dark', name: 'After dark', colors: ['#282032', '#f5f3ed', '#b795ff', '#d9ff59'] },
];
const lightness = (value: string) => { const [r, g, b] = new Color(value).getSource(); return (r * .2126 + g * .7152 + b * .0722) / 255; };
const containsLocked = (object: FabricObject): boolean => !!(object.lockMovementX || object.lockMovementY || (object instanceof Group && object.getObjects().some(containsLocked)));
export function StyleStudio({ editor, brand, onClose }: { editor: Editor; brand: string[]; onClose: () => void }) {
  const source = useRef({ documentId: editor.doc.id, pageId: editor.page.id, json: JSON.stringify(editor.canvas.toObject()) });
  const element = useRef<HTMLCanvasElement>(null), canvas = useRef<StaticCanvas | null>(null);
  const originals = useRef(new Map<FabricObject, { fill: unknown; stroke: unknown; left: number; top: number }>());
  const [ready, setReady] = useState(false), [palette, setPalette] = useState('original'), [spread, setSpread] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const paletteOptions = [...stylePalettes, ...(brand.length >= 2 ? [{ id: 'brand', name: 'Your brand', colors: [brand[0], lightness(brand[0]) > .55 ? '#171719' : '#ffffff', brand[1], brand[2] || '#f5f3ed'] }] : [])];
  useEffect(() => {
    const scale = Math.min(520 / editor.doc.width, 560 / editor.doc.height, 1);
    const preview = new StaticCanvas(element.current!, { width: editor.doc.width * scale, height: editor.doc.height * scale, enableRetinaScaling: false });
    canvas.current = preview; preview.setZoom(scale); let active = true;
    void preview.loadFromJSON(JSON.parse(source.current.json)).then(() => {
      if (!active) return;
      const walk = (objects: FabricObject[]) => objects.forEach(object => { originals.current.set(object, { fill: object.fill, stroke: object.stroke, left: object.left, top: object.top }); if (object instanceof Group) walk(object.getObjects()); });
      walk(preview.getObjects()); preview.renderAll(); setReady(true);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; canvas.current = null; void preview.dispose(); };
  }, [editor]);
  useEffect(() => {
    const preview = canvas.current; if (!preview || !ready) return;
    const chosen = paletteOptions.find(item => item.id === palette)?.colors;
    const background = JSON.parse(source.current.json).background;
    preview.backgroundColor = chosen ? chosen[0] : background;
    const walk = (objects: FabricObject[], locked = false) => objects.forEach(object => {
      const baseline = originals.current.get(object)!;
      const protectedLayer = locked || object.lockMovementX || object.lockMovementY;
      object.set({ fill: baseline.fill, stroke: baseline.stroke, left: baseline.left, top: baseline.top });
      if (chosen && !protectedLayer && !(object instanceof FabricImage)) {
        const recolor = (color: unknown) => {
          if (typeof color !== 'string' || !color || color === 'transparent') return color;
          const [r, g, b, alpha] = new Color(color).getSource();
          if (alpha === 0) return color;
          if (object instanceof Textbox) return chosen[1];
          if (Math.max(r, g, b) - Math.min(r, g, b) < 26) return lightness(color) > .65 ? chosen[3] : chosen[1];
          return chosen[2];
        };
        object.set({ fill: recolor(baseline.fill), stroke: recolor(baseline.stroke) });
      }
      if (object instanceof Group) walk(object.getObjects(), protectedLayer);
      object.setCoords();
    });
    walk(preview.getObjects());
    for (const object of preview.getObjects()) {
      if (containsLocked(object)) continue;
      const rect = object.getBoundingRect();
      if (rect.width > editor.doc.width * .8 || rect.height > editor.doc.height * .8 || rect.left < 0 || rect.top < 0 || rect.left + rect.width > editor.doc.width || rect.top + rect.height > editor.doc.height) continue;
      const factor = spread / 100 * .3;
      const dx = (rect.left + rect.width / 2 - editor.doc.width / 2) * factor, dy = (rect.top + rect.height / 2 - editor.doc.height / 2) * factor;
      object.set({ left: object.left + Math.max(-rect.left, Math.min(editor.doc.width - rect.left - rect.width, dx)), top: object.top + Math.max(-rect.top, Math.min(editor.doc.height - rect.top - rect.height, dy)) }); object.setCoords();
    }
    preview.renderAll();
  }, [ready, palette, spread, brand, editor]);
  const apply = async () => {
    if (!canvas.current || !ready) return;
    setBusy(true); setError('');
    try {
      if (source.current.documentId !== editor.doc.id || source.current.pageId !== editor.page.id || source.current.json !== JSON.stringify(editor.canvas.toObject())) throw new Error('The page changed. Close this preview and reopen Page style.');
      const result = canvas.current.toObject(); await editor.canvas.loadFromJSON(result); editor.setZoom(editor.zoom); editor.commit(); onClose();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return <Modal title="Page style" onClose={onClose} wide className="style-studio"><div className="style-studio-body"><div className="style-studio-preview"><canvas ref={element} aria-label="Page style preview" /></div><div className="style-studio-controls"><h3>Make it feel like you.</h3><p>Try a palette and adjust the layout spacing. Your words and images stay yours.</p><div className="style-palette-options"><button className={palette === 'original' ? 'selected' : ''} aria-pressed={palette === 'original'} onClick={() => setPalette('original')}>Original colors</button>{paletteOptions.map(item => <button className={palette === item.id ? 'selected' : ''} aria-label={`Page palette ${item.name}`} aria-pressed={palette === item.id} key={item.id} onClick={() => setPalette(item.id)}><span className="palette-swatches">{item.colors.map((color, i) => <i key={i} style={{ background: color }} />)}</span>{item.name}</button>)}</div><label className="field"><span>Layout spacing <output>{spread > 0 ? '+' : ''}{spread}%</output></span><input type="range" aria-label="Page layout spacing" min={-100} max={100} value={spread} onChange={e => setSpread(Number(e.target.value))} /></label><button className="text-button" onClick={() => { setPalette('original'); setSpread(0); }}>Reset preview</button><p className="muted small">Locked layers stay in place. Apply when you are ready; Undo restores the previous page.</p>{error && <p role="alert">{error}</p>}<button className="primary full" disabled={!ready || busy || (palette === 'original' && spread === 0)} onClick={() => void apply()}>{busy ? 'Applying…' : 'Apply page style'}</button></div></div></Modal>;
}
