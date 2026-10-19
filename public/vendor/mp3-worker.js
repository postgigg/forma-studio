/* Forma's local PCM-to-MP3 bridge. The separately loaded encoder is unmodified. */
importScripts('/vendor/lamejs/lamejs.iife.js');
self.onmessage=({data})=>{
  try {
    const input=data.channels.map(bytes=>new Float32Array(bytes));
    const encoder=new lamejs.Mp3Encoder(2,data.sampleRate,192),chunks=[];
    const pcm=channel=>{const out=new Int16Array(channel.length);for(let i=0;i<channel.length;i++){const n=Math.max(-1,Math.min(1,channel[i]));out[i]=Math.round(n*(n<0?32768:32767));}return out;};
    const channels=input.map(pcm);let last=-1;
    for(let at=0;at<channels[0].length;at+=1152){const encoded=encoder.encodeBuffer(channels[0].subarray(at,at+1152),channels[1].subarray(at,at+1152));if(encoded.length)chunks.push(Uint8Array.from(encoded));const progress=Math.floor(at/channels[0].length*100);if(progress!==last&&progress%5===0){self.postMessage({progress});last=progress;}}
    const tail=encoder.flush();if(tail.length)chunks.push(Uint8Array.from(tail));
    const bytes=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
    self.postMessage({bytes:bytes.buffer},[bytes.buffer]);
  }catch{self.postMessage({error:'MP3 encoding failed. Try WAV instead.'});}
};
