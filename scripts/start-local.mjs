import { spawn } from "node:child_process";
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const windows = process.platform === "win32";
function run(command, args, { quiet = false, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      windowsHide: true,
      shell: windows && command === "npx",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "",
      err = "";
    child.stdout.on("data", (data) => {
      out += data;
      if (!quiet) process.stdout.write(data);
    });
    child.stderr.on("data", (data) => {
      err += data;
      if (!quiet) process.stderr.write(data);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 || allowFailure
        ? resolve({ code, out, err })
        : reject(
            new Error(
              `${command} ${args[0]} failed. ${quiet ? "Check Docker Desktop and retry." : err}`,
            ),
          ),
    );
  });
}
try {
  await run("docker", ["version", "--format", "{{.Server.Version}}"], {
    quiet: true,
  });
  const network = await run("docker", ["network", "inspect", "forma-local"], {
    quiet: true,
    allowFailure: true,
  });
  if (network.code !== 0)
    await run(
      "docker",
      [
        "network",
        "create",
        "--subnet",
        process.env.FORMA_DOCKER_SUBNET || "10.247.186.0/24",
        "-o",
        "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
        "forma-local",
      ],
      { quiet: true },
    );
  console.log(
    "Starting the isolated Forma Supabase stack. The first start may download images.",
  );
  const started = await run(
    "npx",
    ["supabase", "start", "--network-id", "forma-local"],
    { quiet: true, allowFailure: true },
  );
  if (started.code !== 0) {
    console.error(
      started.err.replace(
        /(?:eyJ[a-zA-Z0-9_.-]+|sb_secret_[a-zA-Z0-9_-]+)/g,
        "[redacted]",
      ),
    );
    throw new Error("Local Supabase did not start.");
  }
  const status = await run(
    "npx",
    ["supabase", "status", "--output-format", "json"],
    { quiet: true },
  );
  const result = JSON.parse(status.out);
  const values = result.env || result;
  const api = values.API_URL || values.api_url;
  const publicKey =
    values.ANON_KEY || values.anon_key || values.PUBLISHABLE_KEY;
  if (!api || !publicKey)
    throw new Error(
      "The Supabase CLI did not return a public API URL and key.",
    );
  await writeFile(
    ".env.local",
    `VITE_SUPABASE_URL=${api}\nVITE_SUPABASE_ANON_KEY=${publicKey}\n`,
  );
  console.log(
    "Supabase is running. Public browser configuration written to .env.local.",
  );
  if (process.argv.includes("--database-only")) process.exit(0);
  await run("docker", [
    "compose",
    "--env-file",
    ".env.local",
    "up",
    "--build",
    "-d",
  ]);
  const designer = await run(process.execPath, ["scripts/start-ai.mjs"], {
    allowFailure: true,
  });
  if (designer.code !== 0)
    console.log(
      "The editor is ready. To enable AI, install/sign in to Codex and run npm run ai:start.",
    );
  console.log("Forma Studio is ready at http://localhost:5186");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
