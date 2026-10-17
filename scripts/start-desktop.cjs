const { spawn } = require('node:child_process');
const { electronPackage } = require('../desktop/platform.cjs');
const child = spawn(require(electronPackage()), ['.', ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: false });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
