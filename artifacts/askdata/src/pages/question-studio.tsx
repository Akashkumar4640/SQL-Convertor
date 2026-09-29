import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowRight,
  BarChart3,
  Bot,
  ChevronDown,
  ChevronRight,
  Columns3,
  Database,
  FileSpreadsheet,
  Info,
  Link2,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Table2,
  Terminal,
  UploadCloud,
  Zap,
} from 'lucide-react';
import { useGetSchema } from '@workspace/api-client-react';
import type { DatabaseSchema } from '@workspace/api-client-react';
import { Navbar } from '../components/navbar';

export function QuestionStudio() {
  const [, setLocation] = useLocation();
  const [question, setQuestion] = useState('');
  const [expandedTable, setExpandedTable] = useState<string | null>('customers');

  const schemaQuery = useGetSchema();
  const schema = schemaQuery.data as DatabaseSchema | undefined;

  const handleLaunchQuery = () => {
    const text = question.trim();
    if (!text) return;
    // Navigate directly to Page 2 (Query & Code Results Studio)
    setLocation(`/query?q=${encodeURIComponent(text)}`);
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-12">
      <Navbar />

      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {/* Main Question Input Studio */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-card via-card to-background p-6 shadow-sm sm:p-10">
          <div className="absolute right-0 top-0 -mr-16 -mt-16 size-72 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl">
            <div className="mb-3.5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-code text-[11px] font-semibold text-primary">
              <Sparkles className="size-3.5" />
              <span>Natural Language → SQL Generator</span>
            </div>

            <h1 className="font-display text-[clamp(2.2rem,4vw,3.6rem)] font-bold leading-[1.06] tracking-tight text-foreground">
              Ask any question.{' '}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Convert into code & table.
              </span>
            </h1>

            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
              Enter any query or business question about your data. We compile it into safe, read-only SQL, provide the complete code breakdown, and render the interactive result table on the next page.
            </p>

            {/* Input Form Box */}
            <div className="mt-8 rounded-2xl border border-input bg-card p-3 shadow-lg shadow-black/[0.03] transition-all focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/10">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleLaunchQuery();
                }}
              >
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleLaunchQuery();
                    }
                  }}
                  placeholder="Type your question here in plain English (e.g. 'Show total revenue for each month' or 'Find customers from London with completed orders')..."
                  className="min-h-[110px] w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 outline-none"
                  maxLength={500}
                />

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <span className="font-code text-[11px] text-primary">⚡ Workflow:</span>
                    <span>Question → Next Page (SQL Code + Data Table)</span>
                    <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
                      ↵ Enter to Run
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {question && (
                      <button
                        type="button"
                        onClick={() => setQuestion('')}
                        className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={!question.trim()}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
                    >
                      <span>Generate & View Table</span>
                      <ArrowRight className="size-4" />
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Quick Prompt Badges */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium text-muted-foreground">Try asking:</span>
              {[
                "For each product category, find the top 3 customers by total amount spent in 2025",
                "give me a query for maxmium salary in top 10 labours",
                "Show average salary by department",
                "Show top 5 customers by revenue",
                "Doctor workload by department",
                "Which products have low stock?",
              ].map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => {
                    setQuestion(sample);
                    setLocation(`/query?q=${encodeURIComponent(sample)}`);
                  }}
                  className="rounded-lg border border-border/80 bg-card/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CSV Import Feature Callout Banner */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
              <FileSpreadsheet className="size-6" />
            </div>
            <div>
              <h3 className="font-display text-[15px] font-bold text-foreground">
                Import Your Own CSV File
              </h3>
              <p className="text-[12px] text-muted-foreground">
                Upload any CSV spreadsheet to automatically construct an SQLite database table, infer data types, and generate SQL queries & live tables.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setLocation('/import')}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[12px] font-semibold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98]"
          >
            <UploadCloud className="size-4" />
            <span>Import CSV Dataset</span>
            <ArrowRight className="size-3.5" />
          </button>
        </div>

        {/* Database Schema & Tables Overview Grid */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-[20px] font-bold text-foreground">
                Connected Database Tables
              </h2>
              <p className="text-[13px] text-muted-foreground">
                You can ask questions regarding any of these tables and columns:
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLocation('/import')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted"
              >
                <FileSpreadsheet className="size-3.5 text-primary" />
                <span>+ Import CSV Table</span>
              </button>

              <button
                type="button"
                onClick={() => setLocation('/chat')}
                className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                <Bot className="size-4" />
                <span>Ask AI SQL Chatbot</span>
              </button>
            </div>
          </div>

          {schemaQuery.isLoading && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="shimmer h-36 rounded-2xl" />
              <div className="shimmer h-36 rounded-2xl" />
              <div className="shimmer h-36 rounded-2xl" />
              <div className="shimmer h-36 rounded-2xl" />
            </div>
          )}

          {schema?.tables && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {schema.tables.map((table) => {
                const isExpanded = expandedTable === table.name;
                return (
                  <div
                    key={table.name}
                    className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
                  >
                    <div>
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Table2 className="size-4 text-primary" />
                          <h3 className="font-code text-[14px] font-bold text-foreground">
                            {table.name}
                          </h3>
                        </div>
                        <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-code text-[10px] text-muted-foreground">
                          {table.columns.length} cols
                        </span>
                      </div>

                      <p className="text-[12px] leading-relaxed text-muted-foreground">
                        {table.description}
                      </p>

                      <div className="mt-4 space-y-1.5 border-t border-border/60 pt-3">
                        <span className="block font-code text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Columns
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {table.columns.map((col) => (
                            <span
                              key={col.name}
                              className="rounded bg-muted/70 px-2 py-0.5 font-code text-[10px] text-foreground/80"
                              title={`${col.type} - ${col.description}`}
                            >
                              {col.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Import New CSV Table Card */}
              <div
                onClick={() => setLocation('/import')}
                className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/80 bg-card/40 p-6 text-center transition-all hover:border-primary/50 hover:bg-card/80 hover:shadow-md"
              >
                <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                  <Plus className="size-6" />
                </div>
                <h3 className="font-display text-[14px] font-bold text-foreground group-hover:text-primary transition-colors">
                  Import CSV Dataset
                </h3>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Upload custom CSV file to create new SQLite table & generate queries
                </p>
                <span className="mt-3 inline-flex items-center gap-1 font-code text-[11px] font-semibold text-primary">
                  <span>Upload CSV</span>
                  <ArrowRight className="size-3" />
                </span>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
