import { cp, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.argv[2] || '');
const html = await readFile(path.join(source, 'index.html'), 'utf8');
if (!html.includes('Good ideas.') || !html.includes('Download for Windows') || /type=["']module["']|id=["']root["']/.test(html)) {
  throw new Error('The source must be the Forma marketing landing page, never the editor build.');
}
const destination = path.join(root, 'website');
await mkdir(destination, { recursive: true });
for (const name of ['index.html', 'style.css', 'site.js', 'walkthrough.html', 'walkthrough.css', 'assets']) {
  await cp(path.join(source, name), path.join(destination, name), { recursive: true });
}
console.log(`Copied the landing page into ${destination}. Run node scripts/verify-marketing-site.mjs before publishing.`);
