// Public references inspected on 2026-10-15. Only attribution and public URLs ship;
// reference artwork is fetched for analysis on the user's device, never added as a design asset.
export const referenceLibrary = [
  { url: 'https://dribbble.com/shots/27416611-Phren-Craft-Celtic-Modular-Identity-System', title: 'Phren Craft – Celtic Modular Identity System', creator: 'Ivana Mundja', imageUrl: 'https://cdn.dribbble.com/userupload/47870533/file/89baeea234677c143e7ea3ad2cf5f946.png?resize=1000x0', cataloguedAt: '2026-10-15' },
  { url: 'https://dribbble.com/shots/26805880-Cubee-Visual-Identity-Toolkit-Brand-System', title: 'Cubee – Visual Identity Toolkit | Brand System', creator: 'Dtail Branding for Dtail Studio', imageUrl: 'https://cdn.dribbble.com/userupload/45807197/file/777a5a694e5e78b77c56c0a0b75d4952.jpg?resize=1000x0', cataloguedAt: '2026-10-15' },
];

export function publicReferenceImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'cdn.dribbble.com' && !url.username && !url.password && /^\/(userupload|users)\//.test(url.pathname) && /\.(png|jpe?g|webp)$/i.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

export async function fetchVisualReferences(sources, { signal, request = fetch } = {}) {
  const unique = new Map();
  for (const source of [...sources, ...referenceLibrary]) {
    if (!unique.has(source.url) && publicReferenceImage(source.imageUrl)) unique.set(source.url, source);
    if (unique.size === 3) break;
  }
  const results = await Promise.allSettled([...unique.values()].map(async source => {
    const response = await request(publicReferenceImage(source.imageUrl), { redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
    if (!response.ok || Number(response.headers.get('content-length') || 0) > 8000000) throw new Error('Reference image unavailable.');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > 8000000) { await response.body.cancel().catch(() => {}); throw new Error('Reference image too large.'); } chunks.push(chunk); }
    const bytes = Buffer.concat(chunks);
    const mime = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : bytes[0] === 255 && bytes[1] === 216 ? 'image/jpeg' : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;
    if (!mime || size < 1000) throw new Error('Reference is not a usable image.');
    return { ...source, src: `data:${mime};base64,${bytes.toString('base64')}` };
  }));
  if (signal?.aborted) throw new Error('Cancelled.');
  return results.filter(result => result.status === 'fulfilled').map(result => result.value);
}
