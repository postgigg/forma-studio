import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Modal } from './ui';
import type { DesktopUpdateState } from './desktop';
import './desktop-updates.css';
export function DesktopUpdates() {
  const [state, setState] = useState<DesktopUpdateState | null>(null);
  const [open, setOpen] = useState(false), [error, setError] = useState('');
  const shown = useRef('');
  useEffect(() => {
    const desktop = window.formaDesktop;
    if (!desktop?.updateStatus) return;
    const receive = (next: DesktopUpdateState) => {
      setState(next);
      const key = next.availableVersion + (next.required ? ':required' : '');
      if (next.availableVersion && ['available', 'downloaded'].includes(next.phase) && shown.current !== key) { shown.current = key; setOpen(true); }
    };
    void desktop.updateStatus().then(receive).catch(() => {});
    const off = desktop.onUpdateState(receive), offShow = desktop.onShowUpdates(() => setOpen(true));
    return () => { off(); offShow(); };
  }, []);
  if (!state) return null;
  const action = async (kind: 'checkForUpdates' | 'downloadUpdate' | 'installUpdate') => {
    setError('');
    try { await window.formaDesktop![kind](); } catch (e) { setError((e as Error).message); }
  };
  const available = !!state.availableVersion;
  return <>
    {available && <button className={'desktop-update-chip' + (state.required ? ' required' : '')} onClick={() => setOpen(true)}><Download size={16} />{state.phase === 'downloaded' ? 'Restart to update' : state.phase === 'downloading' ? `Updating ${Math.round(state.percent)}%` : state.required ? 'Update required' : 'Update available'}</button>}
    {open && <Modal title={state.required ? 'Update required' : available ? 'A new Forma is ready' : 'Forma updates'} onClose={() => setOpen(false)} className="desktop-update-dialog">
      <div className="update-brand"><img src="/brand/forma-mark.svg" width="56" height="56" alt="" /><div><strong>Forma Studio</strong><p>{state.currentVersion}{available && <> → {state.availableVersion}</>}</p></div></div>
      {state.reason && <p>{state.reason}</p>}
      {state.message && <p role="status">{state.message}</p>}
      {state.phase === 'unsupported' && <p role="status">Update checks aren’t available for this build yet.</p>}
      {state.phase === 'checking' && <p role="status">Checking for updates…</p>}
      {state.phase === 'downloading' && <div className="update-progress"><progress value={state.percent} max={100} aria-label="Update download progress" /><p>{Math.round(state.percent)}% downloaded. You can keep designing.</p></div>}
      {state.phase === 'downloaded' && <p>Your design will save before Forma restarts to install the update.</p>}
      {!available && state.phase === 'idle' && !state.message && <p>Forma checks for new releases automatically when you are online.</p>}
      {error && <p role="alert" className="error-text">{error}</p>}
      <div className="update-actions">
        <button className="secondary" onClick={() => setOpen(false)}>Keep working</button>
        {state.canInstall === false && available && state.releaseUrl ? <button className="primary" onClick={() => window.open(state.releaseUrl, '_blank', 'noopener,noreferrer')}>View release</button> : state.canInstall !== false && state.phase === 'downloaded' ? <button className="primary" onClick={() => void action('installUpdate')}><RefreshCw size={17} /> Save & restart</button> : available && state.canInstall !== false && ['available', 'error'].includes(state.phase) ? <button className="primary" onClick={() => void action('downloadUpdate')}><Download size={17} /> Download update</button> : !['checking', 'downloading', 'unsupported'].includes(state.phase) ? <button className="primary" onClick={() => void action('checkForUpdates')}>Check for updates</button> : null}
      </div>
    </Modal>}
  </>;
}
