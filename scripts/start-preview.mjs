import {spawn} from 'node:child_process';
import {openSync,writeFileSync,closeSync} from 'node:fs';
const log=openSync('.local/preview.log','a');
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5190','--strictPort'],{cwd:process.cwd(),detached:true,windowsHide:true,stdio:['ignore',log,log]});
child.unref();closeSync(log);writeFileSync('.local/preview.pid',String(child.pid));
console.log('QA preview launched at http://127.0.0.1:5190');
