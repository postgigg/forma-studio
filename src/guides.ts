export type Bounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export type Guide = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
};

/** Work in document coordinates; guides live outside the document and exports. */
export function smartGuides(
  moving: Bounds,
  others: Bounds[],
  width: number,
  height: number,
  tolerance: number,
) {
  const guides: Guide[] = [];
  const offset = { x: 0, y: 0 };
  for (const axis of ["x", "y"] as const) {
    const start = axis === "x" ? "left" : "top";
    const size = axis === "x" ? "width" : "height";
    const cross = axis === "x" ? "top" : "left";
    const crossSize = axis === "x" ? "height" : "width";
    const end = (b: Bounds) => b[start] + b[size];
    const anchors = (b: Bounds) => [b[start], b[start] + b[size] / 2, end(b)];
    const pageSize = axis === "x" ? width : height;
    const refs = [0, pageSize / 2, pageSize, ...others.flatMap(anchors)];
    let delta = Infinity;
    for (const a of anchors(moving))
      for (const reference of refs) {
        const d = reference - a;
        if (Math.abs(d) <= tolerance && Math.abs(d) < Math.abs(delta))
          delta = d;
      }
    const neighbors = others
      .filter(
        (b) =>
          Math.min(
            b[cross] + b[crossSize],
            moving[cross] + moving[crossSize],
          ) >=
          Math.max(b[cross], moving[cross]) - tolerance,
      )
      .sort((a, b) => a[start] - b[start]);
    const spaces: {
      position: number;
      a: Bounds;
      b: Bounds;
      mode: "between" | "before" | "after";
    }[] = [];
    for (let i = 0; i < neighbors.length - 1; i++) {
      const a = neighbors[i],
        b = neighbors[i + 1];
      const gap = b[start] - end(a);
      if (gap < 0) continue;
      if (gap >= moving[size])
        spaces.push({
          position: (end(a) + b[start] - moving[size]) / 2,
          a,
          b,
          mode: "between",
        });
      spaces.push(
        { position: end(b) + gap, a, b, mode: "after" },
        { position: a[start] - gap - moving[size], a, b, mode: "before" },
      );
    }
    for (const s of spaces) {
      const d = s.position - moving[start];
      if (Math.abs(d) <= tolerance && Math.abs(d) <= Math.abs(delta)) delta = d;
    }
    if (!Number.isFinite(delta)) continue;
    offset[axis] = delta;
    const snapped = { ...moving, [start]: moving[start] + delta };
    for (const a of anchors(snapped)) {
      const matches = others.filter((b) =>
        anchors(b).some((v) => Math.abs(v - a) < 0.5),
      );
      const onPage = [0, pageSize / 2, pageSize].some(
        (v) => Math.abs(v - a) < 0.5,
      );
      if (!matches.length && !onPage) continue;
      const lo = onPage
        ? 0
        : Math.min(snapped[cross], ...matches.map((b) => b[cross])) - 12;
      const hi = onPage
        ? axis === "x"
          ? height
          : width
        : Math.max(
            snapped[cross] + snapped[crossSize],
            ...matches.map((b) => b[cross] + b[crossSize]),
          ) + 12;
      guides.push(
        axis === "x"
          ? { x1: a, x2: a, y1: lo, y2: hi }
          : { x1: lo, x2: hi, y1: a, y2: a },
      );
    }
    const match = spaces.find(
      (s) => Math.abs(s.position - snapped[start]) < 0.5,
    );
    if (match) {
      const ordered =
        match.mode === "between"
          ? [match.a, snapped, match.b]
          : match.mode === "after"
            ? [match.a, match.b, snapped]
            : [snapped, match.a, match.b];
      const c = Math.min(...ordered.map((b) => b[cross])) - 16;
      for (let i = 0; i < 2; i++) {
        const a = end(ordered[i]),
          b = ordered[i + 1][start];
        guides.push(
          axis === "x"
            ? { x1: a, x2: b, y1: c, y2: c, label: String(Math.round(b - a)) }
            : { x1: c, x2: c, y1: a, y2: b, label: String(Math.round(b - a)) },
        );
      }
    }
  }
  return { ...offset, guides };
}
