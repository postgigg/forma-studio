import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  CloudUpload,
  ImagePlus,
  MousePointer2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Editor } from "./editor";
import { DrawingPanel } from "./DrawingPanel";
import { colors, type Asset } from "./types";
import { useFontLibrary, fontLabel } from "./font-library";
import { TextLibrary } from "./TextLibrary";
import { templates } from "./templates";
import { Field, IconButton, TemplatePreview } from "./ui";
import catalog from "../shared/assets.json";
import { graphics, GraphicPreview } from "./graphics";
import { PhotoCreator } from "./PhotoCreator";
import { PhotoFrameLibrary } from "./PhotoFrames";
import "./studio-library.css";
import { BrandProfileEditor, useBrandProfile } from "./BrandContext";
import { DesignStyleCard } from "./DesignStyle";
import { brandAffinity } from "../shared/brand-context.mjs";

export type Panel =
  | "design"
  | "elements"
  | "frames"
  | "solids"
  | "charts"
  | "ai"
  | "text"
  | "uploads"
  | "photos"
  | "brand"
  | "draw";
export const photos = [
  { src: "/photos/plants.jpg", name: "Greenhouse morning" },
  { src: "/photos/coast.jpg", name: "Somewhere by the water" },
  { src: "/photos/interior.jpg", name: "Quiet corners" },
];
export const shapes = [
  "rectangle",
  "rounded",
  "circle",
  "ellipse",
  "triangle",
  "star",
  "heart",
  "arrow",
  "line",
];
export function Sidebar({
  panel,
  editor,
  run,
  assets,
  onUpload,
  onDeleteAsset,
  brand,
  onBrand,
  onGeneratedImage,
  brandLogo,
  onBrandLogo,
}: {
  panel: Panel;
  editor: Editor;
  run: (fn: () => unknown) => void;
  assets: Asset[];
  onUpload: (files: FileList | File[]) => void;
  onDeleteAsset: (id: string) => void;
  brand: string[];
  onBrand: (colors: string[]) => void;
  onGeneratedImage: (asset: Asset) => Promise<void>;
  brandLogo: Asset | null;
  onBrandLogo: (file: File | null) => void;
}) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("All"),
    [occasion, setOccasion] = useState("All occasions"),
    [templateSize, setTemplateSize] = useState(false),
    [elementCategory, setElementCategory] = useState("All");
  const { profile: brandProfile } = useBrandProfile();
  const { families: fonts } = useFontLibrary();
  const [brandRelevant, setBrandRelevant] = useState(true);
  const relevance = (item: {
    name: string;
    description?: string;
    collection?: string;
    theme?: string;
  }) =>
    brandRelevant
      ? brandAffinity(
          `${item.name} ${item.description || ""} ${item.collection || ""} ${item.theme || ""}`,
          brandProfile,
        )
      : 0;
  const input = useRef<HTMLInputElement>(null);
  const [stickerTheme, setStickerTheme] = useState("All themes"),
    [stickerLimit, setStickerLimit] = useState(12);
  const [graphicCollection, setGraphicCollection] = useState("All collections"),
    [graphicLimit, setGraphicLimit] = useState(24),
    [brandGraphics, setBrandGraphics] = useState(false);
  const graphicCollections = [
    ...new Set(graphics.map((g) => g.collection || "Studio essentials")),
  ];
  const filteredGraphics = graphics
    .filter(
      (g) =>
        (graphicCollection === "All collections" ||
          (g.collection || "Studio essentials") === graphicCollection) &&
        `${g.name} ${g.collection || ""} ${g.description || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        relevance(b) - relevance(a) ||
        Number(!!b.collection) - Number(!!a.collection),
    );
  const stickers: {
    id: string;
    name: string;
    src: string;
    description: string;
    theme?: string;
  }[] = catalog.filter((a) => a.category === "AI stickers");
  const themes = [
    ...new Set(stickers.map((a) => a.theme).filter(Boolean)),
  ] as string[];
  const filteredStickers = stickers.filter(
    (a) =>
      (stickerTheme === "All themes" || a.theme === stickerTheme) &&
      `${a.name} ${a.description} ${a.theme || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  filteredStickers.sort((a, b) => relevance(b) - relevance(a));
  useEffect(() => {
    setSearch("");
    setStickerLimit(12);
  }, [panel]);
  useEffect(() => {
    setStickerLimit(12);
  }, [search, stickerTheme, elementCategory]);
  const drag = (event: React.DragEvent, data: object) => {
    event.dataTransfer.setData("application/x-forma", JSON.stringify(data));
    event.dataTransfer.effectAllowed = "copy";
  };
  return (
    <aside className="asset-panel" aria-label={`${panel} library`}>
      <div className="panel-heading">
        <h2>
          {
            {
              design: "Design",
              elements: "Elements",
              frames: "Frames",
              solids: "3D objects",
              charts: "Charts",
              ai: "AI Designer",
              text: "Text",
              uploads: "Your uploads",
              photos: "Photos",
              brand: "Brand kit",
              draw: "Draw",
            }[panel]
          }
        </h2>
      </div>
      {(panel === "design" || panel === "elements" || panel === "photos") && (
        <label className="search">
          <Search size={17} />
          <input
            aria-label={`Search ${panel}`}
            placeholder={`Search ${panel === "design" ? "templates" : panel}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd>/</kbd>
        </label>
      )}
      {panel === "design" && (
        <>
          <div className="category-tabs">
            {["All", "Social", "Presentation", "Print"].map((c) => (
              <button
                key={c}
                className={category === c ? "selected" : ""}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <Field label="Occasion">
            <select
              aria-label="Template occasion"
              value={occasion}
              onChange={(e) => setOccasion(e.target.value)}
            >
              <option>All occasions</option>
              {[
                ...new Set(templates.map((t) => t.occasion).filter(Boolean)),
              ].map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </Field>
          <label className="template-size-option check-row">
            <input
              type="checkbox"
              checked={templateSize}
              onChange={(e) => setTemplateSize(e.target.checked)}
              disabled={editor.doc.pages.length > 1}
            />
            Use template dimensions
          </label>
          {editor.doc.pages.length > 1 && (
            <p className="muted small">
              Templates fit the current size in multipage designs.
            </p>
          )}
          <p className="template-library-count">
            {templates.length} editable templates
          </p>
          <div className="template-grid">
            {templates
              .filter(
                (t) =>
                  (category === "All" || category === t.category) &&
                  (occasion === "All occasions" || occasion === t.occasion) &&
                  `${t.name} ${t.headline} ${t.category} ${t.occasion || ""}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )
              .map((t) => (
                <div className="template-entry" key={t.id}>
                  <button
                    className="template-card"
                    aria-label={`Apply ${t.name} template`}
                    draggable
                    onDragStart={(e) => drag(e, { type: "template", id: t.id })}
                    onClick={() =>
                      run(() => editor.applyTemplate(t, templateSize))
                    }
                  >
                    <TemplatePreview template={t} />
                    <span>{t.name}</span>
                    {t.format && <small>{t.format}</small>}
                  </button>
                  {t.deckIds && (
                    <button
                      className="template-deck-button"
                      onClick={() =>
                        run(() =>
                          editor.applyTemplateSet(
                            t.deckIds!.map((id) =>
                              templates.find((item) => item.id === id)!,
                            ),
                            templateSize,
                          ),
                        )
                      }
                    >
                      Use 4-page deck
                    </button>
                  )}
                </div>
              ))}
          </div>
          {!templates.some(
            (t) =>
              (category === "All" || category === t.category) &&
              (occasion === "All occasions" || occasion === t.occasion) &&
              `${t.name} ${t.headline} ${t.category} ${t.occasion || ""}`
                .toLowerCase()
                .includes(search.toLowerCase()),
          ) && (
            <div className="empty">
              <Search />
              <h3>No templates found</h3>
              <p>Try a different phrase or category.</p>
            </div>
          )}
        </>
      )}
      {panel === "elements" && (
        <>
          {brandProfile && (
            <label className="check-row brand-relevance">
              <input
                type="checkbox"
                aria-label="Prioritize artwork for my business"
                checked={brandRelevant}
                onChange={(e) => setBrandRelevant(e.target.checked)}
              />
              Prioritize artwork for my business
            </label>
          )}
          <div
            className="category-tabs element-tabs"
            role="group"
            aria-label="Element categories"
          >
            {["All", "AI stickers", "Graphics", "Shapes", "Photo frames"].map(
              (c) => (
                <button
                  key={c}
                  className={elementCategory === c ? "selected" : ""}
                  aria-pressed={elementCategory === c}
                  onClick={() => setElementCategory(c)}
                >
                  {c}
                </button>
              ),
            )}
          </div>
          {elementCategory === "Photo frames" && (
            <PhotoFrameLibrary editor={editor} run={run} />
          )}
          {["All", "AI stickers"].includes(elementCategory) && (
            <>
              <h3 className="section-label">
                AI stickers <span>{stickers.length} assets</span>
              </h3>
              <select
                className="sticker-theme"
                aria-label="Sticker theme"
                value={stickerTheme}
                onChange={(e) => setStickerTheme(e.target.value)}
              >
                <option>All themes</option>
                {themes.map((theme) => (
                  <option key={theme}>{theme}</option>
                ))}
              </select>
              <div className="sticker-grid">
                {filteredStickers.slice(0, stickerLimit).map((a) => (
                  <button
                    key={a.id}
                    draggable
                    aria-label={`Add ${a.name}`}
                    onDragStart={(e) => drag(e, { type: "sticker", id: a.id })}
                    onClick={() => run(() => editor.addImage(a.src, a.name))}
                  >
                    <span>
                      <img
                        src={a.src}
                        alt={a.name}
                        loading="lazy"
                        decoding="async"
                      />
                    </span>
                    <small>{a.name}</small>
                  </button>
                ))}
              </div>
              {filteredStickers.length > stickerLimit && (
                <button
                  className="secondary full sticker-more"
                  onClick={() => setStickerLimit((n) => n + 24)}
                >
                  Show {Math.min(24, filteredStickers.length - stickerLimit)}{" "}
                  more stickers
                </button>
              )}
              {!filteredStickers.length && (
                <p className="muted small">No stickers match this search.</p>
              )}
            </>
          )}
          {["All", "Graphics"].includes(elementCategory) && (
            <>
              <h3 className="section-label">
                Graphics <span>{graphics.length} editable vectors</span>
              </h3>
              <Field label="Brand collection">
                <select
                  aria-label="Graphic collection"
                  value={graphicCollection}
                  onChange={(e) => {
                    setGraphicCollection(e.target.value);
                    setGraphicLimit(24);
                  }}
                >
                  <option>All collections</option>
                  {graphicCollections.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </Field>
              <label className="check-row small">
                <input
                  type="checkbox"
                  checked={brandGraphics}
                  onChange={(e) => setBrandGraphics(e.target.checked)}
                />{" "}
                Use my brand palette
              </label>
              <div className="graphic-grid">
                {filteredGraphics.slice(0, graphicLimit).map((g) => (
                  <button
                    key={g.id}
                    draggable
                    aria-label={`Add ${g.name}`}
                    onDragStart={(e) =>
                      drag(e, {
                        type: "graphic",
                        id: g.id,
                        brandColors: brandGraphics,
                      })
                    }
                    onClick={() =>
                      editor.addGraphic(
                        g.id,
                        undefined,
                        undefined,
                        brandGraphics ? brand : undefined,
                      )
                    }
                  >
                    <GraphicPreview id={g.id} />
                    <small>{g.name}</small>
                  </button>
                ))}
              </div>
              {filteredGraphics.length > graphicLimit && (
                <button
                  className="secondary full"
                  onClick={() => setGraphicLimit((n) => n + 30)}
                >
                  Show {Math.min(30, filteredGraphics.length - graphicLimit)}{" "}
                  more graphics
                </button>
              )}
              {!filteredGraphics.length && (
                <p className="muted small">
                  No graphics match this collection and search.
                </p>
              )}
            </>
          )}
          {["All", "Shapes"].includes(elementCategory) && (
            <>
              <h3 className="section-label">Shapes</h3>
              <div className="shape-grid">
                {shapes
                  .filter((s) => s.includes(search.toLowerCase()))
                  .map((s) => (
                    <button
                      key={s}
                      title={`Add ${s}`}
                      aria-label={`Add ${s}`}
                      draggable
                      onDragStart={(e) => drag(e, { type: "shape", kind: s })}
                      onClick={() => editor.addShape(s)}
                    >
                      <span className={`shape shape-${s}`} />
                      <small>{s}</small>
                    </button>
                  ))}
              </div>
            </>
          )}
          <div className="panel-note">
            <MousePointer2 size={22} />
            <p>
              Shift or Ctrl-click to select several. Right-click your selection
              for group actions.
            </p>
          </div>
        </>
      )}
      {panel === "text" && (
        <>
          <button className="primary full" onClick={() => editor.addText()}>
            <Plus size={18} /> Add a text box
          </button>
          <div className="library-intro">
            <h3>Start with the essentials</h3>
          </div>
          <div className="text-presets">
            {(["heading", "subheading", "body"] as const).map((kind) => (
              <button
                className={`text-${kind}`}
                key={kind}
                draggable
                onDragStart={(e) => drag(e, { type: "text", kind })}
                onClick={() => editor.addText(kind)}
              >
                {kind === "heading"
                  ? "Add a heading"
                  : kind === "subheading"
                    ? "Add a subheading"
                    : "Add a little body text"}
              </button>
            ))}
          </div>
          <TextLibrary editor={editor} run={run} />
          <div className="library-intro">
            <h3>A type of your own</h3>
          </div>
          <div className="font-list">
            {fonts.map((font) => (
              <button
                key={font}
                style={{ fontFamily: font }}
                onClick={() => {
                  editor.addText();
                  editor.set({ fontFamily: font });
                }}
              >
                <span>{fontLabel(font)}</span>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
          <div className="panel-note">
            <Pencil size={20} />
            <p>
              Double-click text on the canvas to edit it. Press T to add a
              heading.
            </p>
          </div>
        </>
      )}
      {panel === "uploads" && (
        <>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => {
              if (e.target.files) onUpload(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            className="primary full"
            onClick={() => input.current?.click()}
          >
            <Upload size={17} /> Upload images
          </button>
          <div
            className="upload-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onUpload(e.dataTransfer.files);
            }}
            onClick={() => input.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") input.current?.click();
            }}
          >
            <CloudUpload size={28} />
            <strong>Your ideas belong here</strong>
            <span>Drop images here, or browse files</span>
            <small>JPG, PNG, WebP, GIF · up to 20 MB each</small>
          </div>
          <h3 className="section-label">
            Your images <span>{assets.length}</span>
          </h3>
          <div className="photo-grid">
            {assets.map((asset) => (
              <div className="asset-tile" key={asset.id}>
                <button
                  className="image-tile"
                  aria-label={`Add ${asset.name}`}
                  draggable
                  onDragStart={(e) => drag(e, { type: "asset", id: asset.id })}
                  onClick={() =>
                    run(() => editor.addImage(asset.src, asset.name))
                  }
                >
                  <img src={asset.src} alt={asset.name} />
                </button>
                <IconButton
                  icon={Trash2}
                  label={`Remove ${asset.name} from uploads`}
                  onClick={() => onDeleteAsset(asset.id)}
                />
              </div>
            ))}
          </div>
          {!assets.length && (
            <p className="muted small">
              Your uploaded images will stay in this browser, ready for your
              next design.
            </p>
          )}
        </>
      )}
      {panel === "photos" && (
        <>
          <PhotoCreator onAdd={onGeneratedImage} />
          <div className="library-intro">
            <div>
              <h3>Find your mood</h3>
              <p>A small, considered collection.</p>
            </div>
          </div>
          <div className="stock-photos">
            {photos
              .filter((p) =>
                p.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((photo) => (
                <button
                  key={photo.src}
                  draggable
                  onDragStart={(e) =>
                    drag(e, { type: "photo", src: photo.src })
                  }
                  onClick={() =>
                    run(() => editor.addImage(photo.src, photo.name))
                  }
                >
                  <img src={photo.src} alt={photo.name} />
                  <span>
                    {photo.name}
                    <Plus size={16} />
                  </span>
                </button>
              ))}
          </div>
          <p className="muted small">
            Sample photography from Unsplash. Add your own photographs in
            Uploads.
          </p>
        </>
      )}
      {panel === "brand" && (
        <>
          <div className="brand-banner">
            <span>f.</span>
            <h3>Beautifully consistent.</h3>
            <p>Your purpose, visual voice, colors and logo.</p>
          </div>
          <BrandProfileEditor />
          <DesignStyleCard />
          <h3 className="section-label">
            Your palette <span>{brand.length}</span>
          </h3>
          <div className="brand-logo-card">
            <h3>Your logo</h3>
            {brandLogo && (
              <>
                <button
                  className="brand-logo-preview"
                  aria-label="Add brand logo to design"
                  onClick={() =>
                    run(() => editor.addImage(brandLogo.src, brandLogo.name))
                  }
                >
                  <img src={brandLogo.src} alt={brandLogo.name} />
                </button>
                <small>{brandLogo.name}</small>
              </>
            )}
            <label className="secondary full upload-logo-label">
              <Upload size={16} />
              {brandLogo ? "Replace logo" : "Upload brand logo"}
              <input
                aria-label="Upload brand logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  if (e.target.files?.[0]) onBrandLogo(e.target.files[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {brandLogo && (
              <button className="text-button" onClick={() => onBrandLogo(null)}>
                Remove logo
              </button>
            )}
            <p className="muted small">
              Use your logo in AI designs or click it to add it to the canvas.
            </p>
          </div>
          <div className="brand-colors">
            {brand.map((c, i) => (
              <div key={i}>
                <button
                  className="brand-swatch"
                  style={{ background: c }}
                  aria-label={`Apply brand color ${c}`}
                  onClick={() =>
                    editor.selected
                      ? editor.set({ fill: c })
                      : editor.background(c)
                  }
                />
                <input
                  type="color"
                  aria-label={`Edit brand color ${i + 1}`}
                  value={c}
                  onChange={(e) =>
                    onBrand(
                      brand.map((old, j) => (i === j ? e.target.value : old)),
                    )
                  }
                />
                <small>{c.toUpperCase()}</small>
                <button
                  className="text-button"
                  onClick={() => onBrand(brand.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          {brand.length < 12 && (
            <button
              className="secondary full"
              onClick={() => onBrand([...brand, "#d5e2cc"])}
            >
              <Plus size={17} /> Add brand color
            </button>
          )}
          <div className="panel-note">
            <Check size={20} />
            <p>
              Select an element to apply a color, or click a color to change the
              page background.
            </p>
          </div>
        </>
      )}
      {panel === "draw" && <DrawingPanel editor={editor} brand={brand}/> }
    </aside>
  );
}
