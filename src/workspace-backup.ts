import { createStore, entries, get, set } from 'idb-keyval';
import { allDesigns, validateDesign } from './storage';
import { allCampaigns, type Campaign } from './campaigns';
import { uid, type Design } from './types';
import { validateFonts } from './font-data';
import { loadFonts, rememberFonts } from './font-library';
import { validateKit } from './TextLibrary';
import { validateBrandContext } from '../shared/brand-context.mjs';
import { validateDesignStyle } from '../shared/design-style.mjs';
import { backupFormat, backupSummary, maxBackupBytes, validateWorkspaceBackup, workspaceKey } from '../shared/workspace-backup.mjs';
import catalog from '../shared/assets.json';
import { workspaceChanged } from './workspace-events';
const workspace = createStore('forma-studio', 'workspace');
const fonts = createStore('forma-type-library', 'kits');
const kits = createStore('forma-text-kits', 'library');

export async function captureWorkspace() {
  await Promise.all([allDesigns(), allCampaigns()]);
  const [saved, savedFonts, savedKits] = await Promise.all([entries<string, unknown>(workspace), entries<string, unknown>(fonts), entries<string, unknown>(kits)]);
  const snapshot = validateWorkspaceBackup({ format: backupFormat, version: 1, createdAt: new Date().toISOString(), stores: {
    workspace: saved.filter(([key]) => workspaceKey(key)), fonts: savedFonts.filter(([key]) => key === 'fonts'), textKits: savedKits.filter(([key]) => key === 'kits'),
  } });
  const raw = JSON.stringify(snapshot);
  if (new Blob([raw]).size > maxBackupBytes) throw new Error('A workspace backup can hold up to 256 MB of saved data.');
  return raw;
}

export async function prepareWorkspaceRestore(raw: string) {
  if (new Blob([raw]).size > maxBackupBytes) throw new Error('This backup exceeds the workspace limit.');
  const snapshot = validateWorkspaceBackup(JSON.parse(raw));
  const source = snapshot.stores.workspace;
  const read = (key: string) => source.find(pair => pair[0] === key)?.[1];
  const checkImages = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'src' && typeof item === 'string' && item && !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(item) && !catalog.some(asset => asset.src === item)) throw new Error('Backup images must be embedded or included with Forma.');
      checkImages(item);
    }
  };
  checkImages(source);
  for (const [key, value] of source) {
    if (key.startsWith('design:')) { validateDesign(value); if (key !== `design:${value.id}`) throw new Error('This backup has an inconsistent design identifier.'); }
    if (key.startsWith('campaign:')) {
      const c = value as Campaign;
      if (!c || key !== `campaign:${c.id}` || !['name', 'objective', 'audience', 'style', 'updatedAt'].every(field => typeof (c as any)[field] === 'string') || !Array.isArray(c.folders) || c.folders.length > 2000) throw new Error('This backup has an invalid campaign.');
      for (const folder of c.folders) {
        if (!folder || typeof folder.id !== 'string' || typeof folder.name !== 'string' || !Array.isArray(folder.images) || !Array.isArray(folder.batches) || folder.batches.length > 2000 || !folder.counts || typeof folder.counts !== 'object') throw new Error('This backup has an invalid campaign folder.');
        for (const batch of folder.batches) {
          if (!batch || typeof batch.id !== 'string' || !Array.isArray(batch.tasks) || batch.tasks.length > 500 || !batch.brief || !['running', 'paused', 'completed', 'failed'].includes(batch.status)) throw new Error('This backup has an invalid campaign batch.');
          for (const task of batch.tasks) if (!task || typeof task.id !== 'string' || !['queued', 'running', 'completed', 'failed'].includes(task.status) || (task.designIds && (!Array.isArray(task.designIds) || task.designIds.some(id => typeof id !== 'string')))) throw new Error('This backup has an invalid campaign task.');
        }
      }
    }
  }
  if (read('brand')) { if (!Array.isArray(read('brand')) || read('brand').length > 100 || read('brand').some((color: unknown) => typeof color !== 'string' || !/^#[a-f0-9]{6}$/i.test(color))) throw new Error('The saved palette is invalid.'); }
  validateBrandContext(read('brand-profile')); validateDesignStyle(read('design-style'));
  const storedFonts = validateFonts(snapshot.stores.fonts.find(([key]) => key === 'fonts')?.[1]);
  const storedKits = snapshot.stores.textKits.find(([key]) => key === 'kits')?.[1] || [];
  if (!Array.isArray(storedKits) || storedKits.length > 100) throw new Error('This backup has too many text kits.');
  const restoredKits = storedKits.map(kit => validateKit({ ...kit, format: 'forma-text-kit', version: 1 }));
  // Hash and parse fonts before any persistent workspace writes.
  const allFonts = [...new Map([...storedFonts, ...restoredKits.flatMap(kit => kit.fonts)].map(font => [font.family, font])).values()];
  await loadFonts(allFonts);
  return { snapshot, storedFonts, restoredKits, summary: backupSummary(snapshot) };
}

export async function restoreWorkspace(prepared: Awaited<ReturnType<typeof prepareWorkspaceRestore>>, includeBrand: boolean) {
  const active = (await allCampaigns()).some(c => c.folders.some(f => f.batches.some(b => b.status === 'running')));
  if (active) throw new Error('Finish or pause your running campaigns before restoring a workspace.');
  const { snapshot, storedFonts, restoredKits } = prepared;
  const designIds = new Map<string, string>(), campaignIds = new Map<string, string>(), folderIds = new Map<string, string>();
  for (const [key, value] of snapshot.stores.workspace) {
    if (key.startsWith('design:')) designIds.set(value.id, uid());
    if (key.startsWith('campaign:')) { campaignIds.set(value.id, uid()); for (const folder of value.folders) folderIds.set(folder.id, uid()); }
  }
  const saved = new Map(snapshot.stores.workspace), next: [string, unknown][] = [];
  const date = new Date().toISOString();
  for (const [key, value] of snapshot.stores.workspace) {
    if (key.startsWith('design:')) {
      const d = structuredClone(value) as Design;
      d.id = designIds.get(d.id)!; d.name = `${d.name} (restored)`.slice(0, 500); d.updatedAt = date; delete d.aiJobId;
      d.campaignId = campaignIds.get(d.campaignId || ''); d.folderId = folderIds.get(d.folderId || '');
      next.push([`design:${d.id}`, d]);
    } else if (key.startsWith('campaign:')) {
      const c = structuredClone(value) as Campaign;
      c.id = campaignIds.get(c.id)!; c.name = `${c.name} (restored)`; c.updatedAt = date;
      for (const f of c.folders) {
        f.id = folderIds.get(f.id)!;
        for (const b of f.batches) {
          b.id = uid();
          if (b.status === 'running') { b.status = 'paused'; b.pauseRequested = true; }
          for (const task of b.tasks) {
            task.id = uid(); delete task.jobId;
            task.designIds = task.designIds?.map(id => designIds.get(id)).filter((id): id is string => !!id);
            if (task.status === 'running') { task.status = 'queued'; task.stage = 'Restored; resume when ready'; }
          }
        }
      }
      next.push([`campaign:${c.id}`, c]);
    }
  }
  const existingAssets = await get<any[]>('assets', workspace) || [];
  const importedAssets = saved.get('assets') || [];
  if (!Array.isArray(importedAssets)) throw new Error('This backup has an invalid upload library.');
  const sources = new Set(existingAssets.map(asset => asset.src));
  next.push(['assets', [...existingAssets, ...importedAssets.filter((asset: any) => { if (!asset || typeof asset.src !== 'string' || typeof asset.name !== 'string' || !Number.isFinite(asset.width) || !Number.isFinite(asset.height)) throw new Error('This backup contains an invalid image.'); if (sources.has(asset.src)) return false; sources.add(asset.src); asset.id = uid(); return true; })]]);
  if (includeBrand) for (const key of ['brand', 'brand-profile', 'design-style', 'brand-logo']) if (saved.has(key)) next.push([key, saved.get(key)]);
  // A saved in-progress wizard is recovered only when this device has no draft.
  if (saved.has('campaign-wizard') && !await get('campaign-wizard', workspace)) next.push(['campaign-wizard', saved.get('campaign-wizard')]);
  const existingKits = await get<any[]>('kits', kits) || [];
  const signatures = new Set(existingKits.map(kit => JSON.stringify([kit.name, kit.styles])));
  const additions = restoredKits.filter(kit => { const signature = JSON.stringify([kit.name, kit.styles]); if (signatures.has(signature)) return false; signatures.add(signature); return true; });
  if (existingKits.length + additions.length > 100) throw new Error('Restoring would exceed the 100 text-kit limit.');
  await rememberFonts([...new Map([...storedFonts, ...restoredKits.flatMap(kit => kit.fonts)].map(font => [font.family, font])).values()]);
  // One transaction commits all designs, campaign links and the optional shared brand.
  await workspace('readwrite', store => new Promise<void>((resolve, reject) => {
    store.transaction.oncomplete = () => resolve(); store.transaction.onabort = () => reject(store.transaction.error || new Error('The workspace could not be restored.'));
    try { for (const [key, value] of next) store.put(value, key); } catch (error) { store.transaction.abort(); reject(error); }
  }));
  await set('kits', [...existingKits, ...additions], kits);
  workspaceChanged();
  return prepared.summary;
}
