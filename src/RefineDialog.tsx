import { useEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles, Square } from "lucide-react";
import type { Editor } from "./editor";
import { Modal } from "./ui";
import { designerRequest, DesignerRequestError } from "./ai";
import { useBrandGuidance } from "./BrandContext";
import {
  applyRefinement,
  makeRefinedSelection,
  type SelectionSnapshot,
  type RefinedSelection,
  type RefinementJob,
} from "./refinement";

export function RefineDialog({
  editor,
  snapshot,
  onClose,
  notify,
}: {
  editor: Editor;
  snapshot: SelectionSnapshot;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [prompt, setPrompt] = useState(""),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [job, setJob] = useState<RefinementJob | null>(null),
    [candidate, setCandidate] = useState<RefinedSelection | null>(null),
    [working, setWorking] = useState(false);
  const { brandContext, control: brandControl } = useBrandGuidance(working);
  const alive = useRef(true),
    owned = useRef<{ id: string; token: string } | null>(null);
  const [direction, setDirection] = useState("balanced");
  const connect = async () => {
    try {
      const session = await designerRequest("/session");
      if (!session.ready)
        throw new Error("Sign in to Codex and start your local designer.");
      if (alive.current) {
        setToken(session.token);
        setError("");
      }
    } catch (e) {
      if (alive.current) {
        setToken("");
        setError((e as Error).message);
      }
    }
  };
  useEffect(() => {
    alive.current = true;
    void connect();
    return () => {
      alive.current = false;
      const active = owned.current;
      if (active)
        void designerRequest(`/refinements/${active.id}`, active.token, {
          method: "DELETE",
        }).catch(() => {});
    };
  }, []);
  const cancel = async () => {
    const active = owned.current;
    if (!active) return;
    try {
      await designerRequest(`/refinements/${active.id}`, active.token, {
        method: "DELETE",
      });
      owned.current = null;
      setWorking(false);
      setJob(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const generate = async () => {
    setWorking(true);
    setError("");
    setCandidate(null);
    try {
      let next: RefinementJob = await designerRequest("/refinements", token, {
        method: "POST",
        body: JSON.stringify({
          prompt,
          direction,
          brandContext,
          width: snapshot.width,
          height: snapshot.height,
          nodes: snapshot.nodes,
          images: snapshot.images,
          preview: snapshot.preview,
        }),
      });
      owned.current = { id: next.id, token };
      if (!alive.current) {
        await designerRequest(`/refinements/${next.id}`, token, {
          method: "DELETE",
        });
        owned.current = null;
        return;
      }
      while (alive.current && owned.current?.id === next.id) {
        setJob(next);
        if (next.status === "completed" && next.result) {
          const preview = await makeRefinedSelection(snapshot, next.result);
          if (alive.current) setCandidate(preview);
          owned.current = null;
          break;
        }
        if (next.status === "failed" || next.status === "cancelled") {
          owned.current = null;
          throw new Error(next.error || "Refinement cancelled.");
        }
        await new Promise((r) => setTimeout(r, 1200));
        if (!alive.current || owned.current?.id !== next.id) break;
        next = await designerRequest(`/refinements/${next.id}`, token);
      }
    } catch (e) {
      if (alive.current) {
        if (
          e instanceof TypeError ||
          (e instanceof DesignerRequestError &&
            [401, 403, 503].includes(e.status))
        )
          setToken("");
        setError((e as Error).message);
      }
    } finally {
      if (alive.current) setWorking(false);
    }
  };
  return (
    <Modal title="Improve with AI" onClose={onClose} wide>
      <div className="refine-body">
        <p className="refine-lede">
          Refine {snapshot.roots.length} selected{" "}
          {snapshot.roots.length === 1
            ? "element or group"
            : "elements / groups"}{" "}
          · {snapshot.nodes.length} layers
        </p>
        {brandControl}
        <label className="field">
          <span>Creative direction</span>
          <select
            aria-label="Refinement creative direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            disabled={working}
          >
            <option value="precise">
              Precise · follow the requested changes
            </option>
            <option value="balanced">
              Art directed · improve composition and craft
            </option>
            <option value="bold">
              Bold redesign · explore a stronger visual direction
            </option>
          </select>
        </label>
        <div className={`refine-previews ${candidate ? "has-after" : ""}`}>
          <figure>
            <figcaption>Current selection</figcaption>
            <img
              src={snapshot.preview}
              alt="Selected content before refinement"
            />
          </figure>
          {candidate && (
            <figure>
              <figcaption>Proposed refinement</figcaption>
              <img src={candidate.preview} alt="AI refinement preview" />
            </figure>
          )}
        </div>
        <label className="field">
          <span>What would you like to improve?</span>
          <textarea
            aria-label="Selection refinement brief"
            autoFocus
            rows={4}
            maxLength={6000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Make this feel more premium: improve spacing, balance the groups, use a warmer palette, and keep the exact wording…"
            disabled={working}
          />
        </label>
        {!prompt && (
          <div className="refine-suggestions">
            {[
              "Polish the layout and spacing",
              "Make the typography more editorial",
              "Create a more cohesive color palette",
            ].map((text) => (
              <button
                key={text}
                onClick={() =>
                  setPrompt(
                    `${text}. Preserve the existing content and groups.`,
                  )
                }
              >
                {text}
              </button>
            ))}
          </div>
        )}
        <p className="muted">
          AI can add editable artwork when your brief calls for it. Existing
          words and unselected layers are preserved. Review first; Undo restores
          the original.
        </p>
        {working && (
          <div className="ai-progress">
            <span className="spinner" />
            <strong>{job?.stage || "Sending your selection…"}</strong>
            <p>{job?.elapsedSeconds || 0}s</p>
            <button className="text-button" onClick={() => void cancel()}>
              <Square size={12} /> Cancel refinement
            </button>
          </div>
        )}
        {candidate && <p className="refine-summary">{candidate.summary}</p>}
        {!!candidate?.addedIds?.length && (
          <p className="refine-additions">
            {candidate.addedIds.length} new editable elements
          </p>
        )}
        {!!candidate?.designNotes?.length && (
          <ul className="refine-design-notes">
            {candidate.designNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        )}
        {error && (
          <div role="alert" className="ai-error">
            {error}
            {!token && (
              <button className="text-button" onClick={() => void connect()}>
                Reconnect
              </button>
            )}
          </div>
        )}
        <div className="refine-actions">
          <button className="secondary" onClick={onClose}>
            Close
          </button>
          <button
            className={candidate ? "secondary" : "primary"}
            disabled={working || !token || prompt.trim().length < 8}
            onClick={() => void generate()}
          >
            <Sparkles size={16} />
            {candidate ? "Try another refinement" : "Generate refinement"}
          </button>
          {candidate && (
            <button
              className="primary"
              disabled={working}
              onClick={async () => {
                setWorking(true);
                try {
                  await applyRefinement(editor, snapshot, candidate);
                  notify(
                    "AI refinement applied to your selection. Undo restores the original.",
                  );
                  onClose();
                } catch (e) {
                  setError((e as Error).message);
                  setWorking(false);
                }
              }}
            >
              Apply changes <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
