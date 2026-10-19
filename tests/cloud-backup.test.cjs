const test = require('node:test');
const assert = require('node:assert/strict');
const {mkdtemp,readFile,rm} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {createHash,randomBytes,createCipheriv,createDecipheriv} = require('node:crypto');
const {createServer} = require('node:http');
const {gzipSync} = require('node:zlib');
const {S3Client} = require('@aws-sdk/client-s3');
const {createCloudBackup,validateConnection} = require('../desktop/cloud-backup.cjs');
const connection={region:'us-east-1',endpoint:'https://s3.wasabisys.com',bucket:'forma-backup-test',prefix:'forma-studio',accessKeyId:'FORMAEXAMPLEACCESS12345',secretAccessKey:'exampleSecretForLocalTestsOnly123456789',automatic:true};
const snapshot=()=>({format:'forma-workspace-backup',version:1,createdAt:new Date().toISOString(),stores:{workspace:[['design:sample',{id:'sample',name:'A saved design',pages:[]}],['brand-profile',{business:'Flowers'}],['campaign:campaign',{id:'campaign',folders:[]}],['assets',[]]],fonts:[['fonts',[]]],textKits:[['kits',[]]]}});
function keychain(){const key=randomBytes(32);return {isEncryptionAvailable:()=>true,encryptString:value=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,cipher.update(value),cipher.final(),cipher.getAuthTag()]);},decryptString:bytes=>{const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]).toString();}};}
async function fixture(){
  const profile=await mkdtemp(path.join(tmpdir(),'forma-cloud-test-')),objects=new Map(),requests=[];let failure='';
  const server=createServer(async(req,res)=>{
    const u=new URL(req.url,'http://localhost'),key=decodeURIComponent(u.pathname.slice(1+connection.bucket.length+1));
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
    requests.push({method:req.method,url:u.pathname,headers:req.headers,body});
    if(failure){res.writeHead(403,{'Content-Type':'application/xml'});res.end(`<Error><Code>AccessDenied</Code><Message>${connection.secretAccessKey}</Message></Error>`);return;}
    if(req.method==='HEAD'){res.writeHead(200);res.end();return;}
    if(req.method==='PUT'){
      assert.equal(req.headers['content-md5'],createHash('md5').update(body).digest('base64'));
      objects.set(key,{bytes:body,sha:req.headers['x-amz-meta-forma-sha256']});res.writeHead(200,{ETag:'"example"'});res.end();return;
    }
    if(u.searchParams.get('list-type')==='2'){
      res.writeHead(200,{'Content-Type':'application/xml'});res.end(`<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>false</IsTruncated>${[...objects].map(([key,value])=>`<Contents><Key>${key}</Key><LastModified>2026-10-18T12:00:00Z</LastModified><Size>${value.bytes.length}</Size></Contents>`).join('')}</ListBucketResult>`);return;
    }
    const object=objects.get(key);if(!object){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Length':object.bytes.length,'x-amz-meta-forma-sha256':object.sha});res.end(object.bytes);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const safeStorage=keychain(),clientFactory=cfg=>new S3Client({...cfg,endpoint:`http://127.0.0.1:${server.address().port}`,maxAttempts:1});
  const cloud=createCloudBackup({profile,safeStorage,clientFactory});
  return {cloud,profile,safeStorage,clientFactory,objects,requests,setFailure:value=>failure=value,async close(){await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true});}};
}

test('only the official TLS endpoint for the selected Wasabi region can receive keys',()=>{
  assert.equal(validateConnection(connection).endpoint,'https://s3.wasabisys.com');
  for(const endpoint of ['http://s3.wasabisys.com','https://s3.wasabisys.com.evil.test','https://127.0.0.1','https://s3.eu-west-1.wasabisys.com','https://s3.wasabisys.com:444','https://s3.wasabisys.com/a','https://a:b@s3.wasabisys.com','https://s3.wasabisys.com?token=oops']) assert.throws(()=>validateConnection({...connection,endpoint}));
  for(const prefix of ['../elsewhere','a/../b','a b','/'])assert.throws(()=>validateConnection({...connection,prefix}));
});

test('backup snapshots reject unknown stores, duplicate entries and prototype properties',async()=>{
  const {validateWorkspaceBackup}=await import('../shared/workspace-backup.mjs');assert.equal(validateWorkspaceBackup(snapshot()).version,1);
  const unknown=snapshot();unknown.stores.credentials=[];assert.throws(()=>validateWorkspaceBackup(unknown));
  const duplicate=snapshot();duplicate.stores.workspace.push(['assets',[]]);assert.throws(()=>validateWorkspaceBackup(duplicate));
  const polluted=JSON.parse(JSON.stringify(snapshot()).replace('"pages":[]','"pages":[],"__proto__":{"x":1}'));assert.throws(()=>validateWorkspaceBackup(polluted));
});

test('real S3 SDK signs direct private uploads, verifies a compressed roundtrip and protects saved keys',async()=>{
  const f=await fixture();try{
    const initial=await f.cloud.status();assert.equal(initial.connected,false);
    const state=await f.cloud.connect(connection);assert.equal(state.bucket,connection.bucket);assert.equal('secretAccessKey'in state,false);assert.equal('accessKeyId'in state,false);
    const raw=JSON.stringify(snapshot());const saved=await f.cloud.backup(raw);assert.equal(saved.unchanged,false);assert.ok(saved.lastBackupAt);assert.equal(saved.summary.designs,1);assert.equal(saved.summary.campaigns,1);
    const put=f.requests.find(r=>r.method==='PUT');assert.match(put.headers.authorization,/^AWS4-HMAC-SHA256 /);assert.equal(put.headers['x-amz-server-side-encryption'],'AES256');assert.equal(put.headers['x-amz-acl'],undefined);assert.ok(put.body.length<Buffer.byteLength(raw));
    const encrypted=await readFile(path.join(f.profile,'wasabi-connection.bin'));assert.equal(encrypted.includes(connection.secretAccessKey),false);assert.equal(encrypted.includes(connection.accessKeyId),false);
    const list=await f.cloud.list();assert.equal(list.length,1);assert.ok(list[0].key.startsWith('forma-studio/backups/'));
    const restored=await f.cloud.restore(list[0].key);assert.deepEqual(JSON.parse(restored.raw),JSON.parse(raw));
    const restarted=createCloudBackup({profile:f.profile,safeStorage:f.safeStorage,clientFactory:f.clientFactory});assert.equal((await restarted.status()).lastBackupAt,saved.lastBackupAt);
    const again=await restarted.backup(JSON.stringify({...JSON.parse(raw),createdAt:new Date(Date.now()+1000).toISOString()}));assert.equal(again.unchanged,true);assert.equal(f.requests.filter(r=>r.method==='PUT').length,1);
    await restarted.disconnect();assert.equal((await restarted.status()).connected,false);assert.equal(f.objects.size,1);
  }finally{await f.close();}
});

test('failed uploads never claim completion and provider errors cannot leak keys',async()=>{
  const f=await fixture();try{
    await f.cloud.connect(connection);f.setFailure('denied');await assert.rejects(()=>f.cloud.backup(JSON.stringify(snapshot())),error=>!error.message.includes(connection.secretAccessKey)&&/denied access/.test(error.message));
    assert.equal((await f.cloud.status()).lastBackupAt,null);assert.equal(f.objects.size,0);
    f.setFailure('');await f.cloud.backup(JSON.stringify(snapshot()));assert.ok((await f.cloud.status()).lastBackupAt);
  }finally{await f.close();}
});

test('restore refuses corrupt objects and keys outside the customer backup folder',async()=>{
  const f=await fixture();try{
    await f.cloud.connect(connection);await f.cloud.backup(JSON.stringify(snapshot()));const [key,object]=[...f.objects][0];
    await assert.rejects(()=>f.cloud.restore('other-account/backups/file.forma-backup.json.gz'),/Choose a backup/);
    object.bytes=Buffer.from('corrupt');await assert.rejects(()=>f.cloud.restore(key),/integrity check/);
    const invalid=gzipSync(JSON.stringify({format:'untrusted'}));object.bytes=invalid;object.sha=createHash('sha256').update(invalid).digest('hex');await assert.rejects(()=>f.cloud.restore(key),/not a valid Forma/);
  }finally{await f.close();}
});

test('failed reconnect keeps the previous encrypted configuration and refuses plaintext key storage',async()=>{
  const f=await fixture();try{
    await f.cloud.connect(connection);f.setFailure('denied');await assert.rejects(()=>f.cloud.connect({...connection,bucket:'different-bucket'}));assert.equal((await f.cloud.status()).bucket,connection.bucket);
    const locked=createCloudBackup({profile:f.profile,safeStorage:{isEncryptionAvailable:()=>false}});await assert.rejects(()=>locked.status(),/keychain/);
  }finally{await f.close();}
});
