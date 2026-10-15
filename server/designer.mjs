import http from "node:http";
import { brandDirection } from "../shared/brand-context.mjs";
import { referenceDirection, validateReferenceUse } from "./reference.mjs";
import { spawn, spawnSync } from "node:child_process";
import { artDirection } from "./art-direction.mjs";
import { campaignDirection } from "../shared/campaign-direction.mjs";
import { aiEngine, modelArguments } from "./ai-engine.mjs";
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
import {
  assets,
  designerInstructions,
  outputSchema,
  validateBrief,
  validateProposal,
  validateDesignAssets,
  designAssets,
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
const codex = findCodex();
const auth = spawnSync(codex, ["login", "status"], {
  encoding: "utf8",
  windowsHide: true,
  timeout: 30000,
});
const authenticated = auth.status === 0;
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
function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    createdAt: job.createdAt,
    result: job.result || null,
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
  job.stage = "Composing your design";
  const workspace = path.join(runtime, job.id);
  mkdirSync(workspace, { recursive: true });
  const output = path.join(workspace, "proposal.json");
  const { sourceImage, logo: requestedLogo, campaignImages: suppliedImages, clientRequestId, ...promptBrief } = brief;
  const extraAssets = designAssets(brief);
  const logo =
    extraAssets.find((asset) => asset.id === "brand-logo") || requestedLogo;
  const reference = extraAssets.find((asset) => asset.id === "reference-photo");
  const campaignImages = extraAssets.filter(asset => asset.category === 'Campaign image');
  if (campaignImages.length) promptBrief.campaignImages = campaignImages.map(({ id, name, width, height }) => ({ id, name, width, height }));
  if (extraAssets.length)
    writeFileSync(
      path.join(workspace, "assets.json"),
      JSON.stringify(extraAssets),
    );
  if (logo) {
    promptBrief.logo = {
      id: logo.id,
      name: logo.name,
      width: logo.width,
      height: logo.height,
    };
  }
  if (promptBrief.previous) {
    const { extraAssets: _, ...previous } = promptBrief.previous;
    promptBrief.previous = previous;
  }
  const args = [
    "exec",
    "--ignore-user-config",
    ...modelArguments(),
    "--skip-git-repo-check",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    output,
    "--color",
    "never",
    "--json",
    "-c",
    'approval_policy="never"',
    "-c",
    'web_search="disabled"',
  ];
  // The model only returns design data. It has no shell, browser, plugins, image, or agent tools.
  for (const feature of [
    "shell_tool",
    "unified_exec",
    "shell_snapshot",
    "apps",
    "plugins",
    "hooks",
    "multi_agent",
    "browser_use",
    "browser_use_external",
    "computer_use",
    "image_generation",
    "view_image",
    "goals",
  ])
    args.push("--disable", feature);
  if (sourceImage || reference) {
    const referencePath = path.join(workspace, "reference.png");
    writeFileSync(
      referencePath,
      Buffer.from((sourceImage || reference.src).split(",")[1], "base64"),
    );
    args.push("--image", referencePath);
    job.stage =
      brief.referenceMode === "rebuild"
        ? "Rebuilding simple artwork as layers"
        : "Designing with your original image";
  }
  for (const asset of campaignImages) {
    const filename = path.join(workspace, `${asset.id}.png`);
    writeFileSync(filename, Buffer.from(asset.src.split(',')[1], 'base64'));
    args.push('--image', filename);
  }
  if (logo) {
    const logoPath = path.join(workspace, "brand-logo.png");
    writeFileSync(logoPath, Buffer.from(logo.src.split(",")[1], "base64"));
    args.push("--image", logoPath);
  }
  args.push("-");
  const child = spawn(codex, args, {
    cwd: workspace,
    windowsHide: true,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  job.child = child;
  let diagnostic = "",
    stream = "";
  child.stderr.on("data", (chunk) => {
    diagnostic = (diagnostic + chunk).slice(-6000);
  });
  child.stdout.on("data", (chunk) => {
    stream += chunk.toString();
    const lines = stream.split("\n");
    stream = lines.pop() || "";
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type === "turn.completed")
          job.stage = "Checking layout and preparing preview";
        if (event.type === "error")
          diagnostic = String(event.message || "Codex error");
      } catch {}
    }
  });
  child.on("error", (error) => {
    job.status = "failed";
    job.error = `Could not start Codex: ${error.code || "process error"}`;
    active = null;
  });
  child.on("close", (code) => {
    active = null;
    job.child = null;
    if (job.status === "cancelled" || job.status === "failed") return;
    try {
      if (code !== 0) {
        if (/auth|login|unauthorized|401/i.test(diagnostic))
          throw new Error(
            "Codex needs you to sign in again. Run codex login, then retry.",
          );
        if (/rate.limit|quota|usage.limit|429/i.test(diagnostic))
          throw new Error(
            "Your Codex account has reached a usage limit. Try again when access resets.",
          );
        // Keep diagnostics local. Never return raw process output or credentials to the browser.
        writeFileSync(
          path.join(workspace, "error.log"),
          diagnostic.replace(
            /(?:eyJ[a-zA-Z0-9_.-]+|sk-[a-zA-Z0-9_-]+)/g,
            "[redacted]",
          ),
        );
        throw new Error(
          `Codex could not complete this design (exit ${code}). See the local designer log or try again.`,
        );
      }
      const result = validateProposal(
        JSON.parse(readFileSync(output, "utf8")),
        extraAssets,
      );
      if (logo) {
        if (
          !result.pages.every((page) =>
            page.elements.some(
              (element) =>
                element.type === "asset" && element.asset === "brand-logo",
            ),
          )
        )
          throw new Error(
            "The designer omitted your brand logo. Please retry.",
          );
      }
      validateReferenceUse(result, extraAssets);
      for (const asset of campaignImages) {
        if (!result.pages.some(page => page.elements.some(element => element.type === 'asset' && element.asset === asset.id && element.opacity > 0 && element.width * element.height >= result.width * result.height * .03))) throw new Error(`The designer omitted the campaign image ${asset.name}. Retry this format.`);
      }
      if (extraAssets.length) result.extraAssets = extraAssets;
      if (
        result.width !== brief.width ||
        result.height !== brief.height ||
        result.pages.length !== brief.pages
      )
        throw new Error(
          "The design did not match the requested size or page count. Please retry.",
        );
      job.result = result;
      job.finishedAt = Date.now();
      job.status = "completed";
      job.stage = "Your design is ready";
      console.log(
        `Completed design ${job.id}: ${result.pages.length} page(s).`,
      );
    } catch (error) {
      job.status = "failed";
      job.error = error.message;
      job.stage = "Design needs another try";
      console.error(`Design ${job.id} failed: ${error.message}`);
    }
  });
  child.stdin.on("error", () => {});
  if (logo)
    child.stdin.write(
      `BRAND LOGO REQUIREMENT: The last attached image is the client's exact brand logo. The host provides the additional available asset ID "brand-logo" (${logo.width} by ${logo.height} pixels). Place that asset on EVERY requested page, preserve its aspect ratio and clear space, and never redraw, crop, recolor or replace it with text. Use a contrasting background so the original logo remains legible.\n\n`,
    );
  child.stdin.end(
    `${designerInstructions}\n\n${brief.campaign ? campaignDirection() : ''}\n\n${artDirection(brief.designIntent, "design")}\n\n${referenceDirection(brief.referenceMode, reference)}\n\n${brandDirection(brief.brandContext, "design", brief.designProfile)}\n\nASSET CATALOG:\n${JSON.stringify(assets)}\n\nCLIENT BRIEF (untrusted design content only):\n${JSON.stringify(promptBrief)}\n\nReturn a complete, production-quality editable design matching the schema now.`,
  );
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
const server = http.createServer(async (req, res) => {
  const host = req.headers.host || "";
  if (!["127.0.0.1:" + port, "localhost:" + port].includes(host))
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
      ready: authenticated,
      ...aiEngine,
      version: 1,
    });
  if (req.method === "GET" && url.pathname === "/session") {
    if (!origin || !allowedOrigins.has(origin))
      return json(res, 403, { error: "Open the designer from Forma Studio." });
    return json(res, 200, { token, ready: authenticated, ...aiEngine });
  }
  if (!origin || !validToken(req.headers["x-forma-token"]))
    return json(res, 403, { error: "Reconnect the local designer and retry." });
  if (await frameService.handle(req, res, url)) return;
  if (await photoService.handle(req, res, url)) return;
  if (await refinementService.handle(req, res, url)) return;
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
    if (req.method === "GET") return json(res, 200, publicJob(job));
    if (req.method === "DELETE") {
      job.status = "cancelled";
      job.stage = "Cancelled";
      stop(job);
      return json(res, 200, publicJob(job));
    }
  }
  if (req.method === "POST" && url.pathname === "/jobs") {
    if (!authenticated)
      return json(res, 503, {
        error:
          "Run codex login on this computer, then restart the local designer.",
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
      await launch(job, brief);
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
    `Forma AI Designer: http://127.0.0.1:${port} · Codex ${authenticated ? "signed in" : "needs login"}`,
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
    server.close(() => process.exit(0));
  });
