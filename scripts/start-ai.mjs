import { spawn } from "node:child_process";
import { mkdirSync, openSync, closeSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.FORMA_AI_PORT || 5188);
try {
  const result = await fetch(`http://127.0.0.1:${port}/health`, {
    signal: AbortSignal.timeout(1500),
  });
  const info = await result.json();
  if (info.service === "forma-local-designer") {
    console.log(`AI Designer is already running on port ${port}.`);
    process.exit(0);
  }
  throw new Error(`Port ${port} belongs to another service.`);
} catch (error) {
  if (error.message.includes("another service")) throw error;
}
mkdirSync(path.join(root, ".local"), { recursive: true });
const out = openSync(path.join(root, ".local", "designer.log"), "a");
const child = spawn(
  process.execPath,
  [path.join(root, "server", "designer.mjs")],
  { cwd: root, detached: true, windowsHide: true, stdio: ["ignore", out, out] },
);
writeFileSync(path.join(root, ".local", "designer.pid"), String(child.pid));
child.unref();
closeSync(out);
for (let i = 0; i < 20; i++) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(800),
    });
    if (health.ok) {
      console.log("Local AI Designer started in the background.");
      process.exit(0);
    }
  } catch {}
}
throw new Error("AI Designer did not start. Check .local/designer.log.");
