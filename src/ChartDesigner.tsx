import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  LineChart,
  ChartArea,
  ChartPie,
  CircleDot,
  Plus,
  Trash2,
  Upload,
  Download,
} from "lucide-react";
import { Modal, Field } from "./ui";
import { download, type Editor } from "./editor";
import {
  chartCSV,
  chartPalette,
  chartTypes,
  defaultChart,
  importChartCSV,
  makeChart,
  type ChartData,
  type ChartObject,
  type ChartType,
} from "./charts";

const icons = [BarChart3, LineChart, ChartArea, ChartPie, CircleDot];
export function ChartLibrary({
  onChoose,
}: {
  onChoose: (type: ChartType) => void;
}) {
  return (
    <aside className="asset-panel">
      <div className="panel-heading">
        <h2>Charts</h2>
      </div>
      <p className="modal-description">
        Turn your numbers into a story. Every chart keeps its editable data.
      </p>
      <div className="chart-library">
        {chartTypes.map((type, i) => {
          const Icon = icons[i];
          return (
            <button key={type} onClick={() => onChoose(type)}>
              <Icon size={56} strokeWidth={1.4} />
              <strong>{type[0].toUpperCase() + type.slice(1)} chart</strong>
              <small>
                {i > 2
                  ? "Compare parts of a whole"
                  : "Compare values and trends"}
              </small>
            </button>
          );
        })}
      </div>
      <p className="panel-note">
        Enter data or import a CSV. Choose colors, add series, and switch chart
        styles.
      </p>
    </aside>
  );
}
export function ChartDialog({
  editor,
  type,
  existing,
  onClose,
}: {
  editor: Editor;
  type: ChartType;
  existing?: ChartObject;
  onClose: () => void;
}) {
  const [data, setData] = useState<ChartData>(() =>
      structuredClone(existing?.chart || defaultChart(type)),
    ),
    [error, setError] = useState(""),
    [csv, setCSV] = useState(""),
    [showCSV, setShowCSV] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null),
    file = useRef<HTMLInputElement>(null),
    destination = useRef({
      doc: editor.doc.id,
      page: editor.page.id,
      baseline: existing ? JSON.stringify(existing.chart) : "",
    });
  const update = (value: Partial<ChartData>) =>
    setData((d) => ({ ...d, ...value }));
  useEffect(() => {
    try {
      const chart = makeChart(data),
        out = chart.toCanvasElement({ multiplier: 0.7 });
      const canvas = preview.current!;
      canvas.width = out.width;
      canvas.height = out.height;
      canvas.getContext("2d")!.drawImage(out, 0, 0);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [data]);
  const apply = () => {
    try {
      const chart = makeChart(data);
      if (
        editor.busy ||
        destination.current.doc !== editor.doc.id ||
        destination.current.page !== editor.page.id
      )
        throw new Error("The page changed. Reopen the chart editor.");
      if (existing) {
        if (
          !editor.objects.includes(existing) ||
          JSON.stringify(existing.chart) !== destination.current.baseline ||
          existing.lockMovementX
        )
          throw new Error(
            "This chart changed. Reopen it to edit the latest version.",
          );
        editor.replaceObject(existing, chart);
      } else {
        chart.scale(
          Math.min(
            (editor.doc.width * 0.85) / 960,
            (editor.doc.height * 0.85) / 660,
            1,
          ),
        );
        editor.add(chart, `${data.type} chart`);
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const importCSV = (source: string) => {
    try {
      setData(importChartCSV(source, data));
      setShowCSV(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title={existing ? "Edit chart data" : "Create a chart"}
      onClose={onClose}
      wide
    >
      <div className="chart-dialog">
        <div className="chart-preview">
          <canvas ref={preview} aria-label="Chart preview" />
        </div>
        <div className="chart-controls">
          <div className="field-row">
            <Field label="Chart style">
              <select
                aria-label="Chart style"
                value={data.type}
                onChange={(e) => update({ type: e.target.value as ChartType })}
              >
                {chartTypes.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Background">
              <input
                aria-label="Chart background"
                type="color"
                value={data.background}
                onChange={(e) => update({ background: e.target.value })}
              />
            </Field>
            <Field label="Text">
              <input
                aria-label="Chart text color"
                type="color"
                value={data.ink}
                onChange={(e) => update({ ink: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Title">
            <input
              aria-label="Chart title"
              maxLength={90}
              value={data.title}
              onChange={(e) => update({ title: e.target.value })}
            />
          </Field>
          <Field label="Subtitle">
            <input
              aria-label="Chart subtitle"
              maxLength={160}
              value={data.subtitle}
              onChange={(e) => update({ subtitle: e.target.value })}
            />
          </Field>
          <label className="check-row">
            <input
              type="checkbox"
              checked={data.showValues}
              onChange={(e) => update({ showValues: e.target.checked })}
            />
            Show values
          </label>
          <div className="chart-data-heading">
            <h3>Your data</h3>
            <button
              className="text-button"
              onClick={() => setShowCSV(!showCSV)}
            >
              Paste CSV
            </button>
            <button
              className="text-button"
              onClick={() => file.current?.click()}
            >
              <Upload size={14} />
              Import
            </button>
            <button
              className="text-button"
              onClick={() =>
                download(
                  new Blob([chartCSV(data)], { type: "text/csv" }),
                  "chart-data.csv",
                ).catch(error => setError(error.message))
              }
            >
              <Download size={14} />
              CSV
            </button>
          </div>
          <input
            ref={file}
            hidden
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) importCSV(await f.text());
              e.target.value = "";
            }}
          />
          {showCSV && (
            <div className="csv-entry">
              <textarea
                aria-label="CSV data"
                value={csv}
                onChange={(e) => setCSV(e.target.value)}
                placeholder={"Category,Sales\nJanuary,42\nFebruary,68"}
              />
              <button className="secondary" onClick={() => importCSV(csv)}>
                Use CSV data
              </button>
            </div>
          )}
          {["pie", "donut"].includes(data.type) && (
            <p className="muted small">
              This style shows the first series. Other series are kept when
              switching styles.
            </p>
          )}
          <div className="chart-table-wrap">
            <table className="chart-table">
              <thead>
                <tr>
                  <th>Category</th>
                  {data.series.map((s, j) => (
                    <th key={j}>
                      <div className="series-heading">
                        <input
                          type="color"
                          aria-label={`Series ${j + 1} color`}
                          value={s.color}
                          onChange={(e) =>
                            update({
                              series: data.series.map((v, k) =>
                                k === j ? { ...v, color: e.target.value } : v,
                              ),
                            })
                          }
                        />
                        <input
                          aria-label={`Series ${j + 1} name`}
                          maxLength={40}
                          value={s.name}
                          onChange={(e) =>
                            update({
                              series: data.series.map((v, k) =>
                                k === j ? { ...v, name: e.target.value } : v,
                              ),
                            })
                          }
                        />
                        <button
                          title={`Remove series ${j + 1}`}
                          aria-label={`Remove series ${j + 1}`}
                          disabled={data.series.length === 1}
                          onClick={() =>
                            update({
                              series: data.series.filter((_, k) => k !== j),
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.labels.map((label, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        aria-label={`Category ${i + 1}`}
                        maxLength={40}
                        value={label}
                        onChange={(e) =>
                          update({
                            labels: data.labels.map((v, k) =>
                              k === i ? e.target.value : v,
                            ),
                          })
                        }
                      />
                    </td>
                    {data.series.map((s, j) => (
                      <td key={j}>
                        <input
                          type="number"
                          aria-label={`Row ${i + 1} series ${j + 1}`}
                          value={
                            Number.isFinite(s.values[i]) ? s.values[i] : ""
                          }
                          onChange={(e) =>
                            update({
                              series: data.series.map((v, k) =>
                                k === j
                                  ? {
                                      ...v,
                                      values: v.values.map((n, r) =>
                                        r === i
                                          ? e.target.value === ""
                                            ? NaN
                                            : Number(e.target.value)
                                          : n,
                                      ),
                                    }
                                  : v,
                              ),
                            })
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        aria-label={`Remove row ${i + 1}`}
                        disabled={data.labels.length === 1}
                        onClick={() =>
                          update({
                            labels: data.labels.filter((_, k) => k !== i),
                            series: data.series.map((s) => ({
                              ...s,
                              values: s.values.filter((_, k) => k !== i),
                            })),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="chart-data-actions">
            <button
              className="secondary"
              disabled={data.labels.length >= 20}
              onClick={() =>
                update({
                  labels: [
                    ...data.labels,
                    `Category ${data.labels.length + 1}`,
                  ],
                  series: data.series.map((s) => ({
                    ...s,
                    values: [...s.values, 0],
                  })),
                })
              }
            >
              <Plus size={14} />
              Add row
            </button>
            <button
              className="secondary"
              disabled={data.series.length >= 4}
              onClick={() =>
                update({
                  series: [
                    ...data.series,
                    {
                      name: `Series ${data.series.length + 1}`,
                      color: chartPalette[data.series.length],
                      values: data.labels.map(() => 0),
                    },
                  ],
                })
              }
            >
              <Plus size={14} />
              Add series
            </button>
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="primary" disabled={!!error} onClick={apply}>
          {existing ? "Save chart changes" : "Add chart to design"}
        </button>
      </div>
    </Modal>
  );
}
