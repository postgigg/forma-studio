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
import type { User } from "@supabase/supabase-js";
import { Editor, download } from "./editor";
import { exportMotion } from "./export-motion";
import { motionChoices } from "./Motion";
import { allDesigns, deleteDesign } from "./storage";
import { cloudDelete, cloudDesigns, cloudSave, supabase } from "./cloud";
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
        {presets.map((p) => (
          <button
            key={p.name}
            className={
              width === p.width && height === p.height ? "selected" : ""
            }
            onClick={() => {
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
            else await editor.create(name, width, height);
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

export function ExportDialog({ editor, onClose, notify }: Props) {
  const [format, setFormat] = useState<"png" | "jpeg" | "svg" | "pdf" | "json" | "gif" | "webm">(
      "png",
    ),
    [scale, setScale] = useState(1),
    [transparent, setTransparent] = useState(false),
    [all, setAll] = useState(false),
    [busy, setBusy] = useState(false);
  const [motionStyle,setMotionStyle] = useState<'page'|'none'|'fade'|'rise'|'stagger'|'drift'>('page'), [duration,setDuration] = useState(2), [motionSize,setMotionSize] = useState(720), [fps,setFps] = useState(12), [loop,setLoop] = useState(true), [progress,setProgress] = useState(0);
  const controller=useRef<AbortController|null>(null);
  const animated=format==='gif'||format==='webm';
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
          <option value="webm">WebM · Motion video</option>
          <option value="pdf">PDF · All pages in one document</option>
          <option value="svg">SVG · Editable vector artwork</option>
          <option value="json">Forma · Editable design backup</option>
        </select>
      </Field>
      {animated && <div className="motion-export-options">
        <Field label="Animation"><select aria-label="Export animation" value={motionStyle} onChange={e=>setMotionStyle(e.target.value as typeof motionStyle)}><option value="page">Page animation · Fade if unset</option>{motionChoices.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <div className="field-grid"><Field label="Duration per page"><select aria-label="Export animation duration" value={duration} onChange={e=>setDuration(+e.target.value)}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} seconds</option>)}</select></Field><Field label="Resolution"><select aria-label="Animation resolution" value={motionSize} onChange={e=>setMotionSize(+e.target.value)}>{[360,540,720,1080].map(n=><option key={n} value={n}>{n} px long edge</option>)}</select></Field></div>
        <Field label="Frame rate"><select aria-label="Animation frame rate" value={fps} onChange={e=>setFps(+e.target.value)}>{[12,18,24].map(n=><option key={n} value={n}>{n} frames / second</option>)}</select></Field>
        <label className="check-row"><input type="checkbox" checked={loop} onChange={e=>setLoop(e.target.checked)}/>{format==='gif'?'Loop continuously':'Fade out for a smooth loop'}</label>
        {motionStyle==='page' && <p className="muted small">Saved page animations keep their own duration. Unset pages use the duration above.</p>}
      </div>}
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
          {animated ? "Include every page in one animation" : "Download every page as a separate file"}
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
            if (format==='gif'||format==='webm') {
              await editor.save();controller.current=new AbortController();setProgress(0);
              const copy=structuredClone(editor.doc);
              const blob=await exportMotion(copy,all?copy.pages:[copy.pages[editor.pageIndex]],{format,size:motionSize,fps,style:motionStyle,duration,loop,signal:controller.current.signal,onProgress:setProgress});
              download(blob,`${editor.doc.name.replace(/[^a-z0-9 _-]/gi,'').trim()||'design'}.${format}`);
            } else await editor.export(format, scale, transparent, all);
            notify("Your design is ready. Check your downloads.");
            onClose();
          } catch (e) {
            notify((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download size={18} />
        {busy ? animated ? `Rendering animation… ${progress}%` : "Preparing your download…" : "Download"}
      </button>
      {busy && animated && <button className="secondary full" onClick={()=>controller.current?.abort()}>Cancel export</button>}
    </Modal>
  );
}

export function ProjectsDialog({
  editor,
  onClose,
  notify,
  onNew,
  user,
}: Props & { onNew: () => void; user: User | null }) {
  const [designs, setDesigns] = useState<Design[]>([]),
    [source, setSource] = useState("device"),
    [busy, setBusy] = useState(true),
    [search, setSearch] = useState("");
  const refresh = async () => {
    setBusy(true);
    try {
      setDesigns(
        source === "device" ? await allDesigns() : await cloudDesigns(),
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, [source]);
  return (
    <Modal wide title="Your creative corner" onClose={onClose}>
      <div className="projects-heading">
        <p>All your ideas, with room for a few more.</p>
        <button className="primary" onClick={onNew}>
          <Plus size={17} /> New design
        </button>
      </div>
      <div className="project-filters">
        <div className="segmented">
          <button
            className={source === "device" ? "selected" : ""}
            onClick={() => setSource("device")}
          >
            On this device
          </button>
          <button
            disabled={!user}
            className={source === "account" ? "selected" : ""}
            onClick={() => setSource("account")}
          >
            My account
          </button>
        </div>
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
                    if (
                      !window.confirm(
                        `Delete “${d.name}” from ${source === "device" ? "this device" : "your account"}?`,
                      )
                    )
                      return;
                    try {
                      if (source === "device") {
                        if (editor.doc.id === d.id)
                          await editor.create("Untitled design", 1080, 1080);
                        await deleteDesign(d.id);
                      } else await cloudDelete(d.id);
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
          <p>
            {source === "account"
              ? "Save a design to your account to see it here."
              : "Create a design to get started."}
          </p>
        </div>
      )}
    </Modal>
  );
}

export function AccountDialog({
  editor,
  onClose,
  notify,
  user,
}: Props & { user: User | null }) {
  const [signup, setSignup] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <Modal
      title={user ? "Your studio account" : "Make room for more"}
      onClose={onClose}
    >
      {!supabase ? (
        <>
          <div className="empty">
            <Cloud />
            <h3>Your studio works on this device.</h3>
            <p>
              Account storage is not connected on this installation. You can
              save locally and move designs between devices using a Forma file.
            </p>
          </div>
          <button className="primary full" onClick={onClose}>
            Keep creating
          </button>
        </>
      ) : user ? (
        <>
          <div className="account-profile">
            <div className="avatar">{user.email?.[0].toUpperCase()}</div>
            <div>
              <strong>{user.email}</strong>
              <span>Signed in to your studio</span>
            </div>
          </div>
          <p className="modal-description">
            Your edits save on this device automatically. Save a copy to your
            account to open it on another device.
          </p>
          <button
            className="primary full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await editor.save();
                await cloudSave(editor.doc);
                notify("Saved to your account.");
                onClose();
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Upload size={17} />
            {busy ? "Saving…" : "Save this design to my account"}
          </button>
          <button
            className="text-button full"
            onClick={async () => {
              await supabase?.auth.signOut();
              onClose();
            }}
          >
            <LogOut size={15} /> Sign out
          </button>
          {message && (
            <p role="alert" className="form-message">
              {message}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="modal-description">
            Keep your designs close, wherever you create.
          </p>
          <div className="segmented auth-tabs">
            <button
              className={!signup ? "selected" : ""}
              onClick={() => {
                setSignup(false);
                setMessage("");
              }}
            >
              Sign in
            </button>
            <button
              className={signup ? "selected" : ""}
              onClick={() => {
                setSignup(true);
                setMessage("");
              }}
            >
              Create account
            </button>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!supabase) return;
              setBusy(true);
              setMessage("");
              try {
                const result = signup
                  ? await supabase.auth.signUp({ email, password })
                  : await supabase.auth.signInWithPassword({ email, password });
                if (result.error) throw result.error;
                if (result.data.session) {
                  notify(
                    signup ? "Your studio account is ready." : "Welcome back.",
                  );
                  onClose();
                } else
                  setMessage(
                    "Check your email to confirm your account, then sign in.",
                  );
              } catch (err) {
                setMessage((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Email">
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                required
                minLength={8}
                autoComplete={signup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {message && (
              <p role="alert" className="form-message">
                {message}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? "One moment…" : signup ? "Create account" : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="muted small">
            You can keep creating without an account. Your local designs stay on
            this device.
          </p>
        </>
      )}
    </Modal>
  );
}
