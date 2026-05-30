import { useEffect, useMemo, useRef, useState } from "react";
import { buildZoLiveEditPrompt } from "./prompt";
import { parsePackFromContent, replacePackRouteCode, type ParsedPack, type ParsedRoute } from "./zopack";

export interface ZoLiveEditProps {
  packMarkdown?: string;
  packUrl?: string;
  packPath?: string;
  apiPath?: string;
  className?: string;
  openLabel?: string;
}

type RouteType = ParsedRoute["route_type"];

function isParsedPack(value: ParsedPack | { error: string } | null): value is ParsedPack {
  return Boolean(value && "routes" in value);
}

function routeKey(route: Pick<ParsedRoute, "path" | "route_type">): string {
  return `${route.route_type}:${route.path}`;
}

function routeLanguage(routeType: RouteType): "ts" | "tsx" {
  return routeType === "page" ? "tsx" : "ts";
}

function usePackSource(packMarkdown?: string, packUrl?: string) {
  const [rawMarkdown, setRawMarkdown] = useState(packMarkdown ?? "");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof packMarkdown === "string") {
      setRawMarkdown(packMarkdown);
      setLoadError(null);
      return;
    }

    if (!packUrl) return;

    let cancelled = false;
    setLoadError(null);

    void (async () => {
      try {
        const response = await fetch(packUrl, { headers: { accept: "text/markdown,text/plain,*/*" } });
        if (!response.ok) throw new Error(`Failed to fetch pack: ${response.status}`);
        const text = await response.text();
        if (!cancelled) setRawMarkdown(text);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [packMarkdown, packUrl]);

  return { rawMarkdown, loadError };
}

function CodeMirrorEditor(props: { value: string; language: "ts" | "tsx"; onChange: (value: string) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [{ EditorState }, { EditorView, lineNumbers, highlightActiveLine, drawSelection }, { javascript }] = await Promise.all([
          // @ts-expect-error browser-only remote module
          import("https://esm.sh/@codemirror/state@6.5.2"),
          // @ts-expect-error browser-only remote module
          import("https://esm.sh/@codemirror/view@6.38.0"),
          // @ts-expect-error browser-only remote module
          import("https://esm.sh/@codemirror/lang-javascript@6.2.4"),
        ]);

        if (cancelled || !hostRef.current) return;

        const languageExtension = props.language === "tsx" ? javascript({ typescript: true, jsx: true }) : javascript({ typescript: true });
        const theme = EditorView.theme({
          "&": { height: "100%", backgroundColor: "transparent", color: "#e5e7eb", fontSize: "13px" },
          ".cm-scroller": { fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, "Liberation Mono", monospace' },
          ".cm-content": { caretColor: "#f9fafb" },
          ".cm-gutters": { backgroundColor: "rgba(15, 23, 42, 0.92)", color: "#64748b", border: "none" },
          ".cm-activeLine": { backgroundColor: "rgba(148, 163, 184, 0.08)" },
          ".cm-activeLineGutter": { backgroundColor: "rgba(148, 163, 184, 0.08)" },
        });

        const state = EditorState.create({
          doc: props.value,
          extensions: [
            lineNumbers(),
            highlightActiveLine(),
            drawSelection(),
            EditorView.lineWrapping,
            theme,
            languageExtension,
            EditorView.updateListener.of((update: any) => {
              if (update.docChanged) props.onChange(update.state.doc.toString());
            }),
          ],
        });

        viewRef.current = new EditorView({ state, parent: hostRef.current });
        setReady(true);
      } catch (error) {
        console.error("Failed to load CodeMirror", error);
      }
    })();

    return () => {
      cancelled = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [props.language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const current = view.state.doc.toString();
    if (current === props.value) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: props.value } });
  }, [props.value]);

  if (!ready) {
    return (
      <textarea
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-full min-h-[360px] w-full resize-none rounded-2xl border border-white/10 bg-slate-950/90 p-4 font-mono text-sm leading-6 text-slate-100 outline-none"
        spellCheck={false}
      />
    );
  }

  return <div ref={hostRef} className="h-full min-h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/90" />;
}

export function ZopackLiveEditor(props: ZoLiveEditProps) {
  const { rawMarkdown, loadError } = usePackSource(props.packMarkdown, props.packUrl);
  const plan = useMemo(() => {
    if (!rawMarkdown.trim()) return null;
    try {
      return parsePackFromContent(rawMarkdown);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) } as const;
    }
  }, [rawMarkdown]);

  const [open, setOpen] = useState(false);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const routes = isParsedPack(plan) ? plan.routes : [];
  const selectedRoute = routes[selectedRouteIndex] ?? null;
  const selectedKey = selectedRoute ? routeKey(selectedRoute) : null;
  const currentDraft = selectedKey ? drafts[selectedKey] ?? selectedRoute?.code ?? "" : "";

  useEffect(() => {
    if (!selectedRoute) return;
    const key = routeKey(selectedRoute);
    setDrafts((previous) => (previous[key] !== undefined ? previous : { ...previous, [key]: selectedRoute.code }));
  }, [selectedRoute?.path, selectedRoute?.route_type, selectedRoute?.code]);

  useEffect(() => {
    if (selectedRouteIndex >= routes.length) setSelectedRouteIndex(0);
  }, [routes.length, selectedRouteIndex]);

  async function runEdit() {
    if (!selectedRoute || !selectedKey || !rawMarkdown.trim() || !isParsedPack(plan)) return;

    setRunning(true);
    setError(null);
    setStatus("Sending edit to Zo...");

    const nextCode = drafts[selectedKey] ?? selectedRoute.code;
    const updatedMarkdown = replacePackRouteCode(rawMarkdown, selectedRoute, nextCode);
    const packName = plan.meta.name || props.packUrl || "zopack";
    const prompt = buildZoLiveEditPrompt({
      packName,
      packPath: props.packPath ?? props.packUrl,
      target: selectedRoute,
      beforeCode: selectedRoute.code,
      afterCode: nextCode,
      conversationId,
    });

    try {
      const response = await fetch(props.apiPath ?? "/api/zopack-live-edit", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          input: `${prompt}\n\nDesired full pack markdown after the edit:\n\`\`\`markdown\n${updatedMarkdown.trimEnd()}\n\`\`\``,
          conversation_id: conversationId,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Zo edit failed with status ${response.status}`);
      if (payload && typeof payload.conversation_id === "string") setConversationId(payload.conversation_id);

      setStatus("Zo replied. Refreshing...");
      window.setTimeout(() => window.location.reload(), 600);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
      setStatus("");
    } finally {
      setRunning(false);
    }
  }

  const body = (() => {
    if (!rawMarkdown.trim()) {
      return (
        <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/60 p-4 text-sm text-slate-300">
          {loadError ? `Failed to load pack: ${loadError}` : "Loading pack markdown. If you provided packUrl, make sure it is reachable from this page."}
        </div>
      );
    }

    if (!isParsedPack(plan)) {
      const message = plan && "error" in plan ? plan.error : "Failed to parse pack markdown.";
      return <div className="rounded-2xl border border-red-500/30 bg-red-950/50 p-4 text-sm text-red-100">{message}</div>;
    }

    if (!selectedRoute) {
      return <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">No routes found in this pack.</div>;
    }

    return (
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Files</div>
              <div className="text-sm text-slate-200">{routes.length} route(s)</div>
            </div>
          </div>
          <div className="space-y-2">
            {routes.map((route, index) => {
              const active = index === selectedRouteIndex;
              return (
                <button
                  key={routeKey(route)}
                  type="button"
                  onClick={() => setSelectedRouteIndex(index)}
                  className={[
                    "w-full rounded-xl border px-3 py-2 text-left transition",
                    active
                      ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-100"
                      : "border-white/10 bg-white/0 text-slate-300 hover:border-white/20 hover:bg-white/[0.04]",
                  ].join(" ")}
                >
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{route.route_type}</div>
                  <div className="truncate font-mono text-sm">{route.path}</div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col gap-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Editing</div>
                <div className="font-mono text-base text-slate-100">{selectedRoute.path}</div>
                <div className="text-sm text-slate-400">{selectedRoute.route_type === "page" ? "Page route" : "API route"} · this tab edits the route code inside the pack</div>
              </div>
              <button
                type="button"
                onClick={() => void runEdit()}
                disabled={running}
                className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {running ? "Running..." : "Run"}
              </button>
            </div>
          </div>

          <div className="min-h-[420px] overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-3">
            <CodeMirrorEditor
              value={currentDraft}
              language={routeLanguage(selectedRoute.route_type)}
              onChange={(value) => {
                if (!selectedKey) return;
                setDrafts((previous) => ({ ...previous, [selectedKey]: value }));
              }}
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-300">
            <div className="font-medium text-slate-100">Run behavior</div>
            <div className="mt-1 leading-6">The run button sends the edited route back through your Zo API route, asks Zo to update the pack file in place, and refreshes the page when the edit completes.</div>
            {status ? <div className="mt-2 text-emerald-300">{status}</div> : null}
            {error ? <div className="mt-2 text-red-300">{error}</div> : null}
          </div>
        </section>
      </div>
    );
  })();

  return (
    <div className={props.className}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-6 right-6 z-[60] rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-2xl shadow-emerald-500/20 transition hover:bg-emerald-300"
      >
        {open ? "Close editor" : props.openLabel || "Open live editor"}
      </button>

      {open ? (
        <div className="fixed inset-y-0 right-0 z-[50] w-full max-w-[min(100vw,92rem)] border-l border-white/10 bg-slate-950/95 backdrop-blur">
          <div className="flex h-full flex-col gap-4 p-4 md:p-5">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Zo live editor</div>
                <div className="text-sm text-slate-200">Edit the pack file, send the change to Zo, then refresh.</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5">
                Hide
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto pb-4">{body}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
