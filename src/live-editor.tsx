import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZopackContext, type ZopackContextValue, type ZopackStatus } from "./zopack-context";
import { ZopackIndicator } from "./zopack-indicator";
import { parsePackFromContent, type ParsedPack, type ParsedRoute } from "./zopack";

export interface ZoLiveEditProps {
  packMarkdown?: string;
  packUrl?: string;
  packPath?: string;
  routePath?: string;
  packFilePath?: string;
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

export function resolveZopackStatus(args: {
  hasInlinePack: boolean;
  hasPackUrl: boolean;
  rawMarkdown: string;
  loadError: string | null;
  parsedPack: ParsedPack | { error: string } | null;
  running: boolean;
  error: string | null;
}): ZopackStatus {
  if (args.running) return "saving";
  if (args.error || args.loadError) return "error";
  if (!args.rawMarkdown.trim()) return args.hasPackUrl && !args.hasInlinePack ? "loading" : "idle";
  if (!isParsedPack(args.parsedPack)) return "error";
  return "ready";
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

    if (!packUrl) {
      setRawMarkdown("");
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setRawMarkdown("");
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
  const [notice, setNotice] = useState("");
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

  const runEdit = useCallback(async () => {
    if (!selectedRoute || !selectedKey || !rawMarkdown.trim() || !isParsedPack(plan)) return;

    setRunning(true);
    setError(null);
    setNotice("Sending edit to Zo...");

    const nextCode = drafts[selectedKey] ?? selectedRoute.code;
    const packName = plan.meta.name || props.packPath || props.routePath || props.packUrl || "zopack";

    try {
      const response = await fetch(props.apiPath ?? "/api/zopack-live-edit", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          pack_markdown: rawMarkdown,
          pack_file_path: props.packFilePath,
          pack_name: packName,
          pack_path: props.packPath ?? props.routePath ?? props.packUrl,
          target_path: selectedRoute.path,
          target_route_type: selectedRoute.route_type,
          before_code: selectedRoute.code,
          after_code: nextCode,
          conversation_id: conversationId,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Zo edit failed with status ${response.status}`);
      if (payload && typeof payload.conversation_id === "string") setConversationId(payload.conversation_id);

      setNotice("Zo replied. Refreshing...");
      window.setTimeout(() => window.location.reload(), 600);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
      setNotice("");
    } finally {
      setRunning(false);
    }
  }, [conversationId, drafts, plan, props.apiPath, props.packFilePath, props.packPath, props.packUrl, props.routePath, rawMarkdown, selectedKey, selectedRoute]);

  const contextValue = useMemo<ZopackContextValue>(() => {
    const label = props.openLabel || "Open live editor";
    return {
      isOpen: open,
      label,
      status: resolveZopackStatus({
        hasInlinePack: typeof props.packMarkdown === "string" && props.packMarkdown.trim().length > 0,
        hasPackUrl: typeof props.packUrl === "string" && props.packUrl.trim().length > 0,
        rawMarkdown,
        loadError,
        parsedPack: plan,
        running,
        error,
      }),
      error,
      openPanel: () => setOpen(true),
      closePanel: () => setOpen(false),
      togglePanel: () => setOpen((value) => !value),
    };
  }, [error, loadError, open, plan, props.openLabel, props.packMarkdown, props.packUrl, rawMarkdown, running]);

  const body = (() => {
    if (!rawMarkdown.trim()) {
      if (!props.packUrl && typeof props.packMarkdown !== "string") {
        return <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">No pack source configured. Pass `packMarkdown` or `packUrl` to load a pack.</div>;
      }

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
            <div className="mt-1 leading-6">The run button sends the edited route back through your Zo API route, asks Zo to confirm the exact pack edit, writes the file on the server, and refreshes the page when the edit completes.</div>
            {notice ? <div className="mt-2 text-emerald-300">{notice}</div> : null}
            {error ? <div className="mt-2 text-red-300">{error}</div> : null}
          </div>
        </section>
      </div>
    );
  })();

  const renderPanel = useCallback(
    (context: ZopackContextValue) => (
      <div className="flex h-full min-h-[360px] flex-col gap-4 rounded-3xl border border-white/10 bg-slate-950/95 p-4 text-slate-100 shadow-2xl shadow-black/30 backdrop-blur md:p-5">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Zo live editor</div>
            <div className="text-sm text-slate-200">Edit the pack file, send the change to Zo, then refresh.</div>
          </div>
          <button
            type="button"
            onClick={context.closePanel}
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
          >
            Hide
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto pb-4">{body}</div>
      </div>
    ),
    [body],
  );

  const context = useMemo(() => contextValue, [contextValue]);

  return (
    <div className={props.className}>
      <ZopackContext.Provider value={context}>
        <ZopackIndicator renderPanel={renderPanel} />
      </ZopackContext.Provider>
    </div>
  );
}

export const ZoElement = ZopackLiveEditor;
