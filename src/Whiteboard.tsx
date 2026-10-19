import { useEffect, useRef, useState } from "react";
import {
  Hand,
  MousePointer2,
  MoveUpRight,
  StickyNote,
  RectangleHorizontal,
  MessageSquare,
  ImagePlus,
  PenTool,
  Eraser,
  Check,
  Trash2,
} from "lucide-react";
import type { Editor } from "./editor";
import { BoardConnector } from "./board-connector";
import type { BoardObject } from "./whiteboard-controller";
import { boardColors, type ConnectorData } from "../shared/whiteboard.mjs";
import { Field } from "./ui";
import "./whiteboard.css";
export function WhiteboardPanel({
  editor,
  brand,
  run,
  onUpload,
  onDraw,
}: {
  editor: Editor;
  brand: string[];
  run: (fn: () => unknown) => void;
  onUpload: () => void;
  onDraw: () => void;
}) {
  const [tab, setTab] = useState<"build" | "comments">("build"),
    [draft, setDraft] = useState(""),
    [error, setError] = useState("");
  const composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editor.board.selectedComment) {
      setTab("comments");
      setDraft("");
    }
  }, [editor.board.selectedComment]);
  const comments = editor.page.comments || [];
  return (
    <aside
      className="asset-panel whiteboard-panel"
      aria-label="Whiteboard tools"
    >
      <div className="panel-heading">
        <h2>Whiteboard</h2>
      </div>
      <div className="board-panel-body">
        {!editor.board.active ? (
          <>
            <p>
              Map an idea, collect references or connect a plan. Keep using your
              photos, text and drawing tools.
            </p>
            <button
              className="primary full"
              onClick={() => run(() => editor.board.create())}
            >
              Create whiteboard
            </button>
            <button
              className="secondary full"
              onClick={() => editor.board.enable()}
            >
              Use whiteboard tools in this design
            </button>
          </>
        ) : (
          <>
            <div
              className="board-tabs"
              role="tablist"
              aria-label="Whiteboard panel"
            >
              <button
                role="tab"
                aria-selected={tab === "build"}
                onClick={() => setTab("build")}
              >
                Build
              </button>
              <button
                role="tab"
                aria-selected={tab === "comments"}
                onClick={() => setTab("comments")}
              >
                Comments ({comments.filter((c) => !c.resolved).length})
              </button>
            </div>
            {tab === "build" ? (
              <>
                <div
                  className="board-tool-grid"
                  role="group"
                  aria-label="Whiteboard tools"
                >
                  <button
                    aria-pressed={
                      !editor.board.connecting &&
                      !editor.board.panning &&
                      !editor.board.commenting &&
                      !editor.drawing
                    }
                    onClick={() => editor.board.mode("select")}
                  >
                    <MousePointer2 />
                    Select
                  </button>
                  <button
                    aria-pressed={editor.board.panning}
                    onClick={() =>
                      editor.board.mode(editor.board.panning ? "select" : "pan")
                    }
                  >
                    <Hand />
                    Pan
                  </button>
                  <button
                    aria-pressed={editor.board.connecting}
                    onClick={() =>
                      editor.board.mode(
                        editor.board.connecting ? "select" : "connect",
                      )
                    }
                  >
                    <MoveUpRight />
                    Connect
                  </button>
                  <button onClick={() => editor.board.addCard("sticky")}>
                    <StickyNote />
                    Sticky note
                  </button>
                  <button onClick={() => editor.board.addCard("container")}>
                    <RectangleHorizontal />
                    Container
                  </button>
                  <button onClick={onUpload}>
                    <ImagePlus />
                    Photos
                  </button>
                  <button
                    onClick={() => {
                      editor.draw(
                        true,
                        brand[0] || "#754adb",
                        14,
                        "marker",
                        100,
                      );
                      onDraw();
                    }}
                  >
                    <PenTool />
                    Marker
                  </button>
                  <button
                    onClick={() => {
                      editor.draw(true, "#754adb", 24, "eraser", 100);
                      onDraw();
                    }}
                  >
                    <Eraser />
                    Stroke eraser
                  </button>
                </div>
                <p className="muted small">
                  Drag a connector from one object to another. Move its end
                  handles to reconnect it; drag the middle handle to bend it.
                  Escape returns to selecting.
                </p>
                <button
                  className="secondary full"
                  disabled={
                    editor.canvas
                      .getActiveObjects()
                      .filter((o) => !(o instanceof BoardConnector)).length !==
                    2
                  }
                  onClick={() => run(() => editor.board.connectSelection())}
                >
                  Connect two selected objects
                </button>
                <Field label="New connector color">
                  <input
                    type="color"
                    aria-label="New connector color"
                    value={editor.board.defaults.color}
                    onChange={(e) => {
                      editor.board.defaults.color = e.target.value;
                      editor.notify();
                    }}
                  />
                </Field>
                <div className="board-colors" aria-label="Connector colors">
                  {[...new Set([...brand, ...boardColors])].map((color) => (
                    <button
                      key={color}
                      style={{ background: color }}
                      aria-label={`Connector color ${color}`}
                      onClick={() => {
                        editor.board.defaults.color = color;
                        editor.notify();
                      }}
                    />
                  ))}
                </div>
                <Field label="New line pattern">
                  <select
                    aria-label="New connector pattern"
                    value={editor.board.defaults.pattern}
                    onChange={(e) => {
                      editor.board.defaults.pattern = e.target
                        .value as ConnectorData["pattern"];
                      editor.notify();
                    }}
                  >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                  </select>
                </Field>
                <Field label="Board background">
                  <select
                    aria-label="Whiteboard grid"
                    value={editor.page.boardGrid || "plain"}
                    onChange={(e) =>
                      editor.board.grid(e.target.value as "dots" | "plain")
                    }
                  >
                    <option value="dots">Dot grid</option>
                    <option value="plain">Plain white</option>
                  </select>
                </Field>
                <button
                  className="text-button"
                  onClick={() => {
                    setTab("comments");
                    composer.current?.focus();
                  }}
                >
                  Add a comment
                </button>
                <p className="muted small">
                  Photos and notes fully inside a container move with it. Select
                  several objects with Shift or drag a selection area. Group,
                  align, undo and export with the usual editor controls.
                </p>
              </>
            ) : (
              <>
                <p className="muted small">
                  Comments stay with this board on your device and in its
                  editable backup. They are not printed in image or movie
                  exports.
                </p>
                <textarea
                  ref={composer}
                  aria-label="New board comment"
                  maxLength={4000}
                  rows={4}
                  value={draft}
                  placeholder={
                    editor.selected
                      ? "Comment on the selected object"
                      : "Leave a note for this board"
                  }
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button
                  className="primary full"
                  disabled={!draft.trim()}
                  onClick={() => {
                    try {
                      editor.board.addComment(draft);
                      setDraft("");
                      setError("");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Add comment
                </button>
                <button
                  className="secondary full"
                  disabled={!draft.trim()}
                  aria-pressed={editor.board.commenting}
                  onClick={() => {
                    try {
                      editor.board.placeComment(draft);
                      setError("");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Place comment on board
                </button>
                {editor.board.commenting && (
                  <p role="status">
                    Click an object to attach this comment, or click a blank
                    area to place its pin. Escape cancels.
                  </p>
                )}
                {error && <p role="alert">{error}</p>}
                <div className="board-comment-list">
                  {comments.map((comment, i) => (
                    <article
                      key={comment.id}
                      className={`${comment.resolved ? "resolved " : ""}${editor.board.selectedComment === comment.id ? "selected" : ""}`}
                    >
                      <div>
                        <button
                          className="text-button"
                          onClick={() => {
                            editor.board.selectedComment = comment.id;
                            editor.board.focus(
                              editor.board.commentPoint(comment),
                            );
                            editor.notify();
                          }}
                        >
                          <MessageSquare size={15} /> {i + 1}{" "}
                          {comment.resolved ? "Resolved" : "Comment"}
                        </button>
                        <button
                          aria-label={`Delete comment ${i + 1}`}
                          onClick={() => {
                            editor.page.comments = comments.filter(
                              (c) => c.id !== comment.id,
                            );
                            editor.commit();
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <textarea
                        aria-label={`Comment ${i + 1} text`}
                        rows={3}
                        value={comment.text}
                        maxLength={4000}
                        onChange={(e) => {
                          if (!e.target.value.trim()) return;
                          comment.text = e.target.value;
                          editor.commit();
                        }}
                      />
                      <button
                        className="text-button"
                        onClick={() => {
                          comment.resolved = !comment.resolved;
                          editor.commit();
                        }}
                      >
                        <Check size={14} />
                        {comment.resolved ? "Reopen" : "Resolve"}
                      </button>
                    </article>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
export function ConnectorProperties({
  editor,
  connector,
}: {
  editor: Editor;
  connector: BoardConnector;
}) {
  const d = connector.connector,
    change = (patch: Partial<ConnectorData>) =>
      editor.board.editConnector(connector, patch),
    targets = editor.board.nodes();
  const endpoint = (which: "start" | "end") => (
    <>
      <Field label={`${which === "start" ? "Start" : "End"} attachment`}>
        <select
          aria-label={`Connector ${which} object`}
          value={d[which].nodeId || ""}
          onChange={(e) =>
            change({
              [which]: {
                ...d[which],
                nodeId: e.target.value || undefined,
                side: "auto",
              },
            })
          }
        >
          <option value="">Free endpoint</option>
          {targets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name || o.type}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`${which === "start" ? "Start" : "End"} side`}>
        <select
          aria-label={`Connector ${which} side`}
          value={d[which].side || "auto"}
          onChange={(e) =>
            change({ [which]: { ...d[which], side: e.target.value } })
          }
        >
          {["auto", "top", "right", "bottom", "left"].map((side) => (
            <option key={side} value={side}>
              {side === "auto"
                ? "Automatic"
                : side[0].toUpperCase() + side.slice(1)}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
  return (
    <div className="property-section board-properties">
      <h4>Smart connector</h4>
      {connector.blocked && (
        <p role="status" className="board-route-warning">
          There is no clear route here. Move overlapping objects or reset the
          bend. The orange connector marks this conflict.
        </p>
      )}
      <Field label="Label">
        <input
          aria-label="Connector label"
          value={d.label}
          maxLength={160}
          onChange={(e) => change({ label: e.target.value })}
        />
      </Field>
      <Field label="Line color">
        <input
          type="color"
          aria-label="Connector line color"
          value={d.color}
          onChange={(e) => change({ color: e.target.value })}
        />
      </Field>
      <Field label="Line pattern">
        <select
          aria-label="Connector pattern"
          value={d.pattern}
          onChange={(e) =>
            change({ pattern: e.target.value as ConnectorData["pattern"] })
          }
        >
          {["solid", "dashed", "dotted"].map((p) => (
            <option key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Line shape">
        <select
          aria-label="Connector shape"
          value={d.style}
          onChange={(e) =>
            change({ style: e.target.value as ConnectorData["style"] })
          }
        >
          <option value="elbow">Rounded elbow</option>
          <option value="curve">Soft bends</option>
          <option value="straight">Direct when clear</option>
        </select>
      </Field>
      <Field label="Line width">
        <input
          type="range"
          aria-label="Connector line width"
          min={1}
          max={16}
          value={d.width}
          onChange={(e) => change({ width: +e.target.value })}
        />
      </Field>
      {(["startHead", "endHead"] as const).map((key) => (
        <Field
          key={key}
          label={key === "startHead" ? "Start marker" : "End marker"}
        >
          <select
            aria-label={`Connector ${key}`}
            value={d[key]}
            onChange={(e) => change({ [key]: e.target.value })}
          >
            <option value="none">None</option>
            <option value="arrow">Arrow</option>
            <option value="dot">Dot</option>
          </select>
        </Field>
      ))}
      {endpoint("start")}
      {endpoint("end")}
      <button
        className="secondary full"
        onClick={() => change({ bend: undefined })}
      >
        Reset bend &amp; route automatically
      </button>
      <p className="muted small">
        Drag the middle handle to bend. The endpoints stay attached when their
        objects move or resize.
      </p>
    </div>
  );
}
export function BoardCardProperties({
  editor,
  card,
}: {
  editor: Editor;
  card: BoardObject;
}) {
  return (
    <div className="property-section board-properties">
      <h4>{card.boardCard!.kind === "sticky" ? "Sticky note" : "Container"}</h4>
      <Field
        label={card.boardCard!.kind === "sticky" ? "Note" : "Container title"}
      >
        <textarea
          aria-label="Board card text"
          rows={5}
          maxLength={1000}
          value={card.boardCard!.text}
          onChange={(e) =>
            editor.board.editCard(card, { text: e.target.value })
          }
        />
      </Field>
      <Field label="Card color">
        <input
          type="color"
          aria-label="Board card color"
          value={card.boardCard!.color}
          onChange={(e) =>
            editor.board.editCard(card, { color: e.target.value })
          }
        />
      </Field>
      <p className="muted small">
        Drag to move. Resize with the corner handles. Right-click for the
        existing grouping and editing actions.
      </p>
    </div>
  );
}
export function BoardCommentPins({
  editor,
  onOpen,
}: {
  editor: Editor;
  onOpen: () => void;
}) {
  return (
    <div className="board-comment-pins">
      {(editor.page.comments || []).map((comment, i) => {
        if (comment.resolved) return null;
        const point = editor.board.commentPoint(comment);
        return (
          <button
            key={comment.id}
            className={`board-comment-pin${editor.board.selectedComment === comment.id ? " selected" : ""}`}
            style={{ left: point.x * editor.zoom, top: point.y * editor.zoom }}
            aria-label={`Open board comment ${i + 1}`}
            onClick={() => {
              editor.board.selectedComment = comment.id;
              editor.notify();
              onOpen();
            }}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}
