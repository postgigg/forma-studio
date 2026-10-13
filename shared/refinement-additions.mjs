export const additionKinds = [
  "star",
  "sparkle",
  "rect",
  "ellipse",
  "line",
  "text",
  "path",
];
const num = { type: "number" },
  str = { type: "string" },
  nullable = { type: ["string", "null"] };
export const additionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "name",
    "x",
    "y",
    "width",
    "height",
    "angle",
    "fill",
    "stroke",
    "strokeWidth",
    "opacity",
    "text",
    "font",
    "fontSize",
    "path",
  ],
  properties: {
    kind: { type: "string", enum: additionKinds },
    name: str,
    x: num,
    y: num,
    width: num,
    height: num,
    angle: num,
    fill: str,
    stroke: nullable,
    strokeWidth: num,
    opacity: num,
    text: nullable,
    font: nullable,
    fontSize: { type: ["number", "null"] },
    path: nullable,
  },
};
export function validateAdditions(raw, width, height, fonts) {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 120)
    throw new Error("A refinement can add up to 120 editable elements.");
  return raw.map((a) => {
    if (
      !a ||
      !additionKinds.includes(a.kind) ||
      typeof a.name !== "string" ||
      a.name.length > 120
    )
      throw new Error("Invalid new design element.");
    for (const key of [
      "x",
      "y",
      "width",
      "height",
      "angle",
      "strokeWidth",
      "opacity",
    ])
      if (!Number.isFinite(a[key]))
        throw new Error("Invalid new element geometry.");
    if (
      a.width < 1 ||
      a.height < 1 ||
      a.width > width * 2 ||
      a.height > height * 2 ||
      a.x < 0 ||
      a.y < 0 ||
      a.x + a.width > width + 0.5 ||
      a.y + a.height > height + 0.5 ||
      Math.abs(a.angle) > 360 ||
      a.strokeWidth < 0 ||
      a.strokeWidth > 100 ||
      a.opacity < 0 ||
      a.opacity > 1
    )
      throw new Error(
        "Place added elements inside the design with valid dimensions.",
      );
    if (
      !/^#[\da-f]{6}$/i.test(a.fill) ||
      (a.stroke != null && !/^#[\da-f]{6}$/i.test(a.stroke))
    )
      throw new Error("Invalid new element color.");
    if (
      a.kind === "text" &&
      (typeof a.text !== "string" ||
        a.text.length > 600 ||
        !fonts.includes(a.font) ||
        !Number.isFinite(a.fontSize) ||
        a.fontSize < 6 ||
        a.fontSize > 500)
    )
      throw new Error("Invalid added text.");
    if (
      a.kind === "path" &&
      (typeof a.path !== "string" ||
        a.path.length > 6000 ||
        !/^\s*[Mm][\d\s,\.eE+\-MmLlHhVvCcSsQqTtAaZz]+$/.test(a.path))
    )
      throw new Error("Invalid added vector path.");
    return {
      kind: a.kind,
      name: a.name,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height,
      angle: a.angle,
      fill: a.fill,
      stroke: a.stroke ?? null,
      strokeWidth: a.strokeWidth,
      opacity: a.opacity,
      text: a.text ?? null,
      font: a.font ?? null,
      fontSize: a.fontSize ?? null,
      path: a.path ?? null,
    };
  });
}
export function requestedStars(prompt) {
  const match = prompt.match(
    /(?:add|create|place|scatter|include)\s+(\d{1,3})\s+(?:(?:more|new|additional)\s+)?stars?\b/i,
  );
  return match ? Number(match[1]) : null;
}
