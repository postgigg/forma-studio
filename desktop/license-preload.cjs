const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('formaLicense',{
  status:()=>ipcRenderer.invoke('forma:license-status'),
  activate:key=>ipcRenderer.invoke('forma:license-activate',key),
  purchase:()=>ipcRenderer.invoke('forma:license-purchase'),
});
