import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aiEngine } from './ai-engine.mjs';

const context = new AsyncLocalStorage();
export const providerNames = Object.freeze({ codex: 'Codex', claude: 'Claude', gemini: 'Gemini', kimi: 'Kimi' });
let directory, codexBinary, settings = { provider: 'codex', mode: 'single', models: { codex: aiEngine.model, claude: '', gemini: '', kimi: '' } };
let tail = Promise.resolve(), waiting = 0, executing = null;
const jobs = new Map();
export function validateAISettings(value) {
  if (!value || !Object.hasOwn(providerNames,value.provider) || !['single','claude-codex'].includes(value.mode)) throw new Error('Choose a supported designer and workflow.');
  const models = {};
  for (const id of Object.keys(providerNames)) {
    const model = value.models?.[id] ?? (id === 'codex' ? aiEngine.model : '');
    if (typeof model !== 'string' || model.length > 120 || (model && !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model))) throw new Error('Use a model name or alias supported by your CLI.');
    models[id] = model;
  }
  return { provider: value.provider, mode: value.mode, models };
}
export function configureAI({ runtime, codex }) {
  directory = path.join(runtime,'ai'); codexBinary = codex;
  mkdirSync(path.join(directory,'activity'),{recursive:true});
  try { settings = validateAISettings(JSON.parse(readFileSync(path.join(directory,'settings.json'),'utf8'))); } catch { /* Existing Codex default. */ }
}
export const aiSettings = () => structuredClone(settings);
export function saveAISettings(value) {
  if (jobs.size) throw new Error('Wait for active and queued AI work to finish, or cancel it, before changing models.');
  const next = validateAISettings(value);
  writeFileSync(path.join(directory,'settings.json'),JSON.stringify(next,null,2),{mode:0o600});
  settings = next;
  return aiSettings();
}
function commandOnPath(name) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const file = path.join(dir, name + (process.platform === 'win32' ? '.exe' : ''));
    if (existsSync(file)) return { command:file, prefix:[] };
  }
}
export function providerCommand(id) {
  const override = process.env[`FORMA_${id.toUpperCase()}_BIN`];
  if (override && path.isAbsolute(override) && existsSync(override)) return { command:override, prefix:[] };
  if (id === 'codex' && codexBinary) return { command:codexBinary, prefix:[] };
  const home=os.homedir(), npm=path.join(process.env.APPDATA || path.join(home,'.local'),'npm','node_modules');
  const candidates = id === 'claude' ? [path.join(home,'.local','bin','claude.exe'),path.join(npm,'@anthropic-ai','claude-code','bin','claude.exe')]
    : id === 'kimi' ? [path.join(home,'.kimi-code','bin','kimi.exe'),path.join(home,'.local','bin','kimi.exe')] : [];
  for (const file of candidates) if (existsSync(file)) return { command:file,prefix:[] };
  if (id === 'gemini') {
    const entry=path.join(npm,'@google','gemini-cli','dist','index.js');
    const node=commandOnPath('node');
    if (existsSync(entry) && node) return {command:node.command,prefix:[entry]};
  }
  return commandOnPath(id);
}
export function providerInventory() {
  return Object.entries(providerNames).map(([id,name])=>({id,name,installed:!!providerCommand(id),images:id==='codex',model:settings.models[id] || 'CLI default',login:id==='codex'?'codex login':id==='claude'?'claude auth login':id==='gemini'?'gemini':'kimi login'}));
}
export function selectedEngine() {
  const id=settings.mode==='claude-codex'?'codex':settings.provider;
  return {engine:settings.mode==='claude-codex'?'Claude → Codex':`${providerNames[id]} CLI`,model:settings.models[id],modelLabel:settings.models[id]||`${providerNames[id]} CLI default`,reasoningEffort:id==='codex'?aiEngine.reasoningEffort:'CLI default',imageEngine:id==='codex'?aiEngine.imageEngine:'Not available with this designer',provider:id,mode:settings.mode};
}
export function selectedReady() {
  return settings.mode==='claude-codex' ? !!providerCommand('claude') && !!providerCommand('codex') : !!providerCommand(settings.provider);
}
export function currentAI() { return context.getStore(); }
export async function withAIJob(job, kind, action) {
  const state={job,kind,settings:aiSettings(),entries:[],startedAt:new Date().toISOString()};
  job.ai={...selectedEngine()}; jobs.set(job.id,state);
  try { return await context.run(state,action); }
  finally { jobs.delete(job.id); persist(state); }
}
export function redact(value) {
  return String(value).replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g,'[attached image]')
    .replace(/\bAIza[A-Za-z0-9_-]{25,}/g,'[redacted key]')
    .replace(/\bya29\.[A-Za-z0-9_.-]+/g,'[redacted token]')
    .replace(/\b(?:sk|pk|rk)_(?:test_|live_)?[A-Za-z0-9_-]{12,}/g,'[redacted key]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g,'[redacted key]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+/g,'[redacted token]')
    .replace(/(authorization["'\s:]+(?:bearer\s+)?)[^\s",}]+/gi,'$1[redacted]')
    .replace(/((?:api[_-]?key|access[_-]?token|secret[_-]?key)["'\s:=]+)[^\s",}]+/gi,'$1[redacted]');
}
function publicState(state) {
  return {id:state.job.id,kind:state.kind,status:state.job.status,stage:state.job.stage,startedAt:state.startedAt,ai:state.job.ai,entries:state.entries};
}
function persist(state) {
  if (!directory) return;
  try {writeFileSync(path.join(directory,'activity',state.job.id+'.json'),JSON.stringify(publicState(state)),{mode:0o600});} catch { /* A log failure must not lose the artwork. */ }
}
export function logAI(type, value) {
  const state=currentAI(); if(!state)return;
  state.entries.push({at:new Date().toISOString(),type,text:redact(value).slice(0,90000)});
  if(state.entries.length>40)state.entries.shift();persist(state);
}
export function activityLog(id) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) return null;
  if(jobs.has(id))return publicState(jobs.get(id));
  try{return JSON.parse(readFileSync(path.join(directory,'activity',id+'.json'),'utf8'));}catch{return null;}
}
export function recentActivity() {
  const all=new Map([...jobs].map(([id,state])=>[id,publicState(state)]));
  if(directory)for(const file of readdirSync(path.join(directory,'activity')).filter(f=>/^[a-f0-9-]{36}\.json$/i.test(f)).slice(-200)){
    const id=file.slice(0,-5);if(all.has(id))continue;
    const entry=activityLog(id);if(entry)all.set(id,entry);
  }
  return [...all.values()].sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).slice(0,30).map(({entries,...entry})=>({...entry,steps:entries.length}));
}
export const aiQueueStatus = () => ({executing,waiting,jobs:jobs.size});
export async function oneModel({signal,provider,stage},action) {
  const before=tail;let release;
  tail=new Promise(resolve=>{release=resolve;});waiting++;
  const job=currentAI()?.job,previous=job?.stage;
  if(job&&executing)job.stage=`Waiting for ${providerNames[executing.provider]} to finish`;
  // A queued cancellation never starts a provider, even after its turn arrives.
  await before;
  waiting--;
  try {
    if(signal?.aborted)throw new Error('Cancelled.');
    if(job&&previous)job.stage=previous;
    executing={provider,jobId:job?.id||null,stage};
    return await action();
  } finally {executing=null;release();}
}
