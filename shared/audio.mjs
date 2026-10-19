export const maxAudioClips=24;
export function validateAudio(clips) {
  if(clips==null)return [];
  if(!Array.isArray(clips)||clips.length>maxAudioClips)throw new Error('Use at most 24 audio clips per page.');
  let bytes=0;const ids=new Set();
  for(const clip of clips){
    if(!clip||typeof clip.id!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(clip.id)||ids.has(clip.id)||typeof clip.name!=='string'||clip.name.length>200)throw new Error('Invalid audio clip.');
    ids.add(clip.id);
    if(typeof clip.src!=='string'||!/^data:audio\/(?:webm|ogg|mp4|mpeg|wav|x-wav)(?:;codecs=[a-zA-Z0-9.,-]+)?;base64,[A-Za-z0-9+/]+={0,2}$/.test(clip.src)||clip.src.length>28000000)throw new Error('Audio must be embedded in a supported format under 20 MB.');
    bytes+=clip.src.length;if(bytes>80000000)throw new Error('This page contains too much audio.');
    const rate=clip.rate??1;
    if(![clip.duration,clip.start,clip.end,clip.offset,clip.volume,rate].every(Number.isFinite)||clip.duration<=0||clip.duration>600||clip.start<0||clip.end>clip.duration+.001||clip.end-clip.start<.01||clip.offset<0||clip.offset+clipDuration(clip)>600||clip.volume<0||clip.volume>2||rate<.25||rate>4)throw new Error('Use valid audio timing, speed 25–400% and volume 0–200%.');
    if(clip.waveform&&(!Array.isArray(clip.waveform)||clip.waveform.length>160||clip.waveform.some(n=>!Number.isFinite(n)||n<0||n>1)))throw new Error('Invalid audio waveform.');
  }
  return clips;
}
export function clipDuration(clip) {return (clip.end-clip.start)/(clip.rate??1);}
export function audioLength(clips=[]) {return clips.reduce((length,c)=>Math.max(length,c.offset+clipDuration(c)),0);}
export function splitClip(clip,time,id) {
  if(!Number.isFinite(time)||time<=clip.start+.02||time>=clip.end-.02)throw new Error('Place the cut inside the clip.');
  return [{...clip,end:time},{...clip,id,start:time,offset:clip.offset+(time-clip.start)/(clip.rate??1)}];
}
export function joinClips(clips) {let cursor=0;return clips.map(c=>{const next={...c,offset:cursor};cursor+=clipDuration(c);return next;});}
