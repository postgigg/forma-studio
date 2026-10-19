// Two isolated editor workspaces use real native TLS transports. Only the
// browser/native bridge and loopback network selection are supplied by QA.
// Editor inspection is injected into this browser response, never the bundle.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {createServer} from 'vite';
import {fixture,saved} from './qa-fixture.mjs';
const require=createRequire(import.meta.url),{createCollaboration}=require('../desktop/collaboration.cjs');
const output='.local/collaboration-qa';await mkdir(output,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5198,strictPort:true}});await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--disable-gpu-compositing']});
const services=[],contexts=[],errors=[],proof={};
const networkLog=[];
async function client(label){
  const context=await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true}),page=await context.newPage();contexts.push(context);
  page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(`${label}: ${e.message}`));
  let wire=Promise.resolve();
  const service=await createCollaboration({allowLoopback:true,getInterfaces:()=>[{name:'QA LAN',address:'127.0.0.1'}],onEvent:event=>{if(event.type==='commit')networkLog.push({label,id:event.transactionId,ops:event.ops.map(op=>({path:op.path,after:typeof op.after==='object'?'[object]':op.after})),conflicts:event.conflicts});wire=wire.then(()=>page.evaluate(value=>window.dispatchEvent(new CustomEvent('__qa-live-event',{detail:value})),event)).catch(()=>{});}});services.push(service);
  await page.exposeBinding('__qaLive',async(_source,{method,value})=>{
    if(!['interfaces','status','host','join','stop','renew','admit','permission','remove','publish','presence'].includes(method))throw new Error('Unknown test bridge action.');
    return service[method](value);
  });
  await page.addInitScript(()=>{
    const invoke=(method,value)=>window.__qaLive({method,value});
    window.formaDesktop={platform:'win32',aiEndpoint:'http://127.0.0.1:5188',editText:()=>{},onEditCommand:()=>()=>{},onBeforeClose:()=>()=>{},
      collaboration:{...Object.fromEntries(['interfaces','status','host','join','stop','renew','admit','permission','remove','publish','presence'].map(method=>[method,value=>invoke(method,value)])),onEvent:callback=>{const handler=e=>callback(e.detail);window.addEventListener('__qa-live-event',handler);return()=>window.removeEventListener('__qa-live-event',handler);}}};
  });
  await page.route('**/src/editor.ts*',async route=>{const response=await route.fetch(),source=await response.text();assert.ok(source.includes('notify() {'));await route.fulfill({response,body:source.replace('notify() {','notify() { window.__qaEditor=this;')});});
  await page.goto('http://127.0.0.1:5198/');await page.waitForFunction(()=>window.__qaEditor?.ready,null,{timeout:60000});
  return {page,service};
}
async function view(page){return page.evaluate(()=>{const e=window.__qaEditor;return{id:e.doc.id,access:e.liveAccess,pages:e.doc.pages.map(p=>({id:p.id,objects:p.data.objects.map(o=>({id:o.id,left:o.left,top:o.top,text:o.text})),comments:p.comments||[]}))};});}
try{
  const host=await client('host'),guest=await client('guest');
  const board={...structuredClone(fixture),id:'live-ui-proof',name:'A shared creative session',kind:'whiteboard'};
  await host.page.evaluate(async doc=>{await window.__qaEditor.open(doc);},board);
  const originalGuest=await view(guest.page);
  await host.page.getByRole('button',{name:'Work together',exact:true}).click();
  await host.page.getByLabel('Your collaboration name').fill('Anna');
  await host.page.getByRole('button',{name:'Start live session',exact:true}).click();
  await expect(host.page.getByLabel('Invitation code',{exact:true})).toBeVisible();
  const code=await host.page.getByLabel('Invitation code',{exact:true}).inputValue();assert.ok(code.startsWith('FORMA-LAN-1.'));
  await guest.page.getByRole('button',{name:'Work together',exact:true}).click();
  await guest.page.getByRole('tab',{name:'Join with a code'}).click();
  await guest.page.getByLabel('Your collaboration name').fill('Ben');
  await guest.page.getByLabel('Paste invitation code').fill(code);
  await guest.page.getByRole('button',{name:'Request to join',exact:true}).click();
  await expect(host.page.getByText('Waiting for your approval',{exact:true})).toBeVisible();
  await host.page.getByLabel('Permission for Ben').selectOption('edit');
  await host.page.getByRole('button',{name:'Allow',exact:true}).click();
  await expect(guest.page.getByText('Ben (you)',{exact:true})).toBeVisible();
  await host.page.screenshot({path:output+'/host-session.png',timeout:15000});
  for(const {page} of [host,guest])await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  const joined=await view(guest.page);assert.notEqual(joined.id,board.id);assert.notEqual(joined.id,originalGuest.id);assert.equal(joined.pages[0].objects.length,4);
  assert.equal(await guest.page.evaluate(()=>window.__qaEditor.objects.find(o=>o.id==='photo').getElement().complete),true);
  proof.approval=true;proof.independentLocalCopy=true;proof.embeddedImage=true;
  // Both users change different existing objects, without waiting for delivery.
  await Promise.all([
    host.page.evaluate(()=>{const e=window.__qaEditor;e.objects.find(o=>o.id==='group-a').set({left:145});e.commit();}),
    guest.page.evaluate(()=>{const e=window.__qaEditor;e.objects.find(o=>o.id==='group-b').set({left:625});e.commit();}),
  ]);
  for(const {page} of [host,guest])await expect.poll(async()=>{const d=await view(page);return d.pages[0].objects.filter(o=>['group-a','group-b'].includes(o.id)).map(o=>o.left);}).toEqual([145,625]);
  proof.simultaneousIndependentEdits=true;
  console.log('Initial sharing, embedded media and simultaneous edits passed.');
  await host.page.waitForFunction(()=>!window.__qaEditor.busy);
  await host.page.evaluate(()=>window.__qaEditor.undo());
  for(const {page} of [host,guest])await expect.poll(async()=>{const d=await view(page);return d.pages[0].objects.filter(o=>['group-a','group-b'].includes(o.id)).map(o=>o.left);}).toEqual([90,625]);
  proof.undoPreservesOtherUser=true;
  await guest.page.waitForFunction(()=>!window.__qaEditor.busy);
  await guest.page.evaluate(()=>{const e=window.__qaEditor,o=e.objects.find(o=>o.id==='group-b');for(const top of [220,225,230,235]){o.set({top});e.commit();}});
  for(const {page} of [host,guest])await expect.poll(async()=>(await view(page)).pages[0].objects.find(o=>o.id==='group-b').top).toBe(235);
  proof.orderedRapidEdits=true;
  // Nested groups need rehydration, not plain assignment of serialized children.
  await guest.page.waitForFunction(()=>!window.__qaEditor.busy);
  await guest.page.evaluate(()=>{const e=window.__qaEditor,g=e.objects.find(o=>o.id==='group-b');g.getObjects().find(o=>o.id==='details').set({text:'A season made together.'});e.commit();});
  await expect.poll(()=>host.page.evaluate(()=>window.__qaEditor.objects.find(o=>o.id==='group-b').getObjects().find(o=>o.id==='details').text)).toBe('A season made together.');
  proof.nestedGroupEdit=true;
  await host.page.getByRole('button',{name:'Work together',exact:true}).click();await host.page.getByLabel('Access for Ben').selectOption('comment');await host.page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await expect.poll(async()=>(await view(guest.page)).access).toBe('comment');
  await guest.page.getByRole('button',{name:'Comments',exact:true}).click();
  await guest.page.getByLabel('New board comment').fill('Let’s give this campaign more breathing room.');
  await guest.page.getByRole('button',{name:'Add comment',exact:true}).click();
  await expect.poll(async()=>(await view(host.page)).pages[0].comments[0]?.authorName).toBe('Ben');
  await host.page.getByRole('button',{name:'Comments',exact:true}).click();
  await expect(host.page.getByLabel('Comment 1 text')).toHaveValue('Let’s give this campaign more breathing room.');
  await host.page.getByRole('button',{name:'Resolve',exact:true}).click();
  await expect.poll(async()=>(await view(guest.page)).pages[0].comments[0]?.resolved).toBe(true);
  proof.sharedCommentAndResolution=true;
  console.log('Shared undo, rapid edits, group edits and comments passed.');
  const before=(await view(host.page)).pages[0].objects[0].left;
  await guest.page.evaluate(()=>{const e=window.__qaEditor;e.objects[0].set({left:999});e.commit();});
  await expect.poll(async()=>(await view(guest.page)).pages[0].objects[0].left).toBe(before);assert.equal((await view(host.page)).pages[0].objects[0].left,before);
  proof.commenterArtworkRollback=true;
  await host.page.getByRole('button',{name:'Work together',exact:true}).click();await host.page.getByLabel('Access for Ben').selectOption('view');await host.page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await expect(guest.page.getByLabel('New board comment')).toBeDisabled();proof.viewerCannotComment=true;
  await host.page.getByRole('button',{name:'Work together',exact:true}).click();await host.page.getByLabel('Access for Ben').selectOption('edit');await host.page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await expect.poll(async()=>(await view(guest.page)).access).toBe('edit');
  await guest.page.waitForFunction(()=>!window.__qaEditor.busy);
  await guest.page.evaluate(()=>window.__qaEditor.addPage());
  await expect.poll(async()=>(await view(host.page)).pages.length).toBe(2);proof.pageSync=true;
  await guest.page.waitForFunction(()=>!window.__qaEditor.busy);
  await guest.page.evaluate(()=>window.__qaEditor.changePage(0));
  assert.equal(await guest.page.evaluate(()=>window.__qaEditor.page.id),board.pages[0].id);
  await guest.page.evaluate(()=>{const e=window.__qaEditor;e.canvas.setActiveObject(e.objects.find(o=>o.id==='group-b'));});
  await expect.poll(()=>host.page.locator('.live-selection').count()).toBeGreaterThan(0);proof.selectionPresence=true;
  await host.page.screenshot({path:output+'/shared-board.png',timeout:15000});
  await guest.page.screenshot({path:output+'/guest-board.png',timeout:15000});
  await host.page.getByRole('button',{name:'Work together',exact:true}).click();await host.page.getByRole('button',{name:'End session',exact:true}).click();
  await expect.poll(()=>guest.service.status().mode).toBe('idle');
  const final=await saved(guest.page);assert.equal(final.pages.length,2);assert.equal(final.pages[0].comments[0].authorName,'Ben');
  await guest.page.reload();await guest.page.waitForFunction(()=>window.__qaEditor?.ready);assert.equal((await view(guest.page)).pages.length,2);
  proof.disconnectAndPersistence=true;assert.deepEqual(errors,[]);proof.errors=errors;
  await writeFile(output+'/proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
}catch(error){await writeFile(output+'/failure.json',JSON.stringify({error:error.message,networkLog,errors},null,2));throw error;}finally{
  for(const service of services)await service.stop();for(const context of contexts)await context.close();await browser.close();await server.close();
}
