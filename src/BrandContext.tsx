import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getBrandProfile, putBrandProfile } from "./storage";
import { validateBrandContext, type BrandProfile } from "../shared/brand-context.mjs";
import "./brand-context.css";
const Context = createContext<{
  profile?: BrandProfile;
  ready: boolean;
  error: string;
  save: (profile: BrandProfile) => Promise<void>;
  setSaved: (profile?: BrandProfile) => void;
}>({ ready: false, error: "", save: async () => {}, setSaved: () => {} });
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
    <Context.Provider value={{ profile, ready, error, save, setSaved: setProfile }}>
      {children}
    </Context.Provider>
  );
}
export const useBrandProfile = () => useContext(Context);
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
