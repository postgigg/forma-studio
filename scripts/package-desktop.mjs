import { spawn } from 'node:child_process';
import { access, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import updateRules from '../desktop/updates.cjs';
import desktopPlatform from '../desktop/platform.cjs';
const options = process.argv.slice(2);
if (options.some(option => !['--mac', '--win', '--signed', '--dir'].includes(option)) || (options.includes('--mac') && options.includes('--win'))) throw new Error('Use --mac or --win, with optional --signed or --dir for a Mac build.');
const platform = options.includes('--mac') ? 'darwin' : options.includes('--win') ? 'win32' : process.platform;
const signed = options.includes('--signed');
const directoryOnly = options.includes('--dir');
if (!['darwin', 'win32'].includes(platform) || platform !== process.platform) throw new Error('Build Mac on macOS and Windows on Windows, using the native target architecture.');
if (signed && platform !== 'darwin') throw new Error('--signed is for Mac distribution builds.');
if (directoryOnly && platform !== 'darwin') throw new Error('--dir is for a Mac app bundle.');
if (signed) {
  for (const name of ['CSC_LINK', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) {
    if (!process.env[name]) throw new Error(`A signed Mac build requires ${name}. See docs/macos.md.`);
  }
  if (process.env.CSC_KEY_PASSWORD === undefined) throw new Error('Set CSC_KEY_PASSWORD for the signing certificate.');
}
await access(desktopPlatform.bundledCodexPath(process.cwd()));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const runtimeVersion = desktopPlatform.electronVersion(pkg, platform);
const policy = JSON.parse(await readFile('updates/stable.json', 'utf8'));
if (platform === 'darwin' && signed) {
  const license = JSON.parse(await readFile('shared/mac-license.json', 'utf8'));
  if (!license.currentIssuerId || !license.issuers.some(issuer => issuer.id === license.currentIssuerId)) throw new Error('Configure the public Mac license issuer before packaging. Signed Mac distribution requires a configured activation issuer.');
}
if (policy.version !== pkg.version) throw new Error('Update updates/stable.json to match the release version.');
if (updateRules.compareVersions(policy.minimumSupportedVersion, pkg.version) > 0) throw new Error('The minimum supported version cannot be newer than this release.');
const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', RAYON_NUM_THREADS: '1' };
if (platform === 'darwin' && !signed) {
  delete env.CSC_LINK; delete env.CSC_INSTALLER_LINK;
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
}
const target = platform === 'darwin'
  ? ['--mac', `--${process.arch}`, ...(directoryOnly ? ['--dir'] : []), `--config.electronVersion=${runtimeVersion}`, `--config.extraMetadata.formaElectronVersion=${runtimeVersion}`, `--config.extraMetadata.formaMacDistribution=${signed ? 'signed' : 'development'}`, ...(signed ? ['--config.forceCodeSigning=true'] : ['--config.mac.identity=-', '--config.mac.hardenedRuntime=false', '--config.mac.notarize=false', '--config.electronFuses.enableNodeCliInspectArguments=true'])]
  : ['--win', 'nsis', '--x64', '--config.electronDist=node_modules/electron/dist'];
for (const args of [['node_modules/typescript/bin/tsc', '-b'], ['node_modules/vite/bin/vite.js', 'build'], ['node_modules/electron-builder/cli.js', ...target, '--publish', 'never']]) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, windowsHide: true, stdio: 'inherit' });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Desktop packaging exited with ${code}.`)));
  });
}
if (directoryOnly) {
  console.log(`Built Forma Studio ${pkg.version} app bundle for ${platform}/${process.arch} with Electron ${runtimeVersion}.`);
} else {
await copyFile('updates/stable.json', 'release/update-policy.json');
const artifacts = platform === 'win32'
  ? [`Forma-Studio-Setup-${pkg.version}.exe`, `Forma-Studio-Setup-${pkg.version}.exe.blockmap`, 'latest.yml']
  : [`Forma-Studio-${pkg.version}-${process.arch}.dmg`, `Forma-Studio-${pkg.version}-${process.arch}.zip`, 'latest-mac.yml'];
const sums = [];
for (const name of [...artifacts, 'update-policy.json']) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream('release/' + name)) hash.update(chunk);
  sums.push(`${hash.digest('hex')}  ${name}`);
}
await writeFile(`release/${platform === 'win32' ? 'SHA256SUMS.txt' : `SHA256SUMS-mac-${process.arch}.txt`}`, sums.join('\n') + '\n');
console.log(`Built Forma Studio ${pkg.version} for ${platform}/${process.arch}${platform === 'darwin' ? signed ? ' (Developer ID signed and notarized).' : ' (ad-hoc development build; distribution needs --signed).' : '.'}`);
}
