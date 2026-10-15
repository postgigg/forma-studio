import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const mark = readFileSync('public/brand/forma-mark.svg', 'utf8');
const wordmark = readFileSync('public/brand/forma-wordmark.svg', 'utf8');
writeFileSync('desktop/icon.svg', mark);
writeFileSync('public/favicon.svg', mark);
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage();
  const rendered = await page.evaluate(async ({ svg, wordmark }) => {
    const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(svg); await img.decode();
    const word = new Image(); word.src = 'data:image/svg+xml;base64,' + btoa(wordmark); await word.decode();
    const icons = [16, 24, 32, 48, 64, 128, 256, 1024].map(size => { const c = document.createElement('canvas'); c.width = c.height = size; c.getContext('2d').drawImage(img, 0, 0, size, size); return { size, png: c.toDataURL() }; });
    const bitmap = (width, height, sidebar) => {
      const c = document.createElement('canvas'); c.width = width; c.height = height; const ctx = c.getContext('2d');
      ctx.fillStyle = '#f5f3ed'; ctx.fillRect(0, 0, width, height);
      const size = sidebar ? 88 : 36, x = sidebar ? 38 : 9, y = sidebar ? 44 : 10;
      ctx.drawImage(img, x, y, size, size);
      ctx.drawImage(word, sidebar ? 26 : 55, sidebar ? 154 : 18, sidebar ? 112 : 86, sidebar ? 29.5 : 22.6);
      if (sidebar) { ctx.fillStyle = '#764bdd'; ctx.fillRect(0, height - 9, width, 9); }
      return { width, height, rgba: Array.from(ctx.getImageData(0, 0, width, height).data) };
    };
    return { icons, sidebar: bitmap(164, 314, true), header: bitmap(150, 57, false) };
  }, { svg: mark, wordmark });
  const icons = rendered.icons.filter(icon => icon.size <= 256);
  const header = Buffer.alloc(6 + icons.length * 16); header.writeUInt16LE(1, 2); header.writeUInt16LE(icons.length, 4);
  let offset = header.length; const images = [];
  icons.forEach(({ size, png }, i) => { const bytes = Buffer.from(png.split(',')[1], 'base64'), at = 6 + i * 16; header[at] = header[at + 1] = size === 256 ? 0 : size; header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6); header.writeUInt32LE(bytes.length, at + 8); header.writeUInt32LE(offset, at + 12); images.push(bytes); offset += bytes.length; });
  writeFileSync('desktop/icon.ico', Buffer.concat([header, ...images]));
  writeFileSync('desktop/icon.png', Buffer.from(rendered.icons.find(icon => icon.size === 1024).png.split(',')[1], 'base64'));
  function writeBitmap(name, { width, height, rgba }) {
    const row = Math.ceil(width * 3 / 4) * 4, bytes = Buffer.alloc(54 + row * height); bytes.write('BM'); bytes.writeUInt32LE(bytes.length, 2); bytes.writeUInt32LE(54, 10); bytes.writeUInt32LE(40, 14); bytes.writeInt32LE(width, 18); bytes.writeInt32LE(height, 22); bytes.writeUInt16LE(1, 26); bytes.writeUInt16LE(24, 28); bytes.writeUInt32LE(row * height, 34);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const src = (y * width + x) * 4, dest = 54 + (height - y - 1) * row + x * 3; bytes[dest] = rgba[src + 2]; bytes[dest + 1] = rgba[src + 1]; bytes[dest + 2] = rgba[src]; }
    writeFileSync(name, bytes);
  }
  writeBitmap('desktop/installer-sidebar.bmp', rendered.sidebar); writeBitmap('desktop/installer-header.bmp', rendered.header);
  console.log('Forma icons rendered at 16–1024px, with matching Windows installer artwork.');
} finally { await browser.close(); }
