import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anchor,
  routeConnector,
  segmentHits,
  validateConnector,
  validateBoard,
  roundedPath,
} from "../shared/whiteboard.mjs";
test("ports follow the object bounds and choose the side facing the other object", () => {
  assert.deepEqual(
    anchor({ left: 10, top: 20, width: 100, height: 60 }, { x: 500, y: 50 }),
    { x: 110, y: 50, side: "right" },
  );
  assert.deepEqual(
    anchor({ left: 70, top: 90, width: 200, height: 120 }, { x: 170, y: 800 }),
    { x: 170, y: 210, side: "bottom" },
  );
  assert.deepEqual(
    anchor(
      { left: 10, top: 20, width: 100, height: 60 },
      { x: 500, y: 50 },
      "left",
    ),
    { x: 10, y: 50, side: "left" },
  );
});
test("orthogonal connectors route around nodes without entering their bounds", () => {
  const obstacles = [
    { left: 0, top: 50, width: 150, height: 100 },
    { left: 300, top: 0, width: 170, height: 200 },
    { left: 650, top: 50, width: 150, height: 100 },
  ];
  const start = { x: 150, y: 100, side: "right" },
    end = { x: 650, y: 100, side: "left" };
  const route = routeConnector(start, end, obstacles);
  assert.equal(route.blocked, false);
  assert.ok(route.points.length >= 4);
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1],
      b = route.points[i];
    assert.ok(a.x === b.x || a.y === b.y);
    for (const box of obstacles)
      assert.equal(
        segmentHits(a, b, box),
        false,
        JSON.stringify({ a, b, box }),
      );
  }
  assert.deepEqual(route.points[0], start);
  assert.deepEqual(route.points.at(-1), end);
  assert.match(roundedPath(route.points, 14), / Q /);
});
test("a movable bend changes the route, and an obstructed bend falls back to a clear route", () => {
  const start = { x: 100, y: 100, side: "right" },
    end = { x: 600, y: 100, side: "left" },
    box = { left: 280, top: 40, width: 100, height: 160 };
  const above = routeConnector(start, end, [box], { x: 220, y: -100 }),
    below = routeConnector(start, end, [box], { x: 220, y: 350 });
  assert.notDeepEqual(above.points, below.points);
  const blockedBend = routeConnector(start, end, [box], { x: 300, y: 80 });
  assert.equal(blockedBend.blocked, false);
  for (let i = 1; i < blockedBend.points.length; i++)
    assert.equal(
      segmentHits(blockedBend.points[i - 1], blockedBend.points[i], box),
      false,
    );
  const direct = routeConnector(
    { x: 0, y: 0 },
    { x: 200, y: 100 },
    [],
    undefined,
    "straight",
  );
  assert.equal(direct.points.length, 2);
});
test("enclosing containers do not trap a connection, but impossible ports are flagged", () => {
  const route = routeConnector({ x: 100, y: 100 }, { x: 600, y: 100 }, [
    { left: 20, top: 20, width: 700, height: 300 },
    { left: 300, top: 60, width: 80, height: 100 },
  ]);
  assert.equal(route.blocked, false);
  const impossible = routeConnector(
    { x: 100, y: 100, side: "right" },
    { x: 600, y: 100, side: "left" },
    [{ left: 110, top: 70, width: 60, height: 60 }],
  );
  assert.equal(impossible.blocked, true);
});
test("saved board metadata rejects unsafe, oversized or malformed attachments and notes", () => {
  const connector = {
    start: { x: 0, y: 0, nodeId: "node-a" },
    end: { x: 200, y: 200, nodeId: "node-b" },
    style: "elbow",
    pattern: "dashed",
    color: "#754adb",
    width: 4,
    startHead: "none",
    endHead: "arrow",
    label: "Approve",
  };
  validateConnector(connector);
  for (const patch of [
    { width: Infinity },
    { color: "url(evil)" },
    { label: "x".repeat(161) },
    { start: { x: NaN, y: 0 } },
    { end: { x: 0, y: 0, nodeId: "../bad" } },
    { bend: { x: 999999, y: 1 } },
  ])
    assert.throws(() => validateConnector({ ...connector, ...patch }));
  const comment = {
    id: "comment-a",
    text: "Review this",
    x: 10,
    y: 20,
    resolved: false,
    createdAt: "2026-10-19T00:00:00Z",
  };
  const board = {
    kind: "whiteboard",
    pages: [
      {
        boardGrid: "dots",
        comments: [comment],
        data: { objects: [{ connector }] },
      },
    ],
  };
  validateBoard(board);
  assert.throws(() => validateBoard({ ...board, kind: "other" }));
  assert.throws(() =>
    validateBoard({ ...board, pages: [{ boardGrid: "invalid" }] }),
  );
  assert.throws(() =>
    validateBoard({ ...board, pages: [{ comments: [comment, comment] }] }),
  );
});

test("ports facing away from their target retain their outward lead", () => {
  const boxes = [
      { left: 100, top: 100, width: 150, height: 100 },
      { left: 600, top: 100, width: 150, height: 100 },
    ],
    start = anchor(boxes[0], { x: 600, y: 150 }, "left"),
    end = anchor(boxes[1], { x: 100, y: 150 }, "right"),
    route = routeConnector(start, end, boxes);
  assert.equal(route.blocked, false);
  assert.ok(route.points[1].x < start.x);
  assert.ok(route.points.at(-2).x > end.x);
  for (let i = 1; i < route.points.length; i++)
    for (const box of boxes)
      assert.equal(
        segmentHits(route.points[i - 1], route.points[i], box),
        false,
      );
});
