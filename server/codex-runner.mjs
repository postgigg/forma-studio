import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pngDimensions } from './photos.mjs';
import { modelArguments } from './ai-engine.mjs';

// Each operation owns one child and one isolated output directory.
export function runCodex({ codex, workspace, prompt, schema, images = [], generateImage = false, webSearch = false, onEvent, signal }) {
  mkdirSync(workspace, { recursive: true });
  const started = Date.now();
  const output = path.join(workspace, 'answer.json');
  const args = ['exec', '--ignore-user-config', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '--json', '--color', 'never', '-c', 'approval_policy="never"', '-c', `web_search="${webSearch ? 'live' : 'disabled'}"`];
  args.push(...modelArguments());
  if (schema) {
    const schemaPath = path.join(workspace, 'schema.json');
    writeFileSync(schemaPath, JSON.stringify(schema));
    args.push('--output-schema', schemaPath, '--output-last-message', output);
  }
  for (const feature of ['shell_tool', 'unified_exec', 'shell_snapshot', 'apps', 'plugins', 'hooks', 'multi_agent', 'browser_use', 'browser_use_external', 'computer_use', 'view_image', 'goals']) args.push('--disable', feature);
  args.push(generateImage ? '--enable' : '--disable', 'image_generation');
  images.forEach((src, i) => {
    const file = path.join(workspace, `reference-${i}.png`);
    writeFileSync(file, Buffer.from(src.split(',')[1], 'base64'));
    args.push('--image', file);
  });
  args.push('-');
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Cancelled.'));
    const child = spawn(codex, args, { cwd: workspace, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let stream = '', diagnostic = '', thread = '';
    const stop = () => {
      if (!child.pid || child.exitCode !== null) return;
      if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else child.kill('SIGTERM');
    };
    signal?.addEventListener('abort', stop, { once: true });
    const clean = () => { signal?.removeEventListener('abort', stop); };
    child.stdout.on('data', chunk => {
      stream += chunk.toString();
      const lines = stream.split('\n'); stream = lines.pop() || '';
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          onEvent?.(event);
          if (event.type === 'thread.started' && /^[a-f0-9-]{36}$/i.test(event.thread_id)) thread = event.thread_id;
          if (event.type === 'error') diagnostic = String(event.message || '');
        } catch { /* Partial output is not a result. */ }
      }
    });
    child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-6000); });
    child.on('error', error => { clean(); reject(new Error(`Could not start the local designer: ${error.code || 'process error'}.`)); });
    child.on('close', code => {
      clean();
      try {
        if (signal?.aborted) throw new Error('Cancelled.');
        if (code !== 0) {
          writeFileSync(path.join(workspace, 'run-error.log'), `Exit ${code}\n` + diagnostic.replace(/(?:eyJ[a-zA-Z0-9_.-]+|sk-[a-zA-Z0-9_-]+)/g, '[redacted]'));
          throw new Error(/rate.limit|quota|429|usage.limit/i.test(diagnostic) ? 'Your Codex account has reached a usage limit. Try again when access resets.' : 'The designer could not finish. Check your Codex sign-in or retry.');
        }
        if (!generateImage) return resolve(JSON.parse(readFileSync(output, 'utf8')));
        if (!thread) throw new Error('No image generation session was returned.');
        const folder = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'generated_images', thread);
        const candidates = readdirSync(folder).filter(n => /^exec-[a-f0-9-]+\.png$/i.test(n)).map(n => ({ file: path.join(folder, n), info: statSync(path.join(folder, n)) })).filter(f => f.info.isFile() && f.info.mtimeMs >= started - 5000 && f.info.size <= 30000000).sort((a,b) => b.info.mtimeMs - a.info.mtimeMs);
        if (!candidates.length) throw new Error('No edited image was produced. Please retry.');
        const bytes = readFileSync(candidates[0].file);
        const dimensions = pngDimensions(bytes);
        writeFileSync(path.join(workspace, 'edited.png'), bytes);
        resolve({ src: `data:image/png;base64,${bytes.toString('base64')}`, ...dimensions });
      } catch (error) { reject(new Error(error.code === 'ENOENT' ? 'The AI did not produce a usable result. Please retry.' : error.message)); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
  });
}
