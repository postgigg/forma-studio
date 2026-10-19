function ownAudioRequest({webContents,permission,origin,details,main}) {
  if(!main||main.isDestroyed()||webContents!==main.webContents||permission!=='media')return false;
  const current=main.webContents.getURL();
  try{if(new URL(current).origin!==origin)return false;}catch{return false;}
  if(details.isMainFrame===false)return false;
  if(details.requestingUrl){try{if(new URL(details.requestingUrl).origin!==origin)return false;}catch{return false;}}
  const types=details.mediaTypes || (details.mediaType?[details.mediaType]:[]);
  return types.length>0&&types.every(type=>type==='audio');
}
module.exports={ownAudioRequest};
