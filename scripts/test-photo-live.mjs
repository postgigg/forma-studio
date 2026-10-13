import { writeFileSync, mkdirSync } from "node:fs";
import { pngDimensions } from "../server/photos.mjs";
const base = "http://127.0.0.1:5188",
  origin = "http://localhost:5186";
const session = await fetch(base + "/session", {
  headers: { Origin: origin },
}).then((r) => r.json());
const headers = {
  Origin: origin,
  "X-Forma-Token": session.token,
  "Content-Type": "application/json",
};
const response = process.argv[2]
  ? await fetch(base + "/photos/" + process.argv[2], { headers })
  : await fetch(base + "/photos", {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt:
          "Photorealistic editorial interior photograph of a warm minimal reading corner, sculptural cream boucle lounge chair, walnut side table, open art book and leafy olive tree, late afternoon sunlight across pale limewash walls, refined composition and realistic materials, no text, no logos.",
        format: "Landscape",
        style: "Natural light",
      }),
    });
let job = await response.json();
if (!response.ok) throw new Error(job.error);
console.log(`Live AI photo started: ${job.id}`);
const started = Date.now();
while (Date.now() - started < 500000) {
  await new Promise((r) => setTimeout(r, 2000));
  job = await fetch(base + "/photos/" + job.id, { headers }).then((r) =>
    r.json(),
  );
  if (job.status === "completed") break;
  if (job.status === "failed" || job.status === "cancelled")
    throw new Error(job.error || job.status);
}
if (!job.result) throw new Error("Photo did not finish.");
const bytes = Buffer.from(job.result.src.split(",")[1], "base64");
const size = pngDimensions(bytes);
mkdirSync(".local", { recursive: true });
writeFileSync(".local/photo-output.png", bytes);
writeFileSync(
  ".local/photo-proof.json",
  JSON.stringify(
    {
      id: job.id,
      prompt: job.prompt,
      ...size,
      bytes: bytes.length,
      elapsedSeconds: job.elapsedSeconds,
    },
    null,
    2,
  ),
);
console.log(
  `PASS: actual generated photo ${size.width}x${size.height}, ${bytes.length} bytes, ${job.elapsedSeconds}s.`,
);
