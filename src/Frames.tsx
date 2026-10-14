import { useEffect, useRef, useState } from "react";
import { Globe, Upload, Play, Pause, RotateCcw } from "lucide-react";
import { Modal } from "./ui";
import type { Editor } from "./editor";
import { designerRequest } from "./ai";
import {
  DeviceFrame,
  defaultFrame,
  devices,
  type FrameSettings,
} from "./device-frame";

export function FrameLibrary({
  onChoose,
}: {
  onChoose: (device: string) => void;
}) {
  return (
    <aside className="asset-panel" aria-label="frames library">
      <div className="panel-heading">
        <h2>Frames</h2>
      </div>
      <p className="modal-description">
        Your website, beautifully presented. Choose a device to get started.
      </p>
      <div className="device-library">
        {devices.map((d) => (
          <button key={d.id} onClick={() => onChoose(d.id)}>
            <div className={`device-silhouette device-${d.kind}`}>
              <i />
              <span />
            </div>
            <strong>{d.name}</strong>
            <small>
              {d.viewport.width} × {d.viewport.height} screen
            </small>
          </button>
        ))}
      </div>
      <div className="panel-note">
        <Globe size={22} />
        <p>
          Render a website address or upload a screen image. Save the frame,
          adjust its perspective, and animate it in GIF or WebM.
        </p>
      </div>
    </aside>
  );
}
export function FrameDialog({
  editor,
  device,
  existing,
  onClose,
  notify,
}: {
  editor: Editor;
  device: string;
  existing?: DeviceFrame;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [settings, setSettings] = useState<FrameSettings>(() =>
    structuredClone(existing?.frame || defaultFrame(device)),
  );
  const [address, setAddress] = useState(existing?.frame.url || "");
  const [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [playing, setPlaying] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null),
    upload = useRef<HTMLInputElement>(null),
    capture = useRef<AbortController | null>(null),
    alive = useRef(true);
  const model = useRef<{
    device: string;
    finish: string;
    src: string;
    frame: Promise<DeviceFrame>;
  } | null>(null);
  const orbit = useRef<{
    x: number;
    y: number;
    tiltX: number;
    tiltY: number;
  } | null>(null);
  const destination = useRef({
    doc: editor.doc.id,
    page: editor.page.id,
    baseline: existing ? JSON.stringify(existing.frame) : "",
  });
  const update = (change: Partial<FrameSettings>) =>
    setSettings((value) => ({ ...value, ...change }));
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      capture.current?.abort();
    };
  }, []);
  useEffect(() => {
    let disposed = false,
      request = 0;
    if (
      !model.current ||
      model.current.device !== settings.device ||
      model.current.finish !== settings.finish ||
      model.current.src !== settings.src
    )
      model.current = {
        device: settings.device,
        finish: settings.finish,
        src: settings.src,
        frame: DeviceFrame.create(settings),
      };
    void model.current.frame
      .then((frame) => {
        if (disposed || !preview.current) return;
        frame.frame = settings;
        const canvas = preview.current,
          ctx = canvas.getContext("2d")!;
        canvas.width = 1000;
        canvas.height = 740;
        const scale = Math.min(920 / frame.width, 690 / frame.height),
          start = performance.now();
        const animate = (now: number) => {
          if (disposed) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.scale(scale, scale);
          frame.setMotionPhase(
            playing && !matchMedia("(prefers-reduced-motion: reduce)").matches
              ? (now - start) / 3600
              : null,
          );
          frame._render(ctx);
          ctx.restore();
          if (playing) request = requestAnimationFrame(animate);
        };
        animate(start);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(request);
    };
  }, [settings, playing]);
  const render = async () => {
    setWorking(true);
    setError("");
    const controller = new AbortController();
    capture.current = controller;
    try {
      const session = await designerRequest("/session");
      const result = await designerRequest("/frames/capture", session.token, {
        method: "POST",
        body: JSON.stringify({ url: address, device: settings.device }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(60000),
        ]),
      });
      if (alive.current) {
        update({
          src: result.src,
          url: result.url,
          title: result.title,
          capturedAt: result.capturedAt,
        });
        setAddress(result.url);
      }
    } catch (e) {
      if (alive.current)
        setError(
          controller.signal.aborted
            ? "Capture cancelled."
            : (e as Error).message,
        );
    } finally {
      if (alive.current) setWorking(false);
      capture.current = null;
    }
  };
  const add = async () => {
    setWorking(true);
    setError("");
    try {
      const frame = await DeviceFrame.create(settings);
      if (!alive.current) return;
      if (
        editor.doc.id !== destination.current.doc ||
        editor.page.id !== destination.current.page
      )
        throw new Error(
          "The design changed. Reopen Frames on the page you want to update.",
        );
      const label =
        devices.find((d) => d.id === settings.device)!.name + " frame";
      if (existing) {
        if (
          !editor.objects.includes(existing) ||
          JSON.stringify(existing.frame) !== destination.current.baseline
        )
          throw new Error("This frame changed. Reopen it before applying.");
        if (existing.lockMovementX)
          throw new Error("Unlock this frame to edit it.");
        const index = editor.canvas.getObjects().indexOf(existing),
          width = existing.getScaledWidth();
        const previous = existing.toObject();
        for (const key of [
          "id",
          "name",
          "left",
          "top",
          "angle",
          "opacity",
          "flipX",
          "flipY",
          "shadow",
          "visible",
        ] as const)
          frame.set(
            key as any,
            key === "shadow" ? existing.shadow : previous[key],
          );
        frame.scale(width / frame.width);
        editor.canvas.discardActiveObject();
        editor.canvas.remove(existing);
        editor.canvas.insertAt(index, frame);
        editor.canvas.setActiveObject(frame);
        editor.commit();
      } else {
        frame.scale(
          Math.min(
            (editor.doc.width * 0.88) / frame.width,
            (editor.doc.height * 0.88) / frame.height,
          ),
        );
        editor.add(frame, label);
      }
      notify(
        existing
          ? "Device frame updated. Undo restores the previous version."
          : "Device frame saved with its website screen. Use Animate or Present to play its motion.",
      );
      onClose();
    } catch (e) {
      if (alive.current) {
        setError((e as Error).message);
        setWorking(false);
      }
    }
  };
  return (
    <Modal
      title={existing ? "Edit device frame" : "Create device frame"}
      wide
      className="frame-modal"
      onClose={onClose}
    >
      <div className="frame-editor">
        <div className="frame-preview">
          <div className="frame-preview-heading">
            <strong>
              {devices.find((d) => d.id === settings.device)!.name}
            </strong>
            <span>Drag to rotate</span>
          </div>
          <canvas
            ref={preview}
            aria-label="Device frame preview"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              setPlaying(false);
              orbit.current = {
                x: e.clientX,
                y: e.clientY,
                tiltX: settings.tiltX,
                tiltY: settings.tiltY,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
              e.preventDefault();
            }}
            onPointerMove={(e) => {
              const start = orbit.current;
              if (!start) return;
              update({
                tiltX: Math.round(
                  Math.max(
                    -35,
                    Math.min(35, start.tiltX - (e.clientY - start.y) * 0.18),
                  ),
                ),
                tiltY: Math.round(
                  Math.max(
                    -40,
                    Math.min(40, start.tiltY + (e.clientX - start.x) * 0.18),
                  ),
                ),
              });
            }}
            onPointerUp={(e) => {
              orbit.current = null;
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={() => {
              orbit.current = null;
            }}
          />
          <div
            className="frame-view-presets"
            role="group"
            aria-label="Device view presets"
          >
            <button onClick={() => update({ tiltX: 0, tiltY: 0 })}>
              <RotateCcw size={13} /> Front view
            </button>
            <button onClick={() => update({ tiltX: 8, tiltY: -25 })}>
              Three-quarter
            </button>
            <button onClick={() => update({ tiltX: 28, tiltY: 20 })}>
              Elevated
            </button>
          </div>
          <div className="frame-preview-controls">
            <button
              className="secondary"
              onClick={() => {
                if (settings.motion === "none") update({ motion: "orbit" });
                setPlaying((v) => !v);
              }}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}{" "}
              {playing ? "Pause 3D preview" : "Play 3D preview"}
            </button>
          </div>
        </div>
        <div className="frame-settings">
          <div className="frame-field-pair">
            <label className="field">
              <span>Device</span>
              <select
                aria-label="Device model"
                value={settings.device}
                disabled={working}
                onChange={(e) => update({ device: e.target.value })}
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Finish</span>
              <select
                aria-label="Device finish"
                value={settings.finish}
                onChange={(e) =>
                  update({ finish: e.target.value as FrameSettings["finish"] })
                }
              >
                <option value="silver">Silver</option>
                <option value="graphite">Graphite</option>
                <option value="gold">Champagne</option>
              </select>
            </label>
          </div>
          <h3>Your screen</h3>
          <label className="field">
            <span>Website address</span>
            <input
              aria-label="Website address"
              type="text"
              placeholder="https://your-website.com"
              value={address}
              disabled={working}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && address.trim()) void render();
              }}
            />
          </label>
          <button
            className="primary full"
            disabled={working || !address.trim()}
            onClick={() => void render()}
          >
            {working ? <span className="spinner" /> : <Globe size={16} />}{" "}
            {working
              ? "Rendering website…"
              : settings.src && settings.url
                ? "Refresh website screen"
                : "Render website"}
          </button>
          {working && (
            <button
              className="text-button"
              onClick={() => capture.current?.abort()}
            >
              Cancel capture
            </button>
          )}
          <input
            ref={upload}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            aria-label="Upload device screen"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setError("");
              try {
                if (file.size > 20 * 1024 * 1024)
                  throw new Error("Choose an image smaller than 20 MB.");
                const reader = new FileReader();
                const src = await new Promise<string>((resolve, reject) => {
                  reader.onload = () => resolve(String(reader.result));
                  reader.onerror = () =>
                    reject(new Error("Could not read this image."));
                  reader.readAsDataURL(file);
                });
                const image = new Image();
                image.src = src;
                await image.decode();
                if (alive.current)
                  update({
                    src,
                    url: "",
                    title: file.name,
                    capturedAt: new Date().toISOString(),
                  });
              } catch (error) {
                setError((error as Error).message);
              }
            }}
          />
          <button
            className="secondary full"
            disabled={working}
            onClick={() => upload.current?.click()}
          >
            <Upload size={15} /> Upload screen image
          </button>
          <p className="muted small">
            Captures the visible page at this device’s screen size. Login pages
            use a fresh session; you can upload your own screenshot instead.
          </p>
          <h3>View & motion</h3>
          <label className="field">
            <span>Tilt up / down · {settings.tiltX}°</span>
            <input
              aria-label="Device vertical tilt"
              type="range"
              min={-35}
              max={35}
              value={settings.tiltX}
              onChange={(e) => update({ tiltX: +e.target.value })}
            />
          </label>
          <label className="field">
            <span>Turn left / right · {settings.tiltY}°</span>
            <input
              aria-label="Device horizontal tilt"
              type="range"
              min={-40}
              max={40}
              value={settings.tiltY}
              onChange={(e) => update({ tiltY: +e.target.value })}
            />
          </label>
          {devices.find((d) => d.id === settings.device)!.kind === "laptop" && (
            <label className="field">
              <span>Screen opening · {settings.lidAngle}°</span>
              <input
                aria-label="Laptop screen opening"
                type="range"
                min={95}
                max={130}
                value={settings.lidAngle}
                onChange={(e) => update({ lidAngle: +e.target.value })}
              />
            </label>
          )}
          <label className="field">
            <span>3D movement</span>
            <select
              aria-label="Device 3D movement"
              value={settings.motion}
              onChange={(e) => {
                update({ motion: e.target.value as FrameSettings["motion"] });
                setPlaying(e.target.value !== "none");
              }}
            >
              <option value="none">Still</option>
              <option value="orbit">Orbit</option>
              <option value="rock">Rock side to side</option>
              <option value="float">Float</option>
            </select>
          </label>
          {settings.src && (
            <p className="frame-captured">
              <strong>{settings.title || "Your screen"}</strong>
              <small>
                Screen saved · {new Date(settings.capturedAt).toLocaleString()}
              </small>
            </p>
          )}
        </div>
      </div>
      <div className="refine-actions frame-actions">
        {error && (
          <p role="alert" className="ai-error">
            {error}
          </p>
        )}
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={working || !settings.src}
          onClick={() => void add()}
        >
          {existing ? "Save frame changes" : "Add frame to design"}
        </button>
      </div>
    </Modal>
  );
}
