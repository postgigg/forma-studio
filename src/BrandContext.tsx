import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getBrandProfile, putBrandProfile } from "./storage";
import {
  brandLimits,
  validateBrandContext,
  type BrandProfile,
} from "../shared/brand-context.mjs";
import "./brand-context.css";
import { BrandWebsiteImport } from "./BrandWebsiteImport";
const empty: BrandProfile = {
  name: "",
  business: "",
  mission: "",
  audience: "",
  voice: "",
};
const Context = createContext<{
  profile?: BrandProfile;
  ready: boolean;
  error: string;
  save: (profile: BrandProfile) => Promise<void>;
}>({ ready: false, error: "", save: async () => {} });
export function BrandProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<BrandProfile>(),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    void getBrandProfile()
      .then(setProfile)
      .catch(() => setError("Could not load your saved brand profile."))
      .finally(() => setReady(true));
  }, []);
  const save = async (value: BrandProfile) => {
    const next = validateBrandContext(value);
    await putBrandProfile(next);
    setProfile(next);
    setError("");
  };
  return (
    <Context.Provider value={{ profile, ready, error, save }}>
      {children}
    </Context.Provider>
  );
}
export const useBrandProfile = () => useContext(Context);
export function BrandProfileEditor() {
  const { profile, ready, error, save } = useBrandProfile();
  const [draft, setDraft] = useState<BrandProfile>(profile || empty),
    [status, setStatus] = useState(""),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => setDraft(profile || empty), [profile]);
  const field = (
    key: keyof BrandProfile,
    label: string,
    placeholder: string,
    rows = 2,
  ) => (
    <label className="field" key={key}>
      <span>{label}</span>
      {key === "name" ? (
        <input
          aria-label={label}
          value={draft[key]}
          maxLength={brandLimits[key]}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft({ ...draft, [key]: e.target.value });
            setStatus("");
          }}
        />
      ) : (
        <textarea
          aria-label={label}
          rows={rows}
          maxLength={brandLimits[key]}
          value={draft[key]}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft({ ...draft, [key]: e.target.value });
            setStatus("");
          }}
        />
      )}
    </label>
  );
  return (
    <form
      className="brand-profile-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setFailure("");
        try {
          await save(draft);
          setStatus("Brand profile saved on this device.");
        } catch (e) {
          setFailure((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Your business & mission</h3>
      <p>
        Give AI a clear sense of who you are and what your designs should
        express.
      </p>
      <BrandWebsiteImport value={draft} onApply={fields => { setDraft(current => ({ ...current, ...fields })); setStatus(""); }} />
      {field("name", "Company name", "Petal Studio")}
      {field(
        "business",
        "What your business does",
        "A neighborhood florist selling seasonal bouquets, subscriptions and event flowers.",
      )}
      {field(
        "mission",
        "Mission statement",
        "Bring people closer through thoughtful, seasonal flowers and local grower relationships.",
        3,
      )}
      {field(
        "audience",
        "Who you serve",
        "Thoughtful gift buyers, local families and small businesses.",
      )}
      {field(
        "voice",
        "Visual style & voice",
        "Warm, natural and considered. Botanical details; avoid generic corporate graphics.",
      )}
      <button className="primary full" disabled={!ready || busy} type="submit">
        {busy ? "Saving…" : "Save brand profile"}
      </button>
      <small>
        Used by AI Designer, refinement, AI Pencil, Magic Eraser and photo
        creation. You can turn it off for an individual request.
      </small>
      {!!status && <p role="status">{status}</p>}
      {!!(failure || error) && <p role="alert">{failure || error}</p>}
    </form>
  );
}
export function useBrandGuidance(disabled = false) {
  const { profile } = useBrandProfile();
  const [enabled, setEnabled] = useState(true);
  return {
    brandContext: enabled ? profile : undefined,
    control: profile ? (
      <label className="brand-guidance check-row">
        <input
          type="checkbox"
          aria-label="Use brand context"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>
          Use brand context
          <small>{profile.name || "Saved business purpose and mission"}</small>
        </span>
      </label>
    ) : null,
  };
}
