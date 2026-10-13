import type { Editor } from "./editor";
export function AlignmentGuides({ editor }: { editor: Editor }) {
  if (!editor.guides.length) return null;
  return (
    <svg
      className="alignment-guides"
      aria-hidden="true"
      data-testid="alignment-guides"
      width={editor.doc.width * editor.zoom}
      height={editor.doc.height * editor.zoom}
    >
      {editor.guides.map((g, i) => {
        const x1 = g.x1 * editor.zoom,
          x2 = g.x2 * editor.zoom,
          y1 = g.y1 * editor.zoom,
          y2 = g.y2 * editor.zoom;
        return (
          <g key={i} data-guide={g.label ? "spacing" : "alignment"}>
            <line
              x1={x1}
              x2={x2}
              y1={y1}
              y2={y2}
              strokeDasharray={g.label ? undefined : "4 3"}
            />
            {g.label && (
              <>
                <path
                  d={
                    x1 === x2
                      ? `M${x1 - 4} ${y1}h8 M${x2 - 4} ${y2}h8`
                      : `M${x1} ${y1 - 4}v8 M${x2} ${y2 - 4}v8`
                  }
                />
                <text
                  x={(x1 + x2) / 2 + (x1 === x2 ? 9 : 0)}
                  y={(y1 + y2) / 2 - 6}
                  textAnchor="middle"
                >
                  {g.label}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
