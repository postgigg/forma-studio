// Geometry shared by the whiteboard, saved connectors and its independent checks.
const finite = (n) => Number.isFinite(n) && Math.abs(n) <= 100000;
export const boardColors = [
  "#292432",
  "#754adb",
  "#275db8",
  "#148264",
  "#d64d43",
  "#ce8b19",
];
export function validateConnector(value) {
  if (
    !value ||
    !["elbow", "curve", "straight"].includes(value.style) ||
    !["solid", "dashed", "dotted"].includes(value.pattern) ||
    !/^#[0-9a-f]{6}$/i.test(value.color) ||
    !Number.isFinite(value.width) ||
    value.width < 1 ||
    value.width > 16 ||
    !["none", "arrow", "dot"].includes(value.startHead) ||
    !["none", "arrow", "dot"].includes(value.endHead) ||
    typeof value.label !== "string" ||
    value.label.length > 160
  )
    throw new Error("Invalid whiteboard connector.");
  for (const endpoint of [value.start, value.end]) {
    if (
      !endpoint ||
      !finite(endpoint.x) ||
      !finite(endpoint.y) ||
      (endpoint.nodeId != null &&
        (typeof endpoint.nodeId !== "string" ||
          !/^[A-Za-z0-9_-]{1,120}$/.test(endpoint.nodeId))) ||
      (endpoint.side != null &&
        !["auto", "top", "right", "bottom", "left"].includes(endpoint.side))
    )
      throw new Error("Invalid connector attachment.");
  }
  if (value.bend && (!finite(value.bend.x) || !finite(value.bend.y)))
    throw new Error("Invalid connector bend.");
  return value;
}
export function validateBoard(design) {
  if (design.kind != null && !["design", "whiteboard"].includes(design.kind))
    throw new Error("Invalid workspace type.");
  for (const page of design.pages) {
    if (page.boardGrid != null && !["dots", "plain"].includes(page.boardGrid))
      throw new Error("Invalid whiteboard grid.");
    if (page.comments != null) {
      if (!Array.isArray(page.comments) || page.comments.length > 200)
        throw new Error("Use up to 200 comments per board.");
      const ids = new Set();
      for (const c of page.comments) {
        if (
          !c ||
          typeof c.id !== "string" ||
          !/^[A-Za-z0-9_-]{1,120}$/.test(c.id) ||
          ids.has(c.id) ||
          !finite(c.x) ||
          !finite(c.y) ||
          typeof c.text !== "string" ||
          !c.text.trim() ||
          c.text.length > 4000 ||
          typeof c.resolved !== "boolean" ||
          typeof c.createdAt !== "string" ||
          (c.nodeId != null &&
            (typeof c.nodeId !== "string" ||
              !/^[A-Za-z0-9_-]{1,120}$/.test(c.nodeId)))
        )
          throw new Error("Invalid board comment.");
        ids.add(c.id);
      }
    }
    const walk = (objects, depth = 0) => {
      if (depth > 40) return;
      for (const object of objects || []) {
        if (object.connector) validateConnector(object.connector);
        if (
          object.boardCard &&
          (!["sticky", "container"].includes(object.boardCard.kind) ||
            typeof object.boardCard.text !== "string" ||
            object.boardCard.text.length > 4000 ||
            !/^#[0-9a-f]{6}$/i.test(object.boardCard.color))
        )
          throw new Error("Invalid board card.");
        if (Array.isArray(object.objects)) walk(object.objects, depth + 1);
      }
    };
    walk(page.data?.objects);
  }
}
export function anchor(box, toward, side = "auto") {
  const cx = box.left + box.width / 2,
    cy = box.top + box.height / 2;
  if (side === "auto")
    side =
      Math.abs((toward.x - cx) / Math.max(1, box.width)) >=
      Math.abs((toward.y - cy) / Math.max(1, box.height))
        ? toward.x >= cx
          ? "right"
          : "left"
        : toward.y >= cy
          ? "bottom"
          : "top";
  return side === "left"
    ? { x: box.left, y: cy, side }
    : side === "right"
      ? { x: box.left + box.width, y: cy, side }
      : side === "top"
        ? { x: cx, y: box.top, side }
        : { x: cx, y: box.top + box.height, side };
}
const inside = (p, b) =>
  p.x > b.left + 0.01 &&
  p.x < b.right - 0.01 &&
  p.y > b.top + 0.01 &&
  p.y < b.bottom - 0.01;
export function segmentHits(a, b, box) {
  const r = box.right ?? box.left + box.width,
    d = box.bottom ?? box.top + box.height;
  if (Math.abs(a.x - b.x) < 0.001)
    return (
      a.x > box.left + 0.01 &&
      a.x < r - 0.01 &&
      Math.max(a.y, b.y) > box.top + 0.01 &&
      Math.min(a.y, b.y) < d - 0.01
    );
  if (Math.abs(a.y - b.y) < 0.001)
    return (
      a.y > box.top + 0.01 &&
      a.y < d - 0.01 &&
      Math.max(a.x, b.x) > box.left + 0.01 &&
      Math.min(a.x, b.x) < r - 0.01
    );
  // Liang-Barsky for non-orthogonal free lines.
  let from = 0,
    to = 1;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  for (const [p, q] of [
    [-dx, a.x - box.left],
    [dx, r - a.x],
    [-dy, a.y - box.top],
    [dy, d - a.y],
  ]) {
    if (p === 0) {
      if (q <= 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) from = Math.max(from, t);
    else to = Math.min(to, t);
    if (from >= to) return false;
  }
  return to > 0 && from < 1;
}
function simplify(points) {
  const out = [];
  for (const point of points) {
    if (
      out.length &&
      Math.abs(out.at(-1).x - point.x) + Math.abs(out.at(-1).y - point.y) < 0.01
    )
      continue;
    while (out.length > 1) {
      const a = out.at(-2),
        b = out.at(-1);
      if (
        Math.abs(
          (b.x - a.x) * (point.y - b.y) - (b.y - a.y) * (point.x - b.x),
        ) > 0.01 ||
        (b.x - a.x) * (point.x - b.x) + (b.y - a.y) * (point.y - b.y) < 0
      )
        break;
      out.pop();
    }
    out.push(point);
  }
  return out;
}
function orthogonal(start, end, boxes) {
  const clear = (a, b) => !boxes.some((box) => segmentHits(a, b, box));
  if ((start.x === end.x || start.y === end.y) && clear(start, end))
    return [start, end];
  const corners = [
    { x: end.x, y: start.y },
    { x: start.x, y: end.y },
  ];
  for (const point of corners)
    if (
      !boxes.some((b) => inside(point, b)) &&
      clear(start, point) &&
      clear(point, end)
    )
      return simplify([start, point, end]);
  const xs = [
      ...new Set([start.x, end.x, ...boxes.flatMap((b) => [b.left, b.right])]),
    ].sort((a, b) => a - b),
    ys = [
      ...new Set([start.y, end.y, ...boxes.flatMap((b) => [b.top, b.bottom])]),
    ].sort((a, b) => a - b);
  const width = xs.length,
    index = (x, y) => y * width + x,
    source = index(xs.indexOf(start.x), ys.indexOf(start.y)),
    target = index(xs.indexOf(end.x), ys.indexOf(end.y));
  const size = xs.length * ys.length,
    cost = new Float64Array(size).fill(Infinity),
    previous = new Int32Array(size).fill(-1),
    closed = new Uint8Array(size),
    heap = [];
  const point = (i) => ({ x: xs[i % width], y: ys[Math.floor(i / width)] }),
    heuristic = (i) => {
      const p = point(i);
      return Math.abs(p.x - end.x) + Math.abs(p.y - end.y);
    };
  const push = (id, score) => {
    let i = heap.length;
    heap.push({ id, score });
    while (i) {
      const parent = (i - 1) >> 1;
      if (heap[parent].score <= score) break;
      heap[i] = heap[parent];
      i = parent;
    }
    heap[i] = { id, score };
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (
          child + 1 < heap.length &&
          heap[child + 1].score < heap[child].score
        )
          child++;
        if (last.score <= heap[child].score) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = last;
    }
    return first.id;
  };
  cost[source] = 0;
  push(source, heuristic(source));
  let visits = 0;
  while (heap.length && visits++ < 50000) {
    const current = pop();
    if (closed[current]) continue;
    closed[current] = 1;
    if (current === target) {
      const path = [];
      let at = current;
      while (at !== -1) {
        path.push(point(at));
        at = previous[at];
      }
      return simplify(path.reverse());
    }
    const x = current % width,
      y = Math.floor(current / width),
      a = point(current);
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= ys.length) continue;
      const next = index(nx, ny),
        b = point(next);
      if (closed[next] || boxes.some((box) => inside(b, box)) || !clear(a, b))
        continue;
      let turn = 0;
      if (previous[current] !== -1) {
        const before = point(previous[current]);
        if ((before.x === a.x) !== (a.x === b.x)) turn = 12;
      }
      const candidate =
        cost[current] + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + turn;
      if (candidate < cost[next]) {
        cost[next] = candidate;
        previous[next] = current;
        push(next, candidate + heuristic(next));
      }
    }
  }
  return null;
}
export function routeConnector(
  start,
  end,
  obstacles = [],
  bend,
  style = "elbow",
) {
  // Boundary channels keep paths outside objects. Ignore an enclosing frame that
  // contains an endpoint, otherwise it would trap a connector inside that frame.
  const plain = obstacles
    .filter(
      (b) =>
        [b.left, b.top, b.width, b.height].every(finite) &&
        b.width > 0 &&
        b.height > 0,
    )
    .filter((b) => {
      const plain = { ...b, right: b.left + b.width, bottom: b.top + b.height };
      return !inside(start, plain) && !inside(end, plain);
    });
  const all = plain.map((b) => ({
    left: b.left - 20,
    top: b.top - 20,
    right: b.left + b.width + 20,
    bottom: b.top + b.height + 20,
  }));
  const boxes = [...all]
    .sort(
      (a, b) =>
        Math.min(
          Math.abs(a.left - start.x) + Math.abs(a.top - start.y),
          Math.abs(a.left - end.x) + Math.abs(a.top - end.y),
        ) -
        Math.min(
          Math.abs(b.left - start.x) + Math.abs(b.top - start.y),
          Math.abs(b.left - end.x) + Math.abs(b.top - end.y),
        ),
    )
    .slice(0, 80);
  const outward = (p) => {
    const d = 26;
    return {
      x: p.x + (p.side === "right" ? d : p.side === "left" ? -d : 0),
      y: p.y + (p.side === "bottom" ? d : p.side === "top" ? -d : 0),
    };
  };
  const a = outward(start),
    b = outward(end);
  let points;
  if (
    style === "straight" &&
    !bend &&
    !all.some((box) => segmentHits(a, b, box))
  )
    return { points: simplify([start, a, b, end]), blocked: false };
  if (bend && !boxes.some((box) => inside(bend, box))) {
    const first = orthogonal(a, bend, boxes),
      last = orthogonal(bend, b, boxes);
    if (first && last) points = simplify([start, ...first, ...last, end]);
  } else if (!bend) {
    const route = orthogonal(a, b, boxes);
    if (route) points = simplify([start, ...route, end]);
  }
  // An impossible manual bend never silently draws through an object.
  if (!points && bend) {
    const route = orthogonal(a, b, boxes);
    if (route) points = simplify([start, ...route, end]);
  }
  if (
    points &&
    points.some(
      (p, i) =>
        i > 0 && plain.some((box) => segmentHits(points[i - 1], p, box)),
    )
  )
    return { points, blocked: true };
  return points
    ? { points, blocked: false }
    : { points: [start, end], blocked: true };
}
export function roundedPath(points, radius = 14) {
  if (!points.length) return "M 0 0 L 1 0";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1],
      before = Math.hypot(b.x - a.x, b.y - a.y),
      after = Math.hypot(c.x - b.x, c.y - b.y),
      r = Math.min(radius, before / 2, after / 2);
    if (!before || !after) continue;
    const from = {
        x: b.x + ((a.x - b.x) * r) / before,
        y: b.y + ((a.y - b.y) * r) / before,
      },
      to = {
        x: b.x + ((c.x - b.x) * r) / after,
        y: b.y + ((c.y - b.y) * r) / after,
      };
    d += ` L ${from.x} ${from.y} Q ${b.x} ${b.y} ${to.x} ${to.y}`;
  }
  return d + ` L ${points.at(-1).x} ${points.at(-1).y}`;
}
