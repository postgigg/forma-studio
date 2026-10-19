import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {runExternal} from '../server/provider-runner.mjs';
function fakeProvider(protocol,{error,delay=0}={}){
 let child,closed=false;const received=[];
 const launch=(command,args,config)=>{
  if(command==='taskkill'){setTimeout(()=>{child.exitCode=0;closed=true;child.emit('close',0);},delay);return new EventEmitter();}
  assert.equal(config.shell,false);assert.equal(config.windowsHide,true);
  child=new EventEmitter();child.pid=12345;child.exitCode=null;child.stdout=new PassThrough();child.stderr=new PassThrough();
  const emit=event=>child.stdout.write(JSON.stringify(event)+'\n');
  child.kill=()=>{setTimeout(()=>{child.exitCode=0;closed=true;child.emit('close',0);},delay);};
  child.stdin=new Writable({write(bytes,_encoding,callback){
   for(const line of bytes.toString().split('\n').filter(Boolean)){
    const request=JSON.parse(line);received.push(request);
    queueMicrotask(()=>{
     if(protocol==='claude'){emit({type:'assistant',message:{content:[{type:'thinking',thinking:'PRIVATE'}, {type:'text',text:'ignore this intermediate text'}]}});emit({type:'result',is_error:!!error,...(error?{result:error}:{structured_output:{title:'Ready'}})});return;}
     if(!request.method)return;
     if(request.method==='initialize')emit({jsonrpc:'2.0',id:request.id,result:{agentInfo:{name:'test'},agentCapabilities:{promptCapabilities:{image:true}}}});
     if(request.method==='session/new')emit({jsonrpc:'2.0',id:request.id,result:{sessionId:'isolated-session'}});
     if(request.method==='session/prompt'){
      emit({jsonrpc:'2.0',method:'session/update',params:{update:{sessionUpdate:'agent_thought_chunk',content:{type:'text',text:'PRIVATE'}}}});
      emit({jsonrpc:'2.0',id:900,method:'fs/read_text_file',params:{path:'private.txt'}});
      emit({jsonrpc:'2.0',id:901,method:'session/request_permission',params:{}});
      emit({jsonrpc:'2.0',method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'{"title":"Ready"}'}}}});
      emit({jsonrpc:'2.0',id:request.id,...(error?{error:{code:-32000,message:error}}:{result:{stopReason:'end_turn'}})});
     }
    });
   }callback();
  }});
  return child;
 };
 return {launch,prepare:()=>({command:'fake-provider',args:[],env:{},protocol,input:'{"type":"user","message":{"role":"user","content":[]}}\n',prompt:[{type:'text',text:'brief'}]}),received,closed:()=>closed};
}
test('Claude structured output wins over intermediate prose and completion waits for process exit',async()=>{
 const fake=fakeProvider('claude',{delay:20});
 const result=await runExternal('claude',{workspace:'.',prompt:'brief'},fake);
 assert.deepEqual(result,{title:'Ready'});assert.equal(fake.closed(),true);
});
test('ACP streams only final artwork text, rejects reverse filesystem calls and cancels permission requests',async()=>{
 const fake=fakeProvider('acp');
 const result=await runExternal('kimi',{workspace:'.',prompt:'brief',images:['image']},fake);
 assert.deepEqual(result,{title:'Ready'});assert.equal(fake.closed(),true);
 assert.equal(fake.received.find(r=>r.id===900).error.code,-32601);
 assert.deepEqual(fake.received.find(r=>r.id===901).result,{outcome:{outcome:'cancelled'}});
 assert.deepEqual(fake.received.find(r=>r.method==='session/new').params.mcpServers,[]);
 assert.equal(fake.received[0].params.clientCapabilities.terminal,false);
});
test('provider account errors remain actionable and redact credentials',async()=>{
 const fake=fakeProvider('acp',{error:'Login required sk-abcdefghijklmnopqrstuvwxyz'});
 await assert.rejects(runExternal('gemini',{workspace:'.',prompt:'brief'},fake),error=>error.message.includes('Login required')&&!error.message.includes('abcdefghijklmnopqrstuvwxyz'));
});
