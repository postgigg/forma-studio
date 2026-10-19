import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { configureAI, withAIJob, selectedEngine, selectedReady, providerInventory, aiSettings, saveAISettings, recentActivity, activityLog, aiQueueStatus } from './ai-runtime.mjs';
import { designPipeline } from "./designer-pipeline.mjs";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createPhotoService } from "./photos.mjs";
import { createRefinementService } from "./refinements.mjs";
import { createFrameService } from "./frames.mjs";
import { createBrandImportService } from "./brand-imports.mjs";
import {
  outputSchema,
  validateBrief,
  validateProposal,
  validateDesignAssets,
} from "./contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(process.env.FORMA_DATA_DIR || path.join(root, ".local"), "designer");
mkdirSync(runtime, { recursive: true });
const schemaPath = path.join(runtime, "design.schema.json");
writeFileSync(schemaPath, JSON.stringify(outputSchema));
const port = Number(process.env.FORMA_AI_PORT || 5188);
const allowedOrigins = new Set([
  "http://localhost:5186",
  "http://127.0.0.1:5186",
  "http://localhost:5187",
  "http://127.0.0.1:5187",
  "http://127.0.0.1:51860",
  ...(process.env.FORMA_DESKTOP_TEST_DATA ? ["http://127.0.0.1:51862"] : []),
]);
const token = randomBytes(32).toString("hex");
const win = process.platform === "win32";
function findCodex() {
  if (process.env.FORMA_CODEX_BIN && existsSync(process.env.FORMA_CODEX_BIN))
    return process.env.FORMA_CODEX_BIN;
  const packageRoot = path.join(
    process.env.APPDATA || "",
    "npm",
    "node_modules",
    "@openai",
    "codex",
  );
  const binary = path.join(
    packageRoot,
    "node_modules",
    "@openai",
    "codex-win32-x64",
    "vendor",
    "x86_64-pc-windows-msvc",
    "bin",
    "codex.exe",
  );
  if (win && existsSync(binary)) return binary;
  if (!win) return "codex";
  throw new Error(
    "Codex CLI was not found. Set FORMA_CODEX_BIN to the codex.exe path.",
  );
}
let codex;
try { codex = findCodex(); } catch { /* Other supported CLIs can run without Codex. */ }
configureAI({runtime,codex});
const auth = codex ? spawnSync(codex, ["login", "status"], {
  encoding: "utf8",
  windowsHide: true,
  timeout: 30000,
}) : null;
const authenticated = () => selectedReady();
const jobs = new Map();
for (const id of readdirSync(runtime)) {
  if (!/^[a-f0-9-]{36}$/.test(id)) continue;
  try {
    const filename = path.join(runtime, id, "proposal.json");
    const info = statSync(filename);
    if (info.size > 2000000) continue;
    const assetsPath = path.join(runtime, id, "assets.json");
    const extraAssets = existsSync(assetsPath)
      ? validateDesignAssets(JSON.parse(readFileSync(assetsPath, "utf8")))
      : [];
    const result = validateProposal(
      JSON.parse(readFileSync(filename, "utf8")),
      extraAssets,
    );
    if (extraAssets.length) result.extraAssets = extraAssets;
    jobs.set(id, {
      id,
      status: "completed",
      stage: "Your design is ready",
      result,
      startedAt: info.mtimeMs,
      finishedAt: info.mtimeMs,
      createdAt: info.mtime.toISOString(),
    });
  } catch {
    /* Incomplete or invalid jobs are never presented as usable designs. */
  }
}
let active = null;
function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}
function publicJob(job, includeResult = true) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    ai: job.ai || null,
    createdAt: job.createdAt,
    result: includeResult ? job.result || null : null,
    error: job.error || null,
    elapsedSeconds: Math.round(
      ((job.finishedAt || Date.now()) - job.startedAt) / 1000,
    ),
  };
}
function validToken(value) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{64}$/.test(value) &&
    timingSafeEqual(Buffer.from(value), Buffer.from(token))
  );
}
function stop(job) {
  job.controller?.abort();
  if (!job.child) return;
  if (win)
    spawn("taskkill", ["/PID", String(job.child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else job.child.kill("SIGTERM");
}
async function launch(job, brief) {
  active = job.id;
  job.status = "running";
  job.controller = new AbortController();
  try {
    job.result = await designPipeline({ job, brief, codex, runtime });
    job.status = "completed";
    job.stage = "Your design is ready";
    console.log(`Completed design ${job.id}: ${job.result.pages.length} page(s).`);
  } catch (error) {
    job.status = job.controller.signal.aborted ? "cancelled" : "failed";
    job.error = error.message;
    job.stage = job.status === "cancelled" ? "Cancelled" : "Design needs another try";
    console.error(`Design ${job.id}: ${job.error}`);
  } finally {
    job.finishedAt = Date.now();
    if (active === job.id) active = null;
  }
}
const photoService = createPhotoService({
  codex,
  runtime,
  json,
  authenticated,
});
const refinementService = createRefinementService({
  codex,
  runtime,
  json,
  authenticated,
});
const frameService = createFrameService({ json });
const brandImportService = createBrandImportService({ codex, runtime, json, authenticated });
const server = http.createServer(async (req, res) => {
  const host = req.headers.host || "";
  const listeningPort = server.address().port;
  if (!["127.0.0.1:" + listeningPort, "localhost:" + listeningPort].includes(host))
    return json(res, 403, { error: "Local requests only." });
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin))
    return json(res, 403, { error: "Origin is not allowed." });
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Forma-Token",
    );
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/health")
    return json(res, 200, {
      service: "forma-local-designer",
      busy: aiQueueStatus().jobs > 0,
      ready: authenticated(),
      ...selectedEngine(),
      version: 1,
    });
  if (req.method === "GET" && url.pathname === "/session") {
    if (!origin || !allowedOrigins.has(origin))
      return json(res, 403, { error: "Open the designer from Forma Studio." });
    return json(res, 200, { token, ready: authenticated(), ...selectedEngine(), signedIn: auth?.status === 0 });
  }
  if (!origin || !validToken(req.headers["x-forma-token"]))
    return json(res, 403, { error: "Reconnect the local designer and retry." });
  if (req.method === 'GET' && url.pathname === '/ai/settings') return json(res,200,{settings:aiSettings(),providers:providerInventory(),queue:aiQueueStatus()});
  if (req.method === 'POST' && url.pathname === '/ai/settings') {
    if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'JSON required.'});
    try {
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4000)throw new Error('Settings are too large.');}
      const settings=saveAISettings(JSON.parse(raw));
      return json(res,200,{settings,providers:providerInventory(),queue:aiQueueStatus()});
    } catch(error){return json(res,aiQueueStatus().jobs?409:400,{error:error.message});}
  }
  if(req.method==='GET'&&url.pathname==='/ai/activity')return json(res,200,recentActivity());
  const logMatch=url.pathname.match(/^\/ai\/activity\/([a-f0-9-]{36})$/i);
  if(req.method==='GET'&&logMatch){const log=activityLog(logMatch[1]);return json(res,log?200:404,log||{error:'No activity record was found for this job.'});}
  if (await frameService.handle(req, res, url)) return;
  if (await photoService.handle(req, res, url)) return;
  if (await refinementService.handle(req, res, url)) return;
  if (await brandImportService.handle(req, res, url)) return;
  if (req.method === "GET" && url.pathname === "/jobs")
    return json(
      res,
      200,
      [...jobs.values()]
        .filter((job) => job.status === "completed")
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, 30)
        .map((job) => ({
          id: job.id,
          title: job.result.title,
          createdAt: job.createdAt,
          layers: job.result.pages.reduce(
            (sum, page) => sum + page.elements.length,
            0,
          ),
        })),
    );
  if (req.method === "POST" && url.pathname === "/shutdown") {
    json(res, 200, { stopped: true });
    for (const job of jobs.values()) stop(job);
    photoService.shutdown();
    refinementService.shutdown();
    brandImportService.shutdown();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
    return;
  }
  const match = url.pathname.match(/^\/jobs\/([a-f0-9-]{36})$/);
  if (match) {
    const job = jobs.get(match[1]);
    if (!job)
      return json(res, 404, {
        error: "This design session has ended. Start a new design.",
      });
    if (req.method === "GET") return json(res, 200, publicJob(job, url.searchParams.get("summary") !== "1"));
    if (req.method === "DELETE") {
      job.status = "cancelled";
      job.stage = "Cancelled";
      stop(job);
      return json(res, 200, publicJob(job));
    }
  }
  if (req.method === "POST" && url.pathname === "/jobs") {
    if (!authenticated())
      return json(res, 503, {
        error:
          "Install and sign in to your selected AI CLI, then reconnect.",
      });
    if (!req.headers["content-type"]?.startsWith("application/json"))
      return json(res, 415, { error: "JSON required." });
    let raw = "";
    try {
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 33000000) {
          json(res, 413, { error: "The brief is too large." });
          req.destroy();
          return;
        }
      }
      const brief = validateBrief(JSON.parse(raw));
      if (brief.clientRequestId && jobs.has(brief.clientRequestId)) return json(res, 200, publicJob(jobs.get(brief.clientRequestId)));
      if (active)
        return json(res, 409, {
          error:
            "A design is already being created. Wait for it or cancel it first.",
        });
      for (const [id, j] of jobs)
        if (Date.now() - j.startedAt > 86400000 && id !== active)
          jobs.delete(id);
      if (jobs.size >= 100)
        return json(res, 429, {
          error: "Restart the designer to begin a new session.",
        });
      const job = {
        id: brief.clientRequestId || randomUUID(),
        status: "queued",
        stage: "Reading your brief",
        startedAt: Date.now(),
        createdAt: new Date().toISOString(),
      };
      jobs.set(job.id, job);
      void withAIJob(job, 'design', () => launch(job, brief));
      json(res, 202, publicJob(job));
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return;
  }
  json(res, 404, { error: "Not found." });
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Forma AI Designer: http://127.0.0.1:${server.address().port} · ${selectedEngine().engine}`,
  ),
);
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const job of jobs.values()) stop(job);
    photoService.shutdown();
    refinementService.shutdown();
    brandImportService.shutdown();
    server.close(() => process.exit(0));
  });
