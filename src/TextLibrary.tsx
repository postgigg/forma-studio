import { useEffect, useRef, useState } from 'react';
import { Textbox } from 'fabric';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { createStore, get, set } from 'idb-keyval';
import { Editor, download } from './editor';
import { fonts, uid } from './types';
import { getFont, rememberFonts, removeLibraryFont, uploadFonts, usedFonts, useFontLibrary } from './font-library';
import { validateFonts, type StoredFont } from './font-data';
import { IconButton } from './ui';
import './text-library.css';
import { workspaceChanged } from './workspace-events';
type TextStyle = { name: string; text: string; fontFamily: string; fontSize: number; fontWeight: string | number; fontStyle: 'normal' | 'italic' | 'oblique'; lineHeight: number; charSpacing: number; fill: string };
type TextKit = { id: string; name: string; styles: TextStyle[]; fonts: StoredFont[] };
const db = createStore('forma-text-kits', 'library');
const style = (name: string, family: string, size: number, weight: string | number = 'normal', spacing = 0): TextStyle => ({ name, text: name === 'Heading' ? 'Your next idea' : name === 'Subheading' ? 'Make it your own.' : 'Add the details that matter.', fontFamily: family, fontSize: size, fontWeight: weight, fontStyle: 'normal', lineHeight: 1.15, charSpacing: spacing, fill: '#292432' });
const starters: TextKit[] = [
  { id: 'editorial', name: 'Editorial', styles: [style('Heading', 'Georgia', 96), style('Subheading', 'Arial', 36), style('Body', 'Arial', 24)], fonts: [] },
  { id: 'launch', name: 'Launch', styles: [style('Heading', 'Arial', 104, 'bold', -35), style('Subheading', 'Arial', 34, 'bold'), style('Body', 'Arial', 24)], fonts: [] },
  { id: 'celebration', name: 'Celebration', styles: [style('Heading', 'Forma Deco', 100), style('Subheading', 'Georgia', 40), style('Body', 'Arial', 24)], fonts: [] },
  { id: 'studio', name: 'Studio', styles: [style('Heading', 'Forma Frame', 90), style('Subheading', 'Courier New', 30), style('Body', 'Arial', 24)], fonts: [] },
];
export function validateKit(raw: unknown): TextKit {
  const v = raw as Record<string, any>;
  if (!v || v.format !== 'forma-text-kit' || v.version !== 1 || typeof v.name !== 'string' || !v.name.trim() || v.name.length > 80 || !Array.isArray(v.styles) || !v.styles.length || v.styles.length > 12) throw new Error('Choose a Forma text kit exported from the Text panel.');
  const embedded = validateFonts(v.fonts), allowed = new Set([...fonts, ...embedded.map(font => font.family)]);
  const styles = v.styles.map((s: TextStyle) => {
    if (!s || typeof s.name !== 'string' || s.name.length > 60 || typeof s.text !== 'string' || s.text.length > 2000 || !allowed.has(s.fontFamily) || !Number.isFinite(s.fontSize) || s.fontSize < 6 || s.fontSize > 1000 || !/^(normal|bold|[1-9]00)$/.test(String(s.fontWeight)) || !['normal', 'italic', 'oblique'].includes(s.fontStyle) || !Number.isFinite(s.lineHeight) || s.lineHeight < .5 || s.lineHeight > 4 || !Number.isFinite(s.charSpacing) || s.charSpacing < -200 || s.charSpacing > 1500 || !/^#[a-f0-9]{6}$/i.test(s.fill)) throw new Error('This text kit contains an invalid style.');
    return { name: s.name, text: s.text, fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight, fontStyle: s.fontStyle, lineHeight: s.lineHeight, charSpacing: s.charSpacing, fill: s.fill };
  });
  return { id: uid(), name: v.name.trim(), styles, fonts: embedded };
}
export function TextLibrary({ editor, run }: { editor: Editor; run: (fn: () => unknown) => void }) {
  const { library } = useFontLibrary(), file = useRef<HTMLInputElement>(null), kitFile = useRef<HTMLInputElement>(null);
  const [kits, setKits] = useState<TextKit[]>([]), [name, setName] = useState('My text style'), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { void get<TextKit[]>('kits', db).then(value => setKits(value || [])); }, []);
  const work = (fn: () => Promise<void>) => run(async () => { setBusy(true); setMessage(''); try { await fn(); } finally { setBusy(false); } });
  const saveKits = async (next: TextKit[]) => { if (next.length > 100) throw new Error('Your library can hold up to 100 text kits.'); await set('kits', next, db); setKits(next); workspaceChanged(); };
  const saveSelected = () => work(async () => {
    const text = editor.selected;
    if (!(text instanceof Textbox) || !name.trim()) return;
    const selected: TextStyle = { name: name.trim().slice(0, 60), text: text.text, fontFamily: text.fontFamily, fontSize: text.fontSize, fontWeight: text.fontWeight, fontStyle: text.fontStyle || 'normal', lineHeight: text.lineHeight, charSpacing: text.charSpacing, fill: typeof text.fill === 'string' && /^#[a-f0-9]{6}$/i.test(text.fill) ? text.fill : '#292432' };
    await saveKits([...kits, { id: uid(), name: name.trim().slice(0, 80), styles: [selected], fonts: usedFonts(selected) }]); setMessage('Text style saved to your library.');
  });
  const addKit = (kit: TextKit) => work(async () => {
    await rememberFonts(kit.fonts);
    let top = editor.doc.height * .2;
    for (const item of kit.styles) {
      const { name: label, ...props } = item;
      const object = new Textbox(props.text, { ...props, width: editor.doc.width * .72, left: editor.doc.width * .14, top });
      editor.nameObject(object, label); editor.canvas.add(object); top += object.height + editor.doc.height * .025;
    }
    editor.commit(); setMessage(`${kit.name} added as editable text.`);
  });
  return <div className="type-library">
    <h3>Your fonts</h3>
    <input ref={file} hidden multiple type="file" accept=".ttf,.otf,.woff,.woff2" aria-label="Upload font files" onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) work(async () => { await uploadFonts(files); setMessage('Fonts added. Choose them in any font menu.'); }); }} />
    <button className="secondary full" disabled={busy} onClick={() => file.current?.click()}><Upload size={16} /> Upload fonts</button>
    <p className="muted small">TTF, OTF, WOFF or WOFF2 · saved on this device</p>
    {library.map(font => <div className="custom-font-row" key={font.family}><button style={{ fontFamily: font.family }} onClick={() => { if (!(editor.selected instanceof Textbox)) editor.addText(); editor.set({ fontFamily: font.family }); }}>{font.name}</button><IconButton label={`Remove ${font.name} from font library`} icon={Trash2} onClick={() => work(async () => { await removeLibraryFont(font.family); setMessage('Removed from the library. Fonts used in saved designs are preserved.'); })} /></div>)}
    <div className="type-library-heading"><h3>Text kits</h3><IconButton icon={Upload} label="Import text kit" onClick={() => kitFile.current?.click()} /></div>
    <input ref={kitFile} hidden type="file" accept=".json" aria-label="Import text kit file" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) work(async () => { if (file.size > 60 * 1024 * 1024) throw new Error('Text kit files must be under 60 MB.'); const kit = validateKit(JSON.parse(await file.text())); await rememberFonts(kit.fonts); await saveKits([...kits, kit]); setMessage(`${kit.name} imported with its fonts.`); }); }} />
    <div className="save-text-kit"><label className="field"><span>Kit name</span><input aria-label="Text kit name" value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label><button className="secondary full" disabled={busy || !(editor.selected instanceof Textbox) || !name.trim()} onClick={saveSelected}><Plus size={16} /> Save selected text style</button></div>
    {[...kits, ...starters].map(kit => <div className="text-kit" key={kit.id}><button className="text-kit-preview" aria-label={`Add ${kit.name} text kit`} onClick={() => addKit(kit)}><strong>{kit.name}</strong>{kit.styles.slice(0, 3).map((item, i) => <span key={i} style={{ fontFamily: item.fontFamily, fontWeight: item.fontWeight, fontStyle: item.fontStyle, fontSize: i === 0 ? 27 : 15 }}>{item.text.slice(0, 60)}</span>)}</button><div className="text-kit-actions"><span>{kit.styles.length} editable {kit.styles.length === 1 ? 'style' : 'styles'}</span><IconButton icon={Download} label={`Export ${kit.name} text kit`} onClick={() => work(async () => { const fonts = [...new Map([...kit.fonts, ...kit.styles.map(s => getFont(s.fontFamily)).filter(Boolean) as StoredFont[]].map(f => [f.family, f])).values()]; await download(new Blob([JSON.stringify({ format: 'forma-text-kit', version: 1, name: kit.name, styles: kit.styles, fonts }, null, 2)], { type: 'application/json' }), `${kit.name.replace(/[^a-z0-9 _-]/gi, '')}.forma-text-kit.json`); })} />{kits.includes(kit) && <IconButton icon={Trash2} label={`Delete ${kit.name} text kit`} onClick={() => work(() => saveKits(kits.filter(k => k.id !== kit.id)))} />}</div></div>)}
    {message && <p role="status" className="type-message">{message}</p>}
  </div>;
}
