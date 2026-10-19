import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {configureAI,aiSettings,saveAISettings,validateAISettings,withAIJob,currentAI,oneModel,aiQueueStatus,logAI,activityLog,redact} from '../server/ai-runtime.mjs';
import {parseProviderResult,externalInvocation} from '../server/provider-runner.mjs';
import {validateAudio,splitClip,joinClips,audioLength} from '../shared/audio.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{ownAudioRequest}=require('../desktop/media-permissions.cjs');
const runtime=mkdtempSync(path.join(os.tmpdir(),'forma-ai-settings-'));
configureAI({runtime});
test('provider selection is validated, persisted and cannot change an active job snapshot',async()=>{
  const config={provider:'claude',claudeAuth:'cli',mode:'claude-codex',models:{codex:'chosen-codex',claude:'chosen-claude',gemini:'',kimi:''}};
  saveAISettings(config);assert.deepEqual(aiSettings(),config);
  const job={id:'11111111-1111-4111-8111-111111111111',status:'running',stage:'Planning'};
  await withAIJob(job,'design',async()=>{assert.deepEqual(currentAI().settings,config);assert.throws(()=>saveAISettings({...config,provider:'gemini'}),/Wait/);logAI('instructions','Client brief sk-test_secretisprivate0123456789');assert.doesNotMatch(JSON.stringify(activityLog(job.id)),/secretisprivate/);});
  configureAI({runtime});assert.deepEqual(aiSettings(),config);assert.equal(activityLog(job.id).kind,'design');
  assert.throws(()=>validateAISettings({...config,provider:'shell'}));assert.throws(()=>validateAISettings({...config,models:{codex:'name; rm'}}));
});
test('all provider processes share one cancellable FIFO slot',async()=>{
  let active=0,max=0;const starts=[];let release;const gate=new Promise(r=>release=r);
  const controller=new AbortController();
  const first=oneModel({provider:'claude'},async()=>{active++;max=Math.max(max,active);starts.push('claude');await gate;active--;});
  const second=oneModel({provider:'codex'},async()=>{active++;max=Math.max(max,active);starts.push('codex');active--;});
  const cancelled=oneModel({provider:'kimi',signal:controller.signal},async()=>starts.push('kimi'));
  controller.abort();release();await first;await second;await assert.rejects(cancelled,/Cancelled/);
  assert.equal(max,1);assert.deepEqual(starts,['claude','codex']);assert.equal(aiQueueStatus().executing,null);
});
test('provider output parsing rejects malformed or excessive results and activity redacts secrets and images',()=>{
  assert.deepEqual(parseProviderResult('```json\n{"title":"Ready"}\n```'),{title:'Ready'});
  assert.throws(()=>parseProviderResult('here is my reasoning'));assert.throws(()=>parseProviderResult('x'.repeat(2500001)));
  assert.equal(redact('data:image/png;base64,YWJjZA=='),'[attached image]');assert.doesNotMatch(redact('Authorization: Bearer verysecretkey'),/verysecretkey/);
});
test('audio cuts preserve the source, retain timing and can close gaps without altering trims',()=>{
  const clip={id:'voice',name:'Voice',src:'data:audio/wav;base64,UklGRg==',duration:5,start:1,end:4,offset:2,volume:1,waveform:[.2,.7]};
  validateAudio([clip]);const parts=splitClip(clip,2.25,'voice-b');assert.equal(parts[0].src,parts[1].src);assert.equal(parts[1].offset,3.25);assert.equal(audioLength(parts),5);
  const joined=joinClips([parts[1],parts[0]]);assert.equal(joined[1].offset,1.75);assert.equal(audioLength(joined),3);
  assert.throws(()=>splitClip(clip,1.01,'bad'));for(const patch of [{src:'https://evil.example/a.wav'},{end:6},{volume:3},{offset:-1},{duration:Infinity}])assert.throws(()=>validateAudio([{...clip,...patch}]));
  assert.throws(()=>validateAudio([clip,clip]));
  const fast={...clip,rate:2};validateAudio([fast]);assert.equal(audioLength([fast]),3.5);
  const cutFast=splitClip(fast,2.5,'fast-b');assert.equal(cutFast[1].offset,2.75);assert.equal(audioLength(cutFast),3.5);
  assert.equal(audioLength(joinClips(cutFast)),1.5);
  for(const rate of [0,.1,5,NaN,Infinity])assert.throws(()=>validateAudio([{...clip,rate}]));
  assert.throws(()=>validateAudio([{...clip,duration:600,start:0,end:600,offset:0,rate:.25}]));
});
test('only the trusted main editor can request audio, with camera and other permissions denied',()=>{
  const wc={getURL:()=> 'http://127.0.0.1:51860/'},main={isDestroyed:()=>false,webContents:wc},args={webContents:wc,main,origin:'http://127.0.0.1:51860',permission:'media',details:{isMainFrame:true,mediaTypes:['audio']}};
  assert.equal(ownAudioRequest(args),true);
  for(const patch of [{webContents:{}},{permission:'geolocation'},{details:{mediaTypes:['audio','video']}},{details:{isMainFrame:false,mediaTypes:['audio']}},{details:{mediaTypes:[]}},{details:{requestingUrl:'https://evil.example',mediaTypes:['audio']}}])assert.equal(ownAudioRequest({...args,...patch}),false);
});
