import { useState } from 'react';
export function DesktopAI() {
  const [busy, setBusy] = useState(''), [message, setMessage] = useState('');
  if (!window.formaDesktop) return null;
  const run = async (action: 'signIn' | 'restartAI') => {
    setBusy(action); setMessage(action === 'signIn' ? 'Complete sign-in in your browser, then return here.' : 'Restarting the local designer…');
    try { await window.formaDesktop![action](); setMessage('Ready. Use Reconnect below, or reopen your AI tool.'); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(''); }
  };
  return <details className="design-intent"><summary>AI account & connection</summary>
    <p>Use your own Codex account for AI designs and images. Editing and exports work without an AI account. AI usage follows your account’s plan.</p>
    <div className="button-row"><button className="secondary" disabled={!!busy} onClick={() => void run('signIn')}>{busy === 'signIn' ? 'Waiting for sign-in…' : 'Sign in to Codex'}</button><button className="secondary" disabled={!!busy} onClick={() => void run('restartAI')}>Restart AI</button></div>
    {message && <p role="status">{message}</p>}
  </details>;
}
