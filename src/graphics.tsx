import {
  Circle,
  Ellipse,
  Group,
  Path,
  Polygon,
  Rect,
  type FabricObject,
} from "fabric";
import extraGraphics from "../shared/graphics-extra.json";
import brandedGraphics from "../shared/graphics-branded.json";
export const graphics: {
  id: string;
  name: string;
  path: string;
  stroke?: boolean;
  collection?: string;
  description?: string;
  palette?: string[];
  parts?: { path: string; fill: string; stroke: string; strokeWidth: number }[];
}[] = [
  {
    id: "sparkle",
    name: "Soft sparkle",
    path: "M100 0 Q105 90 200 100 Q105 105 100 200 Q90 105 0 100 Q90 90 100 0Z",
  },
  { id: "starburst", name: "Retro starburst", path: "" },
  { id: "orbit", name: "Orbital rings", path: "" },
  { id: "rainbow", name: "Good-days rainbow", path: "" },
  {
    id: "wave",
    name: "Liquid wave",
    path: "M0 55 C45 -25 70 145 120 65 S175 30 200 60 L200 130 C155 65 140 190 85 125 S25 155 0 125 Z",
  },
  { id: "checker", name: "Checkerboard", path: "" },
  {
    id: "heart",
    name: "Love note",
    path: "M100 180 C-40 90 0 -20 100 50 C200 -20 240 90 100 180Z",
  },
  { id: "flower", name: "Flower power", path: "" },
  ...extraGraphics,
  ...brandedGraphics,
];
export function makeGraphic(id: string, fill = "#b6a3eb", palette?: string[]): FabricObject {
  const branded = graphics.find(g => g.id === id && g.parts);
  if (branded?.parts) return new Group(branded.parts.map((part, i) => {
    const color = (value:string) => { const index = branded.palette?.indexOf(value) ?? -1; return palette?.length && index >= 0 ? palette[index % palette.length] : value; };
    const object = new Path(part.path, {fill: color(part.fill), stroke: color(part.stroke), strokeWidth:part.strokeWidth,strokeLineCap:'round',strokeLineJoin:'round'});
    Object.assign(object, { id: crypto.randomUUID(), name: `${branded.collection} detail ${i+1}` });
    return object;
  }));
  const parts: FabricObject[] = [];
  if (id === "starburst")
    return new Polygon(
      Array.from({ length: 24 }, (_, i) => {
        const a = (i * Math.PI) / 12,
          r = i % 2 ? 65 : 100;
        return { x: 100 + Math.cos(a) * r, y: 100 + Math.sin(a) * r };
      }),
      { fill, strokeWidth: 0 },
    );
  if (id === "orbit")
    for (const angle of [0, 60, 120])
      parts.push(
        new Ellipse({
          rx: 95,
          ry: 32,
          left: 100,
          top: 100,
          originX: "center",
          originY: "center",
          fill: "",
          stroke: fill,
          strokeWidth: 8,
          angle,
        }),
      );
  else if (id === "rainbow")
    for (const [i, c] of ["#c97564", "#deb186", "#e3cd9c", "#9bb7a0"].entries())
      parts.push(
        new Path(
          `M ${12 + i * 22} 188 L ${12 + i * 22} 100 A ${88 - i * 22} ${88 - i * 22} 0 0 1 ${188 - i * 22} 100 L ${188 - i * 22} 188`,
          { fill: "", stroke: c, strokeWidth: 18, strokeLineCap: "round" },
        ),
      );
  else if (id === "checker")
    for (let x = 0; x < 4; x++)
      for (let y = 0; y < 4; y++)
        parts.push(
          new Rect({
            left: x * 50,
            top: y * 50,
            width: 50,
            height: 50,
            fill,
            opacity: (x + y) % 2 ? 0.18 : 1,
            strokeWidth: 0,
          }),
        );
  else if (id === "flower") {
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      parts.push(
        new Circle({
          left: 100 + Math.cos(angle) * 57,
          top: 100 + Math.sin(angle) * 57,
          radius: 39,
          originX: "center",
          originY: "center",
          fill,
          strokeWidth: 0,
        }),
      );
    }
    parts.push(
      new Circle({
        left: 100,
        top: 100,
        radius: 32,
        originX: "center",
        originY: "center",
        fill: "#e9c360",
        strokeWidth: 0,
      }),
    );
  } else {
    const graphic = graphics.find((g) => g.id === id) || graphics[0];
    return new Path(graphic.path, {
      fill: graphic.stroke ? "" : fill,
      stroke: graphic.stroke ? fill : undefined,
      strokeWidth: graphic.stroke ? 8 : 0,
      strokeLineCap: "round",
      strokeLineJoin: "round",
      fillRule: "evenodd",
    });
  }
  return new Group(parts);
}
export function GraphicPreview({ id }: { id: string }) {
  const graphic = graphics.find((g) => g.id === id)!;
  return (
    <svg viewBox="-5 -5 210 210" aria-hidden="true" fill="currentColor">
      {graphic.parts?.map((part,i) => <path key={i} d={part.path} fill={part.fill || 'none'} stroke={part.stroke || undefined} strokeWidth={part.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />)}
      {graphic.path && (
        <path
          d={graphic.path}
          fill={graphic.stroke ? "none" : "currentColor"}
          stroke={graphic.stroke ? "currentColor" : undefined}
          strokeWidth={graphic.stroke ? 8 : 0}
          strokeLinecap="round"
          strokeLinejoin="round"
          fillRule="evenodd"
        />
      )}
      {id === "starburst" && (
        <polygon
          points={Array.from({ length: 24 }, (_, i) => {
            const a = (i * Math.PI) / 12,
              r = i % 2 ? 65 : 100;
            return `${100 + Math.cos(a) * r},${100 + Math.sin(a) * r}`;
          }).join(" ")}
        />
      )}
      {id === "orbit" &&
        [0, 60, 120].map((a) => (
          <ellipse
            key={a}
            cx={100}
            cy={100}
            rx={95}
            ry={32}
            transform={`rotate(${a} 100 100)`}
            fill="none"
            stroke="currentColor"
            strokeWidth={8}
          />
        ))}
      {id === "rainbow" &&
        ["#c97564", "#deb186", "#e3cd9c", "#9bb7a0"].map((c, i) => (
          <path
            key={c}
            d={`M ${12 + i * 22} 188 L ${12 + i * 22} 100 A ${88 - i * 22} ${88 - i * 22} 0 0 1 ${188 - i * 22} 100 L ${188 - i * 22} 188`}
            fill="none"
            stroke={c}
            strokeWidth={18}
            strokeLinecap="round"
          />
        ))}
      {id === "checker" &&
        Array.from({ length: 16 }, (_, i) => (
          <rect
            key={i}
            x={(i % 4) * 50}
            y={Math.floor(i / 4) * 50}
            width={50}
            height={50}
            opacity={((i % 4) + Math.floor(i / 4)) % 2 ? 0.18 : 1}
          />
        ))}
      {id === "flower" && (
        <>
          {Array.from({ length: 8 }, (_, i) => (
            <circle
              key={i}
              cx={100 + Math.cos((i * Math.PI) / 4) * 57}
              cy={100 + Math.sin((i * Math.PI) / 4) * 57}
              r={39}
            />
          ))}
          <circle cx={100} cy={100} r={32} fill="#e9c360" />
        </>
      )}
    </svg>
  );
}
