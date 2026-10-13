import { writeFileSync } from "node:fs";
const base = "http://127.0.0.1:5188",
  origin = "http://localhost:5186";
const session = await (
  await fetch(base + "/session", { headers: { Origin: origin } })
).json();
if (!session.ready) throw new Error("Designer is not ready.");
const headers = {
  Origin: origin,
  "X-Forma-Token": session.token,
  "Content-Type": "application/json",
};
const start = await fetch(base + "/jobs", {
  method: "POST",
  headers,
  body: JSON.stringify({
    prompt:
      "Create an elegant editorial Instagram launch post for an independent botanical skincare brand named LEAF & LIGHT. Required copy: A gentler daily ritual. Plant-powered skincare. Discover the collection. Use sage green, ivory, fine typography, generous whitespace and a botanical graphic. This must be an actual finished professional design.",
    width: 1080,
    height: 1080,
    pages: 1,
    style: "Refined editorial",
    audience: "Design-conscious adults",
    brand: "LEAF & LIGHT",
  }),
});
const job = await start.json();
if (!start.ok) throw new Error(job.error);
console.log("Live Codex design started:", job.id);
for (let i = 0; i < 180; i++) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const status = await (
    await fetch(base + "/jobs/" + job.id, { headers })
  ).json();
  if (i % 10 === 0) console.log(status.stage);
  if (status.status === "failed") throw new Error(status.error);
  if (status.status === "completed") {
    writeFileSync(
      ".local/designer-proof.json",
      JSON.stringify(status.result, null, 2),
    );
    console.log(
      JSON.stringify({
        status: "passed",
        title: status.result.title,
        pages: status.result.pages.length,
        elements: status.result.pages[0].elements.length,
        seconds: status.elapsedSeconds,
      }),
    );
    process.exit(0);
  }
}
throw new Error("Timed out waiting for live designer.");
