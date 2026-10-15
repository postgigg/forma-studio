import { useEffect, useState } from "react";
import { ChevronDown, Plus, RefreshCw, Sparkles, Square } from "lucide-react";
import { designerRequest, isTransientDesignerError } from "./ai";
import { useBrandGuidance } from "./BrandContext";
import { useDesignIntent } from "./DesignIntent";
import { Field } from "./ui";
import type { Asset } from "./types";

type PhotoJob = {
  id: string;
  status: string;
  stage: string;
  error?: string;
  prompt: string;
  elapsedSeconds: number;
  result?: Omit<Asset, "id">;
};
export function PhotoCreator({
  onAdd,
}: {
  onAdd: (asset: Asset) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState(
    () => sessionStorage.getItem("forma:photo-prompt") || "",
  );
  const [format, setFormat] = useState("Square"),
    [style, setStyle] = useState("Natural light"),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [adding, setAdding] = useState(false);
  const [jobId, setJobId] = useState(
      () => sessionStorage.getItem("forma:photo-job") || "",
    ),
    [job, setJob] = useState<PhotoJob | null>(null),
    [recent, setRecent] = useState<{ id: string; title: string }[]>([]);
  const { brandContext, control: brandControl } = useBrandGuidance(busy);
  const { designIntent, control: intentControl } = useDesignIntent(busy, "photo");
  const connect = async () => {
    try {
      setError("");
      const session = await designerRequest("/session");
      if (!session.ready)
        throw new Error(window.formaDesktop ? "Open AI Designer → AI account & connection to sign in, then reconnect here." : "Sign in to Codex on this computer to create photos.");
      setToken(session.token);
      setRecent(await designerRequest("/photos", session.token));
    } catch (e) {
      setError((e as Error).message);
      setToken("");
    }
  };
  useEffect(() => {
    void connect();
  }, []);
  useEffect(() => {
    if (!jobId || !token) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next: PhotoJob = await designerRequest(`/photos/${jobId}`, token);
        if (stopped) return;
        setError("");
        setJob(next);
        setBusy(next.status === "running");
        if (next.error) setError(next.error);
        if (next.status === "running") timer = setTimeout(poll, 1500);
        else if (next.status === "completed")
          void designerRequest("/photos", token)
            .then(setRecent)
            .catch(() => {});
      } catch (e) {
        if (!stopped) {
          if (isTransientDesignerError(e)) {
            setError("Reconnecting to your existing photo generation…");
            setBusy(true); timer = setTimeout(poll, 2500);
          } else { setError((e as Error).message); setBusy(false); }
        }
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId, token]);
  const generate = async () => {
    setError("");
    setBusy(true);
    setJob(null);
    try {
      const next: PhotoJob = await designerRequest("/photos", token, {
        method: "POST",
        body: JSON.stringify({ prompt, format, style, brandContext, designIntent }),
      });
      setJob(next);
      setJobId(next.id);
      sessionStorage.setItem("forma:photo-job", next.id);
    } catch (e) {
      setBusy(false);
      setError((e as Error).message);
    }
  };
  return (
    <details className="photo-creator" aria-label="AI photo creator">
      <summary className="photo-creator-heading">
        <Sparkles size={18} />
        <h3>Create a photo</h3>
        {busy ? <span className="spinner" /> : <ChevronDown size={16} />}
      </summary>
      <p className="muted small">Describe a scene. Make it yours.</p>
      {brandControl}
      <Field label="Your photo idea">
        <textarea
          aria-label="AI photo prompt"
          rows={4}
          maxLength={6000}
          placeholder="A sunlit olive grove, soft morning mist, editorial photography…"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            sessionStorage.setItem("forma:photo-prompt", e.target.value);
          }}
        />
      </Field>
      {intentControl}
      <div className="field-grid">
        <Field label="Format">
          <select
            aria-label="AI photo format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            {["Square", "Landscape", "Portrait"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Photo style">
          <select
            aria-label="AI photo style"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
          >
            {[
              "Natural light",
              "Studio product",
              "Cinematic",
              "Film photography",
              "Macro detail",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
      </div>
      <button
        className="primary full"
        disabled={!token || busy || prompt.trim().length < 8}
        onClick={() => void generate()}
      >
        <Sparkles size={16} />
        {busy ? "Creating your photo…" : "Generate photo"}
      </button>
      {busy && (
        <div className="photo-progress" role="status">
          <span className="spinner" />
          <span>
            {job?.elapsedSeconds || 0}s · Keep editing while it develops.
          </span>
          <button
            className="text-button"
            onClick={async () => {
              try {
                await designerRequest(`/photos/${jobId}`, token, {
                  method: "DELETE",
                });
                setBusy(false);
                setJobId("");
                setJob(null);
                sessionStorage.removeItem("forma:photo-job");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Square size={12} />
            Cancel photo
          </button>
        </div>
      )}
      {error && (
        <div className="ai-error" role="alert">
          {error}
          <button className="text-button" onClick={() => void connect()}>
            <RefreshCw size={12} />
            Reconnect
          </button>
        </div>
      )}
      {job?.result && (
        <div className="photo-result">
          <img src={job.result.src} alt={job.prompt} />
          <small>
            {job.result.width} × {job.result.height} · AI generated
          </small>
          <button
            className="secondary full"
            disabled={adding}
            onClick={async () => {
              setAdding(true);
              try {
                await onAdd({ id: job.id, ...job.result! });
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setAdding(false);
              }
            }}
          >
            <Plus size={16} />
            {adding ? "Adding…" : "Add photo to design"}
          </button>
        </div>
      )}
      {!!recent.length && (
        <Field label="Your generated photos">
          <select
            aria-label="Recent AI photos"
            disabled={busy}
            value={recent.some((r) => r.id === jobId) ? jobId : ""}
            onChange={(e) => {
              if (e.target.value) {
                setJob(null);
                setJobId(e.target.value);
                sessionStorage.setItem("forma:photo-job", e.target.value);
              }
            }}
          >
            <option value="">Choose a photo…</option>
            {recent.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </Field>
      )}
      <p className="ai-disclosure">
        Created with your signed-in Codex account. Photo descriptions are sent
        to the AI service.
      </p>
    </details>
  );
}
