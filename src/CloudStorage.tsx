import { useEffect, useRef, useState } from 'react';
import { Cloud, CloudUpload, Download, ExternalLink, LoaderCircle, ShieldCheck, Unplug } from 'lucide-react';
import { Modal, Field } from './ui';
import type { Editor } from './editor';
import type { CloudBackup, CloudState } from './desktop';
import { captureWorkspace, prepareWorkspaceRestore, restoreWorkspace } from './workspace-backup';
import './cloud-storage.css';
const cloud = () => window.formaDesktop?.cloud;
export const cloudChanged = () => window.dispatchEvent(new Event('forma:cloud-changed'));

export function useCloudBackup() {
  useEffect(() => {
    if (!cloud()) return;
    let timer: ReturnType<typeof setTimeout> | undefined, dirty = true, stopped = false, running = false, lastAttempt = 0;
    const interval = 15 * 60 * 1000;
    async function backup() {
      timer = undefined; if (stopped || running || !dirty) return;
      running = true;
      try {
        const state = await cloud()!.status();
        if (!state.connected || !state.automatic) return;
        const earliest = Math.max(lastAttempt, Date.parse(state.lastBackupAt || '') || 0) + interval;
        if (Date.now() < earliest) { timer = setTimeout(() => void backup(), earliest - Date.now()); return; }
        dirty = false; lastAttempt = Date.now();
        await cloud()!.backup(await captureWorkspace());
      } catch { dirty = true; }
      finally {
        running = false; cloudChanged();
        if (dirty && !timer && !stopped) timer = setTimeout(() => void backup(), interval);
      }
    }
    function changed() { dirty = true; if (!timer && !running) timer = setTimeout(() => void backup(), 2000); }
    function online() { if (timer) clearTimeout(timer); timer = undefined; changed(); }
    window.addEventListener('forma:workspace-changed', changed); window.addEventListener('forma:cloud-settings', online); window.addEventListener('online', online);
    changed();
    return () => { stopped = true; if (timer) clearTimeout(timer); window.removeEventListener('forma:workspace-changed', changed); window.removeEventListener('forma:cloud-settings', online); window.removeEventListener('online', online); };
  }, []);
}

export function CloudStorage({ editor, onClose, activeAI }: { editor: Editor; onClose(): void; activeAI: boolean }) {
  const [state, setState] = useState<CloudState>(), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [region, setRegion] = useState('us-east-1'), [endpoint, setEndpoint] = useState('https://s3.wasabisys.com'), [bucket, setBucket] = useState(''), [prefix, setPrefix] = useState('forma-studio');
  const [accessKeyId, setAccessKeyId] = useState(''), [secretAccessKey, setSecretAccessKey] = useState(''), [automatic, setAutomatic] = useState(true);
  const [backups, setBackups] = useState<CloudBackup[]>([]), [listed, setListed] = useState(false), [prepared, setPrepared] = useState<Awaited<ReturnType<typeof prepareWorkspaceRestore>>>(), [includeBrand, setIncludeBrand] = useState(false), [restored, setRestored] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => void cloud()?.status().then(value => { if (mounted.current) setState(value); }).catch(e => { if (mounted.current) setError(e.message); });
    refresh(); window.addEventListener('forma:cloud-changed', refresh);
    return () => { mounted.current = false; window.removeEventListener('forma:cloud-changed', refresh); };
  }, []);
  const work = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); cloudChanged(); }
  };
  const backUp = async () => {
    await editor.save(); const result = await cloud()!.backup(await captureWorkspace()); setState(result);
    setMessage(result.unchanged ? 'Your saved workspace matches the latest backup.' : 'Your workspace is backed up in your Wasabi bucket.');
  };
  const reconnect = !state?.connected;
  return <Modal title="Cloud storage" onClose={() => { if (!busy && !restored) onClose(); }} wide className="cloud-storage">
    {!cloud() ? <div className="cloud-intro"><Cloud size={40} /><h3>Your storage. Your choice.</h3><p>Wasabi backups are available in the Forma desktop app, where your keys can be protected by your operating system.</p><p>Your browser workspace stays on this device. Export a Forma JSON file from Export to keep an editable copy.</p></div> : <>
      <div className="cloud-intro"><Cloud size={36} /><div><h3>A second home for your work.</h3><p>Connect your own Wasabi bucket. Designs, campaigns, uploads, brand, style, fonts and text kits travel together.</p></div></div>
      {reconnect ? <form onSubmit={e => { e.preventDefault(); void work(async () => {
        const value = await cloud()!.connect({ region, endpoint, bucket, prefix, accessKeyId, secretAccessKey, automatic });
        setState(value); setAccessKeyId(''); setSecretAccessKey(''); await backUp(); window.dispatchEvent(new Event('forma:cloud-settings'));
      }); }}>
        <ol className="cloud-setup"><li><a href="https://wasabi.com/" target="_blank" rel="noreferrer">Create a Wasabi account <ExternalLink size={14} /></a> and a private bucket.</li><li>Create a dedicated access key with access to that bucket. <a href="https://tryformastudio.netlify.app/walkthrough.html#cloud-storage" target="_blank" rel="noreferrer">Setup and permissions</a></li><li>Enter its region, endpoint and keys below.</li></ol>
        <div className="field-grid"><Field label="Bucket name"><input required value={bucket} maxLength={63} onChange={e => setBucket(e.target.value)} placeholder="my-forma-backups" autoComplete="off" /></Field><Field label="Region"><input required value={region} maxLength={30} onChange={e => { const next = e.target.value; setRegion(next); setEndpoint(next === 'us-east-1' ? 'https://s3.wasabisys.com' : `https://s3.${next}.wasabisys.com`); }} placeholder="us-east-1" /></Field></div>
        <Field label="Wasabi HTTPS endpoint"><input required type="url" value={endpoint} maxLength={150} onChange={e => setEndpoint(e.target.value)} /></Field>
        <Field label="Backup folder"><input required value={prefix} maxLength={100} onChange={e => setPrefix(e.target.value)} /></Field>
        <div className="field-grid"><Field label="Access key"><input required value={accessKeyId} maxLength={128} onChange={e => setAccessKeyId(e.target.value)} autoComplete="off" spellCheck={false} /></Field><Field label="Secret key"><input required type="password" value={secretAccessKey} maxLength={200} onChange={e => setSecretAccessKey(e.target.value)} autoComplete="new-password" spellCheck={false} /></Field></div>
        <label className="check-row"><input type="checkbox" checked={automatic} onChange={e => setAutomatic(e.target.checked)} /> Back up changed work automatically, up to every 15 minutes while Forma is open.</label>
        <p className="cloud-privacy"><ShieldCheck size={17} /> Keys are encrypted on this computer. Backups go directly to your Wasabi account. Wasabi bills your account for storage.</p>
        <button className="primary full" disabled={busy}><CloudUpload size={18} /> {busy ? 'Connecting and backing up…' : 'Connect & back up'}</button>
      </form> : <div className="cloud-connected">
        <div className="cloud-destination"><Cloud size={25} /><div><strong>{state.bucket}</strong><span>{state.region} / {state.prefix}</span></div><span className="cloud-connected-label">Connected</span></div>
        <p className="cloud-last-backup">{state.lastBackupAt ? `Last backup: ${new Date(state.lastBackupAt).toLocaleString()}` : 'No completed backup yet.'}</p>
        <label className="check-row"><input type="checkbox" checked={state.automatic} disabled={busy} onChange={e => void work(async () => { setState(await cloud()!.automatic(e.target.checked)); window.dispatchEvent(new Event('forma:cloud-settings')); })} /> Automatic backups while Forma is open</label>
        <p className="muted small">Changed work is backed up up to every 15 minutes. Your local save continues independently.</p>
        <div className="cloud-actions"><button className="primary" disabled={busy || restored} onClick={() => void work(backUp)}><CloudUpload size={18} /> Back up now</button><button className="secondary" disabled={busy || restored} onClick={() => void work(async () => { setBackups(await cloud()!.list()); setListed(true); })}><Download size={17} /> Browse backups</button></div>
        {listed && <div className="cloud-history"><h3>Your backups</h3>{!backups.length && <p>No workspace backups found in this folder.</p>}{backups.map(item => <button className="cloud-history-item" disabled={busy || restored || activeAI} key={item.key} onClick={() => void work(async () => { const result = await cloud()!.restore(item.key); setPrepared(await prepareWorkspaceRestore(result.raw)); })}><span><strong>{new Date(item.createdAt).toLocaleString()}</strong><span>{(item.bytes / 1024 / 1024).toFixed(1)} MB</span></span><span>Review restore →</span></button>)}</div>}
        {prepared && !restored && <div className="cloud-restore"><h3>Restore as a new copy</h3><p>{prepared.summary.designs} designs · {prepared.summary.campaigns} campaigns · {prepared.summary.images} uploads · {prepared.summary.fonts} fonts · {prepared.summary.textKits} text kits</p><p>Existing designs stay intact. Campaign links are kept and unfinished AI batches stay paused until you resume them.</p><label className="check-row"><input type="checkbox" checked={includeBrand} onChange={e => setIncludeBrand(e.target.checked)} /> Use the backup’s brand, palette, logo and personal style on this device</label><button className="primary" disabled={busy || activeAI} onClick={() => void work(async () => { await editor.save(); await restoreWorkspace(prepared, includeBrand); setRestored(true); setMessage('Workspace restored. Reopen the studio to load your recovered libraries.'); })}>Restore workspace</button><button className="secondary" disabled={busy} onClick={() => setPrepared(undefined)}>Cancel restore</button></div>}
        {restored && <button className="primary full" onClick={() => location.reload()}>Reopen studio</button>}
        {activeAI && <p className="muted small">Finish your current AI work before restoring a workspace.</p>}
        <button className="cloud-disconnect" disabled={busy || restored} onClick={() => void work(async () => { setState(await cloud()!.disconnect()); setBackups([]); setListed(false); setPrepared(undefined); setMessage('Disconnected. Your local work and existing Wasabi backups are kept.'); window.dispatchEvent(new Event('forma:cloud-settings')); })}><Unplug size={15} /> Disconnect Wasabi</button>
      </div>}
      {(busy || state?.busy) && <p className="cloud-progress" role="status"><LoaderCircle size={17} className="spin" /> Working with your Wasabi storage…</p>}
      {message && <p className="cloud-message" role="status">{message}</p>}
      {(error || state?.lastError) && <p className="cloud-error" role="alert">{error || state?.lastError}</p>}
    </>}
  </Modal>;
}
