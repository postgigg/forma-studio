import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage();
  const png = await page.evaluate(async svg => {
    const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(svg); await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 256; c.getContext('2d').drawImage(img, 0, 0, 256, 256); return c.toDataURL();
  }, readFileSync('desktop/icon.svg', 'utf8'));
  const bytes = Buffer.from(png.split(',')[1], 'base64'); writeFileSync('desktop/icon.png', bytes);
  const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(bytes.length, 14); header.writeUInt32LE(22, 18);
  writeFileSync('desktop/icon.ico', Buffer.concat([header, bytes])); console.log('Forma desktop icon rendered.');
} finally { await browser.close(); }
