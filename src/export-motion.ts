import { StaticCanvas } from "fabric";
import { fonts, type Design, type DesignPage, type PageMotion } from "./types";
import { prepareMotion, drawMotion, motionLength } from "./motion-render";
import { audioLength } from '../shared/audio.mjs';
import { decodeClips, scheduleClips } from './audio';
export interface MotionExportOptions {
  format: "gif" | "webm" | "mp4";
  size: number;
  fps: number;
  style: PageMotion["style"] | "page";
  duration: number;
  loop: boolean;
  signal: AbortSignal;
  onProgress: (value: number) => void;
}
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
export async function exportMotion(
  design: Design,
  pages: DesignPage[],
  options: MotionExportOptions,
): Promise<Blob> {
  const { format, signal, onProgress } = options;
  const scale = Math.min(
    1,
    options.size / Math.max(design.width, design.height),
  );
  const width = Math.max(2, format==='mp4'?Math.round(design.width*scale/2)*2:Math.round(design.width*scale)),
    height = Math.max(2, format==='mp4'?Math.round(design.height*scale/2)*2:Math.round(design.height*scale));
  const fps = Math.min(24, Math.max(8, options.fps));
  const canvas = new StaticCanvas(undefined, {
    width,
    height,
    enableRetinaScaling: false,
  });
  canvas.setZoom(scale);
  let stream: MediaStream | undefined, recorder: MediaRecorder | undefined;
  let audio: AudioContext | undefined, destination: MediaStreamAudioDestinationNode | undefined;
  let stopAudio: (() => void) | undefined;
  const pageAudioBuffers=new Map<DesignPage,Map<string,AudioBuffer>>();
  const check = () => {
    if (signal.aborted) throw new Error("Animation export cancelled.");
  };
  try {
    await Promise.all(fonts.map((f) => document.fonts.load(`16px "${f}"`)));
    const gifenc = format === "gif" ? await import("gifenc") : null;
    const gif = gifenc?.GIFEncoder();
    const chunks: BlobPart[] = [];
    let recording: Promise<Blob> | undefined;
    if (format !== "gif") {
      const withAudio=pages.some(page=>page.audio?.length);
      const mime = (format==='mp4'?[
        withAudio ? 'video/mp4;codecs=avc1,mp4a.40.2' : 'video/mp4;codecs=avc1',
        withAudio ? 'video/mp4;codecs=avc1.420028,mp4a.40.2' : 'video/mp4;codecs=avc1.420028',
        'video/mp4',
      ]:[
        withAudio ? "video/webm;codecs=vp9,opus" : "video/webm;codecs=vp9",
        withAudio ? "video/webm;codecs=vp8,opus" : "video/webm;codecs=vp8",
        "video/webm",
      ]).find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime)
        throw new Error(`This device cannot encode ${format.toUpperCase()}. Choose ${format==='mp4'?'WebM':'GIF'} instead.`);
      stream = canvas.lowerCanvasEl.captureStream(fps);
      if(pages.some(page=>page.audio?.length)) {
        audio=new AudioContext();await audio.resume();destination=audio.createMediaStreamDestination();
        destination.stream.getAudioTracks().forEach(track=>stream!.addTrack(track));
        for(const page of pages)if(page.audio?.length){check();pageAudioBuffers.set(page,await decodeClips(audio,page.audio));}
      }
      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 6000000,
      });
      recording = new Promise((resolve, reject) => {
        recorder!.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        recorder!.onstop = () =>
          resolve(new Blob(chunks, { type: format==='mp4'?'video/mp4':'video/webm' }));
        recorder!.onerror = () =>
          reject(new Error("The browser could not encode the animation."));
      });
    }
    for (let p = 0; p < pages.length; p++) {
      check();
      await canvas.loadFromJSON(structuredClone(pages[p].data));
      const motion: PageMotion =
        options.style === "page"
          ? pages[p].motion || { style: "fade", duration: options.duration }
          : { style: options.style, duration: options.duration };
      const layers = prepareMotion(canvas),
        length = Math.max(motionLength(motion, layers.length),format!=='gif'?audioLength(pages[p].audio)*1000:0),
        frames = Math.ceil((length * fps) / 1000);
      if (format === "gif") {
        for (let frame = 0; frame < frames; frame++) {
          check();
          drawMotion(
            layers,
            motion,
            (frame * 1000) / fps,
            design.width,
            design.height,
            options.loop,
          );
          canvas.renderAll();
          const rgba = canvas
            .getContext()
            .getImageData(0, 0, width, height).data;
          const palette = gifenc!.quantize(rgba, 256, { format: "rgb565" }),
            index = gifenc!.applyPalette(rgba, palette, "rgb565");
          gif!.writeFrame(index, width, height, {
            palette,
            delay:
              (Math.round(((frame + 1) * 100) / fps) -
                Math.round((frame * 100) / fps)) *
              10,
            repeat: options.loop ? 0 : -1,
            dispose: 1,
          });
          onProgress(
            Math.round(((p + (frame + 1) / frames) / pages.length) * 100),
          );
          await pause();
        }
      } else {
        drawMotion(layers, motion, 0, design.width, design.height);
        canvas.renderAll();
        if (recorder!.state === "inactive") recorder!.start(250);
        if(audio && destination && pages[p].audio?.length) {
          const clips=pages[p].audio!;
          stopAudio=scheduleClips(audio,destination,clips,pageAudioBuffers.get(pages[p])!,audio.currentTime+.02);
        }
        const start = performance.now();
        while (performance.now() - start < length) {
          check();
          const elapsed = performance.now() - start;
          drawMotion(
            layers,
            motion,
            elapsed,
            design.width,
            design.height,
            options.loop,
          );
          canvas.renderAll();
          onProgress(Math.round(((p + elapsed / length) / pages.length) * 100));
          await new Promise((resolve) => setTimeout(resolve, 1000 / fps));
        }
        stopAudio?.();stopAudio=undefined;
      }
    }
    check();
    onProgress(100);
    if (gif) {
      gif.finish();
      return new Blob([Uint8Array.from(gif.bytes()).buffer], {
        type: "image/gif",
      });
    }
    recorder!.stop();
    return await recording!;
  } finally {
    stopAudio?.();
    if (recorder?.state === "recording") recorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
    if(audio)await audio.close();
    await canvas.dispose();
  }
}
