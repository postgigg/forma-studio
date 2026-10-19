// A separate, opt-in LAN service. Never bind the editor or AI API to the LAN.
const https = require('node:https');
const tls = require('node:tls');
const { networkInterfaces } = require('node:os');
const { randomBytes, randomUUID, createHash, timingSafeEqual, X509Certificate } = require('node:crypto');
const { generate } = require('selfsigned');
const colors = ['#754adb','#11796c','#b44728','#255bc5','#a03478','#79621c','#427322','#673bb6'];
const secret = () => randomBytes(32).toString('base64url');
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
function localAddress(value, loopback = false) {
  if (typeof value !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return false;
  const [a,b,...tail] = value.split('.').map(Number);
  if ([a,b,...tail].some(n => n > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || (loopback && a === 127);
}
function sameSecret(a,b) {
  const x = Buffer.from(typeof a === 'string' ? a : ''), y = Buffer.from(typeof b === 'string' ? b : '');
  return x.length === y.length && timingSafeEqual(x,y);
}
function interfaces() {
  return Object.entries(networkInterfaces()).flatMap(([name,items]) => (items || []).filter(item => item.family === 'IPv4' && !item.internal && localAddress(item.address)).map(item => ({name,address:item.address})));
}
function decodeInvite(code, allowLoopback = false) {
  if (typeof code !== 'string' || code.length > 1000 || !/^FORMA-LAN-1\.[A-Za-z0-9_-]+$/.test(code.trim())) throw new Error('Paste a Forma LAN invitation.');
  let info;
  try { info = JSON.parse(Buffer.from(code.trim().split('.')[1],'base64url').toString('utf8')); } catch { throw new Error('Invalid invitation.'); }
  if (!info || !localAddress(info.address,allowLoopback) || !Number.isInteger(info.port) || info.port < 1024 || info.port > 65535 ||
      !/^[a-f0-9]{64}$/.test(info.fingerprint) || !/^[A-Za-z0-9_-]{43}$/.test(info.key) || !Number.isFinite(info.expiresAt) || info.expiresAt <= Date.now()) throw new Error('This invitation is invalid or expired. Ask the host for a new one.');
  return info;
}
function nameOf(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 60 || /[\x00-\x1f]/.test(value)) throw new Error('Enter a name of 1–60 characters.');
  return value.trim();
}
function send(res,status,value) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Connection':'keep-alive'});
  res.end(JSON.stringify(value));
}
async function body(req,limit) {
  let size=0; const chunks=[];
  for await (const chunk of req) { size+=chunk.length; if (size>limit) throw new Error('The collaboration request is too large.'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Certificate pinning happens BEFORE the HTTP agent is given a socket. No
// invitation, session token, headers or artwork are sent to an unpinned peer.
function pinnedAgent(info) {
  const agent = new https.Agent({keepAlive:true,maxSockets:4});
  agent.createConnection = (_options, callback) => {
    let done=false;
    const finish=(error,socket) => { if(done)return;done=true;clearTimeout(timer);callback(error,socket); };
    const socket=tls.connect({host:info.address,port:info.port,rejectUnauthorized:false,minVersion:'TLSv1.3'},()=>{
      const raw=socket.getPeerCertificate()?.raw;
      if (!raw || !sameSecret(createHash('sha256').update(raw).digest('hex'),info.fingerprint)) {
        const error=new Error('The host certificate does not match this invitation.');finish(error);socket.destroy();return;
      }
      finish(null,socket);
    });
    const timer=setTimeout(()=>{finish(new Error('The host could not be reached. Check that you are on the same network.'));socket.destroy();},7000);
    socket.once('error',error=>finish(error));
    // Returning undefined makes the Agent wait for the verified callback.
    return undefined;
  };
  return agent;
}
function request(info,agent,path,value,limit=64*1024*1024,timeout=35000) {
  return new Promise((resolve,reject)=>{
    const raw=JSON.stringify(value),req=https.request({host:info.address,port:info.port,path,method:'POST',agent,
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw)},timeout},res=>{
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>limit){res.destroy(new Error('Oversized collaboration response.'));return;}chunks.push(chunk);});
      res.on('error',reject);
      res.on('end',()=>{try { const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(res.statusCode!==200){const error=new Error(result.error||'The session could not be reached.');error.status=res.statusCode;reject(error);}else resolve(result); }catch(error){reject(error);} });
    });
    req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('The connection to the host timed out.')));req.end(raw);
  });
}

async function createCollaboration({onEvent=()=>{},getInterfaces=interfaces,allowLoopback=false}={}) {
  const {sharedDesign,validateLiveDesign,applyTransaction,maxLiveBytes}=await import('../shared/collaboration.mjs');
  let mode='idle',self=null,hostServer=null,invite=null,doc=null,revision=0,seq=0,events=[],eventBytes=0;
  let peers=new Map(),pending=new Map(),processed=new Map(),hostInfo=null,guestAgent=null,guestToken='',members=[],connected=false,error='',epoch=0;
  const rates=new Map();let expiryTimer;
  const emit=value=>onEvent(structuredClone(value));
  const participant=peer=>({id:peer.id,name:peer.name,role:peer.role,color:peer.color});
  const participants=()=>mode==='host'?[participant(self),...Array.from(peers.values()).map(participant)]:members;
  const state=()=>({mode,self:self&&participant(self),connected,error,participants:participants(),
    pending:mode==='host'?Array.from(pending.values()).filter(p=>p.status==='waiting').map(p=>({id:p.id,name:p.name,createdAt:p.createdAt})):[],
    invitation:mode==='host'&&invite?{code:invite.code,expiresAt:invite.expiresAt,address:invite.address}:null});
  const changed=()=>emit({type:'state',state:state()});
  const snapshot=()=>({type:'snapshot',design:doc,revision,seq,participants:participants()});
  function pollResult(cursor) {
    if (!Number.isInteger(cursor) || cursor<0 || cursor>seq) throw new Error('Invalid session cursor.');
    if (events.length && cursor<events[0].seq-1) return {events:[snapshot()],seq};
    return {events:events.filter(event=>event.seq>cursor),seq};
  }
  function wake() {
    for (const peer of peers.values()) if (peer.poll) {
      const {res,cursor,timer}=peer.poll;clearTimeout(timer);peer.poll=null;send(res,200,pollResult(cursor));
    }
  }
  function broadcast(event) {
    const item={...event,seq:++seq};events.push(item);eventBytes+=JSON.stringify(item).length;
    while(events.length>512 || (eventBytes>16*1024*1024 && events.length>1)) eventBytes-=JSON.stringify(events.shift()).length;
    emit(item);wake();
  }
  function membership() { broadcast({type:'participants',participants:participants()});changed(); }
  function newInvite(address,port,fingerprint) {
    const data={address,port,fingerprint,key:secret(),expiresAt:Date.now()+10*60000};
    invite={...data,code:'FORMA-LAN-1.'+Buffer.from(JSON.stringify(data)).toString('base64url')};
  }
  function sweep() {
    const now=Date.now();
    for(const [id,p] of pending) if(now-p.createdAt>120000){pending.delete(id);changed();}
    for(const [id,p] of peers) if(now-p.lastSeen>90000) removePeer(id,'The participant disconnected.');
    for(const [ip,value] of rates) if(now-value.start>60000) rates.delete(ip);
  }
  function submit(actor,tx) {
    if(!tx || typeof tx.id!=='string' || !/^[A-Za-z0-9_-]{1,120}$/.test(tx.id)) throw new Error('Invalid update ID.');
    const key=actor.id+':'+tx.id;
    if(processed.has(key)) return {ok:true};
    const result=applyTransaction(doc,tx.ops,{role:actor.role,actor});doc=result.design;
    const event={type:'commit',revision:++revision,transactionId:tx.id,actorId:actor.id,ops:result.ops,conflicts:result.conflicts};
    processed.set(key,true);if(processed.size>1024)processed.delete(processed.keys().next().value);
    broadcast(event);return {ok:true};
  }
  function presence(actor,value) {
    if(!value || (value.pageId!=null && (typeof value.pageId!=='string'||value.pageId.length>120)) ||
      (value.x!=null && (!Number.isFinite(value.x)||Math.abs(value.x)>50000)) || (value.y!=null && (!Number.isFinite(value.y)||Math.abs(value.y)>50000)) ||
      !Array.isArray(value.selection) || value.selection.length>1500 || value.selection.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(id))) throw new Error('Invalid cursor update.');
    const now=Date.now();if(now-(actor.lastPresence||0)<70)return {ok:true};actor.lastPresence=now;
    broadcast({type:'presence',participantId:actor.id,pageId:value.pageId||'',x:value.x??null,y:value.y??null,selection:value.selection});return {ok:true};
  }
  function removePeer(id,message='The host removed you from this session.') {
    const peer=peers.get(id);if(!peer)return;
    if(peer.poll){clearTimeout(peer.poll.timer);send(peer.poll.res,403,{error:message});}
    peers.delete(id);membership();
  }
  async function handle(req,res) {
    try {
      const remote=req.socket.remoteAddress?.replace(/^::ffff:/,'');
      if(!localAddress(remote,allowLoopback)||req.headers.origin||req.headers.host!==`${invite.address}:${hostServer.address().port}`){send(res,403,{error:'Native LAN connections only.'});return;}
      const rate=rates.get(remote)||{start:Date.now(),count:0};rates.set(remote,rate);
      if(Date.now()-rate.start>60000){rate.start=Date.now();rate.count=0;}
      if(++rate.count>1800){send(res,429,{error:'Too many collaboration requests.'});return;}
      if(req.method!=='POST'||!['/join','/admission','/poll','/change','/presence','/leave'].includes(req.url)){send(res,404,{error:'Not found.'});return;}
      const value=await body(req,req.url==='/change'?maxLiveBytes:16000);
      if(req.url==='/join') {
        if(invite.expiresAt<=Date.now()||!sameSecret(value.key,invite.key)){send(res,403,{error:'This invitation is invalid or expired.'});return;}
        if(Array.from(pending.values()).filter(p=>p.status==='waiting').length+peers.size>=8)throw new Error('This session has reached its participant limit.');
        const item={id:randomUUID(),name:nameOf(value.name),ticket:secret(),createdAt:Date.now(),status:'waiting'};
        pending.set(item.id,item);changed();send(res,200,{id:item.id,ticket:item.ticket});return;
      }
      if(req.url==='/admission') {
        const item=pending.get(value.id);
        if(!item||!sameSecret(value.ticket,item.ticket)){send(res,403,{error:'The invitation request expired. Join again.'});return;}
        if(item.status==='denied'){send(res,403,{error:'The host declined your request.'});return;}
        if(item.status==='waiting'){send(res,200,{waiting:true});return;}
        const peer=peers.get(item.id);if(!peer){send(res,403,{error:'This session has ended.'});return;}
        peer.lastSeen=Date.now();send(res,200,{token:peer.token,self:participant(peer),...snapshot()});return;
      }
      const peer=Array.from(peers.values()).find(p=>sameSecret(value.token,p.token));
      if(!peer){send(res,403,{error:'You no longer have access to this session.'});return;}
      peer.lastSeen=Date.now();
      if(req.url==='/change'){send(res,200,submit(peer,value.transaction));return;}
      if(req.url==='/presence'){send(res,200,presence(peer,value.presence));return;}
      if(req.url==='/leave'){removePeer(peer.id,'You left the session.');send(res,200,{ok:true});return;}
      const result=pollResult(value.cursor);
      if(result.events.length){send(res,200,result);return;}
      if(peer.poll){clearTimeout(peer.poll.timer);send(peer.poll.res,409,{error:'A second connection used this session.'});}
      const timer=setTimeout(()=>{if(peer.poll?.res===res){peer.poll=null;send(res,200,{events:[],seq});}},25000);
      peer.poll={res,cursor:value.cursor,timer};
      res.once('close',()=>{if(peer.poll?.res===res){clearTimeout(timer);peer.poll=null;}});
    } catch(err) {send(res,400,{error:err.message||'Invalid collaboration request.'});}
  }
  async function stop(message='The session ended. Your local copy is saved.') {
    const previousMode=mode,info=hostInfo,agent=guestAgent,token=guestToken;++epoch;
    mode='idle';connected=false;clearInterval(expiryTimer);
    if(previousMode==='host') {
      for(const peer of peers.values())if(peer.poll){clearTimeout(peer.poll.timer);send(peer.poll.res,403,{error:message});}
      const server=hostServer;hostServer=null;if(server){server.close();const timer=setTimeout(()=>server.closeAllConnections(),200);timer.unref();}
    }
    if(previousMode==='guest'&&info&&agent&&token)void request(info,agent,'/leave',{token},10000,2000).catch(()=>{}).finally(()=>agent.destroy());
    else agent?.destroy();
    self=null;invite=null;doc=null;peers.clear();pending.clear();processed.clear();events=[];members=[];hostInfo=null;guestAgent=null;guestToken='';error='';
    changed();if(previousMode!=='idle')emit({type:'ended',message});return state();
  }
  async function host(value) {
    if(mode!=='idle')throw new Error('Leave the current session first.');
    const available=getInterfaces();
    if(!value||!available.some(item=>item.address===value.address)||!localAddress(value.address,allowLoopback))throw new Error('Choose an available private network address.');
    const name=nameOf(value.name),design=validateLiveDesign(sharedDesign(value.design));
    const pems=await generate([{name:'commonName',value:'Forma LAN session'}],{keyType:'ec',curve:'P-256',algorithm:'sha256',notAfterDate:new Date(Date.now()+86400000)});
    if(mode!=='idle')throw new Error('A session is already running.');
    hostServer=https.createServer({key:pems.private,cert:pems.cert,minVersion:'TLSv1.3',maxHeaderSize:8192},handle);
    hostServer.requestTimeout=20000;hostServer.headersTimeout=10000;hostServer.maxConnections=32;
    hostServer.on('tlsClientError',()=>{});
    try {await new Promise((resolve,reject)=>{hostServer.once('error',reject);hostServer.listen(0,value.address,resolve);});}
    catch(err){hostServer.close();hostServer=null;throw err;}
    const fingerprint=createHash('sha256').update(new X509Certificate(pems.cert).raw).digest('hex');
    newInvite(value.address,hostServer.address().port,fingerprint);
    mode='host';self={id:randomUUID(),name,role:'edit',color:colors[0]};doc=design;revision=0;seq=0;events=[];eventBytes=0;error='';connected=true;
    expiryTimer=setInterval(sweep,10000);expiryTimer.unref();changed();emit(snapshot());return {state:state(),...snapshot()};
  }
  async function join(value) {
    if(mode!=='idle')throw new Error('Leave the current session first.');
    const info=decodeInvite(value?.code,allowLoopback),name=nameOf(value?.name),agent=pinnedAgent(info),run=++epoch;
    mode='joining';self={id:randomUUID(),name,role:'view',color:colors[1]};error='';changed();
    try {
      const admission=await request(info,agent,'/join',{key:info.key,name},16000,10000);
      const deadline=Date.now()+120000;let accepted;
      while(run===epoch&&Date.now()<deadline){
        accepted=await request(info,agent,'/admission',admission,maxLiveBytes,10000);
        if(!accepted.waiting)break;await delay(700);
      }
      if(run!==epoch){agent.destroy();throw new Error('Joining was cancelled.');}
      if(!accepted||accepted.waiting)throw new Error('The host did not approve this request. Try joining again.');
      validateLiveDesign(accepted.design);
      mode='guest';self=accepted.self;members=accepted.participants;hostInfo=info;guestAgent=agent;guestToken=accepted.token;connected=true;
      changed();emit({type:'snapshot',design:accepted.design,revision:accepted.revision,seq:accepted.seq,participants:members});
      void poll(run,accepted.seq);return {state:state(),design:accepted.design,revision:accepted.revision};
    }catch(err){agent.destroy();if(run===epoch){mode='idle';self=null;error=err.message;changed();}throw err;}
  }
  async function poll(run,cursor) {
    let failedAt=0;
    while(run===epoch&&mode==='guest') {
      try {
        const result=await request(hostInfo,guestAgent,'/poll',{token:guestToken,cursor});
        if(run!==epoch)return;
        if(!connected){connected=true;error='';changed();}failedAt=0;
        for(const item of result.events){
          if(item.type==='participants'||item.type==='snapshot'){members=item.participants;const me=members.find(p=>p.id===self.id);if(me)self=me;changed();}
          emit(item);
        }
        cursor=result.seq;
      } catch(err) {
        if(run!==epoch)return;
        if(err.status===403){await stop(err.message);return;}
        failedAt ||= Date.now();connected=false;error='Reconnecting to the host…';changed();
        if(Date.now()-failedAt>45000){await stop('The host disconnected. Your local copy is saved. Start or join a new session to continue together.');return;}
        await delay(1500);
      }
    }
  }
  return {
    interfaces:()=>getInterfaces(),status:()=>state(),host,join,stop,
    renew:()=>{if(mode!=='host')throw new Error('Only the host can renew invitations.');newInvite(invite.address,hostServer.address().port,invite.fingerprint);for(const [id,p] of pending)if(p.status==='waiting')pending.delete(id);changed();return state();},
    admit:value=>{
      if(mode!=='host'||!value||!['edit','comment','view'].includes(value.role))throw new Error('Invalid admission.');
      const item=pending.get(value.id);if(!item||item.status!=='waiting')throw new Error('This request expired.');
      if(!value.allow){item.status='denied';changed();return state();}
      if(peers.size>=8)throw new Error('Use up to eight guests in a session.');
      const peer={id:item.id,name:item.name,role:value.role,color:colors[(peers.size+1)%colors.length],token:secret(),lastSeen:Date.now(),lastPresence:0};
      item.status='approved';peers.set(peer.id,peer);membership();return state();
    },
    permission:value=>{if(mode!=='host'||!['edit','comment','view'].includes(value?.role)||!peers.has(value.id))throw new Error('Invalid participant.');peers.get(value.id).role=value.role;membership();return state();},
    remove:value=>{if(mode!=='host'||typeof value!=='string')throw new Error('Only the host can remove participants.');removePeer(value);return state();},
    publish:async transaction=>{
      if(mode==='host')return submit(self,transaction);
      if(mode!=='guest'||!connected)throw new Error('Wait for the host connection before editing.');
      const run=epoch;
      try{return await request(hostInfo,guestAgent,'/change',{token:guestToken,transaction},16000,12000);}
      catch(err){if(!err.status&&run===epoch&&mode==='guest')return request(hostInfo,guestAgent,'/change',{token:guestToken,transaction},16000,12000);throw err;}
    },
    presence:async value=>{if(mode==='host')return presence(self,value);if(mode==='guest'&&connected)return request(hostInfo,guestAgent,'/presence',{token:guestToken,presence:value},16000,4000);},
  };
}
module.exports={createCollaboration,decodeInvite,localAddress,pinnedAgent,request,interfaces};
