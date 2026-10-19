import catalog from './assets.json' with { type: 'json' };
import { validateBoard } from './whiteboard.mjs';
import { validateAudio } from './audio.mjs';

export const liveProtocol = 1;
export const maxLiveBytes = 64 * 1024 * 1024;
const imagePaths = new Set(catalog.map(item => item.src));
const idPattern = /^[A-Za-z0-9_-]{1,120}$/;
const metaFields = ['name', 'width', 'height', 'kind', 'fonts'];
const pageFields = ['name', 'motion', 'audio', 'boardGrid'];
const unsafe = new Set(['__proto__', 'prototype', 'constructor']);
const clone = value => value === undefined ? undefined : structuredClone(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const validId = value => typeof value === 'string' && idPattern.test(value);

// Only the open artwork crosses this boundary. Workspace branding, campaigns,
// account settings, AI briefs, credentials and thumbnails are never included.
export function sharedDesign(value) {
  const result = { id: value.id, pages: value.pages.map(page => ({
    id: page.id, name: page.name, data: clone(page.data),
    ...Object.fromEntries(['motion','audio','boardGrid','comments'].filter(key => page[key] !== undefined).map(key => [key, clone(page[key])])),
  })) };
  for (const key of metaFields) if (value[key] !== undefined) result[key] = clone(value[key]);
  return result;
}

export function validateLiveDesign(value) {
  if (!value || !validId(value.id) || typeof value.name !== 'string' || value.name.length > 500 ||
      ![value.width,value.height].every(n => Number.isFinite(n) && n >= 64 && n <= 8000) || value.width * value.height > 32000000 ||
      !Array.isArray(value.pages) || !value.pages.length || value.pages.length > 100) throw new Error('Invalid shared design.');
  if (Object.keys(value).some(key => !['id','pages',...metaFields].includes(key))) throw new Error('Only the selected design can be shared.');
  const pageIds = new Set();
  for (const page of value.pages) {
    if (!page || !validId(page.id) || pageIds.has(page.id) || typeof page.name !== 'string' || page.name.length > 500 ||
        !page.data || !Array.isArray(page.data.objects) || page.data.objects.length > 1500 ||
        Object.keys(page).some(key => !['id','data','comments',...pageFields].includes(key))) throw new Error('Invalid shared page.');
    pageIds.add(page.id);
    const ids = new Set();
    for (const object of page.data.objects) {
      if (!object || !validId(object.id) || ids.has(object.id) || typeof object.type !== 'string') throw new Error('Shared elements need unique IDs.');
      ids.add(object.id);
    }
    validateAudio(page.audio);
    if (page.motion && (!['none','fade','rise','stagger','drift'].includes(page.motion.style) || !Number.isFinite(page.motion.duration) || page.motion.duration < .5 || page.motion.duration > 6)) throw new Error('Invalid shared animation.');
    for (const comment of page.comments || []) {
      if ((comment.authorId != null && !validId(comment.authorId)) || (comment.authorName != null && (typeof comment.authorName !== 'string' || comment.authorName.length > 60))) throw new Error('Invalid comment author.');
    }
  }
  validateBoard(value);
  if (value.fonts != null && (!Array.isArray(value.fonts) || value.fonts.length > 48 || value.fonts.some(font =>
    !font || !/^FormaUser-[a-f0-9]{64}$/.test(font.family) || typeof font.name !== 'string' || font.name.length > 100 ||
    !['ttf','otf','woff','woff2'].includes(font.format) || typeof font.data !== 'string' || font.data.length > 12*1024*1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(font.data)))) throw new Error('Invalid shared font.');
  let nodes = 0;
  function walk(item, depth = 0, audio = false) {
    if (++nodes > 1000000 || depth > 40) throw new Error('Shared artwork is too complex.');
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Invalid shared number.');
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item)) {
      if (unsafe.has(key)) throw new Error('Unsafe shared property.');
      if (['src','source'].includes(key) && typeof child === 'string' && child && !imagePaths.has(child) &&
          !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(child) &&
          !(audio && /^data:audio\/(?:webm|ogg|mp4|mpeg|wav|x-wav)(?:;codecs=[a-zA-Z0-9.,-]+)?;base64,[A-Za-z0-9+/]+={0,2}$/.test(child))) throw new Error('Shared media must be embedded or bundled with Forma.');
      walk(child, depth + 1, audio || key === 'audio');
    }
  }
  walk(value);
  if (JSON.stringify(value).length > maxLiveBytes) throw new Error('Keep the shared design under 64 MB.');
  return value;
}

export function diffDesign(before, after) {
  const ops = [];
  const push = (path, a, b) => { if (!equal(a,b)) ops.push({ path, ...(a === undefined ? {} : {before:clone(a)}), ...(b === undefined ? {} : {after:clone(b)}) }); };
  const fields = (path, a, b, keys) => { for (const key of keys) push([...path,key], a?.[key], b?.[key]); };
  fields(['meta'], before, after, metaFields);
  const collection = (path, a, b, update) => {
    const old = new Map((a || []).map(item => [item.id,item])), next = new Map((b || []).map(item => [item.id,item]));
    for (const [id,item] of old) if (!next.has(id)) push([...path,id],item,undefined);
    for (const [id,item] of next) old.has(id) ? update([...path,id],old.get(id),item) : push([...path,id],undefined,item);
  };
  collection(['page'], before.pages, after.pages, (path,a,b) => {
    fields([...path,'meta'], a,b,pageFields);
    fields([...path,'canvas'], a.data,b.data,[...new Set([...Object.keys(a.data),...Object.keys(b.data)])].filter(key => key !== 'objects'));
    collection([...path,'object'],a.data.objects,b.data.objects,(p,x,y) => fields(p,x,y,[...new Set([...Object.keys(x),...Object.keys(y)])].filter(key => key !== 'id')));
    collection([...path,'comment'],a.comments,b.comments,(p,x,y) => fields(p,x,y,[...new Set([...Object.keys(x),...Object.keys(y)])].filter(key => key !== 'id')));
    push([...path,'order'], a.data.objects.map(o => o.id), b.data.objects.map(o => o.id));
  });
  push(['pages'], before.pages.map(p => p.id),after.pages.map(p => p.id));
  return ops;
}

function location(doc, path) {
  if (!Array.isArray(path) || path.length > 5 || path.some(key => typeof key !== 'string' || key.length > 120 || unsafe.has(key))) throw new Error('Invalid change address.');
  if (path[0] === 'meta' && path.length === 2 && metaFields.includes(path[1])) return { owner:doc,key:path[1] };
  if (path[0] === 'pages' && path.length === 1) return { order:doc.pages };
  if (path[0] !== 'page' || !validId(path[1])) throw new Error('Invalid page change.');
  const index = doc.pages.findIndex(p => p.id === path[1]);
  if (path.length === 2) return { collection:doc.pages,index,id:path[1] };
  if (index < 0) return null;
  const page = doc.pages[index];
  if (path[2] === 'meta' && path.length === 4 && pageFields.includes(path[3])) return {owner:page,key:path[3]};
  if (path[2] === 'canvas' && path.length === 4 && path[3] !== 'objects') return {owner:page.data,key:path[3]};
  if (path[2] === 'order' && path.length === 3) return {order:page.data.objects};
  if (!['object','comment'].includes(path[2]) || !validId(path[3]) || ![4,5].includes(path.length)) throw new Error('Invalid element change.');
  const items = path[2] === 'object' ? page.data.objects : (page.comments ||= []), itemIndex = items.findIndex(o => o.id === path[3]);
  if (path.length === 4) return {collection:items,index:itemIndex,id:path[3]};
  if (path[4] === 'id') throw new Error('Element IDs cannot be changed.');
  return itemIndex < 0 ? null : {owner:items[itemIndex],key:path[4]};
}
function read(loc) { return !loc ? undefined : loc.order ? loc.order.map(o => o.id) : loc.collection ? loc.collection[loc.index] : loc.owner[loc.key]; }
function write(loc, op) {
  if (!loc) return;
  if (loc.order) {
    if (!Array.isArray(op.after) || op.after.length > 1500 || new Set(op.after).size !== op.after.length || op.after.some(id => !validId(id))) throw new Error('Invalid element order.');
    const byId = new Map(loc.order.map(o => [o.id,o]));
    const ordered = op.after.filter(id => byId.has(id)).map(id => byId.get(id));
    ordered.push(...loc.order.filter(o => !op.after.includes(o.id)));
    loc.order.splice(0,loc.order.length,...ordered);
  } else if (loc.collection) {
    if (op.after === undefined) { if (loc.index >= 0) loc.collection.splice(loc.index,1); }
    else {
      if (op.after?.id !== loc.id) throw new Error('Invalid element ID.');
      if (loc.index >= 0) loc.collection[loc.index] = clone(op.after); else loc.collection.push(clone(op.after));
    }
  } else if (op.after === undefined) delete loc.owner[loc.key];
  else loc.owner[loc.key] = clone(op.after);
}

// The host serializes transactions and compares each property with its base.
// Independent edits merge; a stale write to the SAME property is rejected.
// This is intentionally a connected, host-led protocol, not offline merging.
export function applyTransaction(value, ops, {role='edit',actor={id:'host',name:'Host'},authoritative=false}={}) {
  if (!Array.isArray(ops) || ops.length > 12000) throw new Error('Too many changes in one update.');
  const next = clone(value), conflicts = [];
  for (const original of ops) {
    if (!original || Object.keys(original).some(key => !['path','before','after'].includes(key))) throw new Error('Invalid change.');
    const op = clone(original), loc = location(next,op.path), current = read(loc), comment = op.path[0] === 'page' && op.path[2] === 'comment';
    if (!authoritative) {
      if (role === 'view' || (role === 'comment' && !comment)) throw new Error('Your permission does not allow artwork changes.');
      if (comment) {
        const adding = op.path.length === 4 && current === undefined && op.after;
        const root = next.pages.find(p => p.id === op.path[1])?.comments?.find(c => c.id === op.path[3]);
        if (adding) op.after = {...op.after,authorId:actor.id,authorName:actor.name};
        else if (op.path.length === 5 && ['authorId','authorName','createdAt'].includes(op.path[4])) throw new Error('Comment authors cannot be changed.');
        else if (root?.authorId && root.authorId !== actor.id && op.path[4] !== 'resolved') throw new Error('Only the author can edit or delete this comment.');
        if (op.path.length === 4 && current !== undefined && op.after !== undefined) throw new Error('Update comment properties individually.');
      }
      if (!loc || (!loc.order && !equal(current,op.before))) { conflicts.push(op.path.join('/')); continue; }
      if (loc.order && !equal(current,op.before)) {
        // Adding/removing different elements is safe; competing reorderings are not.
        const common = (op.before || []).filter(id => (op.after || []).includes(id) && current.includes(id));
        if (!equal(current.filter(id => common.includes(id)), (op.before || []).filter(id => common.includes(id)))) { conflicts.push(op.path.join('/')); continue; }
      }
    }
    write(loc,op);
  }
  if (!authoritative) validateLiveDesign(next);
  return { design:next, ops:diffDesign(value,next), conflicts };
}
