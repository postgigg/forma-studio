export const backupFormat = 'forma-workspace-backup';
export const maxBackupBytes = 256 * 1024 * 1024;
export const workspaceKey = key => typeof key === 'string' && (
  /^(?:design|campaign):[A-Za-z0-9_-]{1,120}$/.test(key) ||
  ['assets', 'brand', 'brand-profile', 'design-style', 'brand-logo', 'campaign-wizard'].includes(key)
);

// The same boundary runs before upload, after decompression, and before restore.
// Native credentials, AI authentication and paid entitlements are never part of it.
export function validateWorkspaceBackup(value) {
  if (!value || value.format !== backupFormat || value.version !== 1 ||
      typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) ||
      !value.stores || typeof value.stores !== 'object') throw new Error('Choose a valid Forma workspace backup.');
  const allowed = { workspace: workspaceKey, fonts: key => key === 'fonts', textKits: key => key === 'kits' };
  if (Object.keys(value.stores).some(key => !Object.hasOwn(allowed, key))) throw new Error('This backup contains an unsupported store.');
  for (const [name, keyAllowed] of Object.entries(allowed)) {
    const pairs = value.stores[name];
    if (!Array.isArray(pairs) || pairs.length > 20000) throw new Error('This workspace backup is too large or incomplete.');
    const keys = new Set();
    for (const pair of pairs) {
      if (!Array.isArray(pair) || pair.length !== 2 || !keyAllowed(pair[0]) || keys.has(pair[0])) throw new Error('This backup contains an invalid or duplicate entry.');
      keys.add(pair[0]);
    }
  }
  let nodes = 0;
  const walk = (item, depth = 0) => {
    if (++nodes > 2500000 || depth > 50) throw new Error('This backup contains too much nested data.');
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('This backup contains invalid numbers.');
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('This backup contains an unsafe property.');
      walk(child, depth + 1);
    }
  };
  walk(value.stores);
  return value;
}

export function backupSummary(value) {
  validateWorkspaceBackup(value);
  const workspace = value.stores.workspace;
  const read = key => workspace.find(pair => pair[0] === key)?.[1];
  return {
    createdAt: value.createdAt,
    designs: workspace.filter(([key]) => key.startsWith('design:')).length,
    campaigns: workspace.filter(([key]) => key.startsWith('campaign:')).length,
    images: Array.isArray(read('assets')) ? read('assets').length : 0,
    fonts: value.stores.fonts.find(([key]) => key === 'fonts')?.[1]?.length || 0,
    textKits: value.stores.textKits.find(([key]) => key === 'kits')?.[1]?.length || 0,
    hasBrand: !!read('brand-profile') || !!read('design-style'),
  };
}
