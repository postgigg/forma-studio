import {useEffect,useRef,useState} from 'react';
import {Volume2,VolumeX} from 'lucide-react';
import type {AudioClip} from './types';
import {decodeClips,scheduleClips} from './audio';
export function PageAudio({clips}:{clips:AudioClip[]}) {
  const [playing,setPlaying]=useState(false),[error,setError]=useState('');const audio=useRef<AudioContext|null>(null);
  useEffect(()=>()=>{const context=audio.current;audio.current=null;if(context)void context.close();},[]);
  if(!clips.length)return null;
  const toggle=async()=>{if(audio.current){await audio.current.close();audio.current=null;setPlaying(false);return;}try{const context=new AudioContext();audio.current=context;await context.resume();const buffers=await decodeClips(context,clips);if(audio.current!==context)return;scheduleClips(context,context.destination,clips,buffers,context.currentTime+.05);setPlaying(true);}catch(e){setError((e as Error).message);}};
  return <button className="presentation-audio" title={error||'Play this page’s audio'} onClick={e=>{e.stopPropagation();void toggle();}}>{playing?<VolumeX size={18}/>:<Volume2 size={18}/>} {playing?'Stop audio':'Play audio'}</button>;
}
