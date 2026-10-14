export const intentLimits = { outcome: 600, message: 600, preserve: 800, avoid: 600 };
export function validateDesignIntent(value) {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Use a valid design intent.");
  const clean = {};
  for (const [key, limit] of Object.entries(intentLimits)) {
    const text = value[key] ?? "";
    if (typeof text !== "string" || text.length > limit)
      throw new Error(`Design ${key} must be text under ${limit + 1} characters.`);
    clean[key] = text.trim();
  }
  return Object.values(clean).some(Boolean) ? clean : undefined;
}
