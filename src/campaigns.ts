import { createStore, entries, get, set } from "idb-keyval";
import {
  designerRequest,
  proposalToDesign,
  isTransientDesignerError,
  type DesignJob,
} from "./ai";
import { getDesign, saveDesign } from "./storage";
import { uid, type Asset } from "./types";
import type { BrandProfile } from "../shared/brand-context.mjs";
import type { DesignStyleProfile } from "../shared/design-style.mjs";

export const campaignFormats = [
  {
    id: "instagram",
    name: "Instagram post",
    width: 1080,
    height: 1350,
    shape: "portrait",
    category: "Social",
  },
  {
    id: "facebook",
    name: "Facebook post",
    width: 1200,
    height: 630,
    shape: "landscape",
    category: "Social",
  },
  {
    id: "linkedin",
    name: "LinkedIn post",
    width: 1200,
    height: 627,
    shape: "landscape",
    category: "Social",
  },
  {
    id: "story",
    name: "Instagram story",
    width: 1080,
    height: 1920,
    shape: "story",
    category: "Social",
  },
  {
    id: "poster",
    name: "Poster",
    width: 1200,
    height: 1600,
    shape: "portrait",
    category: "Print",
  },
  {
    id: "a4",
    name: "A4 document",
    width: 2480,
    height: 3508,
    shape: "portrait",
    category: "Print",
  },
  {
    id: "flyer",
    name: "Flyer",
    width: 1748,
    height: 2480,
    shape: "portrait",
    category: "Print",
  },
  {
    id: "yard-sign",
    name: "Yard sign",
    width: 2400,
    height: 1800,
    shape: "landscape",
    category: "Print",
  },
  {
    id: "business-card",
    name: "Business card",
    width: 1050,
    height: 600,
    shape: "landscape",
    category: "Print",
  },
  {
    id: "square-ad",
    name: "Square ad",
    width: 1080,
    height: 1080,
    shape: "square",
    category: "Ads & web",
  },
  {
    id: "landscape-ad",
    name: "Landscape ad",
    width: 1200,
    height: 628,
    shape: "landscape",
    category: "Ads & web",
  },
  {
    id: "web-banner",
    name: "Website banner",
    width: 1920,
    height: 640,
    shape: "landscape",
    category: "Ads & web",
  },
  {
    id: "presentation",
    name: "Presentation",
    width: 1920,
    height: 1080,
    shape: "landscape",
    category: "Presentations",
  },
] as const;
type PresetChannel = (typeof campaignFormats)[number]["id"];
export type Channel = PresetChannel | `custom:${string}`;
export type Counts = Partial<Record<PresetChannel, number>>;
export interface CampaignFormat {
  id: Channel;
  name: string;
  width: number;
  height: number;
}
export interface CustomCampaignFormat extends CampaignFormat {
  id: `custom:${string}`;
  count: number;
}
export interface CampaignBrief {
  designProfile?: DesignStyleProfile;
  name: string;
  objective: string;
  audience: string;
  style: string;
  brand?: BrandProfile;
  palette: string[];
  logo?: Asset;
  folderName: string;
  intent: string;
  message: string;
  cta: string;
  avoid: string;
  images: Asset[];
  generatePhoto: boolean;
  photoPrompt: string;
}
export interface CampaignTask {
  id: string;
  channel: Channel | "photo";
  format?: CampaignFormat;
  count: number;
  status: "queued" | "running" | "completed" | "failed";
  jobId?: string;
  stage?: string;
  error?: string;
  designIds?: string[];
}
export interface CampaignBatch {
  id: string;
  createdAt: string;
  status: "running" | "paused" | "completed" | "failed";
  pauseRequested?: boolean;
  error?: string;
  tasks: CampaignTask[];
  brief: CampaignBrief;
  system?: { palette: string[]; fonts: string[]; direction: string };
}
export interface CampaignFolder {
  id: string;
  name: string;
  intent: string;
  message: string;
  cta: string;
  avoid: string;
  counts: Counts;
  customFormats?: CustomCampaignFormat[];
  images: Asset[];
  generatePhoto: boolean;
  photoPrompt: string;
  batches: CampaignBatch[];
}
export interface Campaign {
  id: string;
  name: string;
  objective: string;
  audience: string;
  style: string;
  brand?: BrandProfile;
  palette: string[];
  logo?: Asset;
  updatedAt: string;
  folders: CampaignFolder[];
}
const db = createStore("forma-studio", "workspace");
let writes: Promise<unknown> = Promise.resolve();
const changed = () => window.dispatchEvent(new Event("forma:campaigns"));
export async function allCampaigns(): Promise<Campaign[]> {
  await writes.catch(() => {});
  return (await entries<string, Campaign>(db))
    .filter(([k]) => k.startsWith("campaign:"))
    .map(([, v]) => v)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function getCampaign(id: string): Promise<Campaign | undefined> {
  await writes.catch(() => {});
  return get(`campaign:${id}`, db);
}
export function saveCampaign(campaign: Campaign) {
  const copy = structuredClone(campaign);
  writes = writes
    .catch(() => {})
    .then(() => set(`campaign:${copy.id}`, copy, db))
    .then(changed);
  return writes;
}
export function updateCampaign(id: string, update: (value: Campaign) => void) {
  writes = writes
    .catch(() => {})
    .then(async () => {
      const current = await get<Campaign>(`campaign:${id}`, db);
      if (!current) throw new Error("This campaign is no longer available.");
      update(current);
      current.updatedAt = new Date().toISOString();
      await set(`campaign:${id}`, current, db);
      changed();
    });
  return writes;
}
export const emptyCounts = (): Counts => ({
  instagram: 1,
  facebook: 1,
  linkedin: 1,
  story: 0,
});
export async function readCampaignDraft<T>(): Promise<T | null> {
  await writes.catch(() => {});
  return (await get("campaign-wizard", db)) || null;
}
export function writeCampaignDraft(value: unknown) {
  const copy = structuredClone(value);
  writes = writes.catch(() => {}).then(() => set("campaign-wizard", copy, db));
  return writes;
}
export const emptyFolder = (): CampaignFolder => ({
  id: uid(),
  name: "",
  intent: "",
  message: "",
  cta: "",
  avoid: "",
  counts: emptyCounts(),
  customFormats: [],
  images: [],
  generatePhoto: false,
  photoPrompt: "",
  batches: [],
});
export function campaignFolderFormats(folder: CampaignFolder) {
  return [
    ...campaignFormats.map((format) => ({
      ...format,
      count: folder.counts[format.id] ?? 0,
    })),
    ...(folder.customFormats || []),
  ];
}
export function campaignFormatProblem(folder: CampaignFolder): string {
  const formats = campaignFolderFormats(folder);
  if ((folder.customFormats?.length || 0) > 6)
    return "Use up to six custom sizes in one folder.";
  if (
    formats.some(
      (f) => !Number.isInteger(f.count) || f.count < 0 || f.count > 6,
    ) ||
    !formats.some((f) => f.count > 0)
  )
    return "Choose one to six designs for at least one format.";
  if (formats.some((f) => !f.name.trim() || f.name.length > 80))
    return "Give each custom size a name, up to 80 characters.";
  if (
    formats.some(
      (f) =>
        !Number.isInteger(f.width) ||
        !Number.isInteger(f.height) ||
        f.width < 256 ||
        f.height < 256 ||
        f.width > 4096 ||
        f.height > 4096 ||
        f.width * f.height > 12000000,
    )
  )
    return "Use whole-pixel dimensions from 256 to 4,096 px, up to 12 megapixels.";
  if (
    new Set(formats.map((f) => f.id)).size !== formats.length ||
    folder.customFormats?.some((f) => !/^custom:[a-z0-9-]+$/i.test(f.id))
  )
    return "Remove the duplicated or invalid custom size and add it again.";
  return "";
}
function taskFormat(task: CampaignTask): CampaignFormat {
  const format =
    task.format || campaignFormats.find((f) => f.id === task.channel);
  if (!format)
    throw new Error(
      "This campaign format is no longer available. Add it to a new collection.",
    );
  return format;
}
export function makeBatch(
  campaign: Campaign,
  folder: CampaignFolder,
  designProfile?: DesignStyleProfile,
): CampaignBatch {
  const formats = campaignFolderFormats(folder);
  if (
    !campaign.name.trim() ||
    campaign.objective.trim().length < 8 ||
    !folder.name.trim() ||
    folder.intent.trim().length < 8
  )
    throw new Error(
      "Give the campaign and folder a name and a specific objective.",
    );
  const formatProblem = campaignFormatProblem(folder);
  if (formatProblem) throw new Error(formatProblem);
  if (
    folder.images.length > 4 ||
    (folder.generatePhoto && folder.images.length >= 4)
  )
    throw new Error("Use up to four images, including a generated photo.");
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    status: "running",
    brief: structuredClone({
      designProfile: designProfile?.enabled ? designProfile : undefined,
      name: campaign.name,
      objective: campaign.objective,
      audience: campaign.audience,
      style: campaign.style,
      brand: campaign.brand,
      palette: campaign.palette,
      logo: campaign.logo,
      folderName: folder.name,
      intent: folder.intent,
      message: folder.message,
      cta: folder.cta,
      avoid: folder.avoid,
      images: folder.images,
      generatePhoto: folder.generatePhoto,
      photoPrompt: folder.photoPrompt,
    }),
    tasks: [
      ...(folder.generatePhoto
        ? [
            {
              id: uid(),
              channel: "photo" as const,
              count: 1,
              status: "queued" as const,
            },
          ]
        : []),
      ...formats
        .filter((f) => f.count > 0)
        .map((f) => ({
          id: uid(),
          channel: f.id,
          format: { id: f.id, name: f.name, width: f.width, height: f.height },
          count: f.count,
          status: "queued" as const,
        })),
    ],
  };
}
export async function campaignImage(file: File): Promise<Asset> {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 20 * 1024 * 1024
  )
    throw new Error("Choose a PNG, JPG or WebP image under 20 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    if (canvas.width < 64 || canvas.height < 64)
      throw new Error("Choose an image at least 64 pixels wide and high.");
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const src = canvas.toDataURL("image/png");
    if (src.length > 4_000_000)
      throw new Error(
        "This image has too much detail for this batch. Upload a smaller copy.",
      );
    return {
      id: uid(),
      name: file.name.slice(0, 120),
      src,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    bitmap.close();
  }
}
function jobBody(batch: CampaignBatch, task: CampaignTask) {
  const b = batch.brief;
  const format = taskFormat(task);
  return {
    clientRequestId: task.id,
    campaign: true,
    designProfile: b.designProfile ?? null,
    prompt: `PARENT CAMPAIGN: ${b.name}\nOverall objective: ${b.objective}\nAudience: ${b.audience}\nSUBCAMPAIGN FOLDER: ${b.folderName}\nFolder intent: ${b.intent}\nRequired message and facts: ${b.message || "Use only facts in the brief."}\nDesired action: ${b.cta || "Choose an appropriate non-factual action from the stated objective."}\nAvoid: ${b.avoid || "Generic layouts and unsupported claims."}\nDELIVERABLE: ${task.count} distinct ${format.name} designs. Each page must be one complete independent design.\n${batch.system ? `APPROVED VISUAL SYSTEM: ${JSON.stringify(batch.system)}` : ""}`,
    width: format.width,
    height: format.height,
    pages: task.count,
    style:
      b.style || "Professional editorial art direction tailored to the brief",
    audience: b.audience,
    brand: b.brand?.name || b.name,
    brandContext: b.brand,
    palette: batch.system?.palette.length ? batch.system.palette : b.palette,
    ...(b.logo ? { logo: b.logo } : {}),
    campaignImages: b.images.map((image) => ({
      name: image.name,
      src: image.src,
    })),
    designIntent: {
      outcome: b.objective.slice(0, 600),
      message: b.intent.slice(0, 600),
      preserve: b.message.slice(0, 800),
      avoid: b.avoid.slice(0, 600),
    },
  };
}
const running = new Set<string>();
const delay = () => new Promise((resolve) => setTimeout(resolve, 1500));
export async function runCampaignBatch(
  campaignId: string,
  folderId: string,
  batchId: string,
) {
  if (running.has(batchId)) return;
  running.add(batchId);
  const locate = (c: Campaign) =>
    c.folders
      .find((f) => f.id === folderId)
      ?.batches.find((b) => b.id === batchId);
  const edit = (fn: (batch: CampaignBatch) => void) =>
    updateCampaign(campaignId, (c) => {
      const b = locate(c);
      if (!b) throw new Error("This batch is no longer available.");
      fn(b);
    });
  const read = async () => {
    const c = await getCampaign(campaignId);
    const b = c && locate(c);
    if (!b) throw new Error("This batch is no longer available.");
    return b;
  };
  try {
    if (!navigator.locks)
      throw new Error(
        "Open Forma in a current browser or the desktop app to create campaign batches.",
      );
    await navigator.locks.request(
      "forma:campaign-generation",
      { ifAvailable: true },
      async (lock) => {
        if (!lock) {
          await edit((b) => {
            b.status = "paused";
            b.error =
              "Another campaign is creating designs. Resume this batch when it finishes.";
          });
          return;
        }
        const session = await designerRequest("/session");
        if (!session.ready)
          throw new Error(
            "Connect your AI account in AI Designer, then resume this campaign.",
          );
        await edit((b) => {
          b.status = "running";
          b.pauseRequested = false;
          b.error = "";
        });
        for (let index = 0; index < (await read()).tasks.length; index++) {
          let batch = await read();
          if (batch.pauseRequested) {
            await edit((b) => {
              b.status = "paused";
            });
            return;
          }
          let task = batch.tasks[index];
          if (task.status === "completed") continue;
          const route = task.channel === "photo" ? "/photos" : "/jobs";
          let job: any;
          if (task.jobId) {
            try {
              job = await designerRequest(
                `${route}/${task.jobId}`,
                session.token,
              );
            } catch (error) {
              if ((error as { status?: number }).status !== 404) throw error;
            }
            if (job?.status === "failed" || job?.status === "cancelled") {
              job = null;
              await edit((b) => {
                b.tasks[index].status = "failed";
              });
              task = (await read()).tasks[index];
            }
          }
          if (!job) {
            // Persist the request ID before submitting, so a lost response can be
            // recovered without submitting a second paid generation.
            if (task.status === "failed")
              await edit((b) => {
                b.tasks[index].id = uid();
                b.tasks[index].jobId = undefined;
              });
            batch = await read();
            task = batch.tasks[index];
            await edit((b) => {
              b.tasks[index].status = "running";
              b.tasks[index].error = "";
              b.tasks[index].jobId = task.id;
              b.tasks[index].stage = "Reading the campaign brief";
            });
            const b = batch.brief;
            job = await designerRequest(route, session.token, {
              method: "POST",
              body: JSON.stringify(
                task.channel === "photo"
                  ? {
                      clientRequestId: task.id,
                      prompt: `Create a professional campaign photograph for ${b.name}. Campaign objective: ${b.objective}. Audience: ${b.audience}. Subcampaign intent: ${b.intent}. Image direction: ${b.photoPrompt || b.style}. Use a credible subject and setting directly relevant to this business and intent. Leave purposeful negative space for separate editable typography. No text, invented product claims, watermarks, or logos.`,
                      format: "Landscape",
                      style: "Studio product",
                      brandContext: b.brand,
                      designProfile: b.designProfile ?? null,
                    }
                  : jobBody(batch, task),
              ),
            });
            await edit((b) => {
              b.tasks[index].jobId = job.id;
            });
          }
          for (;;) {
            await edit((b) => {
              b.tasks[index].stage = job.stage;
            });
            if (job.status === "completed" && job.result) break;
            if (job.status === "failed" || job.status === "cancelled") {
              await edit((b) => {
                b.tasks[index].status = "failed";
                b.tasks[index].error = job.error || "The AI job was cancelled.";
              });
              throw new Error(job.error || "The AI job was cancelled.");
            }
            await delay();
            try {
              job = await designerRequest(`${route}/${job.id}`, session.token);
            } catch (error) {
              if (!isTransientDesignerError(error)) throw error;
              await edit((b) => {
                b.tasks[index].stage = "Reconnecting to the existing AI job";
              });
            }
          }
          if (task.channel === "photo") {
            const image = await campaignImage(
              new File(
                [await (await fetch(job.result.src)).blob()],
                "Campaign photo.png",
                { type: "image/png" },
              ),
            );
            await edit((b) => {
              b.brief.images.push(image);
              b.tasks[index].status = "completed";
              b.tasks[index].stage = "Campaign photo ready";
            });
          } else {
            const result = (job as DesignJob).result!;
            const format = taskFormat(task);
            if (
              result.width !== format.width ||
              result.height !== format.height ||
              result.pages.length !== task.count
            ) {
              await edit((b) => {
                b.tasks[index].status = "failed";
              });
              throw new Error(
                "The AI returned a different format or quantity. Your completed designs are safe; retry this format.",
              );
            }
            const ids: string[] = [];
            for (const [i, page] of result.pages.entries()) {
              const id = `campaign-${batch.id}-${task.channel}-${i}`;
              if (!(await getDesign(id))) {
                const design = await proposalToDesign({
                  ...result,
                  title: `${page.name} · ${format.name}`,
                  pages: [page],
                });
                design.id = id;
                design.campaignId = campaignId;
                design.folderId = folderId;
                design.aiJobId = `${job.id}:${i}`;
                await saveDesign(design);
              }
              ids.push(id);
            }
            await edit((b) => {
              b.tasks[index].status = "completed";
              b.tasks[index].designIds = ids;
              b.tasks[index].stage = "Saved to this folder";
              if (!b.system)
                b.system = {
                  palette: result.palette,
                  fonts: [
                    ...new Set(
                      result.pages.flatMap((p) =>
                        p.elements
                          .filter((e) => e.type === "text")
                          .map((e) => e.font),
                      ),
                    ),
                  ],
                  direction: result.description.slice(0, 700),
                };
            });
          }
        }
        await edit((b) => {
          b.status = "completed";
          b.error = "";
        });
      },
    );
  } catch (error) {
    await edit((b) => {
      b.status = "failed";
      b.error = (error as Error).message;
    }).catch(() => {});
  } finally {
    running.delete(batchId);
    changed();
  }
}
export async function resumeCampaigns() {
  for (const c of await allCampaigns())
    for (const f of c.folders)
      for (const b of f.batches)
        if (b.status === "running") {
          if (b.pauseRequested)
            await updateCampaign(c.id, (current) => {
              current.folders
                .find((folder) => folder.id === f.id)!
                .batches.find((batch) => batch.id === b.id)!.status = "paused";
            });
          else void runCampaignBatch(c.id, f.id, b.id);
        }
}
