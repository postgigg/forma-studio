import { StaticCanvas } from "fabric";
import { fonts, type Design, type DesignPage, type PageMotion } from "./types";
import { prepareMotion, drawMotion, motionLength } from "./motion-render";
export interface MotionExportOptions {
  format: "gif" | "webm";
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
  const width = Math.max(2, Math.round(design.width * scale)),
    height = Math.max(2, Math.round(design.height * scale));
  const fps = Math.min(24, Math.max(8, options.fps));
  const canvas = new StaticCanvas(undefined, {
    width,
    height,
    enableRetinaScaling: false,
  });
  canvas.setZoom(scale);
  let stream: MediaStream | undefined, recorder: MediaRecorder | undefined;
  const check = () => {
    if (signal.aborted) throw new Error("Animation export cancelled.");
  };
  try {
    await Promise.all(fonts.map((f) => document.fonts.load(`16px "${f}"`)));
    const gifenc = format === "gif" ? await import("gifenc") : null;
    const gif = gifenc?.GIFEncoder();
    const chunks: BlobPart[] = [];
    let recording: Promise<Blob> | undefined;
    if (format === "webm") {
      const mime = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime)
        throw new Error("This browser cannot export WebM. Choose GIF instead.");
      stream = canvas.lowerCanvasEl.captureStream(fps);
      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 6000000,
      });
      recording = new Promise((resolve, reject) => {
        recorder!.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        recorder!.onstop = () =>
          resolve(new Blob(chunks, { type: "video/webm" }));
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
        length = motionLength(motion, layers.length),
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
    if (recorder?.state === "recording") recorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
    await canvas.dispose();
  }
}
