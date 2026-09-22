import { useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Columns3,
  Copy,
  Database,
  Download,
  Info,
  Link2,
  PanelRight,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Table2,
  Terminal,
  X,
} from 'lucide-react';
import {
  useAskData,
  useGetSchema,
  useHealthCheck,
} from '@workspace/api-client-react';
import type { AskDataResult, DatabaseSchema } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Router as WouterRouter,
  Switch,
  useLocation,
} from 'wouter';

const queryClient = new QueryClient();

type HistoryItem = {
  id: number;
  question: string;
  result: AskDataResult;
};

const examples = [
  'Show the top 5 customers by total revenue.',
  'How many orders were placed in each city?',
  'What was the total revenue for each month?',
];

function AskDataWorkspace() {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeResult, setActiveResult] = useState<AskDataResult | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState<number | null>(null);
  const [schemaOpen, setSchemaOpen] = useState(true);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const schemaQuery = useGetSchema();
  const healthQuery = useHealthCheck();
  const askMutation = useAskData();
  const schema = schemaQuery.data as DatabaseSchema | undefined;

  const selectedTable = useMemo(
    () => schema?.tables.find((table) => table.name === expandedTable),
    [expandedTable, schema],
  );

  const handleSubmit = (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || askMutation.isPending) return;
    askMutation.mutate(
      { data: { question: trimmedQuestion } },
      {
        onSuccess: (result) => {
          const item = { id: Date.now(), question: trimmedQuestion, result };
          setHistory((current) => [item, ...current].slice(0, 8));
          setActiveHistoryId(item.id);
          setActiveResult(result);
        },
      },
    );
  };

  const selectExample = (example: string) => {
    setQuestion(example);
    setActiveHistoryId(null);
  };

  const selectHistory = (item: HistoryItem) => {
    setQuestion(item.question);
    setActiveHistoryId(item.id);
    setActiveResult(item.result);
  };

  const copySql = async () => {
    if (!activeResult?.sql) return;
    await navigator.clipboard?.writeText(activeResult.sql);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const exportRows = () => {
    if (!activeResult || activeResult.rows.length === 0) return;
    const csvValue = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value);
      return `"${text.replaceAll('"', '""')}"`;
    };
    const csv = [
      activeResult.columns.map(csvValue).join(','),
      ...activeResult.rows.map((row) => row.map(csvValue).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'askdata-results.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="workbench-grid min-h-[100dvh] bg-background text-foreground">
      <header className="flex h-[68px] items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur md:px-7">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-[11px] bg-primary text-primary-foreground shadow-sm">
            <BarChart3 className="size-[18px]" strokeWidth={2.4} />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[20px] font-semibold tracking-[-0.025em]">AskData</span>
              <span className="hidden rounded-full bg-accent px-2 py-0.5 font-code text-[9px] font-medium uppercase tracking-[0.14em] text-accent-foreground sm:inline-flex">workbench</span>
            </div>
            <p className="hidden text-[11px] text-muted-foreground sm:block">Ask clearly. Query safely.</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="hidden items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] text-muted-foreground sm:flex">
            <span className={`size-1.5 rounded-full ${healthQuery.isError ? 'bg-destructive' : 'bg-emerald-600'}`} />
            {healthQuery.isLoading ? 'Connecting to sample db' : healthQuery.isError ? 'Service unavailable' : 'Sample db connected'}
          </div>
          <button
            type="button"
            data-testid="button-toggle-schema"
            onClick={() => setSchemaOpen((open) => !open)}
            className="flex size-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            aria-label="Toggle schema panel"
          >
            <PanelRight className="size-4" />
          </button>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100dvh-68px)] max-w-[1640px] grid-cols-1 lg:grid-cols-[238px_minmax(0,1fr)_316px]">
        <aside className="hidden border-r border-border bg-sidebar px-3 py-5 text-sidebar-foreground lg:block">
          <div className="mb-7 px-3">
            <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/55">
              <Database className="size-3.5" />
              Explorer
            </div>
            <p className="text-[12px] leading-relaxed text-sidebar-foreground/55">A small, safe place to learn how questions become queries.</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/45">
              <span>Conversation</span>
              {history.length > 0 && <span>{history.length}</span>}
            </div>
            {history.length === 0 ? (
              <div className="mx-2 rounded-xl border border-dashed border-sidebar-border px-3 py-4 text-[11px] leading-relaxed text-sidebar-foreground/45">
                Your questions will stay here while you explore.
              </div>
            ) : (
              history.map((item) => (
                <button
                  type="button"
                  data-testid={`button-history-${item.id}`}
                  key={item.id}
                  onClick={() => selectHistory(item)}
                  className={`group flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-[12px] leading-snug transition-colors ${activeHistoryId === item.id ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'}`}
                >
                  <Clock3 className="mt-0.5 size-3.5 shrink-0 opacity-60" />
                  <span className="line-clamp-2">{item.question}</span>
                </button>
              ))
            )}
          </div>

          <div className="mt-auto pt-8">
            <div className="mx-2 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-medium">
                <ShieldCheck className="size-3.5 text-secondary" />
                Safe by default
              </div>
              <p className="text-[10px] leading-relaxed text-sidebar-foreground/50">AskData only generates read-only queries against the sample database.</p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-7 md:px-8 lg:px-10">
          <div className="mx-auto max-w-[860px]">
            <section className="fade-up mb-8">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                <CircleDot className="size-3.5" />
                Natural language → SQL
              </div>
              <h1 className="font-display max-w-[670px] text-[clamp(2.25rem,4vw,3.7rem)] leading-[0.98] tracking-[-0.045em] text-foreground">
                Ask a question.<br />
                <span className="text-primary">See how it works.</span>
              </h1>
              <p className="mt-4 max-w-[560px] text-[14px] leading-relaxed text-muted-foreground">
                Explore a small sample database in plain English. We translate your question into safe SQL, then keep the answer inspectable.
              </p>
            </section>

            <section className="fade-up fade-up-delay-1 mb-8 rounded-2xl border border-border bg-card p-3 shadow-[0_16px_45px_hsl(var(--foreground)/0.05)]">
              <form onSubmit={handleSubmit}>
                <div className="rounded-xl border border-input bg-background p-1.5 transition-colors focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/10">
                  <textarea
                    data-testid="input-question"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                     onKeyDown={(event) => {
                       if (event.key === 'Enter' && !event.shiftKey) {
                         event.preventDefault();
                         handleSubmit();
                       }
                     }}
                     placeholder="Ask a question about your data…"
                    className="min-h-[86px] w-full resize-none bg-transparent px-3 py-2.5 text-[14px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
                    maxLength={500}
                  />
                  <div className="flex items-center justify-between border-t border-border/70 px-2 pt-2">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Sparkles className="size-3.5 text-secondary" />
                      <span>Natural language is okay</span>
                      <span className="hidden text-muted-foreground/50 sm:inline">⌘ Enter to run</span>
                    </div>
                    <button
                      type="submit"
                      data-testid="button-ask-data"
                      disabled={!question.trim() || askMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-[12px] font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-45"
                    >
                       {askMutation.isPending ? 'Thinking' : 'Ask'}
                      {askMutation.isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                    </button>
                  </div>
                </div>
              </form>
            </section>

            {!activeResult && !askMutation.isPending && (
              <section className="fade-up fade-up-delay-2">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-[12px] font-semibold text-foreground">Start with an example</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Good questions are specific, but never need SQL syntax.</p>
                  </div>
                  <ArrowUpRight className="size-4 text-muted-foreground/50" />
                </div>
                <div className="grid gap-2.5 md:grid-cols-3">
                  {examples.map((example, index) => (
                    <button
                      type="button"
                      data-testid={`button-example-${index}`}
                      key={example}
                      onClick={() => selectExample(example)}
                      className="group rounded-xl border border-border bg-card px-3.5 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_8px_22px_hsl(var(--foreground)/0.06)]"
                    >
                      <span className="mb-3 block font-code text-[10px] text-secondary">0{index + 1}</span>
                      <span className="block text-[12px] leading-relaxed text-foreground/80 group-hover:text-foreground">{example}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-8 flex items-start gap-2.5 rounded-xl bg-accent/60 p-3.5 text-[11px] leading-relaxed text-accent-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  <p><strong className="font-semibold">A note for learners:</strong> the generated SQL is intentionally visible. Read it alongside the result to build intuition.</p>
                </div>
              </section>
            )}

            {askMutation.isPending && (
              <section className="fade-up space-y-3" aria-live="polite" data-testid="status-loading">
                <div className="flex items-center gap-2 text-[12px] font-medium text-primary">
                  <RefreshCw className="size-3.5 animate-spin" />
                  Translating your question into a safe query…
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="shimmer h-3 w-1/3 rounded" />
                  <div className="mt-4 shimmer h-3 w-3/4 rounded" />
                  <div className="mt-2 shimmer h-3 w-1/2 rounded" />
                  <div className="mt-6 grid grid-cols-3 gap-2">
                    <div className="shimmer h-8 rounded" />
                    <div className="shimmer h-8 rounded" />
                    <div className="shimmer h-8 rounded" />
                  </div>
                </div>
              </section>
            )}

            {askMutation.isError && !askMutation.isPending && (
              <section className="fade-up rounded-xl border border-destructive/25 bg-destructive/5 p-4" data-testid="status-error">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-4 text-destructive" />
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">We couldn't reach the query service.</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Try the question again in a moment. Your schema browser is still available.</p>
                    <button type="button" data-testid="button-retry-query" onClick={() => handleSubmit()} className="mt-3 text-[11px] font-semibold text-destructive underline underline-offset-4">Retry question</button>
                  </div>
                </div>
              </section>
            )}

            {activeResult && !askMutation.isPending && (
              <ResultView
                result={activeResult}
                copied={copied}
                onCopy={copySql}
                onExport={exportRows}
              />
            )}
          </div>
        </main>

        <aside className={`${schemaOpen ? 'block' : 'hidden'} border-l border-border bg-card/65 px-4 py-6 lg:block`}>
          <div className="mb-5 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-semibold tracking-[-0.01em]">Database schema</h2>
                <button
                  type="button"
                  data-testid="button-close-schema"
                  onClick={() => setSchemaOpen(false)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
                  aria-label="Close schema panel"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Know the shape before you ask.</p>
            </div>
            <Database className="size-4 text-primary" />
          </div>

          {schemaQuery.isLoading && <SchemaLoading />}
          {schemaQuery.isError && (
            <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-[11px] text-muted-foreground" data-testid="status-schema-error">
              <p className="font-medium text-foreground">Schema unavailable</p>
              <button type="button" data-testid="button-retry-schema" onClick={() => schemaQuery.refetch()} className="mt-2 inline-flex items-center gap-1 font-semibold text-destructive">
                <RefreshCw className="size-3" /> Try again
              </button>
            </div>
          )}
          {schema && (
            <>
              <div className="mb-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border bg-background p-3">
                  <p className="font-code text-[17px] text-primary">{schema.tables.length}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">tables</p>
                </div>
                <div className="rounded-xl border border-border bg-background p-3">
                  <p className="font-code text-[17px] text-primary">{schema.row_count.toLocaleString()}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">sample rows</p>
                </div>
              </div>
              <div className="space-y-2">
                {schema.tables.map((table) => {
                  const isOpen = expandedTable === table.name;
                  return (
                    <div className="overflow-hidden rounded-xl border border-border bg-background" key={table.name}>
                      <button
                        type="button"
                        data-testid={`button-table-${table.name}`}
                        onClick={() => setExpandedTable(isOpen ? null : table.name)}
                        className="flex w-full items-center gap-2.5 px-3 py-3 text-left transition-colors hover:bg-muted/60"
                      >
                        {isOpen ? <ChevronDown className="size-3.5 text-primary" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
                        <Table2 className="size-3.5 text-secondary" />
                        <span className="min-w-0 flex-1 truncate font-code text-[12px] font-medium text-foreground">{table.name}</span>
                        <span className="font-code text-[10px] text-muted-foreground">{table.columns.length}</span>
                      </button>
                      {isOpen && (
                        <div className="border-t border-border px-3 pb-3 pt-2.5">
                          <p className="mb-3 text-[10px] leading-relaxed text-muted-foreground">{table.description}</p>
                          <div className="space-y-2">
                            {table.columns.map((column) => (
                              <div className="flex items-start gap-2" key={column.name}>
                                <Columns3 className="mt-0.5 size-3 shrink-0 text-muted-foreground/70" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate font-code text-[10px] text-foreground">{column.name}</span>
                                    {column.nullable && <span className="text-[9px] text-muted-foreground">nullable</span>}
                                  </div>
                                  <p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">{column.type} · {column.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {schema.relationships.length > 0 && (
                <div className="mt-5 border-t border-border pt-4">
                  <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <Link2 className="size-3.5" />
                    Relationships
                  </div>
                  <div className="space-y-2">
                    {schema.relationships.map((relationship, index) => (
                      <div className="rounded-lg bg-muted/55 px-2.5 py-2 font-code text-[9px] leading-relaxed text-muted-foreground" data-testid={`relationship-${index}`} key={`${relationship.from_table}-${relationship.from_column}`}>
                        <span className="text-primary">{relationship.from_table}</span>.{relationship.from_column}
                        <span className="px-1.5 text-muted-foreground/50">→</span>
                        <span className="text-secondary-foreground">{relationship.to_table}</span>.{relationship.to_column}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {selectedTable && <span className="sr-only">{selectedTable.name} selected</span>}
        </aside>
      </div>
    </div>
  );
}

function SchemaLoading() {
  return (
    <div className="space-y-2.5" aria-label="Loading schema" data-testid="status-schema-loading">
      <div className="shimmer h-16 rounded-xl" />
      <div className="shimmer h-12 rounded-xl" />
      <div className="shimmer h-12 rounded-xl" />
      <div className="shimmer h-12 rounded-xl" />
    </div>
  );
}

function ResultView({
  result,
  copied,
  onCopy,
  onExport,
}: {
  result: AskDataResult;
  copied: boolean;
  onCopy: () => void;
  onExport: () => void;
}) {
  if (result.error) {
    return (
      <section className="fade-up rounded-xl border border-destructive/25 bg-destructive/5 p-5" data-testid="result-error">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-4 text-destructive" />
          <div>
            <p className="text-[13px] font-semibold text-foreground">{result.error.code}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{result.error.message}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="fade-up space-y-4" data-testid="result-panel">
      <div className="rounded-xl border border-border bg-card p-4 shadow-[0_12px_36px_hsl(var(--foreground)/0.04)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Terminal className="size-3.5" />
            </div>
            <div>
              <p className="text-[12px] font-semibold">Generated SQL</p>
              <p className="text-[10px] text-muted-foreground">Read-only · safe to inspect</p>
            </div>
          </div>
          <button type="button" data-testid="button-copy-sql" onClick={onCopy} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            {copied ? <Check className="size-3 text-emerald-700" /> : <Copy className="size-3" />}
            {copied ? 'Copied' : 'Copy SQL'}
          </button>
        </div>
        <pre className="overflow-x-auto rounded-lg bg-[hsl(217_29%_20%)] px-3.5 py-3.5 font-code text-[11px] leading-[1.75] text-[hsl(40_34%_92%)]" data-testid="text-generated-sql"><code>{result.sql}</code></pre>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span className="rounded-full bg-accent px-2 py-1 text-accent-foreground">{result.cached ? 'Returned from cache' : 'Fresh query'}</span>
          <span>{result.row_count.toLocaleString()} {result.row_count === 1 ? 'row' : 'rows'} returned</span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-[0_12px_36px_hsl(var(--foreground)/0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Table2 className="size-4 text-primary" />
            <div>
              <p className="text-[12px] font-semibold">Result rows</p>
              <p className="text-[10px] text-muted-foreground">The data behind your answer</p>
            </div>
          </div>
          <button
            type="button"
            data-testid="button-export-results"
            disabled={result.rows.length === 0}
            onClick={onExport}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <Download className="size-3" /> Export CSV
          </button>
        </div>
        {result.rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center" data-testid="empty-result">
            <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
              <Table2 className="size-4 text-muted-foreground" />
            </div>
            <p className="text-[13px] font-medium">No rows matched this question</p>
            <p className="mt-1 max-w-[280px] text-[11px] leading-relaxed text-muted-foreground">Try widening the time range or asking for a less specific set of results.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="bg-muted/45">
                  {result.columns.map((column) => (
                    <th className="whitespace-nowrap border-b border-border px-4 py-2.5 font-code text-[10px] font-medium text-muted-foreground" data-testid={`header-column-${column}`} key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, rowIndex) => (
                  <tr className="transition-colors hover:bg-muted/35" data-testid={`row-result-${rowIndex}`} key={`row-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td className="border-b border-border/70 px-4 py-3 font-code text-[10px] text-foreground/80" data-testid={`cell-result-${rowIndex}-${cellIndex}`} key={`${rowIndex}-${cellIndex}`}>{cell === null || cell === undefined ? <span className="text-muted-foreground/50">null</span> : String(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={AskDataWorkspace} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
