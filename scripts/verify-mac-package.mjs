import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import desktopPlatform from '../desktop/platform.cjs';

assert.equal(process.platform, 'darwin', 'Verify the Mac app on macOS.');
const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve('app-builder-lib'));
const { extractFile } = builderRequire('@electron/asar');
const { getCurrentFuseWire, FuseV1Options } = builderRequire('@electron/fuses');
const appPath = path.join(root, 'release', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'Forma Studio.app');
const info = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', path.join(appPath, 'Contents', 'Info.plist')], { encoding: 'utf8' }));
assert.equal(info.CFBundleIdentifier, pkg.build.appId);
assert.equal(info.CFBundleShortVersionString, pkg.version);
assert.equal(info.LSMinimumSystemVersion, pkg.build.mac.minimumSystemVersion);
await access(path.join(appPath, 'Contents', 'Resources', info.CFBundleIconFile));
const archive = path.join(appPath, 'Contents', 'Resources', 'app.asar');
const distribution = process.argv.includes('--signed') ? 'signed' : 'development';
const fuseWire = await getCurrentFuseWire(appPath);
const inspectorEnabled = fuseWire[FuseV1Options.EnableNodeCliInspectArguments] === 49;
assert.equal(inspectorEnabled, distribution === 'development', 'Only development packages enable the inspector needed by the native smoke test.');
const packaged = JSON.parse(extractFile(archive, 'package.json'));
const runtimeVersion = desktopPlatform.electronVersion(pkg, 'darwin');
assert.equal(packaged.formaMacDistribution, distribution);
assert.equal(packaged.formaElectronVersion, runtimeVersion);
const frameworkPath = path.join(appPath, 'Contents/Frameworks/Electron Framework.framework/Versions/A');
const frameworkInfo = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', path.join(frameworkPath, 'Resources/Info.plist')], { encoding: 'utf8' }));
assert.equal(frameworkInfo.CFBundleVersion, runtimeVersion);
const buildInfo = execFileSync('xcrun', ['vtool', '-show-build', path.join(frameworkPath, 'Electron Framework')], { encoding: 'utf8' });
const runtimeMinimumSystemVersion = /\bminos\s+(\d+\.\d+(?:\.\d+)?)/.exec(buildInfo)?.[1];
assert.equal(runtimeMinimumSystemVersion?.split('.').slice(0, 2).join('.'), pkg.build.mac.minimumSystemVersion, 'The actual Electron binary must support the configured Mac baseline.');
for (const filename of ['desktop/main.cjs', 'desktop/preload.cjs', 'desktop/platform.cjs', 'desktop/render.cjs', 'desktop/updates.cjs', 'desktop/mac-releases.cjs', 'server/design-review.mjs', 'server/designer.mjs']) {
  assert.deepEqual(extractFile(archive, filename), await readFile(path.join(root, filename)), `Packaged source differs: ${filename}`);
}
for (const filename of ['forma-mark.svg', 'forma-wordmark.svg', 'forma-logo.svg']) {
  assert.deepEqual(extractFile(archive, `dist/brand/${filename}`), await readFile(path.join(root, 'public', 'brand', filename)), `Packaged identity differs: ${filename}`);
}
const codex = desktopPlatform.bundledCodexPath(archive);
for (const binary of [path.join(appPath, 'Contents', 'MacOS', info.CFBundleExecutable), codex, path.join(path.dirname(codex), 'codex-code-mode-host')]) {
  assert.equal(execFileSync('lipo', ['-archs', binary], { encoding: 'utf8' }).trim(), process.arch === 'arm64' ? 'arm64' : 'x86_64');
}
execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
if (process.argv.includes('--signed')) {
  execFileSync('xcrun', ['stapler', 'validate', appPath], { stdio: 'inherit' });
  execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose=2', appPath], { stdio: 'inherit' });
}
const report = { testedAt: new Date().toISOString(), appPath, version: pkg.version, architecture: process.arch, distribution, runtimeVersion, runtimeMinimumSystemVersion, inspectorEnabled, minimumSystemVersion: info.LSMinimumSystemVersion, icon: info.CFBundleIconFile, bundledCodex: true, bundledCodeModeHost: true, packagedSourceMatches: true, packagedBrandMatches: true, signatureVerified: true, notarizationVerified: distribution === 'signed' };
await mkdir(path.join(root, '.local'), { recursive: true });
await writeFile(path.join(root, '.local', 'mac-package-verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
