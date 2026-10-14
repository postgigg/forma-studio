import { useEffect, useState } from "react";
import { intentLimits, validateDesignIntent, type DesignIntent } from "../shared/design-intent.mjs";
import { designerRequest } from "./ai";
import "./design-intent.css";

const empty: DesignIntent = { outcome: "", message: "", preserve: "", avoid: "" };
const fields = [
  ["outcome", "Desired outcome", "What should someone understand, feel, or do?"],
  ["message", "Main message", "The one thing they should remember"],
  ["preserve", "Keep unchanged", "Exact wording, subjects, colors, or layout to protect"],
  ["avoid", "Avoid", "Styles, subjects, or treatments that do not fit"],
] as const;
export function useDesignIntent(disabled = false, storageKey?: string) {
  const [value, setValue] = useState<DesignIntent>(() => {
    try { return validateDesignIntent(JSON.parse(sessionStorage.getItem(`forma:intent:${storageKey}`) || "null")) || { ...empty }; }
    catch { return { ...empty }; }
  });
  const update = (next: DesignIntent) => {
    setValue(next);
    if (storageKey) sessionStorage.setItem(`forma:intent:${storageKey}`, JSON.stringify(next));
  };
  return {
    designIntent: validateDesignIntent(value),
    reset: () => update({ ...empty }),
    control: <details className="design-intent">
      <summary>Design intent & quality{Object.values(value).some(Boolean) && <span>Added</span>}</summary>
      <p>Give your designer a clear outcome. It will use hierarchy, typography, color and spacing to support it.</p>
      {fields.map(([key, label, placeholder]) => <label className="field" key={key}>
        <span>{label}</span><textarea aria-label={label} rows={2} disabled={disabled} maxLength={intentLimits[key]} value={value[key]} placeholder={placeholder} onChange={e => update({ ...value, [key]: e.target.value })} />
      </label>)}
      <p className="small muted">Your current request takes priority. Targeted edits stay within your selection or marked area.</p>
    </details>,
  };
}
export function AiEngine({ images = false }: { images?: boolean }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    let alive = true;
    void designerRequest("/health").then(info => {
      if (alive && info.modelLabel) setLabel(`${info.modelLabel} · ${info.reasoningEffort === "max" ? "Maximum reasoning" : info.reasoningEffort}`);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return label ? <p className="ai-engine" aria-label="AI engine">{label}{images && <span>Images: Codex native image generation</span>}</p> : null;
}
