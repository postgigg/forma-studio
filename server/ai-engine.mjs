// Explicitly pinned: --ignore-user-config otherwise falls back to the CLI default.
export const aiEngine = Object.freeze({
  engine: "Codex CLI",
  model: "gpt-6.1-sol",
  modelLabel: "GPT-6.1 Sol",
  reasoningEffort: "max",
  imageEngine: "Codex native image generation",
});
export function modelArguments(model = aiEngine.model) {
  return ["--model", model || aiEngine.model, "-c", `model_reasoning_effort="${aiEngine.reasoningEffort}"`];
}
