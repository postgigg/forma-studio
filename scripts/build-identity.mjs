import { mkdir, writeFile } from 'node:fs/promises';

// Original, explicitly drawn geometry. No font, stock symbol or runtime dependency.
// A rising F and returning ribbon form an asymmetric, open composition.
// The short middle arm and stepped lower opening distinguish it from split-ring marks.
export const symbol = '<path d="M35 170V85C35 48 58 27 94 27H166L140 53H97C73 53 61 65 61 87V94H130L104 120H61V144Z"/><path d="M96 144H131C144 144 152 136 152 123V87L178 61V123C178 153 161 170 131 170H70Z"/>';
export const letters = [
  'M6 80V29C6 10 16 0 34 0H49L37 12H34C24 12 19 18 19 29V31H45L33 43H19V80Z',
  'M79 29C97 29 108 39 108 55C108 72 97 82 79 82C61 82 50 72 50 55C50 39 61 29 79 29ZM79 41C69 41 63 46 63 55C63 65 69 70 79 70C89 70 95 65 95 55C95 46 89 41 79 41Z',
  'M118 80V31H131V39C136 32 143 29 156 30V43C139 42 131 48 131 61V80Z',
  'M165 80V31H178V37C182 32 188 29 195 29C204 29 210 33 213 39C218 32 224 29 233 29C247 29 255 38 255 53V80H242V55C242 46 239 41 232 41C224 41 219 47 219 57V80H206V55C206 46 203 41 196 41C187 41 178 48 178 58V80Z',
  'M289 29C297 29 304 32 308 37V31H321V68L309 80V74C304 79 298 82 289 82C273 82 263 71 263 55C263 39 273 29 289 29ZM292 41C282 41 276 46 276 55C276 65 282 70 292 70C302 70 308 65 308 55C308 46 302 41 292 41Z',
].map(d => `<path fill-rule="evenodd" d="${d}"/>`).join('');
const svg = (box, content, label = 'Forma Studio') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" role="img" aria-label="${label}"><title>${label}</title>${content}</svg>\n`;
await mkdir('public/brand', { recursive: true });
const mark = svg('0 0 256 256', `<rect width="256" height="256" rx="58" fill="#764bdd"/><g fill="#fff" transform="translate(8 8) scale(1.2)">${symbol}</g>`);
const outputs = {
  'forma-mark.svg': mark,
  'forma-symbol.svg': svg('0 0 200 200', `<g fill="#171719">${symbol}</g>`),
  'forma-symbol-light.svg': svg('0 0 200 200', `<g fill="#f5f3ed">${symbol}</g>`),
  'forma-wordmark.svg': svg('0 0 327 86', `<g fill="#171719">${letters}</g>`),
  'forma-wordmark-light.svg': svg('0 0 327 86', `<g fill="#f5f3ed">${letters}</g>`),
  'forma-logo.svg': svg('0 0 468 110', `<g fill="#764bdd" transform="translate(-13 -17) scale(.72)">${symbol}</g><g fill="#171719" transform="translate(137 10)">${letters}</g>`),
  'forma-logo-light.svg': svg('0 0 468 110', `<g fill="#bda2ff" transform="translate(-13 -17) scale(.72)">${symbol}</g><g fill="#f5f3ed" transform="translate(137 10)">${letters}</g>`),
};
for (const [name, contents] of Object.entries(outputs)) await writeFile('public/brand/' + name, contents);
console.log('Built 7 Forma identity assets from the shared, font-independent geometry.');
