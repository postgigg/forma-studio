// Explicitly pinned: --ignore-user-config otherwise falls back to the CLI default.
export const aiEngine = Object.freeze({
  engine: "Codex CLI",
  model: "gpt-6-astra",
  modelLabel: "GPT-6 Astra",
  reasoningEffort: "max",
  imageEngine: "Codex native image generation",
});
export function modelArguments() {
  return ["--model", aiEngine.model, "-c", `model_reasoning_effort="${aiEngine.reasoningEffort}"`];
}
