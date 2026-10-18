const {app,BrowserWindow,ipcMain,safeStorage,shell,session} = require('electron');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const config = require('../shared/mac-license.json');
const {digest} = require('../shared/license-protocol.cjs');
const {MacLicenseClient,LicenseError} = require('./license-client.cjs');
async function hardwareIdentity() {
  const {stdout} = await promisify(execFile)('/usr/sbin/ioreg',['-rd1','-c','IOPlatformExpertDevice'],{timeout:15000,maxBuffer:1048576});
  const id = /"IOPlatformUUID"\s*=\s*"([a-fA-F0-9-]{36})"/.exec(stdout)?.[1];
  if (!id) throw new LicenseError('INVALID_DEVICE','Forma could not verify this Mac. Please restart and try again.');
  return digest('forma-studio-mac-v1\n'+id.toLowerCase());
}
async function request(endpoint,value) {
  let response;
  try { response = await fetch(config.apiOrigin+endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),signal:AbortSignal.timeout(30000)}); }
  catch { throw new LicenseError('NETWORK_UNAVAILABLE','Connect to the internet and try again. If activation already went through, retry with the same key on this Mac.'); }
  const text = await response.text();
  if (text.length>16384) throw new LicenseError('LICENSE_UNAVAILABLE','Activation is temporarily unavailable. Please try again.');
  let data;try {data=JSON.parse(text);}catch{throw new LicenseError('LICENSE_UNAVAILABLE','Activation is temporarily unavailable. Please try again.');}
  if (!response.ok) throw new LicenseError(data.error || 'LICENSE_UNAVAILABLE',data.message || 'Activation could not be completed. Please try again.');
  return data;
}
async function ensureMacLicense() {
  const client = new MacLicenseClient({file:path.join(app.getPath('userData'),'mac-activation.bin'),safeStorage,hardwareHash:await hardwareIdentity(),config,request});
  let startupError='';
  try { if (await client.load()) return null; }
  catch(error) {startupError=error.message;}
  const activationSession = session.fromPartition('forma-mac-activation');
  activationSession.setPermissionRequestHandler((_web,_permission,callback)=>callback(false));
  activationSession.setPermissionCheckHandler(()=>false);
  activationSession.on('will-download',event=>event.preventDefault());
  const window = new BrowserWindow({width:900,height:710,minWidth:740,minHeight:620,resizable:true,title:'Activate Forma Studio',backgroundColor:'#f4f1e9',show:false,webPreferences:{preload:path.join(__dirname,'license-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,session:activationSession}});
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  const expected=pathToFileURL(path.join(__dirname,'license.html')).href;
  const trusted=event=>{if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame.url!==expected)throw Error('Untrusted activation request.');};
  const focus=()=>{if(!window.isDestroyed()){if(window.isMinimized())window.restore();window.show();window.focus();}};
  app.on('second-instance',focus);
  let working=false;
  return new Promise((resolve,reject)=>{
    let complete=false;
    ipcMain.handle('forma:license-status',event=>{trusted(event);return{error:startupError,pendingKey:client.profile?.pending?.licenseKey || null};});
    ipcMain.handle('forma:license-purchase',async event=>{trusted(event);await shell.openExternal(config.purchaseUrl);return true;});
    ipcMain.handle('forma:license-activate',async(event,key)=>{
      trusted(event);
      if(working||complete)return{ok:false,message:'Activation is already in progress.'};
      if(startupError)return{ok:false,message:startupError};
      working=true;
      try {await client.activate(key);complete=true;resolve(window);return{ok:true};}
      catch(error){return{ok:false,message:error instanceof LicenseError?error.message:'Activation could not be verified. Retry the same key on this Mac.'};}
      finally{working=false;}
    });
    window.once('closed',()=>{app.removeListener('second-instance',focus);for(const channel of ['forma:license-status','forma:license-purchase','forma:license-activate'])ipcMain.removeHandler(channel);if(!complete)reject(new LicenseError('LICENSE_CANCELLED','Activation was cancelled.'));});
    window.once('ready-to-show',focus);
    window.loadFile(path.join(__dirname,'license.html')).catch(reject);
  });
}
module.exports={ensureMacLicense};
