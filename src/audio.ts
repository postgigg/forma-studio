import { audioLength, validateAudio } from '../shared/audio.mjs';
import { uid, type AudioClip } from './types';
export function audioBytes(src:string) {return Uint8Array.from(atob(src.slice(src.indexOf(',')+1)),c=>c.charCodeAt(0)).buffer;}
export async function decodeClips(context:BaseAudioContext,clips:AudioClip[]) {
  validateAudio(clips);const buffers=new Map<string,AudioBuffer>();
  for(const clip of clips)if(!buffers.has(clip.src))buffers.set(clip.src,await context.decodeAudioData(audioBytes(clip.src)));
  return buffers;
}
export function scheduleClips(context:BaseAudioContext,destination:AudioNode,clips:AudioClip[],buffers:Map<string,AudioBuffer>,at=context.currentTime) {
  const sources:AudioBufferSourceNode[]=[];
  for(const clip of clips){const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffers.get(clip.src)!;source.playbackRate.value=clip.rate??1;gain.gain.value=clip.volume;source.connect(gain);gain.connect(destination);source.start(at+clip.offset,clip.start);source.stop(at+clip.offset+(Math.min(clip.end,source.buffer.duration)-clip.start)/(clip.rate??1));sources.push(source);}
  return ()=>sources.forEach(s=>{try{s.stop();}catch{/* Already ended. */}});
}
export async function audioClip(blob:Blob,name:string):Promise<AudioClip> {
  if(blob.size>20*1024*1024)throw new Error('Choose an audio clip under 20 MB.');
  const mime=blob.type.split(';')[0];
  if(!['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav'].includes(mime))throw new Error('Choose WebM, Ogg, M4A, MP3 or WAV audio.');
  const context=new AudioContext();
  try{
    const bytes=await blob.arrayBuffer(),buffer=await context.decodeAudioData(bytes.slice(0));
    if(buffer.duration<.05||buffer.duration>600)throw new Error('Use audio between 0.05 seconds and 10 minutes.');
    const waveform=Array.from({length:100},(_,i)=>{const channel=buffer.getChannelData(0),from=Math.floor(i*channel.length/100),to=Math.floor((i+1)*channel.length/100);let peak=0;for(let k=from;k<to;k+=Math.max(1,Math.floor((to-from)/80)))peak=Math.max(peak,Math.abs(channel[k]));return Math.min(1,peak);});
    const src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as string);reader.onerror=()=>reject(new Error('The audio file could not be read.'));reader.readAsDataURL(new Blob([bytes],{type:mime}));});
    const clip={id:uid(),name:name.slice(0,200),src,duration:buffer.duration,start:0,end:buffer.duration,offset:0,volume:1,rate:1,waveform};validateAudio([clip]);return clip;
  } finally {await context.close();}
}
async function mixBuffer(clips:AudioClip[]) {
  validateAudio(clips);const length=audioLength(clips);if(!length)throw new Error('Add an audio clip first.');
  const context=new OfflineAudioContext(2,Math.ceil(length*44100),44100);
  scheduleClips(context,context.destination,clips,await decodeClips(context,clips),0);
  return context.startRendering();
}
export async function mixWav(clips:AudioClip[]) {
  const buffer=await mixBuffer(clips),bytes=new ArrayBuffer(44+buffer.length*4),view=new DataView(bytes);
  const text=(offset:number,value:string)=>[...value].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));
  text(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,44100,true);view.setUint32(28,176400,true);view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,buffer.length*4,true);
  const channels=[buffer.getChannelData(0),buffer.getChannelData(1)];let offset=44;
  for(let i=0;i<buffer.length;i++)for(let ch=0;ch<2;ch++){const n=Math.min(1,Math.max(-1,channels[ch][i]));view.setInt16(offset,n<0?n*32768:n*32767,true);offset+=2;}
  return new Blob([bytes],{type:'audio/wav'});
}
export async function mixMp3(clips:AudioClip[],onProgress:(n:number)=>void=()=>{},signal?:AbortSignal) {
  const check=()=>{if(signal?.aborted)throw new Error('Audio export cancelled.');};check();
  const buffer=await mixBuffer(clips);check();
  const channels=[buffer.getChannelData(0).slice(),buffer.getChannelData(1).slice()];
  return new Promise<Blob>((resolve,reject)=>{
    const worker=new Worker('/vendor/mp3-worker.js');
    const clean=()=>{worker.terminate();signal?.removeEventListener('abort',abort);};
    const abort=()=>{clean();reject(new Error('Audio export cancelled.'));};
    signal?.addEventListener('abort',abort,{once:true});
    worker.onerror=()=>{clean();reject(new Error('MP3 encoding failed. Try WAV instead.'));};
    worker.onmessage=({data})=>{if(data.error){clean();reject(new Error(data.error));}else if(data.bytes){clean();resolve(new Blob([data.bytes],{type:'audio/mpeg'}));}else onProgress(data.progress);};
    worker.postMessage({channels:channels.map(c=>c.buffer),sampleRate:buffer.sampleRate},channels.map(c=>c.buffer));
  });
}
