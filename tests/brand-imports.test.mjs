import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mkdirSync,mkdtempSync } from 'node:fs';
import path from 'node:path';
import { isPublicAddress,websiteAddress,publicDestination,readPublicPage,collectWebsite } from '../server/public-website.mjs';
import { validateWebsiteDraft } from '../shared/brand-import.mjs';
import { createBrandImportService,brandImportInstructions } from '../server/brand-imports.mjs';
const address={address:'93.184.215.14',family:4};
test('business websites reject local, private, credential-bearing, alternate-port and non-web targets',async()=>{
  for(const value of ['file:///C:/private','javascript:alert(1)','data:text/html,a','https://name:password@example.com','http://localhost/','http://2130706433/','http://127.1/','http://10.0.0.1/','http://169.254.169.254/','http://[::1]/','http://[::ffff:127.0.0.1]/','https://site.example:8080/'])assert.throws(()=>websiteAddress(value),value);
  for(const ip of ['0.0.0.0','127.0.0.1','10.0.0.1','172.31.1.1','192.168.1.1','100.64.0.1','169.254.169.254','198.18.0.1','224.0.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::1'])assert.equal(isPublicAddress(ip),false,ip);
  assert.equal(isPublicAddress(address.address),true);assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
  assert.equal(websiteAddress('example.com/about#story').href,'https://example.com/about');
  await assert.rejects(publicDestination('https://example.com',{resolve:async()=>[address,{address:'127.0.0.1',family:4}]}),/public website/);
});
function requestFixture(reply,onOptions=()=>{}){return(url,options,callback)=>{
  onOptions(url,options);const req=new EventEmitter();req.setTimeout=()=>req;req.destroy=error=>{if(error)req.emit('error',error);req.emit('close');};
  req.end=()=>queueMicrotask(()=>{const response=Readable.from(reply.body?[Buffer.from(reply.body)]:[]);response.statusCode=reply.status||200;response.headers=reply.headers||{'content-type':'text/html'};response.on('close',()=>req.emit('close'));callback(response);});return req;
};}
test('website requests pin validated DNS, omit cookies and credentials, and recheck every redirect',async()=>{
  let pinned;const request=requestFixture({body:'<p>Public business information</p>'},(_url,options)=>{assert.equal(options.headers.Cookie,undefined);assert.equal(options.headers.Authorization,undefined);options.lookup('example.com',{},(_error,ip,family)=>pinned={ip,family});});
  const result=await readPublicPage('https://example.com',{resolve:async()=>[address],request});assert.match(result.html,/Public business/);assert.deepEqual(pinned,{ip:address.address,family:4});
  await assert.rejects(readPublicPage('https://example.com',{resolve:async()=>[address],request:requestFixture({status:302,headers:{location:'https://127.0.0.1/admin'}})}),/public HTTP/);
  await assert.rejects(readPublicPage('https://example.com',{resolve:async()=>[address],request:requestFixture({status:302,headers:{location:'http://example.com/'}})}),/HTTPS/);
  await assert.rejects(readPublicPage('https://example.com',{resolve:async()=>[address],request:requestFixture({headers:{'content-type':'text/html'},body:'x'.repeat(2_000_001)})}),/too large/);
  await assert.rejects(readPublicPage('https://example.com',{resolve:async()=>[address],request:requestFixture({headers:{'content-type':'application/pdf'},body:'not HTML'})}),/HTML/);
});
const html='<title>Petal Studio</title><script>throw new Error("do not execute")</script><style>.private{display:none}</style><h1>Petal Studio</h1><p>We sell seasonal flowers and thoughtful bouquets for local gift buyers. Our purpose is bringing neighbors closer through seasonal flowers.</p><a href="/about">About us</a><a href="https://elsewhere.example/about">Elsewhere</a>';
test('collection reads a small same-origin page set without executing website scripts',async()=>{
  const calls=[];const result=await collectWebsite('https://example.com/',{read:async url=>{calls.push(url);return{url,html};}});assert.deepEqual(calls,['https://example.com/','https://example.com/about']);assert.equal(result.pages.length,2);assert.doesNotMatch(result.pages[0].text,/do not execute|display:none/);
});
function aiFields(){return Object.fromEntries(['name','business','mission','audience','voice'].map(key=>[key,{value:key==='name'?'Petal Studio':`A considered ${key}`,basis:key==='mission'?'suggested':'stated',sourceId:'page-1',evidence:'seasonal flowers'}]));}
test('AI drafts separate suggestions and validate every source excerpt rather than trusting generated links',()=>{
  const pages=[{id:'page-1',url:'https://example.com/',title:'Petal Studio',text:'We sell seasonal flowers and thoughtful bouquets.'}];
  const fields=validateWebsiteDraft(aiFields(),pages);assert.equal(fields.mission.basis,'suggested');assert.equal(fields.name.sourceUrl,pages[0].url);
  const invented=aiFields();invented.mission.evidence='Certified by imaginary organization';assert.throws(()=>validateWebsiteDraft(invented,pages),/matched to its source/);
  const missing=aiFields();missing.name.sourceId='https://evil.example';assert.throws(()=>validateWebsiteDraft(missing,pages),/matched to its source/);
  const unknown=aiFields();unknown.mission={value:'',basis:'unknown',sourceId:'',evidence:''};assert.equal(validateWebsiteDraft(unknown,pages).mission.value,'');assert.match(brandImportInstructions,/untrusted source material/);
});
test('website draft jobs remain asynchronous beyond six minutes, require explicit cancellation and never save a brand',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.now()});
  mkdirSync('.local',{recursive:true});
  let answer,controller,status,last;const runtime=mkdtempSync(path.resolve('.local/brand-job-proof-'));
  const service=createBrandImportService({codex:'test',runtime,authenticated:true,json(_res,code,value){status=code;last=value;},collect:async url=>({url,pages:[{id:'page-1',url,title:'Petal Studio',text:'seasonal flowers'}],warnings:[]}),run:options=>{controller=options.signal;return new Promise(resolve=>{answer=resolve;});}});
  const submit=Readable.from([JSON.stringify({url:'https://example.com/'})]);submit.method='POST';submit.headers={'content-type':'application/json'};
  await service.handle(submit,{},new URL('http://local/brand-imports'));assert.equal(status,202);const id=last.id;await new Promise(resolve=>setImmediate(resolve));
  t.mock.timers.tick(12*60*1000);assert.equal(controller.aborted,false);
  await service.handle({method:'GET'}, {},new URL('http://local/brand-imports/'+id));assert.equal(last.status,'running');assert.ok(last.elapsedSeconds>=720);assert.equal(last.result,null);
  answer(aiFields());await Promise.resolve();await Promise.resolve();await service.handle({method:'GET'}, {},new URL('http://local/brand-imports/'+id));assert.equal(last.status,'completed');assert.equal(last.result.fields.name.value,'Petal Studio');assert.equal(Object.hasOwn(last.result,'brandProfileSaved'),false);
  const second=Readable.from([JSON.stringify({url:'https://example.com/'})]);second.method='POST';second.headers={'content-type':'application/json'};await service.handle(second,{},new URL('http://local/brand-imports'));const secondId=last.id;await Promise.resolve();await service.handle({method:'DELETE'}, {},new URL('http://local/brand-imports/'+secondId));assert.equal(last.status,'cancelled');assert.equal(controller.aborted,true);answer(aiFields());await Promise.resolve();service.shutdown();
});
