import { spawn } from 'node:child_process';
const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', RAYON_NUM_THREADS: '1' };
for (const args of [['node_modules/typescript/bin/tsc', '-b'], ['node_modules/vite/bin/vite.js', 'build'], ['node_modules/electron-builder/cli.js', ...(process.platform === 'darwin' ? ['--mac', 'dmg'] : ['--win', 'nsis', '--x64']), '--publish', 'never']]) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, windowsHide: true, stdio: 'inherit' });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Desktop packaging exited with ${code}.`)));
  });
}
