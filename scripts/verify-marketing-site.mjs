import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'website');
const html = await readFile(path.join(site, 'index.html'), 'utf8');
const js = await readFile(path.join(site, 'site.js'), 'utf8');
assert.match(html, /Good ideas\./, 'Publish the marketing landing page.');
assert.match(html, /Your desktop design studio\./);
assert.match(html, /Download for Windows/);
assert.doesNotMatch(html, /id=["']root["']|type=["']module["']|localhost|127\.0\.0\.1|id="campaigns"/);
assert.doesNotMatch(html, /github(?:usercontent)?\.com|\bgithub\b/i, 'Public landing copy and links must not promote the source host.');
const downloads = [...html.matchAll(/class="[^"]*download-link[^"]*" href="([^"]+)"/g)].map(match => match[1]);
assert.equal(downloads.length, 3);
assert.equal(new Set(downloads).size, 1, 'Every download button must point to the same installer.');
assert.match(downloads[0], /^https:\/\/tryformastudio\.netlify\.app\/downloads\/v(\d+\.\d+\.\d+)\/Forma-Studio-Setup-\1\.exe$/);
const routing = await readFile(path.join(root, 'netlify.toml'), 'utf8');
assert.ok(routing.includes(`from = "${new URL(downloads[0]).pathname}"`), 'The branded installer URL must have a distribution route.');
const guide = await readFile(path.join(site, 'walkthrough.html'), 'utf8');
assert.doesNotMatch(guide, /github(?:usercontent)?\.com|\bgithub\b/i);
assert.ok(guide.includes(downloads[0]), 'Guide and homepage must link the same Windows release.');
for (const match of guide.matchAll(/(?:src|href)="([^"#][^"]*)"/g)) {
  const reference = match[1].split(/[?#]/)[0];
  if (/^https?:/.test(reference)) continue;
  assert.ok((await stat(path.join(site, reference))).isFile(), `Missing guide asset: ${reference}`);
}
for (const match of html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)) {
  const reference = match[1].split('?')[0];
  if (/^https?:/.test(reference)) continue;
  assert.ok((await stat(path.join(site, reference))).isFile(), `Missing landing asset: ${reference}`);
}
for (const match of js.matchAll(/\['((?:studio|occasion)-\d+)'/g)) {
  await stat(path.join(site, 'assets', `modern-${match[1]}.webp`));
}
for (let i = 0; i < 17; i++) await stat(path.join(site, 'assets', `solid-turn-${i}.webp`));
console.log(JSON.stringify({ landingPage: true, editorEntrypoint: false, download: downloads[0], dynamicAngles: 17, assets: 'verified' }));
