import { spawn } from 'node:child_process';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import updateRules from '../desktop/updates.cjs';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const policy = JSON.parse(await readFile('updates/stable.json', 'utf8'));
if (policy.version !== pkg.version) throw new Error('Update updates/stable.json to match the release version.');
if (updateRules.compareVersions(policy.minimumSupportedVersion, pkg.version) > 0) throw new Error('The minimum supported version cannot be newer than this release.');
const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', RAYON_NUM_THREADS: '1' };
for (const args of [['node_modules/typescript/bin/tsc', '-b'], ['node_modules/vite/bin/vite.js', 'build'], ['node_modules/electron-builder/cli.js', ...(process.platform === 'darwin' ? ['--mac'] : ['--win', 'nsis', '--x64']), '--publish', 'never']]) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, windowsHide: true, stdio: 'inherit' });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Desktop packaging exited with ${code}.`)));
  });
}
await copyFile('updates/stable.json', 'release/update-policy.json');
if (process.platform === 'win32') {
  const name = `Forma-Studio-Setup-${pkg.version}.exe`, hash = createHash('sha256');
  for await (const chunk of createReadStream('release/' + name)) hash.update(chunk);
  await writeFile('release/SHA256SUMS.txt', `${hash.digest('hex')}  ${name}\n`);
}
