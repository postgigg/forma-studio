import { useSyncExternalStore } from 'react';
import { createStore, get, set } from 'idb-keyval';
import { fonts } from './types';
import { workspaceChanged } from './workspace-events';
import { detectFont, fontBytes, validateFonts, type StoredFont } from './font-data';
const db = createStore('forma-type-library', 'kits');
const loaded = new Map<string, StoredFont>(), listeners = new Set<() => void>();
let library: StoredFont[] = [], families = [...fonts], initialized: Promise<void> | undefined;
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
function notify() { families = [...fonts, ...loaded.keys()]; listeners.forEach(fn => fn()); }
async function hash(bytes: Uint8Array) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))].map(n => n.toString(16).padStart(2, '0')).join(''); }
export async function loadFonts(raw: unknown) {
  const checked = validateFonts(raw);
  for (const font of checked) {
    const bytes = fontBytes(font);
    if (bytes.length > 8 * 1024 * 1024 || detectFont(bytes) !== font.format || 'FormaUser-' + await hash(bytes) !== font.family) throw new Error(`The font ${font.name} is damaged or has been changed.`);
    if (loaded.has(font.family)) continue;
    const face = new FontFace(font.family, bytes as Uint8Array<ArrayBuffer>);
    await face.load(); document.fonts.add(face); loaded.set(font.family, font);
  }
  notify();
}
export function initFonts() {
  return initialized ||= (async () => { library = validateFonts(await get('fonts', db)); await loadFonts(library); })();
}
export async function uploadFonts(files: File[]) {
  await initFonts();
  if (!files.length || files.length > 48) throw new Error('Choose up to 48 font files.');
  const next = [...library];
  for (const file of files) {
    if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} is larger than 8 MB.`);
    const bytes = new Uint8Array(await file.arrayBuffer()), format = detectFont(bytes);
    const family = 'FormaUser-' + await hash(bytes);
    if (next.some(font => font.family === family)) continue;
    let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    next.push({ family, name: file.name.replace(/\.(ttf|otf|woff2?)$/i, '').slice(0, 100), format, data: btoa(binary) });
  }
  validateFonts(next); await loadFonts(next); await set('fonts', next, db); library = next; notify(); workspaceChanged();
}
export async function rememberFonts(raw: unknown) {
  await initFonts(); const additions = validateFonts(raw);
  const next = [...new Map([...library, ...additions].map(font => [font.family, font])).values()];
  validateFonts(next); await loadFonts(additions); await set('fonts', next, db); library = next; notify(); workspaceChanged();
}
export async function removeLibraryFont(family: string) { const next = library.filter(font => font.family !== family); await set('fonts', next, db); library = next; notify(); workspaceChanged(); }
export function fontLabel(family: string) { return loaded.get(family)?.name || family; }
export function getFont(family: string) { return loaded.get(family); }
export function usedFonts(value: unknown): StoredFont[] {
  const found = new Set<string>();
  const walk = (item: unknown) => {
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item)) {
      if (key === 'fontFamily' && typeof child === 'string' && loaded.has(child)) found.add(child);
      else if (child && typeof child === 'object') walk(child);
    }
  };
  walk(value); return [...found].map(name => loaded.get(name)!);
}
export function useFontLibrary() {
  useSyncExternalStore(subscribe, () => families);
  return { families, library };
}
