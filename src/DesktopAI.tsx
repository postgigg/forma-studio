import { useEffect, useState } from "react";
import { designerRequest } from "./ai";
import { Field, Modal } from "./ui";
type Settings = {
  provider: string;
  mode: "single" | "claude-codex";
  models: Record<string, string>;
  claudeAuth: "cli" | "environment";
};
type Provider = {
  id: string;
  name: string;
  installed: boolean;
  images: boolean;
  login: string;
};
type Activity = {
  id: string;
  kind: string;
  status: string;
  stage: string;
  startedAt: string;
  ai?: { engine: string; modelLabel: string };
  entries?: { at: string; type: string; text: string }[];
};
export function DesktopAI() {
  const [open] = useState(true),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [token, setToken] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null),
    [providers, setProviders] = useState<Provider[]>([]),
    [activities, setActivities] = useState<Activity[]>([]),
    [log, setLog] = useState<Activity | null>(null);
  const connect = async (preserveChoice = false) => {
    try {
      const session = await designerRequest("/session");
      setToken(session.token);
      const data = await designerRequest("/ai/settings", session.token);
      if (!preserveChoice) setSettings(data.settings);
      setProviders(data.providers);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  useEffect(() => {
    if (open) void connect();
  }, [open]);
  useEffect(() => {
    if (!open || !token) return;
    let stopped = false;
    const refresh = async () => {
      try {
        const list = await designerRequest("/ai/activity", token);
        if (!stopped) setActivities(list);
        if (log) {
          const record = await designerRequest(`/ai/activity/${log.id}`, token);
          if (!stopped) setLog(record);
        }
      } catch {
        /* Runner may be reconnecting. */
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [open, token, log?.id]);
  const save = async () => {
    setBusy("save");
    setMessage("");
    try {
      const next = await designerRequest("/ai/settings", token, {
        method: "POST",
        body: JSON.stringify(settings),
      });
      setSettings(next.settings);
      setProviders(next.providers);
      setMessage("AI choice saved. It applies to new jobs.");
      window.dispatchEvent(new Event("forma:ai-settings-changed"));
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy("");
    }
  };
  const native = async (action: "signIn" | "restartAI", provider = "codex") => {
    setBusy(action);
    setMessage(
      action === "signIn"
        ? `Complete ${providers.find((p) => p.id === provider)?.name || provider} sign-in in your browser.`
        : "Restarting the local designer…",
    );
    try {
      if (action === "signIn") {
        await window.formaDesktop!.signIn(
          provider,
          settings?.claudeAuth || "cli",
        );
      } else await window.formaDesktop!.restartAI();
      await connect(true);
      setMessage(
        action === "signIn"
          ? "Signed in. Save AI choice to use the selected account and model."
          : "Local designer restarted. Your selection is unchanged.",
      );
      window.dispatchEvent(new Event("forma:ai-settings-changed"));
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy("");
    }
  };
  const selected = providers.find((p) => p.id === settings?.provider);
  return (
    <>
      <section className="ai-settings help-ai-settings">
        <h3>AI account &amp; connection</h3>
        <p>
          Choose the account that designs your work. Only one model runs at a
          time across all AI tools. Your saved brand, style and campaign
          instructions stay shared.
        </p>
        {settings && (
          <>
            <Field label="Workflow">
              <select
                aria-label="AI workflow"
                value={settings.mode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    mode: e.target.value as Settings["mode"],
                  })
                }
              >
                <option value="single">One designer</option>
                <option value="claude-codex">
                  Claude plans → Codex builds
                </option>
              </select>
            </Field>
            {settings.mode === "single" ? (
              <>
                <Field label="Designer">
                  <select
                    aria-label="AI provider"
                    value={settings.provider}
                    onChange={(e) =>
                      setSettings({ ...settings, provider: e.target.value })
                    }
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.installed ? "" : " · not installed"}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Model or alias">
                  <input
                    aria-label="AI model"
                    maxLength={120}
                    placeholder="Use this CLI’s default"
                    value={settings.models[settings.provider] || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        models: {
                          ...settings.models,
                          [settings.provider]: e.target.value,
                        },
                      })
                    }
                  />
                </Field>
                <p className="muted small">
                  {selected?.installed
                    ? "CLI detected. Sign-in is checked by the provider when work starts."
                    : "Install this provider’s official CLI first."}{" "}
                  Sign in with <code>{selected?.login}</code>.
                </p>
              </>
            ) : (
              <>
                <p>
                  Claude studies the brief and develops the direction. Once it
                  finishes, Codex builds the editable design and reviews the
                  rendered result. Both CLI accounts must be signed in.
                </p>
                {["claude", "codex"].map((id) => (
                  <Field
                    key={id}
                    label={`${id === "claude" ? "Claude planner" : "Codex builder"} model`}
                  >
                    <input
                      aria-label={`${id} model`}
                      maxLength={120}
                      placeholder="Use CLI default"
                      value={settings.models[id]}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          models: { ...settings.models, [id]: e.target.value },
                        })
                      }
                    />
                  </Field>
                ))}
              </>
            )}
            {(settings.provider === "claude" ||
              settings.mode === "claude-codex") && (
              <Field label="Claude account type">
                <select
                  aria-label="Claude account type"
                  value={settings.claudeAuth}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      claudeAuth: e.target.value as Settings["claudeAuth"],
                    })
                  }
                >
                  <option value="cli">Claude subscription / CLI sign-in</option>
                  <option value="environment">
                    API billing / existing CLI environment
                  </option>
                </select>
                <p className="muted small">
                  Subscription mode uses your signed-in Claude account. API
                  billing can incur separate provider charges.
                </p>
              </Field>
            )}
            <p className="muted small">
              Photos, AI Pencil and Magic Eraser use Codex native image
              generation. Select Codex or the sequential workflow to use them.
              Forma never silently replaces your chosen designer.
            </p>
            <button
              className="primary full"
              disabled={!!busy}
              onClick={() => void save()}
            >
              {busy === "save" ? "Saving…" : "Save AI choice"}
            </button>
          </>
        )}
        {window.formaDesktop && (
          <div className="button-row">
            {(settings?.mode === "claude-codex"
              ? ["claude", "codex"]
              : [settings?.provider || "codex"]
            )
              .filter((id) => id !== "gemini")
              .map((id) => (
                <button
                  key={id}
                  className="secondary"
                  disabled={
                    !!busy ||
                    !providers.find((p) => p.id === id)?.installed ||
                    activities.some((a) =>
                      ["running", "queued"].includes(a.status),
                    )
                  }
                  onClick={() => void native("signIn", id)}
                >
                  Sign in to {providers.find((p) => p.id === id)?.name || id}
                </button>
              ))}
            <button
              className="secondary"
              disabled={
                !!busy ||
                activities.some((a) => ["running", "queued"].includes(a.status))
              }
              onClick={() => void native("restartAI")}
            >
              Restart AI
            </button>
          </div>
        )}
        {settings?.provider === "gemini" && settings.mode === "single" && (
          <p className="muted small">
            Open your installed Gemini CLI to complete its interactive sign-in,
            then reconnect here.
          </p>
        )}
        <details className="ai-activity">
          <summary>Peek under the commands</summary>
          <p className="muted small">
            Local instructions, commands, handoffs and results. Credentials and
            image data are hidden. Provider private reasoning is excluded.
          </p>
          {activities.length ? (
            <ul>
              {activities.map((a) => (
                <li key={a.id}>
                  <button
                    className="text-button"
                    onClick={async () => {
                      try {
                        setLog(
                          await designerRequest(`/ai/activity/${a.id}`, token),
                        );
                      } catch (e) {
                        setMessage((e as Error).message);
                      }
                    }}
                  >
                    <strong>
                      {a.ai?.engine || "Designer"} · {a.kind}
                    </strong>
                    <span>{a.stage}</span>
                    <small>
                      {new Date(a.startedAt).toLocaleString()} · {a.status}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>No AI activity recorded yet.</p>
          )}
        </details>
        {message && <p role="status">{message}</p>}
      </section>
      {log && (
        <Modal title="AI activity" onClose={() => setLog(null)} wide>
          <p>
            {log.ai?.engine} · {log.ai?.modelLabel} · {log.stage}
          </p>
          <div className="ai-log">
            {log.entries?.map((entry, i) => (
              <details key={i} open={entry.type === "error"}>
                <summary>
                  {entry.type}{" "}
                  <time>{new Date(entry.at).toLocaleTimeString()}</time>
                </summary>
                <pre>{entry.text}</pre>
              </details>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
