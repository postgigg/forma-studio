import { Circle, FabricObject, Group, Line, Path, Rect, Textbox } from "fabric";

export const chartTypes = ["bar", "line", "area", "pie", "donut"] as const;
export type ChartType = (typeof chartTypes)[number];
export interface ChartData {
  type: ChartType;
  title: string;
  subtitle: string;
  labels: string[];
  series: { name: string; color: string; values: number[] }[];
  background: string;
  ink: string;
  showValues: boolean;
}
export type ChartObject = Group & { chart: ChartData };

// Fabric automatically enlivens any custom property with a registered `type`.
// ChartData.type = "line" would otherwise become a Fabric Line, losing plain
// data on the next save and making the data editor fail to clone it. Keep the
// established Group JSON format, but restore chart data outside that process.
const restoreGroup = Group.fromObject;
Group.fromObject = async function (object, options) {
  const { chart, ...serialized } = object as typeof object & { chart?: ChartData };
  const group = await restoreGroup.call(this, serialized as typeof object, options);
  if (chart) Object.assign(group, { chart: structuredClone(chart) });
  return group;
};
export const chartPalette = [
  "#754adb",
  "#e9a66e",
  "#668266",
  "#5486a0",
  "#df7998",
  "#bfad78",
];
export function defaultChart(type: ChartType = "bar"): ChartData {
  return {
    type,
    title: "A season of growth",
    subtitle: "Quarterly performance · 2026",
    labels: ["Q1", "Q2", "Q3", "Q4"],
    series: [
      { name: "This year", color: chartPalette[0], values: [42, 68, 56, 92] },
      { name: "Last year", color: chartPalette[2], values: [32, 48, 46, 65] },
    ],
    background: "#ffffff",
    ink: "#292432",
    showValues: true,
  };
}
export function isChart(value: unknown): value is ChartObject {
  return value instanceof Group && !!(value as ChartObject).chart;
}
export function validateChart(data: ChartData) {
  if (
    !chartTypes.includes(data.type) ||
    !data.labels.length ||
    data.labels.length > 20 ||
    !data.series.length ||
    data.series.length > 4
  )
    throw new Error("Use 1–20 categories and 1–4 data series.");
  if (
    data.title.length > 90 ||
    data.subtitle.length > 160 ||
    data.labels.some((x) => !x.trim() || x.length > 40)
  )
    throw new Error(
      "Add short category labels and a title of up to 90 characters.",
    );
  if (
    data.series.some(
      (s) =>
        !s.name.trim() ||
        s.name.length > 40 ||
        s.values.length !== data.labels.length ||
        s.values.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e12),
    )
  )
    throw new Error(
      "Every cell needs a finite number between −1 trillion and 1 trillion.",
    );
  if (
    [data.ink, data.background, ...data.series.map((s) => s.color)].some(
      (c) => !/^#[\da-f]{6}$/i.test(c),
    )
  )
    throw new Error("Choose valid chart colors.");
  if (
    ["pie", "donut"].includes(data.type) &&
    (data.series[0].values.some((v) => v < 0) ||
      !data.series[0].values.some((v) => v > 0))
  )
    throw new Error(
      "Pie and donut charts need non-negative values and at least one value above zero.",
    );
}
const compact = (n: number) =>
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
export function makeChart(raw: ChartData): ChartObject {
  const data = structuredClone(raw);
  validateChart(data);
  const nodes: FabricObject[] = [];
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    r = 0,
  ) =>
    nodes.push(
      new Rect({
        left: x,
        top: y,
        width: w,
        height: h,
        fill,
        rx: r,
        ry: r,
        strokeWidth: 0,
      }),
    );
  const text = (
    value: string,
    x: number,
    y: number,
    w: number,
    size = 18,
    color = data.ink,
    weight = 400,
    align: 'left' | 'center' | 'right' = "left",
  ) =>
    nodes.push(
      new Textbox(value, {
        left: x,
        top: y,
        width: w,
        fontFamily: "Arial",
        fontSize: size,
        fill: color,
        fontWeight: weight,
        textAlign: align,
        splitByGrapheme: true,
        strokeWidth: 0,
      }),
    );
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    width = 1,
  ) =>
    nodes.push(
      new Line([x1, y1, x2, y2], { stroke: color, strokeWidth: width }),
    );
  rect(0, 0, 960, 660, data.background, 24);
  text(data.title, 48, 34, 864, 32, data.ink, 600);
  text(data.subtitle, 48, 82, 864, 17);
  if (["pie", "donut"].includes(data.type)) {
    const values = data.series[0].values,
      total = values.reduce((a, b) => a + b, 0),
      cx = 296,
      cy = 368,
      radius = 211;
    let angle = -Math.PI / 2;
    values.forEach((v, i) => {
      if (!v) return;
      const end = angle + (v / total) * Math.PI * 2,
        color =
          i === 0
            ? data.series[0].color
            : chartPalette[i % chartPalette.length];
      if (v === total)
        nodes.push(
          new Circle({
            left: cx - radius,
            top: cy - radius,
            radius,
            fill: color,
            strokeWidth: 0,
          }),
        );
      else
        nodes.push(
          new Path(
            `M ${cx} ${cy} L ${cx + radius * Math.cos(angle)} ${cy + radius * Math.sin(angle)} A ${radius} ${radius} 0 ${end - angle > Math.PI ? 1 : 0} 1 ${cx + radius * Math.cos(end)} ${cy + radius * Math.sin(end)} Z`,
            { fill: color, stroke: data.background, strokeWidth: 2 },
          ),
        );
      angle = end;
    });
    if (data.type === "donut") {
      nodes.push(
        new Circle({
          left: cx - 128,
          top: cy - 128,
          radius: 128,
          fill: data.background,
          strokeWidth: 0,
        }),
      );
      text(compact(total), cx - 115, cy - 35, 230, 46, data.ink, 600, "center");
      text("TOTAL", cx - 115, cy + 26, 230, 14, data.ink, 400, "center");
    }
    const spacing = Math.min(43, 440 / data.labels.length);
    data.labels.forEach((label, i) => {
      const y = 155 + i * spacing;
      rect(
        573,
        y + 5,
        13,
        13,
        i === 0 ? data.series[0].color : chartPalette[i % chartPalette.length],
        3,
      );
      text(label, 602, y, 215, Math.min(19, spacing * 0.65));
      text(
        data.showValues ? `${Math.round((values[i] / total) * 100)}%` : "",
        820,
        y,
        92,
        18,
        data.ink,
        600,
        "right",
      );
    });
    text(data.series[0].name, 574, 606, 338, 15);
  } else {
    const all = data.series.flatMap((s) => s.values),
      low = Math.min(0, ...all),
      high = Math.max(0, ...all);
    const span = high - low || 1,
      magnitude = 10 ** Math.floor(Math.log10(span / 4)),
      step = [1, 2, 5, 10].find((v) => v * magnitude >= span / 4)! * magnitude;
    const min = Math.floor(low / step) * step,
      max = Math.ceil((high || (!low ? 1 : 0)) / step) * step,
      range = max - min;
    const x = 90,
      y = 158,
      w = 822,
      h = 352,
      py = (v: number) => y + h - ((v - min) / range) * h;
    for (let v = min; v <= max + step / 100; v += step) {
      line(x, py(v), x + w, py(v), "#e9e6ef");
      text(compact(v), 14, py(v) - 11, 62, 14, data.ink, 400, "right");
    }
    line(x, py(0), x + w, py(0), "#c7c0d1", 1.5);
    const stride = w / data.labels.length;
    data.labels.forEach((label, i) =>
      text(
        label,
        x + stride * i + 3,
        y + h + 18,
        stride - 6,
        Math.min(17, 180 / data.labels.length),
        data.ink,
        400,
        "center",
      ),
    );
    data.series.forEach((series, s) => {
      const points = series.values.map((v, i) => [
        x + stride * (i + 0.5),
        py(v),
      ]);
      if (data.type === "bar")
        series.values.forEach((v, i) => {
          const barW = (stride * 0.72) / data.series.length;
          rect(
            x + stride * i + stride * 0.14 + barW * s,
            Math.min(py(0), py(v)),
            Math.max(2, barW - 4),
            Math.max(1, Math.abs(py(v) - py(0))),
            series.color,
            3,
          );
          if (data.showValues && data.labels.length * data.series.length <= 24)
            text(
              compact(v),
              x + stride * i + stride * 0.14 + barW * s - 5,
              v >= 0 ? py(v) - 24 : py(v) + 6,
              barW + 6,
              13,
              data.ink,
              500,
              "center",
            );
        });
      else {
        const path = points
          .map((p, i) => `${i ? "L" : "M"} ${p[0]} ${p[1]}`)
          .join(" ");
        if (data.type === "area")
          nodes.push(
            new Path(
              `${path} L ${points.at(-1)![0]} ${py(0)} L ${points[0][0]} ${py(0)} Z`,
              { fill: series.color, opacity: 0.13, strokeWidth: 0 },
            ),
          );
        nodes.push(
          new Path(path, {
            fill: null,
            stroke: series.color,
            strokeWidth: 4,
            strokeLineJoin: "round",
          }),
        );
        points.forEach(([px, yy], i) => {
          nodes.push(
            new Circle({
              left: px - 5,
              top: yy - 5,
              radius: 5,
              fill: series.color,
              stroke: data.background,
              strokeWidth: 2,
            }),
          );
          if (data.showValues && data.labels.length * data.series.length <= 16)
            text(
              compact(series.values[i]),
              px - 24,
              yy - 30 - s * 5,
              48,
              13,
              data.ink,
              500,
              "center",
            );
        });
      }
      rect(48 + s * 220, 608, 13, 13, series.color, 3);
      text(series.name, 70 + s * 220, 601, 192, 16);
    });
  }
  const chart = new Group(nodes, { strokeWidth: 0 }) as ChartObject;
  chart.chart = data;
  return chart;
}
export function chartCSV(data: ChartData) {
  const cell = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
  return [
    ["Category", ...data.series.map((s) => s.name)],
    ...data.labels.map((label, i) => [
      label,
      ...data.series.map((s) => s.values[i]),
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
export function importChartCSV(source: string, base: ChartData): ChartData {
  if (source.length > 100_000)
    throw new Error("CSV is too large. Use up to 20 rows and 4 series.");
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  source = source.replace(/^\uFEFF/, "");
  for (let i = 0; i <= source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n" || c === undefined)) {
      row.push(value.trim());
      value = "";
      if (c !== ",") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else if (c !== "\r" && c !== undefined) value += c;
  }
  if (
    quoted ||
    rows.length < 2 ||
    rows[0].length < 2 ||
    rows.some((r) => r.length !== rows[0].length)
  )
    throw new Error(
      "Use a header row, category names in column one, and numeric values in the remaining columns.",
    );
  const result = {
    ...base,
    labels: rows.slice(1).map((r) => r[0]),
    series: rows[0]
      .slice(1)
      .map((name, s) => ({
        name,
        color: base.series[s]?.color || chartPalette[s % chartPalette.length],
        values: rows
          .slice(1)
          .map((r) => (r[s + 1] === "" ? NaN : Number(r[s + 1]))),
      })),
  };
  validateChart(result);
  return result;
}
