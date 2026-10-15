import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  WandSparkles,
} from "lucide-react";
import {
  designerRequest,
  proposalToDesign,
  type DesignJob,
  type Proposal,
  type RebuildReference,
} from "./ai";
import { Editor } from "./editor";
import { presets, type Design, type Asset } from "./types";
import { Field } from "./ui";
import { useBrandGuidance } from "./BrandContext";
import { AiEngine, useDesignIntent } from "./DesignIntent";
import { DesktopAI } from "./DesktopAI";

const examples = [
  "A refined launch poster for a botanical skincare brand. Sage, ivory, and warm editorial typography.",
  "A bold summer sale Instagram post for a creative stationery shop. Playful stickers, confident type, 30% off.",
  "A three-slide presentation for a modern interior design studio. Quiet luxury, beautiful photography, concise copy.",
];
export function DesignerPanel({
  editor,
  brand,
  notify,
  reference,
  onClearReference,
  brandLogo,
}: {
  editor: Editor;
  brand: string[];
  notify: (s: string) => void;
  reference: RebuildReference | null;
  onClearReference: () => void;
  brandLogo: Asset | null;
}) {
  const [token, setToken] = useState(""),
    [connection, setConnection] = useState(
      "Connecting to your local designer…",
    ),
    [prompt, setPrompt] = useState(
      () => sessionStorage.getItem("forma:ai-prompt") || "",
    ),
    [style, setStyle] = useState("Art director’s choice"),
    [audience, setAudience] = useState(""),
    [brandName, setBrandName] = useState(""),
    [useBrand, setUseBrand] = useState(false),
    [useLogo, setUseLogo] = useState(true),
    [referenceMode, setReferenceMode] = useState<"preserve" | "rebuild">(
      "preserve",
    ),
    [format, setFormat] = useState(0),
    [pages, setPages] = useState(1),
    [details, setDetails] = useState(false),
    [jobId, setJobId] = useState(
      () => sessionStorage.getItem("forma:ai-job") || "",
    ),
    [job, setJob] = useState<DesignJob | null>(null),
    [draft, setDraft] = useState<Design | null>(null),
    [proposal, setProposal] = useState<Proposal | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [previewPage, setPreviewPage] = useState(0);
  const [recent, setRecent] = useState<
    { id: string; title: string; layers: number }[]
  >([]);
  const [view, setView] = useState<"create" | "results">(() =>
    sessionStorage.getItem("forma:ai-job") ? "results" : "create",
  );
  const panelRef = useRef<HTMLElement>(null);
  const { designIntent, control: intentControl, reset: resetIntent } = useDesignIntent(busy, "designer");
  const newDesign = () => {
    setView("create");
    onClearReference();
    setJobId("");
    setJob(null);
    setDraft(null);
    setProposal(null);
    setPrompt("");
    resetIntent();
    setError("");
    setPreviewPage(0);
    sessionStorage.removeItem("forma:ai-job");
    sessionStorage.removeItem("forma:ai-prompt");
    panelRef.current?.scrollTo({ top: 0 });
    requestAnimationFrame(() =>
      panelRef.current?.querySelector("textarea")?.focus(),
    );
  };
  const connect = async () => {
    setConnection("Connecting to your local designer…");
    try {
      const session = await designerRequest("/session");
      if (!session.ready)
        throw new Error(
          window.formaDesktop ? "Open AI account & connection below to sign in." : "Sign in to Codex on this computer, then restart the designer.",
        );
      setToken(session.token);
      setConnection("Local designer connected");
      setRecent(await designerRequest("/jobs", session.token));
    } catch (e) {
      setToken("");
      setConnection("Local designer is offline");
      setError(
        e instanceof Error && e.message !== "Failed to fetch"
          ? e.message
          : window.formaDesktop ? "The designer is starting. Use Reconnect in a moment, or open AI account & connection below." : "Start the local designer with npm run ai:start in the Forma project.",
      );
    }
  };
  useEffect(() => {
    void connect();
  }, []);
  useEffect(() => {
    if (!window.formaDesktop || token) return;
    const timer = setInterval(() => void connect(), 4000);
    return () => clearInterval(timer);
  }, [token]);
  useEffect(() => {
    if (reference) {
      setView("create");
      setPrompt(
        "Create a polished design with this original image. Preserve its visual quality, detail, style and composition. Keep any new text, logo and layout elements separately editable. Do not redraw the photographic content as shapes.",
      );
      setPages(1);
      setReferenceMode("preserve");
      setDraft(null);
      setProposal(null);
      setJobId("");
      setJob(null);
      sessionStorage.removeItem("forma:ai-job");
    }
  }, [reference?.id]);
  const openDraft = async () => {
    if (!draft) return;
    try {
      await editor.open(draft);
      notify(
        "Your AI design is open. Text, shapes and images are separate editable layers.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    if (!jobId || !token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next: DesignJob = await designerRequest(`/jobs/${jobId}`, token);
        if (cancelled) return;
        setJob(next);
        if (next.status === "completed" && next.result) {
          setConnection("Preparing your editable preview…");
          const design = await proposalToDesign(next.result);
          if (cancelled) return;
          setDraft(design);
          setProposal(next.result);
          setPreviewPage(0);
          setBusy(false);
          setConnection("Local designer connected");
          void designerRequest("/jobs", token)
            .then(setRecent)
            .catch(() => {});
        } else if (next.status === "failed" || next.status === "cancelled") {
          setBusy(false);
          if (next.error) setError(next.error);
        } else {
          setBusy(true);
          timer = setTimeout(poll, 1200);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setBusy(false);
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, token]);
  const { brandContext, control: brandControl } = useBrandGuidance(busy);
  const generate = async (refine = false) => {
    setError("");
    setBusy(true);
    setDraft(null);
    try {
      const size = presets[format];
      const result: DesignJob = await designerRequest("/jobs", token, {
        method: "POST",
        body: JSON.stringify({
          prompt,
          brandContext,
          designIntent,
          width: reference?.width || size.width,
          height: reference?.height || size.height,
          pages,
          style,
          audience,
          brand: brandName || brandContext?.name || "",
          palette: useBrand ? brand : [],
          ...(useLogo && brandLogo ? { logo: brandLogo } : {}),
          ...(reference ? { sourceImage: reference.data, referenceMode } : {}),
          ...(refine && proposal ? { previous: proposal } : {}),
        }),
      });
      sessionStorage.setItem("forma:ai-job", result.id);
      sessionStorage.setItem("forma:ai-prompt", prompt);
      setJob(result);
      setJobId(result.id);
      setView("results");
    } catch (e) {
      setBusy(false);
      setError((e as Error).message);
    }
  };
  return (
    <aside
      ref={panelRef}
      className="asset-panel ai-panel"
      aria-label="AI Designer"
    >
      <div
        className="ai-view-tabs"
        role="tablist"
        aria-label="AI designer views"
      >
        <button
          role="tab"
          aria-selected={view === "create"}
          onClick={() => setView("create")}
        >
          Create
        </button>
        <button
          role="tab"
          aria-selected={view === "results"}
          onClick={() => setView("results")}
        >
          Results & history
        </button>
      </div>
      {view === "create" && (
        <>
          <div className="ai-intro">
            <WandSparkles size={25} />
            <h3>Your idea. Beautifully made.</h3>
            <p>
              A creative partner for complete, editable designs. Tell it what
              you have in mind.
            </p>
          </div>
          {reference && (
            <div className="ai-reference">
              <img src={reference.data} alt="Original design reference" />
              <div>
                <strong>Your original image</strong>
                <label className="field">
                  <span>Reference treatment</span>
                  <select
                    aria-label="Reference treatment"
                    value={referenceMode}
                    disabled={busy}
                    onChange={(e) => {
                      const mode = e.target.value as "preserve" | "rebuild";
                      setReferenceMode(mode);
                      setPrompt(
                        mode === "preserve"
                          ? "Create a polished design with this original image. Preserve its visual quality, detail, style and composition. Keep any new text, logo and layout elements separately editable."
                          : "Rebuild the visible wording and simple artwork of this reference as independent text and vector layers. Preserve the composition and palette. Treat complex imagery as a stylized approximation.",
                      );
                    }}
                  >
                    <option value="preserve">Keep image quality</option>
                    <option value="rebuild">Rebuild simple artwork</option>
                  </select>
                </label>
                <p>
                  {referenceMode === "preserve"
                    ? "Keeps the original as a photo layer. New text, logo and layout stay editable. Use AI Pencil for changes inside the image."
                    : "Best for simple posters and flat artwork. Complex photos become stylized; hidden original layers cannot be recovered."}
                </p>
                <button className="text-button" onClick={onClearReference}>
                  Remove reference
                </button>
              </div>
            </div>
          )}
          <label className="field ai-brief">
            <span>Your creative brief</span>
            <textarea
              aria-label="AI design brief"
              rows={6}
              maxLength={6000}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                sessionStorage.setItem("forma:ai-prompt", e.target.value);
              }}
              placeholder="What are we making? Describe the purpose, mood, colors, and exact words to include…"
            />
          </label>
          {!prompt && !draft && (
            <div className="ai-examples">
              {examples.map((example, i) => (
                <button
                  key={example}
                  onClick={() => {
                    setPrompt(example);
                    if (i === 2) {
                      setFormat(2);
                      setPages(3);
                    }
                  }}
                >
                  <Sparkles size={13} />
                  {
                    [
                      "A botanical brand launch",
                      "A playful summer sale",
                      "An elegant studio presentation",
                    ][i]
                  }
                  <ArrowRight size={12} />
                </button>
              ))}
            </div>
          )}
          <div className="field-grid">
            <Field label="Format">
              <select
                aria-label="AI design format"
                value={format}
                onChange={(e) => setFormat(+e.target.value)}
              >
                {presets.map((p, i) => (
                  <option key={p.name} value={i}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pages">
              <select
                aria-label="AI page count"
                value={pages}
                onChange={(e) => setPages(+e.target.value)}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </Field>
          </div>
          {brandControl}
          {intentControl}
          <Field label="Art direction">
            <select
              aria-label="Art direction"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
            >
              {[
                "Art director’s choice",
                "Refined editorial",
                "Quiet luxury",
                "Bold & expressive",
                "Playful & tactile",
                "Natural & organic",
                "Clean & minimal",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <button
            className="ai-details-toggle"
            aria-expanded={details}
            onClick={() => setDetails(!details)}
          >
            Fine-tune the brief
            <ChevronDown size={14} />
          </button>
          {details && (
            <div className="ai-details">
              <Field label="Brand / business">
                <input
                  maxLength={120}
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Your brand name"
                />
              </Field>
              <Field label="Audience">
                <input
                  maxLength={250}
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="Who should this speak to?"
                />
              </Field>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={useBrand}
                  onChange={(e) => setUseBrand(e.target.checked)}
                />{" "}
                Use my brand palette
              </label>
              {useBrand && (
                <div className="ai-palette">
                  {brand.map((c) => (
                    <i key={c} style={{ background: c }} />
                  ))}
                </div>
              )}
            </div>
          )}
          {!busy && (
            <>
              {brandLogo && (
                <label className="ai-use-logo check-row">
                  <input
                    type="checkbox"
                    checked={useLogo}
                    onChange={(e) => setUseLogo(e.target.checked)}
                  />
                  <img src={brandLogo.src} alt="Saved brand logo" /> Use my
                  brand logo
                </label>
              )}
              <button
                className="primary full ai-generate"
                disabled={!token || prompt.trim().length < 8}
                onClick={() => void generate()}
              >
                <WandSparkles size={17} />{" "}
                {reference
                  ? referenceMode === "preserve"
                    ? "Design with this image"
                    : "Rebuild simple artwork"
                  : "Create my design"}
              </button>
              {proposal && (
                <button
                  className="secondary full"
                  disabled={!token || prompt.trim().length < 8}
                  onClick={() => void generate(true)}
                >
                  <RefreshCw size={15} /> Refine the last design
                </button>
              )}
            </>
          )}
        </>
      )}
      {view === "results" && (
        <>
          {recent.length > 0 && (
            <Field label="Recent AI designs · original layers">
              <select
                aria-label="Recent AI designs"
                value={recent.some((r) => r.id === jobId) ? jobId : ""}
                disabled={busy}
                onChange={(e) => {
                  if (e.target.value) {
                    onClearReference();
                    setDraft(null);
                    setJobId(e.target.value);
                    sessionStorage.setItem("forma:ai-job", e.target.value);
                  }
                }}
              >
                <option value="">Open a previous design…</option>
                {recent.map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.title} · {r.layers} layers
                  </option>
                ))}
              </select>
            </Field>
          )}
          {!busy && (
            <button className="secondary full" onClick={newDesign}>
              <Plus size={16} /> New AI design
            </button>
          )}
          {busy && (
            <div className="ai-progress">
              <span className="spinner" />
              <strong>{job?.stage || "Sending your brief…"}</strong>
              <p>
                {job?.elapsedSeconds || 0}s · You can keep editing while I work.
              </p>
              <button
                className="text-button"
                onClick={async () => {
                  if (jobId) {
                    try {
                      await designerRequest(`/jobs/${jobId}`, token, {
                        method: "DELETE",
                      });
                      setBusy(false);
                      setJob(null);
                      sessionStorage.removeItem("forma:ai-job");
                      setJobId("");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }
                }}
              >
                <Square size={12} /> Cancel generation
              </button>
            </div>
          )}
          {draft && proposal && (
            <div className="ai-result">
              <div className="section-label">
                <h3>{draft.name}</h3>
                <span>
                  <Check size={12} /> Ready
                </span>
              </div>
              <button className="primary full" onClick={() => void openDraft()}>
                Open editable design
                <ArrowRight size={16} />
              </button>
              <div className="ai-layer-count">
                {draft.pages[previewPage].data.objects instanceof Array
                  ? draft.pages[previewPage].data.objects.length
                  : 0}{" "}
                editable layers · {draft.width} × {draft.height} px
              </div>
              <button
                className="ai-preview"
                aria-label="Open generated design as editable layers"
                onClick={() => void openDraft()}
              >
                <img
                  src={draft.pages[previewPage].thumbnail}
                  alt="AI design preview"
                  draggable={false}
                />
              </button>
              {draft.pages.length > 1 && (
                <div className="ai-page-pills">
                  {draft.pages.map((p, i) => (
                    <button
                      className={i === previewPage ? "selected" : ""}
                      key={p.id}
                      onClick={() => setPreviewPage(i)}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
              <p>{proposal.description}</p>
              <div className="ai-palette">
                {proposal.palette
                  .filter((c) => /^#[0-9a-f]{6}$/i.test(c))
                  .map((c, i) => (
                    <i key={i} style={{ background: c }} title={c} />
                  ))}
              </div>
              <small>
                Creates a separate design. Your current work stays saved.
              </small>
            </div>
          )}
          {!draft && !busy && (
            <p className="muted">
              Choose a recent design to view its editable result.
            </p>
          )}
          {draft && (
            <button
              className="secondary full"
              onClick={() => setView("create")}
            >
              <RefreshCw size={15} /> Refine this design
            </button>
          )}
        </>
      )}
      {error && (
        <div className="ai-error" role="alert">
          {error}
          {
            <button
              className="text-button"
              onClick={() => {
                setError("");
                void connect();
              }}
            >
              Reconnect
            </button>
          }
        </div>
      )}
      {!token && <DesktopAI />}
      <div className="ai-connection">
        <span className={token ? "status-dot" : "status-dot pending"} />
        {connection}
      </div>
      <p className="ai-disclosure">
        Uses your signed-in Codex account. Your brief is sent to the AI service;
        your designs stay in your studio.
      </p>
      <AiEngine />
    </aside>
  );
}
