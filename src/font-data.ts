export type FontFormat = 'ttf' | 'otf' | 'woff' | 'woff2';
export interface StoredFont { family: string; name: string; format: FontFormat; data: string }
const formats: FontFormat[] = ['ttf', 'otf', 'woff', 'woff2'];
export function validateFonts(raw: unknown): StoredFont[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 48) throw new Error('A font kit can contain up to 48 fonts.');
  let total = 0;
  return raw.map(value => {
    if (!value || typeof value !== 'object' || !/^FormaUser-[a-f0-9]{64}$/.test(value.family) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100 || !formats.includes(value.format) || typeof value.data !== 'string' || value.data.length > 12 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.data)) throw new Error('This file contains an invalid font.');
    total += value.data.length;
    if (total > 56 * 1024 * 1024) throw new Error('The font kit is too large. Keep embedded fonts under 40 MB.');
    return { family: value.family, name: value.name.trim(), format: value.format, data: value.data };
  });
}
export function fontBytes(font: StoredFont) { return Uint8Array.from(atob(font.data), c => c.charCodeAt(0)); }
export function detectFont(bytes: Uint8Array): FontFormat {
  const header = String.fromCharCode(...bytes.subarray(0, 4));
  if (header === 'wOFF') return 'woff';
  if (header === 'wOF2') return 'woff2';
  if (header === 'OTTO') return 'otf';
  if (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) return 'ttf';
  throw new Error('Choose a valid TTF, OTF, WOFF or WOFF2 font file.');
}
