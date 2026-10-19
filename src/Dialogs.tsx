import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Cloud,
  Download,
  FolderOpen,
  LogOut,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Editor, download } from "./editor";
import { exportMotion } from "./export-motion";
import { motionChoices } from "./Motion";
import { allDesigns, deleteDesign } from "./storage";
import { presets, type Design } from "./types";
import { Field, IconButton, Modal } from "./ui";

type Props = {
  editor: Editor;
  onClose: () => void;
  notify: (message: string) => void;
};
export function SizeDialog({
  editor,
  onClose,
  notify,
  resize = false,
}: { resize?: boolean } & Props) {
  const [name, setName] = useState("Untitled design"),
    [width, setWidth] = useState(resize ? editor.doc.width : 1080),
    [height, setHeight] = useState(resize ? editor.doc.height : 1080),
    [whiteboard,setWhiteboard]=useState(false),
    [scale, setScale] = useState(true),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={resize ? "Resize your design" : "Start something new"}
      onClose={onClose}
    >
      <p className="modal-description">
        {resize
          ? "Give your ideas a little more room."
          : "Big idea or little spark. There’s a size for it."}
      </p>
      {!resize && (
        <Field label="Design name">
          <input
            autoFocus
            maxLength={250}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Give your idea a name"
          />
        </Field>
      )}
      <div className="size-presets">
        {[...presets,...(!resize?[{name:"Whiteboard",width:4000,height:2600,category:"Whiteboard"}]:[])].map((p) => (
          <button
            key={p.name}
            className={
              width === p.width && height === p.height ? "selected" : ""
            }
            onClick={() => {
              setWhiteboard(p.category==="Whiteboard");
              setWidth(p.width);
              setHeight(p.height);
              if (!resize) setName(p.name);
            }}
          >
            <span
              className="size-outline"
              style={{ aspectRatio: `${p.width}/${p.height}` }}
            />
            <strong>{p.name}</strong>
            <small>
              {p.width} × {p.height}
            </small>
          </button>
        ))}
      </div>
      <div className="field-grid">
        <Field label="Width (px)">
          <input
            type="number"
            value={width}
            min={64}
            max={8000}
            onChange={(e) => setWidth(+e.target.value)}
          />
        </Field>
        <Field label="Height (px)">
          <input
            type="number"
            value={height}
            min={64}
            max={8000}
            onChange={(e) => setHeight(+e.target.value)}
          />
        </Field>
      </div>
      {resize && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={scale}
            onChange={(e) => setScale(e.target.checked)}
          />{" "}
          Scale content to fit the new size
        </label>
      )}
      <button
        className="primary full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            if (resize) editor.resize(width, height, scale);
            else {await editor.create(name, width, height);if(whiteboard){editor.board.enable();editor.board.grid('dots');window.dispatchEvent(new Event('forma:whiteboard'));}}
            onClose();
          } catch (e) {
            notify((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Preparing…" : resize ? "Resize design" : "Create design"}
        <ArrowRight size={17} />
      </button>
    </Modal>
  );
}

export function ExportDialog({ editor, onClose, notify, initialFormat="png" }: Props & {initialFormat?:"png"|"mp4"}) {
  const [format, setFormat] = useState<
      "png" | "jpeg" | "svg" | "pdf" | "json" | "gif" | "webm" | "mp4"
    >(initialFormat),
    [scale, setScale] = useState(1),
    [transparent, setTransparent] = useState(false),
    [all, setAll] = useState(false),
    [busy, setBusy] = useState(false);
  const [motionStyle, setMotionStyle] = useState<
      "page" | "none" | "fade" | "rise" | "stagger" | "drift"
    >("page"),
    [duration, setDuration] = useState(2),
    [motionSize, setMotionSize] = useState(720),
    [fps, setFps] = useState(12),
    [loop, setLoop] = useState(true),
    [progress, setProgress] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const animated = format === "gif" || format === "webm" || format === "mp4";
  return (
    <Modal
      title="Take your design with you"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="modal-description">
        From a little idea to something out in the world.
      </p>
      <div className="export-preview">
        <img src={editor.page.thumbnail} alt="Current page preview" />
        <div>
          <strong>{editor.doc.name}</strong>
          <span>
            {editor.doc.width} × {editor.doc.height} px
          </span>
          <span>
            {editor.doc.pages.length}{" "}
            {editor.doc.pages.length === 1 ? "page" : "pages"}
          </span>
        </div>
      </div>
      <Field label="File type">
        <select
          aria-label="File type"
          value={format}
          onChange={(e) => setFormat(e.target.value as typeof format)}
        >
          <option value="png">PNG · Crisp images & graphics</option>
          <option value="jpeg">JPG · Smaller image files</option>
          <option value="gif">GIF · Looping animated design</option>
          <option value="mp4">MP4 · Movie with page audio</option>
          <option value="webm">WebM · Motion video with page audio</option>
          <option value="pdf">PDF · All pages in one document</option>
          <option value="svg">SVG · Editable vector artwork</option>
          <option value="json">Forma · Editable design backup</option>
        </select>
      </Field>
      {animated && (
        <div className="motion-export-options">
          {editor.doc.pages.some(page=>page.audio?.length) && <p className="muted small">{format==='gif'?'GIF does not support audio. Choose MP4 or WebM to include your soundtrack.':'Your saved page audio is included. Pages extend to fit their clips.'}</p>}
          <Field label="Animation">
            <select
              aria-label="Export animation"
              value={motionStyle}
              onChange={(e) =>
                setMotionStyle(e.target.value as typeof motionStyle)
              }
            >
              <option value="page">Page animation · Fade if unset</option>
              {motionChoices.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="field-grid">
            <Field label="Duration per page">
              <select
                aria-label="Export animation duration"
                value={duration}
                onChange={(e) => setDuration(+e.target.value)}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} seconds
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Resolution">
              <select
                aria-label="Animation resolution"
                value={motionSize}
                onChange={(e) => setMotionSize(+e.target.value)}
              >
                {[360, 540, 720, 1080].map((n) => (
                  <option key={n} value={n}>
                    {n} px long edge
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Frame rate">
            <select
              aria-label="Animation frame rate"
              value={fps}
              onChange={(e) => setFps(+e.target.value)}
            >
              {[12, 18, 24].map((n) => (
                <option key={n} value={n}>
                  {n} frames / second
                </option>
              ))}
            </select>
          </Field>
          <label className="check-row">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
            />
            {format === "gif"
              ? "Loop continuously"
              : "Fade out for a smooth loop"}
          </label>
          {motionStyle === "page" && (
            <p className="muted small">
              Saved page animations keep their own duration. Unset pages use the
              duration above.
            </p>
          )}
        </div>
      )}
      {["png", "jpeg", "pdf"].includes(format) && (
        <Field label="Export quality">
          <select
            aria-label="Export quality"
            value={scale}
            onChange={(e) => setScale(+e.target.value)}
          >
            <option value={1}>1× · Original size</option>
            <option value={2}>2× · Extra detail</option>
            <option value={3}>3× · Maximum detail</option>
          </select>
        </Field>
      )}
      {["png", "svg"].includes(format) && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={transparent}
            onChange={(e) => setTransparent(e.target.checked)}
          />{" "}
          Transparent background
        </label>
      )}
      {!["pdf", "json"].includes(format) && editor.doc.pages.length > 1 && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />{" "}
          {animated
            ? "Stitch every page into one movie / animation"
            : "Download every page as a separate file"}
        </label>
      )}
      <p className="muted small">
        {format === "json"
          ? "Keep this file to reopen and edit your design on another device."
          : format === "pdf"
            ? "Includes every page. Artwork is rendered as high-quality images."
            : "Your download is generated right here on your device."}
      </p>
      <button
        className="primary full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            if (format === "gif" || format === "webm" || format === "mp4") {
              await editor.save();
              controller.current = new AbortController();
              setProgress(0);
              const copy = structuredClone(editor.doc);
              const blob = await exportMotion(
                copy,
                all ? copy.pages : [copy.pages[editor.pageIndex]],
                {
                  format,
                  size: motionSize,
                  fps,
                  style: motionStyle,
                  duration,
                  loop,
                  signal: controller.current.signal,
                  onProgress: setProgress,
                },
              );
              await download(
                blob,
                `${editor.doc.name.replace(/[^a-z0-9 _-]/gi, "").trim() || "design"}.${format}`,
              );
            } else await editor.export(format, scale, transparent, all);
            notify(
              window.formaDesktop
                ? "Your design was saved."
                : "Your design is ready. Check your downloads.",
            );
            onClose();
          } catch (e) {
            notify((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download size={18} />
        {busy
          ? animated
            ? `Rendering animation… ${progress}%`
            : "Preparing your download…"
          : "Download"}
      </button>
      {busy && animated && (
        <button
          className="secondary full"
          onClick={() => controller.current?.abort()}
        >
          Cancel export
        </button>
      )}
    </Modal>
  );
}

export function ProjectsDialog({
  editor,
  onClose,
  notify,
  onNew,
  onCampaigns,
  onCloud,
}: Props & { onNew: () => void; onCampaigns: () => void; onCloud: () => void }) {
  const [designs, setDesigns] = useState<Design[]>([]),
    [busy, setBusy] = useState(true),
    [search, setSearch] = useState("");
  const refresh = async () => {
    setBusy(true);
    try {
      setDesigns(await allDesigns());
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <Modal wide title="Your creative corner" onClose={onClose}>
      <div className="projects-heading">
        <p>All your ideas, with room for a few more.</p>
        <button className="secondary" onClick={onCloud}><Cloud size={17} /> Cloud storage</button>
        <button className="secondary" onClick={onCampaigns}>
          <FolderOpen size={17} />
          Campaigns
        </button>
        <button className="primary" onClick={onNew}>
          <Plus size={17} /> New design
        </button>
      </div>
      <div className="project-filters">
        <p className="muted small">Saved on this device</p>
        <input
          aria-label="Search designs"
          placeholder="Find a design…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {busy ? (
        <div className="empty">Opening your designs…</div>
      ) : (
        <div className="projects-grid">
          {designs
            .filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
            .map((d) => (
              <article className="project-card" key={d.id}>
                <button
                  onClick={async () => {
                    try {
                      await editor.open(d);
                      onClose();
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  <div className="project-thumb">
                    <img src={d.pages[0].thumbnail} alt={d.name} />
                  </div>
                  <strong>{d.name}</strong>
                  <small>
                    {d.width} × {d.height} · {d.pages.length}{" "}
                    {d.pages.length === 1 ? "page" : "pages"}
                  </small>
                </button>
                <IconButton
                  icon={Trash2}
                  label={`Delete design ${d.name}`}
                  onClick={async () => {
                    if (!window.confirm(`Delete “${d.name}” from this device?`))
                      return;
                    try {
                      if (editor.doc.id === d.id)
                        await editor.create("Untitled design", 1080, 1080);
                      await deleteDesign(d.id);
                      await refresh();
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                />
              </article>
            ))}
        </div>
      )}
      {!busy && !designs.length && (
        <div className="empty">
          <FolderOpen />
          <h3>Your next idea belongs here.</h3>
          <p>Create a design to get started.</p>
        </div>
      )}
    </Modal>
  );
}
