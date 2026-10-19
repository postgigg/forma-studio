import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Mic, Play, Scissors, Square, Trash2, Upload } from 'lucide-react';
import { Modal } from './ui';
import { download, type Editor } from './editor';
import { audioClip, decodeClips, mixWav, mixMp3, scheduleClips } from './audio';
import { audioLength, clipDuration, joinClips, maxAudioClips, splitClip, validateAudio } from '../shared/audio.mjs';
import { uid, type AudioClip } from './types';

function AudioNumber({value,onCommit,label,min=0,max=600,digits=2}:{value:number;onCommit:(n:number)=>void;label:string;min?:number;max?:number;digits?:number}) {
  const [draft,setDraft]=useState(value.toFixed(digits));
  useEffect(()=>setDraft(value.toFixed(digits)),[value,digits]);
  const commit=()=>{const n=Number(draft);if(draft.trim()&&Number.isFinite(n))onCommit(n);setDraft(value.toFixed(digits));};
  return <input aria-label={label} type="number" min={min} max={max} step={digits===0?1:.01} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/>;
}
export function AudioStudio({editor,onClose,onMovie}:{editor:Editor;onClose:()=>void;onMovie:()=>void}) {
  const [clips,setClips]=useState<AudioClip[]>(()=>structuredClone(editor.page.audio||[])),[recording,setRecording]=useState(false),[seconds,setSeconds]=useState(0),[busy,setBusy]=useState(false),[playing,setPlaying]=useState(false),[error,setError]=useState('');
  const [cut,setCut]=useState<Record<string,number>>({}),[dirty,setDirty]=useState(false),[exportProgress,setExportProgress]=useState<number|null>(null);
  const exportController=useRef<AbortController|null>(null);
  const recorder=useRef<MediaRecorder|null>(null),media=useRef<MediaStream|null>(null),playback=useRef<AudioContext|null>(null),alive=useRef(true),file=useRef<HTMLInputElement>(null);
  const finishPlayback=()=>{const context=playback.current;playback.current=null;if(context)void context.close();setPlaying(false);};
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;exportController.current?.abort();if(recorder.current?.state==='recording')recorder.current.stop();media.current?.getTracks().forEach(t=>t.stop());if(playback.current)void playback.current.close();};},[]);
  useEffect(()=>{if(!recording)return;const begin=Date.now(),timer=setInterval(()=>{setSeconds((Date.now()-begin)/1000);if(Date.now()-begin>=60000)recorder.current?.stop();},100);return()=>clearInterval(timer);},[recording]);
  const change=(next:AudioClip[])=>{try{validateAudio(next);finishPlayback();setClips(next);setDirty(true);setError('');}catch(e){setError((e as Error).message);}};
  const add=async(blob:Blob,name:string)=>{
    setBusy(true);try{const clip=await audioClip(blob,name);if(alive.current)setClips(previous=>{const next=[...previous,{...clip,offset:audioLength(previous)}];try{validateAudio(next);setDirty(true);return next;}catch(e){setError((e as Error).message);return previous;}});}
    catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setBusy(false);}
  };
  const record=async()=>{
    setError('');setBusy(true);finishPlayback();
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone recording is unavailable. Import an audio file instead.');
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if(!alive.current){stream.getTracks().forEach(t=>t.stop());return;}
      media.current=stream;const mime=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
      const next=new MediaRecorder(stream,mime?{mimeType:mime,audioBitsPerSecond:96000}:undefined),chunks:BlobPart[]=[];recorder.current=next;
      next.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      next.onstop=()=>{stream.getTracks().forEach(t=>t.stop());media.current=null;recorder.current=null;if(alive.current){setRecording(false);void add(new Blob(chunks,{type:next.mimeType}),'Voice recording '+new Date().toLocaleTimeString());}};
      next.onerror=()=>{stream.getTracks().forEach(t=>t.stop());if(alive.current){setRecording(false);setError('Recording stopped. Check microphone permissions.');}};
      next.start(200);setSeconds(0);setRecording(true);
    }catch(e){setError((e as Error).name==='NotAllowedError'?'Microphone access was denied. Allow Forma to use your microphone in system settings, or import a clip.':(e as Error).message);media.current?.getTracks().forEach(t=>t.stop());}finally{if(alive.current)setBusy(false);}
  };
  const play=async()=>{
    if(playing){finishPlayback();return;}setBusy(true);setError('');
    try{const context=new AudioContext();playback.current=context;await context.resume();const buffers=await decodeClips(context,clips);if(!alive.current||playback.current!==context)return;scheduleClips(context,context.destination,clips,buffers,context.currentTime+.05);setPlaying(true);const expected=context;setTimeout(()=>{if(playback.current===expected)finishPlayback();},audioLength(clips)*1000+100);}
    catch(e){finishPlayback();setError((e as Error).message);}finally{if(alive.current)setBusy(false);}
  };
  const close=()=>{if(recording||busy)return;if(dirty&&!window.confirm('Discard your unsaved audio edits?'))return;onClose();};
  const update=(id:string,key:'start'|'end'|'offset'|'volume'|'rate',value:number)=>change(clips.map(c=>c.id===id?{...c,[key]:value}:c));
  return <Modal title={`Page ${editor.pageIndex+1} audio`} onClose={close} wide><div className="audio-studio">
    <div className="audio-toolbar"><button className={recording?'danger':'primary'} disabled={busy||clips.length>=maxAudioClips} onClick={()=>recording?recorder.current?.stop():void record()}>{recording?<Square size={17}/>:<Mic size={17}/>} {recording?`Stop · ${seconds.toFixed(2)}s`:'Record voice'}</button><button className="secondary" disabled={busy||recording||clips.length>=maxAudioClips} onClick={()=>file.current?.click()}><Upload size={16}/>Import audio</button><button className="secondary" disabled={busy||recording||!clips.length} onClick={()=>void play()}>{playing?<Square size={16}/>:<Play size={16}/>} {playing?'Stop preview':'Play mix'}</button><input ref={file} hidden type="file" accept="audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav,.mp3,.m4a,.wav,.webm,.ogg" onChange={e=>{const selected=e.target.files?.[0];if(selected)void add(selected,selected.name);e.target.value='';}}/></div>
    <p className="muted small">Record up to 60 seconds per take. Trim, split and arrange clips without changing the source. Timing uses seconds to two decimal places. Speed and volume start at 100%. Save your clips with the design, download an MP3 or WAV, or stitch pages into an MP4 movie. GIF, images and PDF are silent.</p>
    {error&&<p className="ai-error" role="alert">{error}</p>}
    {!clips.length&&!recording&&<div className="audio-empty"><Mic size={32}/><p>Record a voiceover or bring in your own soundtrack.</p></div>}
    <fieldset className="audio-fields" disabled={busy||recording}><ol className="audio-clips">{clips.map((c,i)=><li key={c.id}><div className="audio-clip-heading"><input aria-label={`Clip ${i+1} name`} value={c.name} maxLength={200} onChange={e=>change(clips.map(v=>v.id===c.id?{...v,name:e.target.value}:v))}/><span>{clipDuration(c).toFixed(2)}s</span><button aria-label={`Move clip ${i+1} up`} disabled={i===0} onClick={()=>{const n=[...clips];[n[i-1],n[i]]=[n[i],n[i-1]];change(n);}}><ArrowUp size={16}/></button><button aria-label={`Move clip ${i+1} down`} disabled={i===clips.length-1} onClick={()=>{const n=[...clips];[n[i+1],n[i]]=[n[i],n[i+1]];change(n);}}><ArrowDown size={16}/></button><button aria-label={`Delete clip ${i+1}`} onClick={()=>change(clips.filter(v=>v.id!==c.id))}><Trash2 size={16}/></button></div>
      <svg className="audio-wave" viewBox="0 0 600 64" preserveAspectRatio="none" aria-label={`Waveform for ${c.name}`}><rect x={600*c.start/c.duration} width={600*(c.end-c.start)/c.duration} height={64} fill="#eee6ff"/>{(c.waveform||[]).map((v,k)=><line key={k} x1={k*6+3} x2={k*6+3} y1={32-Math.max(1,v*29)} y2={32+Math.max(1,v*29)} stroke="#754adb" strokeWidth={3}/>)}</svg>
      <div className="audio-timing">{([['start','Trim start',c.start],['end','Trim end',c.end],['offset','Timeline start',c.offset]] as const).map(([key,label,value])=><label key={key}>{label} (s)<AudioNumber label={`Clip ${i+1} ${label}`} value={value} onCommit={n=>update(c.id,key,n)}/></label>)}
        <label>Speed (%)<AudioNumber label={`Clip ${i+1} Speed percent`} min={25} max={400} digits={0} value={(c.rate??1)*100} onCommit={n=>update(c.id,'rate',n/100)}/></label>
        <label>Volume (%)<AudioNumber label={`Clip ${i+1} Volume percent`} max={200} digits={0} value={c.volume*100} onCommit={n=>update(c.id,'volume',n/100)}/></label>
      </div>
      <div className="audio-split"><label>Cut at source time (s)<AudioNumber label={`Clip ${i+1} cut time`} min={c.start+.03} max={c.end-.03} value={cut[c.id]??Math.round((c.start+c.end)*50)/100} onCommit={n=>setCut({...cut,[c.id]:n})}/></label><button className="secondary" disabled={clips.length>=maxAudioClips} onClick={()=>{try{change([...clips.slice(0,i),...splitClip(c,cut[c.id]??(c.start+c.end)/2,uid()),...clips.slice(i+1)]);}catch(e){setError((e as Error).message);}}}><Scissors size={15}/>Split clip</button></div>
    </li>)}</ol></fieldset>
    {!!clips.length&&<div className="audio-toolbar"><button className="secondary" disabled={busy||recording} onClick={()=>change(joinClips(clips))}>Join clips in this order</button><span>{audioLength(clips).toFixed(2)}s total</span>
      {(['mp3','wav'] as const).map(format=><button key={format} className="text-button" disabled={busy||recording} onClick={async()=>{setBusy(true);setError('');finishPlayback();const controller=new AbortController();exportController.current=controller;setExportProgress(0);try{const blob=format==='mp3'?await mixMp3(clips,setExportProgress,controller.signal):await mixWav(clips);if(!controller.signal.aborted&&alive.current)await download(blob,editor.doc.name+'-audio.'+format);}catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current){setBusy(false);setExportProgress(null);}exportController.current=null;}}}>Download audio {format.toUpperCase()}</button>)}
    </div>}
    {exportProgress!==null&&<p role="status" className="audio-export-progress">Preparing audio {exportProgress}% <button className="text-button" onClick={()=>exportController.current?.abort()}>Cancel export</button></p>}
    <p className="muted small">For a movie, save this page's soundtrack and choose whether to include all pages in Download. Speed changes also change pitch.</p>
    <button className="secondary" disabled={busy||recording} onClick={()=>{try{validateAudio(clips);editor.page.audio=structuredClone(clips);editor.commit();setDirty(false);onMovie();}catch(e){setError((e as Error).message);}}}>Save audio &amp; create movie</button>
    <div className="refine-actions"><button className="secondary" disabled={recording||busy} onClick={close}>Cancel</button><button className="primary" disabled={recording||busy} onClick={()=>{try{validateAudio(clips);editor.page.audio=structuredClone(clips);editor.commit();setDirty(false);onClose();}catch(e){setError((e as Error).message);}}}>Save page audio</button></div>
  </div></Modal>;
}
