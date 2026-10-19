import { useCallback, useEffect, useRef, useState } from "react";
import { ActiveSelection, FabricImage, Group, Textbox } from "fabric";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Box,
  Scan,
  Check,
  ChevronDown,
  CircleHelp,
  Cloud,
  Copy,
  Download,
  Eraser,
  Expand,
  FolderOpen,
  Grid2X2,
  Image,
  LayoutTemplate,
  LoaderCircle,
  Laptop,
  Maximize2,
  Megaphone,
  Minus,
  MousePointer2,
  MoreHorizontal,
  Palette,
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
  PanelTopClose,
  PanelTopOpen,
  Pencil,
  Play,
  Plus,
  Redo2,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { Editor, type DesignObject } from "./editor";
import {
  getAssets,
  getBrand,
  putAssets,
  putBrand,
  getBrandLogo,
  putBrandLogo,
} from "./storage";
import { templates } from "./templates";
import { uid, type Asset } from "./types";
import { useFontLibrary, fontLabel } from "./font-library";
import { TextSpacing } from "./TextSpacing";
import { DesktopUpdates } from "./DesktopUpdates";
import { CloudStorage, useCloudBackup } from './CloudStorage';
import { StyleStudio } from "./StyleStudio";
import { CampaignStudio } from "./CampaignStudio";
import { resumeCampaigns } from "./campaigns";
import { Sidebar, photos, shapes, type Panel } from "./Sidebar";
import { Inspector } from "./Inspector";
import {
  ExportDialog,
  ProjectsDialog,
  SizeDialog,
} from "./Dialogs";
import { IconButton, Modal } from "./ui";
import { SelectionMenu } from "./SelectionMenu";
import { DesignerPanel } from "./DesignerPanel";
import { AlignmentGuides } from "./AlignmentGuides";
import { RotationReadout } from "./RotationReadout";
import catalog from "../shared/assets.json";
import "./features.css";
import "./data-design.css";
import type { RebuildReference } from "./ai";
import { captureSelection, type SelectionSnapshot } from "./refinement";
import { RefineDialog } from "./RefineDialog";
import { MotionCanvas, MotionDialog } from "./Motion";
import { TextColor } from "./TextColor";
import { flushSync } from "react-dom";
import { GraphicColor } from "./GraphicColor";
import { MagicEraser } from "./MagicEraser";
import { FrameDialog, FrameLibrary } from "./Frames";
import { SolidDialog, SolidLibrary } from "./Solids";
import { SolidObject, type SolidSettings } from "./solid-object";
import { DeviceFrame } from "./device-frame";
import { savedDeviceMotion } from "./motion-render";
import { ChartDialog, ChartLibrary } from "./ChartDesigner";
import { isChart, type ChartType, type ChartObject } from "./charts";
import { PhotoFrame } from "./photo-frame";
import { PhotoFrameDialog } from "./PhotoFrames";
import { MarqueeSelection } from "./MarqueeSelection";
import { PageThumbnails } from "./PageThumbnails";
import { useDesignerActivity } from "./designer-activity";
import { commandKey, shortcut } from "./platform";

const navigation = [
  { id: "design", icon: LayoutTemplate, label: "Design" },
  { id: "ai", icon: Sparkles, label: "AI Designer" },
  { id: "elements", icon: Shapes, label: "Elements" },
  { id: "photos", icon: Image, label: "Photos" },
  { id: "frames", icon: Laptop, label: "Frames" },
  { id: "solids", icon: Box, label: "3D objects" },
  { id: "charts", icon: BarChart3, label: "Charts" },
  { id: "text", icon: Type, label: "Text" },
  { id: "uploads", icon: Upload, label: "Uploads" },
  { id: "brand", icon: Palette, label: "Brand" },
  { id: "draw", icon: Pencil, label: "Draw" },
] as const;
type Dialog =
  | "actions"
  | "new"
  | "resize"
  | "export"
  | "projects"
  | "campaigns"
  | "help"
  | "motion"
  | "style"
  | "cloud"
  | null;

async function imageAsset(file: File, forcePng = false): Promise<Asset> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error(`${file.name} is larger than 20 MB.`);
  if (
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)
  )
    throw new Error("Choose PNG, JPG, WebP, or GIF images.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 3200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing is unavailable.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return {
      id: uid(),
      name: file.name,
      src: canvas.toDataURL(
        file.type === "image/jpeg" && !forcePng ? "image/jpeg" : "image/png",
        0.92,
      ),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    bitmap.close();
  }
}

export default function App() {
  useCloudBackup();
  const designerActivity = useDesignerActivity();
  const [headerCollapsed, setHeaderCollapsed] = useState(() => {
    try { return localStorage.getItem("forma:header-collapsed") === "true"; }
    catch { return false; }
  });
  const toggleHeader = () => setHeaderCollapsed(value => {
    try { localStorage.setItem("forma:header-collapsed", String(!value)); } catch { /* Optional preference. */ }
    return !value;
  });
  const { families: fonts } = useFontLibrary();
  const canvasRef = useRef<HTMLCanvasElement>(null),
    stageRef = useRef<HTMLDivElement>(null),
    importRef = useRef<HTMLInputElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null),
    [, setRevision] = useState(0),
    [panel, setPanel] = useState<Panel>("design"),
    [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 1000),
    [inspectorOpen, setInspectorOpen] = useState(() => {
      try {
        const stored = localStorage.getItem("forma:inspector-open");
        if (stored !== null) return stored === "true";
      } catch {
        /* The editor still works when preferences cannot be stored. */
      }
      return window.innerWidth > 700;
    }),
    [pagesOpen, setPagesOpen] = useState(
      () => localStorage.getItem("forma:pages-open") !== "false",
    ),
    [dialog, setDialog] = useState<Dialog>(null),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [assets, setAssets] = useState<Asset[]>([]),
    [brand, setBrand] = useState<string[]>([]),
    [brandLogo, setBrandLogo] = useState<Asset | null>(null),
    [autoFit, setAutoFit] = useState(true),
    [slides, setSlides] = useState<string[]>([]),
    [slide, setSlide] = useState(0),
    [dragging, setDragging] = useState(false),
    [uploading, setUploading] = useState(false);
  const [menuPoint, setMenuPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const closeMenu = useCallback(() => setMenuPoint(null), []);
  const [refinement, setRefinement] = useState<SelectionSnapshot | null>(null);
  const [erasing, setErasing] = useState<SelectionSnapshot | null>(null);
  const [pencilling, setPencilling] = useState<SelectionSnapshot | null>(null);
  const pencilImage = () => {
    setMenuPoint(null);
    if (editor?.selected instanceof FabricImage)
      run(async () => setPencilling(await captureSelection(editor)));
  };
  const [charting, setCharting] = useState<{
    type: ChartType;
    existing?: ChartObject;
  } | null>(null);
  const [photoFraming, setPhotoFraming] = useState<PhotoFrame | null>(null);
  const [solidEditing, setSolidEditing] = useState<{ initial: SolidSettings; existing?: SolidObject } | null>(null);
  const [areaSelecting, setAreaSelecting] = useState(false);
  const [propertiesRequest, setPropertiesRequest] = useState(0);
  useEffect(() => { void resumeCampaigns().catch(() => {}); }, []);
  useEffect(() => window.formaDesktop?.onBeforeClose(async () => { await editor?.save(); }), [editor]);
  const finishAreaSelection = useCallback(() => setAreaSelecting(false), []);
  useEffect(() => {
    if (editor) {
      editor.onPhotoFrameEdit = setPhotoFraming;
      editor.onSolidEdit = object => setSolidEditing({ initial: object.solid, existing: object });
      return () => {
        editor.onPhotoFrameEdit = undefined;
        editor.onSolidEdit = undefined;
      };
    }
  }, [editor]);
  const [framing, setFraming] = useState<{
    device: string;
    existing?: DeviceFrame;
  } | null>(null);
  const eraseImage = () => {
    setMenuPoint(null);
    if (editor?.selected instanceof FabricImage)
      run(async () => setErasing(await captureSelection(editor)));
  };
  const improveSelection = () => {
    setMenuPoint(null);
    if (editor) run(async () => setRefinement(await captureSelection(editor)));
  };
  const [rebuildReference, setRebuildReference] =
    useState<RebuildReference | null>(null);
  const rebuildImage = () => {
    const selected = editor?.selected;
    if (!(selected instanceof FabricImage)) return;
    const scale = Math.min(1, 2400 / Math.max(selected.width, selected.height));
    const outputScale = 1600 / Math.max(selected.width, selected.height);
    setRebuildReference({
      id: uid(),
      data: selected.toDataURL({
        format: "png",
        withoutTransform: true,
        multiplier: scale,
        enableRetinaScaling: false,
      }),
      name: (selected as DesignObject).name || "Uploaded design",
      width: Math.max(256, Math.round(selected.width * outputScale)),
      height: Math.max(256, Math.round(selected.height * outputScale)),
    });
    setPanel("ai");
    setPanelOpen(true);
    setMenuPoint(null);
  };
  const fitCanvas = () => {
    setAutoFit(true);
    if (editor && stageRef.current)
      editor.fit(stageRef.current.clientWidth, stageRef.current.clientHeight);
  };
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  }, []);
  const showInspector = (open: boolean) => {
    setInspectorOpen(open);
    try {
      localStorage.setItem("forma:inspector-open", String(open));
    } catch {
      /* Optional preference. */
    }
  };
  const run = useCallback(
    (fn: () => unknown) => {
      try {
        Promise.resolve(fn()).catch((e) =>
          notify(
            e instanceof Error
              ? e.message
              : "Something went wrong. Please try again.",
          ),
        );
      } catch (e) {
        notify((e as Error).message);
      }
    },
    [notify],
  );
  useEffect(() => {
    if (!canvasRef.current) return;
    const instance = new Editor(
      canvasRef.current,
      () => setRevision((v) => v + 1),
      notify,
    );
    setEditor(instance);
    instance.onContextMenu = setMenuPoint;
    instance.onShowProperties = () => { showInspector(true); setPropertiesRequest(value => value + 1); };
    void instance.boot().catch((e) => setError(e.message));
    void getAssets()
      .then(setAssets)
      .catch(() => notify("Your image library could not be opened."));
    void getBrand()
      .then(setBrand)
      .catch(() => {});
    void getBrandLogo()
      .then(setBrandLogo)
      .catch(() => {});
    return () => {
      instance.dispose();
      clearTimeout(toastTimer.current);
    };
  }, [notify]);
  useEffect(() => {
    const desktop = window.formaDesktop;
    if (!desktop?.onEditCommand) return;
    return desktop.onEditCommand(command => {
      const target = document.activeElement;
      if (target?.closest('input,textarea,[contenteditable="true"]')) {
        desktop.editText(command);
        return;
      }
      if (!editor?.ready || editor.busy || dialog || refinement || slides.length || target?.closest('[role="dialog"],[role="menu"]')) return;
      run(() => {
        switch (command) {
          case 'undo': return editor.undo();
          case 'redo': return editor.undo(true);
          case 'cut': return editor.cut();
          case 'copy': return editor.copy();
          case 'paste': return editor.paste();
          case 'selectAll': return editor.selectAll();
        }
      });
    });
  }, [editor, dialog, refinement, slides, run]);
  useEffect(() => {
    if (!editor?.ready || !stageRef.current || !autoFit) return;
    const el = stageRef.current;
    const fit = () => editor.fit(el.clientWidth, el.clientHeight);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    editor,
    editor?.ready,
    editor?.doc?.id,
    editor?.doc?.width,
    editor?.doc?.height,
    autoFit,
    panelOpen,
  ]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (slides.length) {
        if (e.key === "Escape") {
          setSlides([]);
          return;
        }
        if (e.key === "ArrowRight")
          setSlide((v) => Math.min(v + 1, slides.length - 1));
        if (e.key === "ArrowLeft") setSlide((v) => Math.max(0, v - 1));
        return;
      }
      if (dialog || refinement || document.querySelector("dialog[open]"))
        return;
      if (
        editor?.ready &&
        (e.ctrlKey || e.metaKey) &&
        !(e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        )
      ) {
        if (["-", "=", "+", "0"].includes(e.key)) {
          e.preventDefault();
          if (e.key === "0") fitCanvas();
          else {
            setAutoFit(false);
            editor.setZoom(editor.zoom * (e.key === "-" ? 0.8 : 1.25));
          }
          return;
        }
      }
      editor?.keyboard(e);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [editor, dialog, slides, refinement]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !editor) return;
    let frame = 0,
      delta = 0,
      pointer = { x: 0, y: 0 };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      delta +=
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? stage.clientHeight
            : 1);
      pointer = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const before = editor.canvas.upperCanvasEl.getBoundingClientRect();
        const point = {
          x: (pointer.x - before.left) / editor.zoom,
          y: (pointer.y - before.top) / editor.zoom,
        };
        const zoom = editor.zoom * Math.exp(-delta * 0.002);
        delta = 0;
        flushSync(() => {
          setAutoFit(false);
          editor.setZoom(zoom);
        });
        const after = editor.canvas.upperCanvasEl.getBoundingClientRect();
        stage.scrollLeft += after.left + point.x * editor.zoom - pointer.x;
        stage.scrollTop += after.top + point.y * editor.zoom - pointer.y;
        editor.canvas.calcOffset();
      });
    };
    stage.addEventListener("wheel", wheel, { passive: false });
    return () => {
      stage.removeEventListener("wheel", wheel);
      cancelAnimationFrame(frame);
    };
  }, [editor]);
  useEffect(() => {
    const handle = () => {
      if (document.visibilityState === "hidden")
        void editor?.save().catch(() => {});
    };
    document.addEventListener("visibilitychange", handle);
    return () => document.removeEventListener("visibilitychange", handle);
  }, [editor]);
  const upload = async (
    files: FileList | File[],
    point?: { x: number; y: number },
  ) => {
    if (!editor || uploading) return;
    setUploading(true);
    setPanel("uploads");
    setPanelOpen(true);
    try {
      const added: Asset[] = [];
      for (const file of Array.from(files)) {
        try {
          added.push(await imageAsset(file));
        } catch (e) {
          notify((e as Error).message);
        }
      }
      if (!added.length) return;
      const next = [...(await getAssets()), ...added];
      await putAssets(next);
      setAssets(next);
      for (const asset of added)
        await editor.addImage(asset.src, asset.name, point?.x, point?.y);
      notify(
        `${added.length === 1 ? "Image" : `${added.length} images`} added to your design.`,
      );
    } finally {
      setUploading(false);
    }
  };
  const drop = async (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!editor?.ready) return;
    const rect = editor.canvas.upperCanvasEl.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) / editor.zoom,
      y: (event.clientY - rect.top) / editor.zoom,
    };
    if (event.dataTransfer.files.length) {
      const files = event.dataTransfer.files;
      if (files[0].name.endsWith(".json")) await editor.importDesign(files[0]);
      else await upload(files, point);
      return;
    }
    const raw = event.dataTransfer.getData("application/x-forma");
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.type === "photo-frame")
      await editor.addPhotoFrame(data.mask, point.x, point.y);
    if (data.type === "shape" && shapes.includes(data.kind))
      editor.addShape(data.kind, point.x, point.y);
    if (data.type === "graphic")
      editor.addGraphic(
        data.id,
        point.x,
        point.y,
        data.brandColors ? brand : undefined,
      );
    if (data.type === "sticker") {
      const sticker = catalog.find(
        (a) => a.id === data.id && a.category === "AI stickers",
      );
      if (sticker)
        await editor.addImage(sticker.src, sticker.name, point.x, point.y);
    }
    if (
      data.type === "text" &&
      ["heading", "subheading", "body"].includes(data.kind)
    )
      editor.addText(data.kind, point.x, point.y);
    if (data.type === "template") {
      const t = templates.find((t) => t.id === data.id);
      if (t) await editor.applyTemplate(t);
    }
    if (data.type === "asset") {
      const a = assets.find((a) => a.id === data.id);
      if (a) await editor.addImage(a.src, a.name, point.x, point.y);
    }
    if (data.type === "photo") {
      const p = photos.find((p) => p.src === data.src);
      if (p) await editor.addImage(p.src, p.name, point.x, point.y);
    }
  };
  const ready = editor?.ready,
    selected = editor?.selected,
    selectedText = selected instanceof Textbox ? selected : null;
  return (
    <div className={`studio-app${headerCollapsed ? " header-collapsed" : ""}`}>
      <DesktopUpdates />
      {dialog === 'style' && editor && <StyleStudio editor={editor} brand={brand} onClose={() => setDialog(null)} />}
      <header className="topbar" id="studio-header" hidden={headerCollapsed}>
        <button
          className="wordmark"
          onClick={() => {
            if (ready)
              run(async () => {
                await editor.save();
                setDialog("projects");
              });
          }}
          aria-label="Forma home"
        >
          <img className="logo-mark" src="/brand/forma-mark.svg" alt="" />
          <img className="logo-wordmark" src="/brand/forma-wordmark.svg" alt="" />
        </button>
        <span className="header-divider" />
        <button
          className="header-link projects-link"
          disabled={!ready}
          onClick={() =>
            run(async () => {
              await editor!.save();
              setDialog("projects");
            })
          }
        >
          <FolderOpen size={17} /> My designs
        </button>
        <span className="header-chevron">/</span>
        <div className="design-title">
          {ready ? (
            <input
              aria-label="Design title"
              maxLength={250}
              value={editor.doc.name}
              onChange={(e) => editor.rename(e.target.value)}
            />
          ) : (
            <span>Your design studio</span>
          )}
          <Pencil size={12} />
        </div>
        <div className="save-status" title={editor?.saveStatus}>
          <span
            className={
              editor?.saveStatus.startsWith("Saved")
                ? "status-dot"
                : "status-dot pending"
            }
          />
          <span>{editor?.saveStatus || "Opening studio…"}</span>
        </div>
        <div className="header-actions">
          <button className="campaign-launch" aria-label="Campaigns" title="Campaigns" disabled={!ready} onClick={() => run(async () => { await editor!.save(); setDialog('campaigns'); })}><Megaphone size={17}/><span>Campaigns</span></button>
          <button
            className="secondary new-design-button"
            disabled={!ready}
            onClick={() => setDialog("new")}
            aria-label="New blank design"
          >
            <Plus size={16} />
            <span>New design</span>
          </button>
          <button
            className="secondary present-button"
            disabled={!ready || editor.busy}
            onClick={() =>
              run(async () => {
                setSlides(await editor!.presentationImages());
                setSlide(0);
              })
            }
          >
            <Play size={15} /> Present
          </button>
          <button
            className="primary"
            disabled={!ready}
            onClick={() => setDialog("export")}
          >
            <Download size={17} />
            <span>Export</span>
            <ChevronDown size={13} />
          </button>
        </div>
      </header>
      <div
        className={`workspace-shell ${inspectorOpen ? "show-inspector" : ""}`}
      >
        <nav className="tool-rail" aria-label="Design tools">
          {navigation.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className={panel === id && panelOpen ? "active" : ""}
              disabled={!ready}
              onClick={() => {
                setPanel(id);
                setPanelOpen(panel === id ? !panelOpen : true);
                if (id !== "draw") editor?.draw(false);
              }}
              title={id === "ai" && designerActivity.count ? designerActivity.stage : label}
              aria-label={label}
              aria-busy={id === "ai" ? designerActivity.count > 0 : undefined}
            >
              <span>
                {id === "ai" && designerActivity.count ?
                  <LoaderCircle size={23} strokeWidth={1.65} className="designer-rail-spinner" /> :
                  <Icon size={23} strokeWidth={1.65} />}
              </span>
              <small>{label}</small>
            </button>
          ))}
          <div className="rail-spacer" />
          <button onClick={() => setDialog("help")} title="Help & shortcuts">
            <span>
              <CircleHelp size={22} />
            </span>
            <small>Help</small>
          </button>
        </nav>
        {ready && panelOpen && panel === "ai" && (
          <DesignerPanel
            editor={editor}
            brand={brand}
            notify={notify}
            brandLogo={brandLogo}
            reference={rebuildReference}
            onClearReference={() => setRebuildReference(null)}
          />
        )}
        {ready && panelOpen && panel === "frames" && (
          <FrameLibrary onChoose={(device) => setFraming({ device })} />
        )}
        {ready && panelOpen && panel === "solids" && <SolidLibrary onChoose={initial => setSolidEditing({ initial })} />}
        {ready && panelOpen && panel === "charts" && (
          <ChartLibrary onChoose={(type) => setCharting({ type })} />
        )}
        {ready &&
          panelOpen &&
          panel !== "ai" &&
          panel !== "frames" &&
          panel !== "solids" &&
          panel !== "charts" && (
            <Sidebar
              panel={panel}
              editor={editor}
              run={run}
              assets={assets}
              onGeneratedImage={async (asset) => {
                const current = await getAssets();
                const next = [
                  ...current.filter((a) => a.id !== asset.id),
                  asset,
                ];
                await putAssets(next);
                setAssets(next);
                await editor.addImage(asset.src, asset.name);
                notify("Photo added to your design and saved in Uploads.");
              }}
              onUpload={(files) => run(() => upload(files))}
              onDeleteAsset={(id) =>
                run(async () => {
                  const next = assets.filter((a) => a.id !== id);
                  await putAssets(next);
                  setAssets(next);
                })
              }
              brand={brand}
              brandLogo={brandLogo}
              onBrandLogo={(file) =>
                run(async () => {
                  const logo = file ? await imageAsset(file, true) : null;
                  await putBrandLogo(logo);
                  setBrandLogo(logo);
                  if (logo)
                    notify(
                      "Brand logo saved. AI Designer can use this exact artwork.",
                    );
                })
              }
              onBrand={(next) =>
                run(async () => {
                  await putBrand(next);
                  setBrand(next);
                })
              }
            />
          )}
        <main className="editor-main" aria-label="Design editor">
          <div className={`context-toolbar${selected ? " has-selection" : ""}`}>
            <div className="toolbar-left">
              <IconButton icon={headerCollapsed ? PanelTopOpen : PanelTopClose}
                label={headerCollapsed ? "Show top bar" : "Hide top bar"}
                onClick={toggleHeader} expanded={!headerCollapsed} controls="studio-header" />
              {headerCollapsed && <IconButton icon={MoreHorizontal} label="Design actions" disabled={!ready} onClick={() => setDialog("actions")} />}
              {panelOpen && (
                <IconButton
                  icon={PanelLeftClose}
                  label="Hide library"
                  onClick={() => setPanelOpen(!panelOpen)}
                />
              )}
              {panelOpen && <span className="toolbar-divider" />}
              {ready && (
                <>
                  <IconButton
                    icon={Scan}
                    label="Select area"
                    active={areaSelecting}
                    onClick={() => {
                      editor.draw(false);
                      setAreaSelecting((v) => !v);
                    }}
                  />
                  <div className="page-toolbar-actions">
                  <button
                    className="toolbar-button"
                    aria-label="Resize"
                    title="Resize"
                    onClick={() => setDialog("resize")}
                  >
                    <Expand size={15} /> <span>Resize</span> <ChevronDown className="toolbar-chevron" size={12} />
                  </button>
                  <button
                    className="toolbar-button"
                    aria-label="Animate"
                    title="Animate"
                    onClick={() => setDialog("motion")}
                  >
                    <Play size={14} /> <span>Animate</span>
                  </button>
                  <button className="toolbar-button" aria-label="Page style" title="Page style" onClick={() => setDialog('style')}><Palette size={16} /> <span>Page style</span></button>
                  </div>
                  <span className="toolbar-divider" />
                  <IconButton
                    icon={Undo2}
                    label={`Undo (${shortcut('Z')})`}
                    onClick={() => run(() => editor.undo())}
                    disabled={!editor.canUndo}
                  />
                  <IconButton
                    icon={Redo2}
                    label={`Redo (${shortcut('Shift+Z')})`}
                    onClick={() => run(() => editor.undo(true))}
                    disabled={!editor.canRedo}
                  />
                </>
              )}
            </div>
            <div className="context-actions">
              {selectedText ? (
                <>
                  <TextColor editor={editor!} />
                  <select
                    aria-label="Quick font"
                    value={selectedText.fontFamily}
                    onChange={(e) =>
                      editor?.set({ fontFamily: e.target.value })
                    }
                  >
                    {fonts.map((f) => (
                      <option value={f} key={f}>{fontLabel(f)}</option>
                    ))}
                  </select>
                  <input
                    className="quick-size"
                    aria-label="Quick font size"
                    type="number"
                    min={6}
                    max={1000}
                    value={Math.round(selectedText.fontSize)}
                    onChange={(e) => {
                      if (+e.target.value >= 6 && +e.target.value <= 1000)
                        editor?.set({ fontSize: +e.target.value });
                    }}
                  />
                  <button
                    className={
                      editor?.textStyle("fontWeight") === "bold"
                        ? "toolbar-button active"
                        : "toolbar-button"
                    }
                    aria-label="Quick bold"
                    aria-pressed={editor?.textStyle("fontWeight") === "bold"}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() =>
                      editor?.set({
                        fontWeight:
                          editor?.textStyle("fontWeight") === "bold"
                            ? "normal"
                            : "bold",
                      })
                    }
                  >
                    <b>B</b>
                  </button>
                  <TextSpacing editor={editor!} text={selectedText} />
                </>
              ) : selected ? (
                <>
                  <span className="selection-label">
                    {selected instanceof ActiveSelection
                      ? `${editor!.canvas.getActiveObjects().length} selected`
                      : selected.name || "Selection"}
                  </span>
                  {selected instanceof Group && (
                    <button
                      className="toolbar-button"
                      onClick={() => editor?.group()}
                    >
                      {selected instanceof ActiveSelection
                        ? "Group"
                        : "Ungroup"}
                    </button>
                  )}
                </>
              ) : null}
              {selected && (
                <>
                  {selected instanceof SolidObject && <button className="toolbar-button" aria-label="Edit 3D object" title="Edit 3D object" disabled={selected.lockMovementX} onClick={() => setSolidEditing({ initial: selected.solid, existing: selected })}><Box size={16} /> <span>Edit 3D object</span></button>}
                  {selected instanceof DeviceFrame && (
                    <button
                      className="toolbar-button"
                      aria-label="Edit frame"
                      title="Edit frame"
                      disabled={selected.lockMovementX}
                      onClick={() =>
                        setFraming({
                          device: selected.frame.device,
                          existing: selected,
                        })
                      }
                    >
                      <Laptop size={16} /> <span>Edit frame</span>
                    </button>
                  )}
                  {isChart(selected) && (
                    <button
                      className="toolbar-button"
                      aria-label="Edit data"
                      title="Edit data"
                      disabled={selected.lockMovementX}
                      onClick={() =>
                        setCharting({
                          type: selected.chart.type,
                          existing: selected,
                        })
                      }
                    >
                      <BarChart3 size={16} />
                      <span>Edit data</span>
                    </button>
                  )}
                  {selected instanceof PhotoFrame && (
                    <button
                      className="toolbar-button"
                      disabled={selected.lockMovementX}
                      onClick={() => setPhotoFraming(selected)}
                    >
                      Crop photo frame
                    </button>
                  )}
                  {!(selected instanceof Textbox) &&
                    !(selected instanceof FabricImage) &&
                    !(selected instanceof PhotoFrame) &&
                    !(selected instanceof DeviceFrame) &&
                    !(selected instanceof SolidObject) &&
                    !isChart(selected) && <GraphicColor editor={editor!} />}
                  {selected instanceof FabricImage && (
                    <button
                      className="toolbar-button"
                      aria-label="AI Pencil"
                      title="AI Pencil"
                      disabled={selected.lockMovementX}
                      onClick={pencilImage}
                    >
                      <Pencil size={15} />
                      <span>AI Pencil</span>
                    </button>
                  )}
                  {selected instanceof FabricImage && (
                    <button
                      className="toolbar-button eraser-toolbar"
                      aria-label="Magic Eraser"
                      title="Magic Eraser"
                      onClick={eraseImage}
                      disabled={selected.lockMovementX}
                    >
                      <Eraser size={15} /> <span>Magic Eraser</span>
                    </button>
                  )}
                  <button
                    className="toolbar-button improve-toolbar"
                    aria-label="Improve with AI"
                    title="Improve with AI"
                    onClick={improveSelection}
                    disabled={editor?.busy}
                  >
                    <Sparkles size={15} /> <span>Improve with AI</span>
                  </button>
                  {selected instanceof FabricImage && (
                    <button
                      className="toolbar-button rebuild-toolbar"
                      onClick={rebuildImage}
                    >
                      <Sparkles size={15} /> Design with image
                    </button>
                  )}
                  <IconButton
                    icon={MoreHorizontal}
                    label="Selection actions"
                    onClick={() => {
                      const bounds =
                        editor!.canvas.upperCanvasEl.getBoundingClientRect();
                      setMenuPoint({
                        x: bounds.x + bounds.width / 2,
                        y: bounds.y + 30,
                      });
                    }}
                  />
                  <IconButton
                    icon={Copy}
                    label="Duplicate selection"
                    onClick={() => run(() => editor?.duplicate())}
                  />
                  <IconButton
                    icon={Trash2}
                    label="Delete selection"
                    onClick={() => editor?.remove()}
                  />
                </>
              )}
              <IconButton
                icon={inspectorOpen ? PanelRightClose : PanelRightOpen}
                label={
                  inspectorOpen
                    ? "Hide properties and layers"
                    : "Show properties and layers"
                }
                expanded={inspectorOpen}
                controls="design-inspector"
                onClick={() => showInspector(!inspectorOpen)}
              />
            </div>
          </div>
          <div
            ref={stageRef}
            className={`canvas-stage ${dragging ? "dragging" : ""} ${editor?.drawing ? "is-drawing" : ""} ${areaSelecting ? "area-selecting" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setDragging(false);
            }}
            onDrop={(e) => run(() => drop(e))}
          >
            {ready && (
              <MarqueeSelection
                editor={editor}
                stage={stageRef}
                active={areaSelecting}
                onComplete={finishAreaSelection}
              />
            )}
            {areaSelecting && (
              <div className="selection-hint">
                Drag across the area to select. Shift adds to your selection.
                Esc cancels.
              </div>
            )}
            <div className="artboard-area">
              <div className="page-caption">
                <span>
                  Page {ready ? editor.pageIndex + 1 : 1}
                  <span className="caption-dash">—</span>
                  <input
                    aria-label="Page name"
                    value={ready ? editor.page.name : ""}
                    disabled={!ready}
                    placeholder="Add a page title"
                    onChange={(e) => {
                      if (editor) {
                        editor.page.name = e.target.value;
                        editor.commit();
                      }
                    }}
                  />
                </span>
                {ready && (
                  <div>
                    <button className="page-refine-button" aria-label="Refine page with AI" title="Refine page with AI" disabled={editor.busy || !editor.objects.length} onClick={() => run(async () => setRefinement(await captureSelection(editor, 'page')))}><Sparkles size={17} aria-hidden="true" /></button>
                    <IconButton
                      icon={Copy}
                      label="Duplicate page"
                      onClick={() => run(() => editor.addPage(true))}
                    />
                    <IconButton
                      icon={Trash2}
                      label="Delete page"
                      disabled={editor.doc.pages.length === 1}
                      onClick={() => run(() => editor.removePage())}
                    />
                  </div>
                )}
              </div>
              <div
                className="artboard"
                aria-label="Editable design canvas"
                style={
                  ready
                    ? {
                        width: editor.doc.width * editor.zoom,
                        height: editor.doc.height * editor.zoom,
                      }
                    : undefined
                }
              >
                <canvas ref={canvasRef} />
                {ready && <AlignmentGuides editor={editor} />}
                {ready && <RotationReadout editor={editor} />}
                {editor?.busy && (
                  <div className="canvas-busy">
                    <span className="spinner" />
                  </div>
                )}
              </div>
              {ready && (
                <button
                  className="add-page"
                  onClick={() => run(() => editor.addPage())}
                >
                  <Plus size={16} /> Add page
                </button>
              )}
            </div>
            {!ready && (
              <div className="loading-studio">
                <img className="logo-mark" src="/brand/forma-mark.svg" alt="" />
                <h2>
                  {error
                    ? "Your studio needs a moment"
                    : "A little space to create."}
                </h2>
                <p>{error || "Getting your canvas ready…"}</p>
                {error && (
                  <button
                    className="primary"
                    onClick={() =>
                      run(async () => {
                        await editor?.create("Untitled design", 1080, 1080);
                        if (editor) {
                          editor.ready = true;
                          editor.notify();
                        }
                        setError("");
                      })
                    }
                  >
                    Start a new design
                  </button>
                )}
              </div>
            )}
            {dragging && (
              <div className="drop-indicator">
                <Upload size={26} /> Drop it into your design
              </div>
            )}
          </div>
          {ready && (
            <>
              <div
                className="page-tray"
                id="page-thumbnails"
                hidden={!pagesOpen}
              >
                <PageThumbnails editor={editor} run={run} />
              </div>
              <footer className="workspace-footer">
                <button
                  className="footer-page page-tray-toggle"
                  aria-label={
                    pagesOpen ? "Hide page thumbnails" : "Show page thumbnails"
                  }
                  aria-expanded={pagesOpen}
                  aria-controls="page-thumbnails"
                  onClick={() => {
                    const next = !pagesOpen;
                    setPagesOpen(next);
                    localStorage.setItem("forma:pages-open", String(next));
                  }}
                >
                  <Grid2X2 size={15} /> Page {editor.pageIndex + 1} of{" "}
                  {editor.doc.pages.length}
                  <ChevronDown
                    size={13}
                    style={{ transform: pagesOpen ? "none" : "rotate(180deg)" }}
                  />
                </button>
                <div className="zoom-control">
                  <IconButton
                    icon={Minus}
                    label="Zoom canvas out"
                    onClick={() => {
                      setAutoFit(false);
                      editor.setZoom(editor.zoom - 0.1);
                    }}
                  />
                  <input
                    aria-label="Canvas zoom"
                    type="range"
                    min={5}
                    max={200}
                    step={1}
                    value={Math.round(editor.zoom * 100)}
                    onChange={(e) => {
                      setAutoFit(false);
                      editor.setZoom(+e.target.value / 100);
                    }}
                  />
                  <IconButton
                    icon={Plus}
                    label="Zoom canvas in"
                    onClick={() => {
                      setAutoFit(false);
                      editor.setZoom(editor.zoom + 0.1);
                    }}
                  />
                  <select
                    aria-label="Canvas zoom preset"
                    value="current"
                    onChange={(e) => {
                      if (e.target.value === "fit") fitCanvas();
                      else {
                        setAutoFit(false);
                        editor.setZoom(Number(e.target.value));
                      }
                    }}
                  >
                    <option value="current" hidden>
                      {Math.round(editor.zoom * 100)}%
                    </option>
                    <option value="fit">Fit to screen</option>
                    {[10, 25, 50, 75, 100, 150, 200].map((n) => (
                      <option value={n / 100} key={n}>
                        {n}%
                      </option>
                    ))}
                  </select>
                  <IconButton
                    icon={Maximize2}
                    label="Fit to screen"
                    onClick={() => {
                      setAutoFit(true);
                      if (stageRef.current)
                        editor.fit(
                          stageRef.current.clientWidth,
                          stageRef.current.clientHeight,
                        );
                    }}
                  />
                </div>
              </footer>
            </>
          )}
        </main>
        {ready && (
          <Inspector
            editor={editor}
            run={run}
            collapsed={!inspectorOpen}
            propertiesRequest={propertiesRequest}
            onRebuild={rebuildImage}
            onErase={eraseImage}
            onPencil={pencilImage}
            onChart={() => {
              if (isChart(editor.selected))
                setCharting({
                  type: editor.selected.chart.type,
                  existing: editor.selected,
                });
            }}
            onPhotoFrame={() => {
              if (editor.selected instanceof PhotoFrame)
                setPhotoFraming(editor.selected);
            }}
            onSolid={() => { if (editor.selected instanceof SolidObject) setSolidEditing({ initial: editor.selected.solid, existing: editor.selected }); }}
            onFrame={() => {
              if (editor.selected instanceof DeviceFrame)
                setFraming({
                  device: editor.selected.frame.device,
                  existing: editor.selected,
                });
            }}
          />
        )}
      </div>
      {ready && menuPoint && (
        <SelectionMenu
          editor={editor}
          point={menuPoint}
          onClose={closeMenu}
          run={run}
          onRebuild={rebuildImage}
          onImprove={improveSelection}
          onErase={eraseImage}
          onPencil={pencilImage}
        />
      )}
      {ready && refinement && (
        <RefineDialog
          editor={editor}
          snapshot={refinement}
          onClose={() => setRefinement(null)}
          notify={notify}
        />
      )}
      {ready && erasing && (
        <MagicEraser
          editor={editor}
          snapshot={erasing}
          onClose={() => setErasing(null)}
          notify={notify}
        />
      )}
      {ready && pencilling && (
        <MagicEraser
          pencil
          editor={editor}
          snapshot={pencilling}
          onClose={() => setPencilling(null)}
          notify={notify}
        />
      )}
      <input
        hidden
        ref={importRef}
        type="file"
        accept=".json"
        onChange={(e) => {
          if (e.target.files?.[0])
            run(() => editor?.importDesign(e.target.files![0]));
          e.target.value = "";
        }}
      />
      {ready && dialog === "actions" && (
        <Modal title="Design actions" onClose={() => setDialog(null)}>
          <div className="compact-design-actions">
            <label>Design title<input aria-label="Design title" maxLength={250} value={editor.doc.name} onChange={e => editor.rename(e.target.value)} /></label>
            <p role="status">{editor.saveStatus}</p>
            <button className="secondary" onClick={() => run(async () => { await editor.save(); setDialog("projects"); })}><FolderOpen size={17} /> My designs</button>
            <button className="secondary" onClick={() => run(async () => { await editor.save(); setDialog("campaigns"); })}><Megaphone size={17} /> Campaigns</button>
            <button className="secondary" onClick={() => run(async () => { await editor.save(); setDialog("cloud"); })}><Cloud size={17} /> Cloud storage</button>
            <button className="secondary" aria-label="New blank design" onClick={() => setDialog("new")}><Plus size={17} /> New design</button>
            <button className="secondary" disabled={editor.busy} onClick={() => run(async () => { setSlides(await editor.presentationImages()); setSlide(0); setDialog(null); })}><Play size={17} /> Present</button>
            <button className="primary" onClick={() => setDialog("export")}><Download size={17} /> Export</button>
          </div>
        </Modal>
      )}
      {ready && dialog === "new" && (
        <SizeDialog
          editor={editor}
          notify={notify}
          onClose={() => setDialog(null)}
        />
      )}
      {ready && dialog === "motion" && (
        <MotionDialog
          editor={editor}
          onClose={() => setDialog(null)}
          notify={notify}
        />
      )}
      {ready && framing && (
        <FrameDialog
          editor={editor}
          {...framing}
          onClose={() => setFraming(null)}
          notify={notify}
        />
      )}
      {ready && solidEditing && <SolidDialog editor={editor} {...solidEditing} notify={notify} onClose={() => setSolidEditing(null)} />}
      {ready && charting && (
        <ChartDialog
          editor={editor}
          {...charting}
          onClose={() => setCharting(null)}
        />
      )}
      {ready && photoFraming && (
        <PhotoFrameDialog
          editor={editor}
          existing={photoFraming}
          onClose={() => setPhotoFraming(null)}
        />
      )}
      {ready && dialog === "resize" && (
        <SizeDialog
          resize
          editor={editor}
          notify={notify}
          onClose={() => setDialog(null)}
        />
      )}
      {ready && dialog === "export" && (
        <ExportDialog
          editor={editor}
          notify={notify}
          onClose={() => setDialog(null)}
        />
      )}
      {ready && dialog === "projects" && (
        <ProjectsDialog
          editor={editor}
          notify={notify}
          onNew={() => setDialog("new")}
          onCampaigns={() => setDialog("campaigns")}
          onCloud={() => setDialog("cloud")}
          onClose={() => setDialog(null)}
        />
      )}
      {ready && dialog === 'cloud' && <CloudStorage editor={editor} onClose={() => setDialog(null)} activeAI={designerActivity.count > 0} />}
      {ready && dialog === 'campaigns' && <CampaignStudio editor={editor} brand={brand} brandLogo={brandLogo} onClose={() => setDialog(null)} onAISetup={() => { setDialog(null); setPanel('ai'); setPanelOpen(true); }} />}
      {dialog === "help" && (
        <Modal title="A few little shortcuts" onClose={() => setDialog(null)}>
          {window.formaDesktop?.checkForUpdates && <button className="secondary full" onClick={() => { setDialog(null); run(() => window.formaDesktop!.checkForUpdates()); }}><Download size={17} /> Check for updates</button>}
          <p className="modal-description">Less clicking. More creating.</p>
          <div className="shortcut-list">
            {[
              ["Undo", shortcut('Z')],
              ["Redo", shortcut('Shift+Z')],
              ["Copy / paste", shortcut('C / V')],
              ["Duplicate", shortcut('D')],
              ["Select all", shortcut('A')],
              ["Group / ungroup", shortcut('G')],
              ["Save on this device", shortcut('S')],
              ["Add text / rectangle / circle", "T / R / C"],
              ["Move an element", "Arrow keys"],
              ["Move 10 pixels", "Shift + Arrow"],
              ["Delete selected", "Delete / Backspace"],
              ["Deselect / stop drawing", "Escape"],
            ].map(([label, key]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
          <button
            className="secondary full"
            onClick={() => {
              setDialog(null);
              importRef.current?.click();
            }}
          >
            <Upload size={17} /> Import a Forma design file
          </button>
          <p className="muted small">
            Shift or {commandKey}-click elements or layers to select several. Drag a
            selection box across the canvas to select an area. Right-click a
            selection for actions, or press Shift+F10. All edits save on this
            device automatically.
          </p>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {uploading && (
        <div className="upload-status">
          <span className="spinner" /> Adding your images…
        </div>
      )}
      {slides.length > 0 && (
        <div
          className="presentation"
          role="dialog"
          aria-label="Presentation"
          aria-modal="true"
        >
          <button
            className="presentation-close"
            aria-label="Close presentation"
            onClick={() => setSlides([])}
          >
            <X size={24} />
          </button>
          {editor &&
          ((editor.doc.pages[slide]?.motion &&
            editor.doc.pages[slide].motion?.style !== "none") ||
            savedDeviceMotion(editor.doc.pages[slide]?.data)) ? (
            <MotionCanvas
              key={slide}
              data={editor.doc.pages[slide].data}
              width={editor.doc.width}
              height={editor.doc.height}
              motion={editor.doc.pages[slide].motion}
              presentation
            />
          ) : (
            <img src={slides[slide]} alt={`Slide ${slide + 1}`} />
          )}
          <div className="presentation-controls">
            <IconButton
              icon={ArrowLeft}
              label="Previous slide"
              disabled={slide === 0}
              onClick={() => setSlide(slide - 1)}
            />
            <span>
              {slide + 1} / {slides.length}
            </span>
            <IconButton
              icon={ArrowRight}
              label="Next slide"
              disabled={slide === slides.length - 1}
              onClick={() => setSlide(slide + 1)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
