const port = Number(process.env.FORMA_AI_PORT || 5188);
const endpoint = `http://127.0.0.1:${port}`;
const origin = "http://localhost:5186";
try {
  const health = await fetch(endpoint + "/health", {
    signal: AbortSignal.timeout(2000),
  }).then((r) => r.json());
  if (health.service !== "forma-local-designer")
    throw new Error("This port does not belong to Forma AI Designer.");
  const session = await fetch(endpoint + "/session", {
    headers: { Origin: origin },
  }).then((r) => r.json());
  const response = await fetch(endpoint + "/shutdown", {
    method: "POST",
    headers: { Origin: origin, "X-Forma-Token": session.token },
  });
  if (!response.ok) throw new Error("The local designer could not be stopped.");
  console.log("Forma AI Designer stopped.");
} catch (error) {
  if (error.message === "fetch failed")
    console.log("Forma AI Designer is not running.");
  else throw error;
}
