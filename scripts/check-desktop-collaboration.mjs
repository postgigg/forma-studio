import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createConnection} from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fixture,saved} from './qa-fixture.mjs';
import {diffDesign,sharedDesign} from '../shared/collaboration.mjs';
const require=createRequire(import.meta.url),{createCollaboration}=require('../desktop/collaboration.cjs');
const packaged=process.argv.includes('--packaged'),version=JSON.parse(await readFile('package.json')).version;
for(const port of [51862,51863,51942])await new Promise((resolve,reject)=>{const socket=createConnection({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();reject(new Error(`QA port ${port} is occupied; existing apps are left alone.`));});socket.once('error',()=>resolve());});
const folder=path.resolve('.local/desktop-collaboration-'+version+'-'+Date.now());await mkdir(folder,{recursive:true});
const log=openSync(path.join(folder,'desktop.log'),'a');
const executable=path.resolve(packaged?'release/win-unpacked/Forma Studio.exe':'node_modules/electron/dist/electron.exe');
const child=spawn(executable,[...(packaged?[]:['.']),'--remote-debugging-port=51942','--disable-renderer-backgrounding','--disable-background-timer-throttling'],{windowsHide:true,env:{...process.env,FORMA_DESKTOP_TEST_DATA:folder},stdio:['ignore',log,log]});closeSync(log);
let browser,page;const errors=[],events=[],proof={version,packaged,profileIsolated:true};
const guest=await createCollaboration({onEvent:event=>events.push(event)});
try{
  for(let i=0;i<180;i++){try{const state=await fetch('http://127.0.0.1:51942/json/version').then(r=>r.json());if(state.webSocketDebuggerUrl)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.connectOverCDP('http://127.0.0.1:51942');page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
  await page.getByLabel('Design title',{exact:true}).waitFor({timeout:60000});
  const board={...structuredClone(fixture),id:'native-collaboration-proof',name:'Native collaboration proof',kind:'whiteboard'};
  await page.locator('input[type=file][accept=".json"]').setInputFiles({name:'native-collaboration.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(board))});
  await page.waitForFunction(()=>document.querySelector('[aria-label="Design title"]').value.startsWith('Native collaboration proof'));
  await page.getByRole('button',{name:'Work together',exact:true}).evaluate(button=>button.click());
  await page.getByLabel('Your collaboration name').fill('Native host');
  await page.getByRole('button',{name:'Start live session',exact:true}).evaluate(button=>button.click());
  await page.getByLabel('Invitation code',{exact:true}).waitFor();const code=await page.getByLabel('Invitation code',{exact:true}).inputValue();
  const joining=guest.join({name:'Native guest',code});
  await page.getByLabel('Permission for Native guest').waitFor();await page.getByLabel('Permission for Native guest').selectOption('edit');
  await page.getByRole('button',{name:'Allow',exact:true}).evaluate(button=>button.click());
  const joined=await joining;assert.equal(joined.state.self.role,'edit');proof.nativeAdmission=true;
  const changed=structuredClone(joined.design);changed.pages[0].data.objects.find(object=>object.id==='group-a').left=170;
  await guest.publish({id:'native-edit',ops:diffDesign(joined.design,changed)});
  const deadline=Date.now()+20000;let doc;
  do{doc=await saved(page);if(doc.pages[0].data.objects.find(object=>object.id==='group-a').left===170)break;await new Promise(r=>setTimeout(r,80));}while(Date.now()<deadline);
  assert.equal(doc.pages[0].data.objects.find(object=>object.id==='group-a').left,170);proof.nativeCanvasAndPersistence=true;
  await page.getByLabel('Access for Native guest').selectOption('view');
  await assert.rejects(()=>guest.publish({id:'native-forbidden',ops:diffDesign(joined.design,changed)}),/permission/);proof.nativePermissionEnforced=true;
  const boundary=await page.evaluate(async()=>{let externalBlocked=false;try{await fetch('https://example.com/');}catch{externalBlocked=true;}return{requireType:typeof window.require,processType:typeof window.process,externalBlocked};});
  assert.deepEqual(boundary,{requireType:'undefined',processType:'undefined',externalBlocked:true});proof.rendererSandboxAndCSP=true;
  await page.getByRole('button',{name:'End session',exact:true}).evaluate(button=>button.click());
  await page.waitForFunction(()=>!document.querySelector('.live-session-bar'));proof.nativeEndSession=true;
  await page.getByRole('dialog',{name:'Work together',exact:true}).getByRole('button',{name:'Close dialog',exact:true}).evaluate(button=>button.click());
  await page.locator('.tool-rail button[title="Help & shortcuts"]').evaluate(button=>button.click());
  await page.getByLabel('Installed Forma version',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Installed Forma version',{exact:true}).textContent(),`Forma ${version}`);
  await page.getByRole('button',{name:'Check for updates',exact:true}).evaluate(button=>button.click());
  await page.getByRole('dialog',{name:'Forma updates',exact:true}).waitFor();
  assert.equal(await page.getByRole('dialog',{name:'Help & settings',exact:true}).count(),0);proof.helpOpensExistingUpdater=true;
  assert.deepEqual(errors,[]);proof.errors=errors;
  await writeFile(`.local/desktop-collaboration-${version}-proof.json`,JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
}finally{
  await guest.stop();try{if(page&&!page.isClosed())await Promise.race([page.evaluate(()=>window.close()),new Promise(r=>setTimeout(r,1800))]);}catch{}
  await Promise.race([browser?.close().catch(()=>{}),new Promise(r=>setTimeout(r,1500))]);if(child.exitCode===null)child.kill();
}
