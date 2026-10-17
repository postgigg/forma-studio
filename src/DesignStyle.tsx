import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Palette } from "lucide-react";
import { Modal } from "./ui";
import { getDesignStyle, putDesignStyle, putBrandAndDesignStyle } from "./storage";
import { DesignStyleContext, useDesignStyle } from "./design-style-context";
import { useBrandProfile } from "./BrandContext";
import { BrandWebsiteImport } from "./BrandWebsiteImport";
import { brandLimits, type BrandProfile } from "../shared/brand-context.mjs";
import {
  designStyles,
  styleOptions,
  craftPreferences,
  craftAvoidances,
  type DesignStyleProfile,
} from "../shared/design-style.mjs";
import "./design-style.css";

const defaults: DesignStyleProfile = {
  styles: ["minimal"],
  enabled: true,
  density: "airy",
  typography: "sans",
  colorMood: "brand",
  details: "",
  avoid: "",
};
const blankBrand: BrandProfile = {
  name: "",
  business: "",
  mission: "",
  audience: "",
  voice: "",
};
const labels: Record<string, string> = {
  airy: "Generous space",
  balanced: "Balanced",
  rich: "Layered detail",
  sans: "Clean sans serif",
  serif: "Expressive serif",
  mixed: "A considered pairing",
  brand: "Follow my brand",
  monochrome: "Monochrome",
  warm: "Warm & natural",
  cool: "Cool & composed",
  vibrant: "Confident color",
};

export function DesignStyleProvider({ children }: { children: ReactNode }) {
  const { ready: brandReady, setSaved: setSavedBrand } = useBrandProfile();
  const [profile, setProfile] = useState<DesignStyleProfile>(),
    [ready, setReady] = useState(false),
    [opened, setOpened] = useState(false),
    [failure, setFailure] = useState("");
  useEffect(() => {
    void getDesignStyle()
      .then(setProfile)
      .catch(() => setFailure("Could not load your design preferences."))
      .finally(() => setReady(true));
  }, []);
  const save = async (value: DesignStyleProfile, brand?: BrandProfile) => {
    if (brand) {
      const saved = await putBrandAndDesignStyle(brand, value);
      setSavedBrand(saved.brand);
      setProfile(saved.style);
    } else {
      await putDesignStyle(value);
      setProfile(value);
    }
    setFailure("");
  };
  return (
    <DesignStyleContext.Provider
      value={{ profile, ready: ready && brandReady, open: () => setOpened(true), save }}
    >
      {children}
      {opened && (
        <StyleOnboarding
          initial={profile || defaults}
          failure={failure}
          onClose={() => setOpened(false)}
          onSave={async (value, brand) => {
            await save(value, brand);
            setOpened(false);
          }}
        />
      )}
    </DesignStyleContext.Provider>
  );
}
export function DesignStyleCard() {
  const { profile, ready, open } = useDesignStyle();
  const { profile: brand, error } = useBrandProfile();
  return (
    <section className="design-style-card">
      <Palette size={22} />
      <h3>{brand?.name || "Your design direction"}</h3>
      {brand?.mission && <p>{brand.mission}</p>}
      <p>
        {profile
          ? `${profile.styles.map((id) => designStyles.find((s) => s.id === id)!.name).join(" + ")} · ${labels[profile.density]}`
          : "Bring your business, mission and design preferences together."}
      </p>
      <button className="secondary full" aria-label="Set up brand and style" onClick={open} disabled={!ready}>
        {profile || brand ? "Edit brand & style" : "Set up brand & style"}
      </button>
      {profile && <small>Design preferences {profile.enabled ? "on" : "off"} for AI</small>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function StyleOnboarding({
  initial,
  failure,
  onClose,
  onSave,
}: {
  initial: DesignStyleProfile;
  failure: string;
  onClose: () => void;
  onSave: (value: DesignStyleProfile, brand: BrandProfile) => Promise<void>;
}) {
  const { profile: brand } = useBrandProfile();
  const [draft, setDraft] = useState<DesignStyleProfile>(() =>
    structuredClone(initial),
  );
  const [business, setBusiness] = useState<BrandProfile>(() => ({
    ...blankBrand,
    ...brand,
  }));
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(failure);
  const titles = [
    "What feels like you?",
    "Find your visual rhythm.",
    "Give your taste a purpose.",
  ];
  const field = (
    key: keyof BrandProfile,
    title: string,
    placeholder: string,
  ) => (
    <label className="style-field">
      <span>{title}</span>
      <textarea
        aria-label={title}
        value={business[key]}
        maxLength={brandLimits[key]}
        rows={key === "mission" ? 3 : 2}
        placeholder={placeholder}
        onChange={(e) => setBusiness({ ...business, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <Modal
      title="Brand & style"
      className="style-onboarding"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="style-onboarding-brand">
        <img src="/brand/forma-logo.svg" alt="Forma Studio" />
        <span>A designer that gets you.</span>
      </div>
      <nav className="style-steps" aria-label="Design style setup steps">
        {["Your style", "The details", "Brand & intent"].map((name, i) => (
          <span key={name} aria-current={i === step ? "step" : undefined}>
            <b>{i < step ? <Check size={14} /> : i + 1}</b>
            {name}
          </span>
        ))}
      </nav>
      <div className="style-onboarding-scroll">
        <h1>{titles[step]}</h1>
        {step === 0 && (
          <>
            <p className="style-intro">
              Choose up to three directions. These are starting points for
              original work, shaped around each brief.
            </p>
            <div className="style-choice-grid">
              {designStyles.map((style) => (
                <button
                  key={style.id}
                  className={`style-choice ${draft.styles.includes(style.id) ? "chosen" : ""}`}
                  aria-pressed={draft.styles.includes(style.id)}
                  aria-label={`${style.name} design style`}
                  onClick={() => {
                    const selected = draft.styles.includes(style.id);
                    if (!selected && draft.styles.length === 3) {
                      setError(
                        "Choose up to three styles. Deselect one to try another.",
                      );
                      return;
                    }
                    setError("");
                    setDraft({
                      ...draft,
                      styles: selected
                        ? draft.styles.filter((id) => id !== style.id)
                        : [...draft.styles, style.id],
                    });
                  }}
                >
                  <div
                    className={`style-sample sample-${style.id}`}
                    aria-hidden="true"
                  >
                    <span>STUDIO COLLECTION</span>
                    <strong>
                      Made for
                      <br />
                      what matters.
                    </strong>
                    <i />
                    <small>A considered point of view.</small>
                  </div>
                  <div className="style-choice-caption">
                    <strong>{style.name}</strong>
                    <i>
                      {draft.styles.includes(style.id) && <Check size={14} />}
                    </i>
                    <p>{style.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <p className="style-intro">
              Choose how your work should feel. The current brief and required
              brand colors always come first.
            </p>
            {(["density", "typography", "colorMood"] as const).map((key) => (
              <fieldset className="style-option-group" key={key}>
                <legend>
                  {key === "density"
                    ? "Space & detail"
                    : key === "typography"
                      ? "Typography"
                      : "Color direction"}
                </legend>
                <div>
                  {styleOptions[key].map((value) => (
                    <button
                      className={draft[key] === value ? "chosen" : ""}
                      aria-pressed={draft[key] === value}
                      key={value}
                      onClick={() => setDraft({ ...draft, [key]: value })}
                    >
                      {labels[value]}
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
            <fieldset className="style-option-group style-preferences">
              <legend>What makes a design feel right to you?</legend>
              <div>
                {craftPreferences.map(choice => (
                  <button
                    key={choice.id}
                    title={choice.description}
                    className={draft.preferences?.includes(choice.id) ? "chosen" : ""}
                    aria-pressed={draft.preferences?.includes(choice.id) || false}
                    onClick={() => setDraft({ ...draft, preferences: draft.preferences?.includes(choice.id) ? draft.preferences.filter(id => id !== choice.id) : [...(draft.preferences || []), choice.id] })}
                  >{choice.name}</button>
                ))}
              </div>
              <textarea
                aria-label="Personal design details"
                value={draft.details}
                maxLength={800}
                rows={3}
                placeholder="Quiet layouts, one strong image, confident typography. Every detail should have a reason."
                onChange={(e) =>
                  setDraft({ ...draft, details: e.target.value })
                }
              />
            </fieldset>
            <fieldset className="style-option-group style-preferences">
              <legend>What should your designer avoid?</legend>
              <div>
                {craftAvoidances.map(choice => (
                  <button
                    key={choice.id}
                    title={choice.description}
                    className={draft.avoidances?.includes(choice.id) ? "chosen" : ""}
                    aria-pressed={draft.avoidances?.includes(choice.id) || false}
                    onClick={() => setDraft({ ...draft, avoidances: draft.avoidances?.includes(choice.id) ? draft.avoidances.filter(id => id !== choice.id) : [...(draft.avoidances || []), choice.id] })}
                  >{choice.name}</button>
                ))}
              </div>
              <textarea
                aria-label="Personal design dislikes"
                value={draft.avoid}
                maxLength={600}
                rows={2}
                placeholder="Crowded compositions, generic gradients, tiny decorative labels…"
                onChange={(e) => setDraft({ ...draft, avoid: e.target.value })}
              />
            </fieldset>
          </>
        )}
        {step === 2 && (
          <>
            <p className="style-intro">
              Your preferences guide the craft. Your business, mission and
              audience guide what the design needs to say.
            </p>
            <div className="style-identity-summary">
              <strong>
                {draft.styles
                  .map((id) => designStyles.find((s) => s.id === id)!.name)
                  .join(" + ")}
              </strong>
              <span>
                {labels[draft.density]} · {labels[draft.typography]} ·{" "}
                {labels[draft.colorMood]}
              </span>
            </div>
            <label className="check-row"><input type="checkbox" aria-label="Use personal design preferences" checked={draft.enabled} onChange={event => setDraft({...draft, enabled:event.target.checked})}/>Use my design preferences for AI</label>
            <BrandWebsiteImport value={business} onApply={fields => setBusiness(current => ({ ...current, ...fields }))} />
            {field("name", "Company name", "Petal Studio")}
            {field(
              "business",
              "What your business does",
              "Seasonal flowers for thoughtful gifts, local delivery and celebrations.",
            )}
            {field(
              "mission",
              "Mission statement",
              "Bring people closer through thoughtful flowers and local grower relationships.",
            )}
            {field(
              "audience",
              "Who you serve",
              "Local gift buyers and people planning meaningful celebrations.",
            )}
            {field(
              "voice",
              "Brand visual style & voice",
              "Minimal, warm and natural. Original photography with generous space.",
            )}
            <p className="style-use-note">
              Used across AI designs, campaigns, photos, refinement and AI
              Pencil. Magic Eraser keeps the existing image style and only
              removes what you mark. Your settings stay on this device and can
              be edited together in Brand.
            </p>
          </>
        )}
        {error && (
          <p className="style-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="style-onboarding-footer">
        <button
          className="secondary"
          disabled={busy}
          onClick={() => (step ? setStep(step - 1) : onClose())}
        >
          <ArrowLeft size={16} />
          {step ? "Back" : "Not now"}
        </button>
        <span>{step + 1} of 3</span>
        <button
          className="primary"
          disabled={busy || !draft.styles.length}
          onClick={async () => {
            if (step < 2) {
              setError("");
              setStep(step + 1);
              return;
            }
            setBusy(true);
            setError("");
            try {
              await onSave(draft, business);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Saving…"
            : step < 2
              ? "Continue"
              : "Save brand & style"}
          <ArrowRight size={16} />
        </button>
      </footer>
    </Modal>
  );
}
