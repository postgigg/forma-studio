import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderOpen,
  ImagePlus,
  Megaphone,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { Modal } from "./ui";
import { Editor } from "./editor";
import {
  allDesigns,
  getBrandProfile,
  getSavedBrand,
  getDesignStyle,
  saveDesign,
} from "./storage";
import { designerRequest } from "./ai";
import { uid, type Asset, type Design } from "./types";
import {
  allCampaigns,
  campaignFormats,
  campaignFolderFormats,
  campaignFormatProblem,
  campaignImage,
  emptyFolder,
  makeBatch,
  readCampaignDraft,
  runCampaignBatch,
  saveCampaign,
  updateCampaign,
  writeCampaignDraft,
  type Campaign,
  type CampaignFolder,
  type CustomCampaignFormat,
} from "./campaigns";
import "./campaigns.css";

type Wizard = {
  campaign: Campaign;
  folder: CampaignFolder;
  step: number;
  existing: boolean;
};
const steps = ["Campaign", "Folder intent", "Designs & images", "Review"];
const guides = [
  [
    "Start with the outcome.",
    "Name the change you want to create: bookings, a launch, store visits, awareness, or a conversation.",
    "A specific audience and a concrete objective give every folder a shared direction.",
  ],
  [
    "One folder. One purpose.",
    "A folder is a subcampaign. Give it a focused message that supports the parent objective.",
    "For a flower-shop launch: separate wedding enquiries, weekly bouquets, and local delivery.",
  ],
  [
    "Choose what you need.",
    "Choose social posts, print, ads, presentations or custom sizes. Upload the actual products, people, or brand images to include.",
    "Each graphic gets its own composition. Typography and color connect the collection.",
  ],
  [
    "Brief it. Then build it.",
    "The AI reads both objectives, designs each platform at its own dimensions, and saves editable results here.",
    "Review the copy and imagery before publishing. You control the final result.",
  ],
];
export function CampaignStudio({
  editor,
  brand,
  brandLogo,
  onClose,
  onAISetup,
}: {
  editor: Editor;
  brand: string[];
  brandLogo: Asset | null;
  onClose: () => void;
  onAISetup: () => void;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [campaignId, setCampaignId] = useState(editor.doc.campaignId || "");
  const [folderId, setFolderId] = useState(editor.doc.folderId || "");
  const [wizard, setWizard] = useState<Wizard | null>(null);
  const [draft, setDraft] = useState<Wizard | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [moveId, setMoveId] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const refresh = async () => {
    const [c, d] = await Promise.all([allCampaigns(), allDesigns()]);
    setCampaigns(c);
    setDesigns(d);
  };
  const connect = async () => {
    try {
      setConnected(Boolean((await designerRequest("/session")).ready));
    } catch {
      setConnected(false);
    }
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    void connect();
    void readCampaignDraft<Wizard>().then(setDraft);
    const update = () => void refresh().catch((e) => setError(e.message));
    window.addEventListener("forma:campaigns", update);
    return () => window.removeEventListener("forma:campaigns", update);
  }, []);
  useEffect(() => {
    if (!wizard) return;
    const timer = setTimeout(() => {
      void writeCampaignDraft(wizard).catch((e) => setError(e.message));
      setDraft(wizard);
    }, 250);
    return () => clearTimeout(timer);
  }, [wizard]);
  const campaign = campaigns.find((c) => c.id === campaignId);
  const folder = campaign?.folders.find((f) => f.id === folderId);
  const start = async (parent?: Campaign, current?: CampaignFolder) => {
    setError("");
    const [profile, savedPalette] = await Promise.all([getBrandProfile(), getSavedBrand()]);
    setWizard({
      campaign: structuredClone(
        parent || {
          id: uid(),
          name: "",
          objective: "",
          audience: profile?.audience || "",
          style: profile?.voice || "",
          brand: profile,
          palette: savedPalette || [],
          ...(brandLogo ? { logo: brandLogo } : {}),
          updatedAt: new Date().toISOString(),
          folders: [],
        },
      ),
      folder: structuredClone(current || emptyFolder()),
      step: parent ? 1 : 0,
      existing: Boolean(parent),
    });
  };
  const updateParent = (
    key: "name" | "objective" | "audience" | "style",
    value: string,
  ) =>
    setWizard((w) => w && { ...w, campaign: { ...w.campaign, [key]: value } });
  const updateFolder = (patch: Partial<CampaignFolder>) =>
    setWizard((w) => w && { ...w, folder: { ...w.folder, ...patch } });
  const updateCustom = (id: string, patch: Partial<CustomCampaignFormat>) => {
    if (wizard)
      updateFolder({
        customFormats: (wizard.folder.customFormats || []).map((f) =>
          f.id === id ? { ...f, ...patch } : f,
        ),
      });
  };
  const leaveWizard = async (closeDialog = false) => {
    try {
      if (wizard) {
        await writeCampaignDraft(wizard);
        setDraft(wizard);
      }
      setWizard(null);
      if (closeDialog) onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const total = wizard
    ? campaignFolderFormats(wizard.folder).reduce((a, f) => a + f.count, 0)
    : 0;
  const formatProblem = wizard ? campaignFormatProblem(wizard.folder) : "";
  const valid = !wizard
    ? false
    : wizard.step === 0
      ? wizard.campaign.name.trim().length > 0 &&
        wizard.campaign.objective.trim().length >= 8 &&
        wizard.campaign.audience.trim().length > 0
      : wizard.step === 1
        ? wizard.folder.name.trim().length > 0 &&
          wizard.folder.intent.trim().length >= 8
        : !formatProblem &&
          total > 0 &&
          (!wizard.folder.generatePhoto || wizard.folder.images.length < 4);
  const finish = async (generate: boolean) => {
    if (!wizard) return;
    setBusy(true);
    setError("");
    try {
      const c = structuredClone(wizard.campaign),
        f = structuredClone(wizard.folder);
      const batch = generate ? makeBatch(c, f, await getDesignStyle()) : null;
      if (batch) f.batches.push(batch);
      if (wizard.existing)
        await updateCampaign(c.id, (current) => {
          const old = current.folders.find((x) => x.id === f.id);
          if (old?.batches.some((b) => b.status === "running"))
            throw new Error(
              "Wait for this folder’s running batch before changing its brief.",
            );
          // Use the latest completed history, not the wizard's earlier snapshot.
          f.batches = [...(old?.batches || []), ...(batch ? [batch] : [])];
          current.folders = [
            ...current.folders.filter((x) => x.id !== f.id),
            f,
          ];
          current.name = c.name;
          current.objective = c.objective;
          current.audience = c.audience;
          current.style = c.style;
        });
      else {
        c.folders = [f];
        c.updatedAt = new Date().toISOString();
        await saveCampaign(c);
      }
      setCampaignId(c.id);
      setFolderId(f.id);
      setWizard(null);
      setDraft(null);
      await writeCampaignDraft(null);
      await refresh();
      if (batch) void runCampaignBatch(c.id, f.id, batch.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const moveDesign = async () => {
    if (!campaign || !folder || !moveId) return;
    setBusy(true);
    try {
      if (moveId === editor.doc.id) {
        editor.doc.campaignId = campaign.id;
        editor.doc.folderId = folder.id;
        editor.commit();
        await editor.save();
      } else {
        const d = designs.find((d) => d.id === moveId);
        if (!d) throw new Error("That design is no longer available.");
        await saveDesign({
          ...d,
          campaignId: campaign.id,
          folderId: folder.id,
          updatedAt: new Date().toISOString(),
        });
      }
      setMoveId("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const field = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    placeholder: string,
    maxLength: number,
    multiline = false,
  ) => (
    <label className="campaign-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={3}
        />
      ) : (
        <input
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
        />
      )}
    </label>
  );
  return (
    <Modal
      title="Campaign studio"
      className="campaign-studio"
      onClose={() => void leaveWizard(true)}
    >
      <div className="campaign-brand">
        <img src="/brand/forma-mark.svg" alt="" />
        <img src="/brand/forma-wordmark.svg" alt="Forma" />
        <span>Campaign studio</span>
      </div>
      {error && (
        <div className="campaign-error" role="alert">
          {error}
          <button
            aria-label="Dismiss campaign error"
            onClick={() => setError("")}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {wizard ? (
        <div className="campaign-wizard">
          <aside className="campaign-guide">
            <div className="campaign-step-number">0{wizard.step + 1}</div>
            <h2>{guides[wizard.step][0]}</h2>
            <p>{guides[wizard.step][1]}</p>
            <div className="campaign-guide-note">{guides[wizard.step][2]}</div>
            <div className="campaign-guide-art" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          </aside>
          <div className="campaign-wizard-main">
            <nav className="campaign-steps" aria-label="Campaign setup steps">
              {steps.map((name, i) => (
                <span
                  key={name}
                  aria-current={wizard.step === i ? "step" : undefined}
                  className={i <= wizard.step ? "reached" : ""}
                >
                  <b>{i < wizard.step ? <Check size={15} /> : i + 1}</b>
                  {name}
                </span>
              ))}
            </nav>
            <div className="campaign-step-body" key={wizard.step}>
              {wizard.step === 0 && (
                <>
                  <h2>What are we creating?</h2>
                  {field(
                    "Campaign name",
                    wizard.campaign.name,
                    (v) => updateParent("name", v),
                    "Spring at Petal & Stem",
                    120,
                  )}
                  {field(
                    "Campaign objective",
                    wizard.campaign.objective,
                    (v) => updateParent("objective", v),
                    "Introduce our local flower delivery and encourage first-time orders.",
                    600,
                    true,
                  )}
                  {field(
                    "Campaign audience",
                    wizard.campaign.audience,
                    (v) => updateParent("audience", v),
                    "People buying thoughtful gifts in our neighborhood",
                    500,
                  )}
                  {field(
                    "Visual direction",
                    wizard.campaign.style,
                    (v) => updateParent("style", v),
                    "Modern botanical photography, generous white space, editorial type.",
                    500,
                  )}
                  {wizard.campaign.brand && (
                    <div className="campaign-parent">
                      <strong>
                        {wizard.campaign.brand.name || "Your brand"}
                      </strong>
                      <p>
                        {wizard.campaign.brand.mission ||
                          wizard.campaign.brand.business}
                      </p>
                      <span>
                        Saved brand intent and mission will guide this campaign.
                      </span>
                    </div>
                  )}
                  <label className="check-row">
                    <input type="checkbox" aria-label="Use my brand palette for this campaign" checked={wizard.campaign.palette.length > 0} onChange={event => setWizard(current => current && { ...current, campaign: { ...current.campaign, palette: event.target.checked ? brand : [] } })} />
                    Use my brand palette
                  </label>
                </>
              )}
              {wizard.step === 1 && (
                <>
                  <h2>Give this folder a purpose.</h2>
                  <div className="campaign-parent">
                    <strong>{wizard.campaign.name}</strong>
                    <p>{wizard.campaign.objective}</p>
                  </div>
                  {field(
                    "Folder name",
                    wizard.folder.name,
                    (v) => updateFolder({ name: v }),
                    "Mother’s Day bouquets",
                    120,
                  )}
                  {field(
                    "Folder intent",
                    wizard.folder.intent,
                    (v) => updateFolder({ intent: v }),
                    "Show the care in our hand-tied bouquets and invite people to order a gift for Mum.",
                    600,
                    true,
                  )}
                  {field(
                    "Required message and facts",
                    wizard.folder.message,
                    (v) => updateFolder({ message: v }),
                    "Exact offer, product names, dates, or copy that must appear.",
                    800,
                    true,
                  )}
                  {field(
                    "Call to action",
                    wizard.folder.cta,
                    (v) => updateFolder({ cta: v }),
                    "Explore the bouquet collection",
                    240,
                  )}
                  {field(
                    "What to avoid",
                    wizard.folder.avoid,
                    (v) => updateFolder({ avoid: v }),
                    "No invented prices, generic floral icons, or crowded layouts.",
                    600,
                  )}
                </>
              )}
              {wizard.step === 2 && (
                <>
                  <h2>Build your design collection.</h2>
                  <p className="campaign-intro">
                    Choose how many original designs you need for each format.
                  </p>
                  {[...new Set(campaignFormats.map((f) => f.category))].map(
                    (category) => (
                      <fieldset
                        className="campaign-format-group"
                        key={category}
                      >
                        <legend>{category}</legend>
                        <div className="campaign-format-grid">
                          {campaignFormats
                            .filter((f) => f.category === category)
                            .map((format) => (
                              <label
                                className={`campaign-format ${wizard.folder.counts[format.id] ? "chosen" : ""}`}
                                key={format.id}
                              >
                                <span
                                  className={`campaign-format-icon ${format.shape}`}
                                  aria-hidden="true"
                                />
                                <strong>{format.name}</strong>
                                <small>
                                  {format.width} × {format.height} px
                                </small>
                                <span className="campaign-count">
                                  <span>Designs</span>
                                  <input
                                    type="number"
                                    aria-label={`${format.name} count`}
                                    min={0}
                                    max={6}
                                    value={wizard.folder.counts[format.id] ?? 0}
                                    onChange={(e) => {
                                      const count = e.target.valueAsNumber;
                                      updateFolder({
                                        counts: {
                                          ...wizard.folder.counts,
                                          [format.id]: Number.isFinite(count)
                                            ? Math.max(
                                                0,
                                                Math.min(6, Math.trunc(count)),
                                              )
                                            : 0,
                                        },
                                      });
                                    }}
                                  />
                                </span>
                              </label>
                            ))}
                        </div>
                      </fieldset>
                    ),
                  )}
                  <section
                    className="campaign-custom-formats"
                    aria-label="Custom sizes"
                  >
                    <header>
                      <h3>Custom sizes</h3>
                      <button
                        className="secondary"
                        disabled={
                          (wizard.folder.customFormats?.length || 0) >= 6
                        }
                        onClick={() =>
                          updateFolder({
                            customFormats: [
                              ...(wizard.folder.customFormats || []),
                              {
                                id: `custom:${uid()}`,
                                name: `Custom design ${(wizard.folder.customFormats?.length || 0) + 1}`,
                                width: 1200,
                                height: 1200,
                                count: 1,
                              },
                            ],
                          })
                        }
                      >
                        <Plus size={16} />
                        Add custom size
                      </button>
                    </header>
                    <p>
                      Set exact dimensions in pixels. From 256 to 4,096 px per
                      side, up to 12 megapixels.
                    </p>
                    {(wizard.folder.customFormats || []).map((format, i) => (
                      <div className="campaign-custom-row" key={format.id}>
                        <label className="custom-name">
                          Name
                          <input
                            aria-label={`Custom size ${i + 1} name`}
                            value={format.name}
                            maxLength={80}
                            onChange={(e) =>
                              updateCustom(format.id, { name: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Width (px)
                          <input
                            aria-label={`Custom size ${i + 1} width (px)`}
                            type="number"
                            min={256}
                            max={4096}
                            step={1}
                            value={format.width || ""}
                            onChange={(e) =>
                              updateCustom(format.id, {
                                width: e.target.valueAsNumber || 0,
                              })
                            }
                          />
                        </label>
                        <span aria-hidden="true">×</span>
                        <label>
                          Height (px)
                          <input
                            aria-label={`Custom size ${i + 1} height (px)`}
                            type="number"
                            min={256}
                            max={4096}
                            step={1}
                            value={format.height || ""}
                            onChange={(e) =>
                              updateCustom(format.id, {
                                height: e.target.valueAsNumber || 0,
                              })
                            }
                          />
                        </label>
                        <label>
                          Designs
                          <input
                            aria-label={`Custom size ${i + 1} count`}
                            type="number"
                            min={0}
                            max={6}
                            value={format.count}
                            onChange={(e) =>
                              updateCustom(format.id, {
                                count: Math.max(
                                  0,
                                  Math.min(
                                    6,
                                    Math.trunc(e.target.valueAsNumber || 0),
                                  ),
                                ),
                              })
                            }
                          />
                        </label>
                        <button
                          className="text-button"
                          aria-label={`Remove custom size ${i + 1}`}
                          onClick={() =>
                            updateFolder({
                              customFormats:
                                wizard.folder.customFormats!.filter(
                                  (f) => f.id !== format.id,
                                ),
                            })
                          }
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ))}
                  </section>
                  {formatProblem && (
                    <p className="campaign-format-problem" role="alert">
                      {formatProblem}
                    </p>
                  )}
                  <div className="campaign-upload">
                    <h3>Your images, in the work.</h3>
                    <p>
                      Upload up to four product, people, or brand images. They
                      stay as separate image layers.
                    </p>
                    <label className="campaign-upload-button">
                      <ImagePlus size={20} />
                      Choose images
                      <input
                        type="file"
                        aria-label="Upload campaign images"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        disabled={busy}
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          e.target.value = "";
                          setBusy(true);
                          setError("");
                          try {
                            if (
                              files.length +
                                wizard.folder.images.length +
                                Number(wizard.folder.generatePhoto) >
                              4
                            )
                              throw new Error(
                                "Use up to four images, including a generated photo.",
                              );
                            const added = await Promise.all(
                              files.map(campaignImage),
                            );
                            updateFolder({
                              images: [...wizard.folder.images, ...added],
                            });
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />
                    </label>
                    <div className="campaign-image-grid">
                      {wizard.folder.images.map((image) => (
                        <figure key={image.id}>
                          <img src={image.src} alt={image.name} />
                          <figcaption>{image.name}</figcaption>
                          <button
                            aria-label={`Remove image ${image.name}`}
                            onClick={() =>
                              updateFolder({
                                images: wizard.folder.images.filter(
                                  (i) => i.id !== image.id,
                                ),
                              })
                            }
                          >
                            <X size={16} />
                          </button>
                        </figure>
                      ))}
                    </div>
                  </div>
                  <label className="campaign-photo-option">
                    <input
                      type="checkbox"
                      checked={wizard.folder.generatePhoto}
                      disabled={wizard.folder.images.length >= 4}
                      onChange={(e) =>
                        updateFolder({ generatePhoto: e.target.checked })
                      }
                    />
                    <span>
                      <strong>Create a campaign photo with AI</strong>
                      <small>
                        Generate one relevant image, then use it across the
                        collection.
                      </small>
                    </span>
                  </label>
                  {wizard.folder.generatePhoto &&
                    field(
                      "Campaign photo direction",
                      wizard.folder.photoPrompt,
                      (v) => updateFolder({ photoPrompt: v }),
                      "Our bouquet on a sunlit table, natural editorial photography, room for the headline.",
                      600,
                      true,
                    )}
                </>
              )}
              {wizard.step === 3 && (
                <>
                  <h2>
                    {total} design{total === 1 ? "" : "s"}. One clear direction.
                  </h2>
                  <div className="campaign-review">
                    <div>
                      <span>Campaign objective</span>
                      <h3>{wizard.campaign.name}</h3>
                      <p>{wizard.campaign.objective}</p>
                    </div>
                    <div>
                      <span>Subcampaign folder</span>
                      <h3>{wizard.folder.name}</h3>
                      <p>{wizard.folder.intent}</p>
                    </div>
                    <div className="campaign-review-formats">
                      {campaignFolderFormats(wizard.folder)
                        .filter((f) => f.count > 0)
                        .map((f) => (
                          <span key={f.id}>
                            <b>{f.count}</b>
                            {f.name} · {f.width} × {f.height} px
                          </span>
                        ))}
                    </div>
                    {wizard.folder.message && (
                      <div>
                        <span>Required copy</span>
                        <p>{wizard.folder.message}</p>
                      </div>
                    )}
                    {wizard.folder.cta && (
                      <div>
                        <span>Call to action</span>
                        <p>{wizard.folder.cta}</p>
                      </div>
                    )}
                    <div>
                      <span>Image direction</span>
                      <p>
                        {wizard.folder.images.length} uploaded image
                        {wizard.folder.images.length === 1 ? "" : "s"}
                        {wizard.folder.generatePhoto
                          ? " + one AI campaign photo"
                          : ""}
                        .{" "}
                        {wizard.campaign.style ||
                          "Art direction based on the campaign brief."}
                      </p>
                    </div>
                  </div>
                  <div className="campaign-connection">
                    <i className={connected ? "online" : ""} />
                    <span>
                      {connected
                        ? "Your AI designer is connected."
                        : "Connect your AI account to create this collection."}
                    </span>
                    {!connected && (
                      <>
                        <button
                          className="text-button"
                          onClick={() => void connect()}
                        >
                          Reconnect
                        </button>
                        <button
                          className="text-button"
                          onClick={async () => {
                            if (wizard) await writeCampaignDraft(wizard);
                            onAISetup();
                          }}
                        >
                          AI account
                        </button>
                      </>
                    )}
                  </div>
                  <p className="campaign-intro">
                    Create generates each selected format and saves every
                    editable design in this folder. Your provider’s AI usage
                    applies.
                  </p>
                </>
              )}
            </div>
            <footer className="campaign-wizard-footer">
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  wizard.step > 0
                    ? setWizard({ ...wizard, step: wizard.step - 1 })
                    : void leaveWizard()
                }
              >
                <ArrowLeft size={17} />
                {wizard.step ? "Back" : "Save draft & close"}
              </button>
              <span>Saved on this device</span>
              {wizard.step === 3 ? (
                <>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void finish(false)}
                  >
                    Save folder
                  </button>
                  <button
                    className="primary"
                    disabled={busy || !connected || !valid}
                    onClick={() => void finish(true)}
                  >
                    <Sparkles size={17} />
                    {busy
                      ? "Saving…"
                      : `Create ${total} design${total === 1 ? "" : "s"}`}
                  </button>
                </>
              ) : (
                <button
                  className="primary"
                  disabled={!valid || busy}
                  onClick={() =>
                    setWizard({ ...wizard, step: wizard.step + 1 })
                  }
                >
                  Continue
                  <ArrowRight size={17} />
                </button>
              )}
            </footer>
          </div>
        </div>
      ) : (
        <div className="campaign-workspace">
          <aside className="campaign-navigation">
            <button className="primary full" onClick={() => void start()}>
              <Plus size={18} />
              New campaign
            </button>
            <h2>Your campaigns</h2>
            {campaigns.map((c) => (
              <button
                key={c.id}
                className={c.id === campaignId ? "selected" : ""}
                onClick={() => {
                  setCampaignId(c.id);
                  setFolderId("");
                }}
              >
                <Megaphone size={18} />
                <span>
                  {c.name}
                  <small>
                    {c.folders.length} folder{c.folders.length === 1 ? "" : "s"}
                  </small>
                </span>
              </button>
            ))}
            <button
              className="campaign-guide-toggle"
              onClick={() => setShowGuide(!showGuide)}
            >
              <Sparkles size={18} />
              AI campaign guide
            </button>
            {draft && (
              <button onClick={() => setWizard(draft)}>
                <ArrowRight size={18} />
                Continue saved brief
              </button>
            )}
          </aside>
          <div className="campaign-content">
            {showGuide && (
              <section className="campaign-help">
                <button
                  aria-label="Close campaign guide"
                  onClick={() => setShowGuide(false)}
                >
                  <X size={18} />
                </button>
                <h2>A good brief builds a better campaign.</h2>
                <div>
                  <article>
                    <b>01</b>
                    <h3>Set the shared objective.</h3>
                    <p>
                      Describe the business, audience and outcome. Your saved
                      brand mission provides context.
                    </p>
                  </article>
                  <article>
                    <b>02</b>
                    <h3>Focus each folder.</h3>
                    <p>
                      Give each subcampaign its own message, exact facts and
                      action. Upload the actual images to use.
                    </p>
                  </article>
                  <article>
                    <b>03</b>
                    <h3>Create, review, refine.</h3>
                    <p>
                      Choose formats and quantities. The AI makes editable
                      designs; you review them and refine individual layers.
                    </p>
                  </article>
                </div>
              </section>
            )}
            {!campaign ? (
              <section className="campaign-empty">
                <h1>
                  Make your next
                  <br />
                  campaign happen.
                </h1>
                <p>
                  Start with an objective. Focus it into folders.
                  <br />
                  Create designs for every place your message belongs.
                </p>
                <button className="primary" onClick={() => void start()}>
                  <Plus size={18} />
                  Create a campaign
                </button>
                <div className="campaign-empty-art" aria-hidden="true">
                  <div>Instagram</div>
                  <div>Facebook</div>
                  <div>LinkedIn</div>
                </div>
              </section>
            ) : (
              <>
                <header className="campaign-content-heading">
                  <div>
                    {folder && (
                      <button
                        className="text-button"
                        onClick={() => setFolderId("")}
                      >
                        <ArrowLeft size={16} />
                        {campaign.name}
                      </button>
                    )}
                    <h1>{folder?.name || campaign.name}</h1>
                    <p>{folder?.intent || campaign.objective}</p>
                    {folder && (
                      <div className="campaign-inherits">
                        Campaign objective: {campaign.objective}
                      </div>
                    )}
                  </div>
                  <button
                    className="primary"
                    onClick={() => void start(campaign)}
                  >
                    <Plus size={17} />
                    New folder
                  </button>
                </header>
                {!folder ? (
                  <div className="campaign-folder-grid">
                    {campaign.folders.map((f) => (
                      <button
                        className="campaign-folder-card"
                        key={f.id}
                        onClick={() => setFolderId(f.id)}
                      >
                        <FolderOpen size={36} />
                        <h2>{f.name}</h2>
                        <p>{f.intent}</p>
                        <span>
                          {
                            designs.filter(
                              (d) =>
                                d.campaignId === campaign.id &&
                                d.folderId === f.id,
                            ).length
                          }{" "}
                          designs
                          <ArrowRight size={20} />
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="campaign-folder-actions">
                      <button
                        className="primary"
                        disabled={folder.batches.some(
                          (b) => b.status === "running",
                        )}
                        onClick={() => void start(campaign, folder)}
                      >
                        <Sparkles size={18} />
                        Create designs
                      </button>
                      <div>
                        <select
                          aria-label="Move existing design to folder"
                          value={moveId}
                          onChange={(e) => setMoveId(e.target.value)}
                        >
                          <option value="">Add an existing design…</option>
                          {designs
                            .filter(
                              (d) =>
                                d.folderId !== folder.id ||
                                d.campaignId !== campaign.id,
                            )
                            .map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                        </select>
                        <button
                          className="secondary"
                          disabled={!moveId || busy}
                          onClick={() => void moveDesign()}
                        >
                          Move to folder
                        </button>
                      </div>
                    </div>
                    {folder.batches
                      .slice()
                      .reverse()
                      .map((batch) => (
                        <section
                          className="campaign-batch"
                          key={batch.id}
                          aria-label="Campaign generation progress"
                        >
                          <header>
                            <h2>
                              {batch.status === "completed"
                                ? "Your collection is ready"
                                : batch.status === "running"
                                  ? "Creating your collection"
                                  : batch.status === "paused"
                                    ? "Collection paused"
                                    : "This collection needs attention"}
                            </h2>
                            <span>
                              {batch.tasks
                                .filter(
                                  (t) =>
                                    t.status === "completed" &&
                                    t.channel !== "photo",
                                )
                                .reduce((n, t) => n + t.count, 0)}{" "}
                              /{" "}
                              {batch.tasks
                                .filter((t) => t.channel !== "photo")
                                .reduce((n, t) => n + t.count, 0)}{" "}
                              designs
                            </span>
                          </header>
                          <div className="campaign-task-list">
                            {batch.tasks.map((task) => (
                              <div key={task.id}>
                                <i className={task.status}>
                                  {task.status === "completed" ? (
                                    <Check size={15} />
                                  ) : task.status === "running" ? (
                                    <span className="spinner" />
                                  ) : null}
                                </i>
                                <strong>
                                  {task.channel === "photo"
                                    ? "Campaign photo"
                                    : task.format?.name ||
                                      campaignFormats.find(
                                        (f) => f.id === task.channel,
                                      )?.name ||
                                      "Custom design"}
                                </strong>
                                <span>{task.stage || "Waiting"}</span>
                              </div>
                            ))}
                          </div>
                          {batch.error && <p role="alert">{batch.error}</p>}
                          {batch.status === "running" ? (
                            <button
                              className="text-button"
                              disabled={batch.pauseRequested}
                              onClick={() =>
                                void updateCampaign(campaign.id, (c) => {
                                  c.folders
                                    .find((f) => f.id === folder.id)!
                                    .batches.find(
                                      (b) => b.id === batch.id,
                                    )!.pauseRequested = true;
                                })
                              }
                            >
                              {batch.pauseRequested
                                ? "Pausing after the current format…"
                                : "Pause after current format"}
                            </button>
                          ) : (
                            batch.status !== "completed" && (
                              <button
                                className="secondary"
                                onClick={() =>
                                  void runCampaignBatch(
                                    campaign.id,
                                    folder.id,
                                    batch.id,
                                  )
                                }
                              >
                                Resume collection
                              </button>
                            )
                          )}
                        </section>
                      ))}
                    <div className="campaign-design-grid">
                      {designs
                        .filter(
                          (d) =>
                            d.campaignId === campaign.id &&
                            d.folderId === folder.id,
                        )
                        .map((d) => (
                          <article key={d.id}>
                            <button
                              onClick={async () => {
                                try {
                                  await editor.open(d);
                                  onClose();
                                } catch (e) {
                                  setError((e as Error).message);
                                }
                              }}
                            >
                              <div>
                                <img src={d.pages[0].thumbnail} alt={d.name} />
                              </div>
                              <h3>{d.name}</h3>
                              <span>
                                {d.width} × {d.height} · {d.pages.length} page
                                {d.pages.length === 1 ? "" : "s"}
                              </span>
                            </button>
                          </article>
                        ))}
                    </div>
                    {!designs.some(
                      (d) =>
                        d.campaignId === campaign.id &&
                        d.folderId === folder.id,
                    ) &&
                      !folder.batches.length && (
                        <div className="campaign-folder-empty">
                          <FolderOpen size={46} />
                          <h2>A home for this part of the story.</h2>
                          <p>
                            Create a collection with AI, or move an existing
                            design into this folder.
                          </p>
                        </div>
                      )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
