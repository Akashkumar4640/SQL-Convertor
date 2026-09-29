import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import {
  ArrowRight,
  Bot,
  Check,
  Code2,
  Copy,
  ExternalLink,
  MessageSquare,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Table2,
  Terminal,
  Trash2,
  User,
} from 'lucide-react';
import { Navbar } from '../components/navbar';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestedSql?: string;
  explanation?: string;
  suggestedQuestions?: string[];
  tableResult?: {
    columns: string[];
    rows: unknown[][];
    executionTimeMs?: number;
    error?: string;
    autoExecuted?: boolean;
  };
  timestamp: string;
};

export function ChatbotPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const contextParam = searchParams.get('context') || '';

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `👋 Hello! Welcome to the **SQL & Data AI Mentor**!

I can answer questions about the database **and about any CSV datasets you've imported** — just ask naturally!

For example:
- *"How many matches did CSK win?"* (if you imported an IPL CSV)
- *"Show top 10 labours by salary"*
- *"What is the average fee by department?"*
- *"Explain SQL Inner Join vs Left Join"*

Import a CSV at the **Import CSV** page, then come back and ask questions about it here!`,
      suggestedQuestions: [
        'What can I call you?',
        'Show top 10 labours with highest salary',
        'Explain SQL Joins',
        'Show patient appointments by doctor',
      ],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [runningQueryId, setRunningQueryId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    if (contextParam) {
      sendMessage(contextParam);
    }
  }, [contextParam]);

  /** Returns true when the user's input looks like a raw SQL statement */
  const looksLikeSql = (text: string): boolean => {
    const trimmed = text.trim().toUpperCase();
    return (
      trimmed.startsWith('SELECT') ||
      trimmed.startsWith('WITH') ||
      trimmed.startsWith('INSERT') ||
      trimmed.startsWith('UPDATE') ||
      trimmed.startsWith('DELETE') ||
      trimmed.startsWith('CREATE') ||
      trimmed.startsWith('DROP') ||
      trimmed.startsWith('EXPLAIN')
    );
  };

  const sendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // ── Direct SQL paste: run immediately and show table ──────────────────────
    if (looksLikeSql(text)) {
      const msgId = `assistant-${Date.now()}`;
      try {
        const startTime = Date.now();
        const res = await fetch('/api/execute-sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: text }),
        });
        const data = await res.json();
        const assistantMsg: Message = {
          id: msgId,
          role: 'assistant',
          content: data.error
            ? `⚠️ SQL Error: ${data.error.message || data.error}`
            : `✅ Query executed in **${data.executionTimeMs ?? (Date.now() - startTime)}ms** — ${data.row_count ?? data.rows?.length ?? 0} row(s) returned.`,
          suggestedSql: text,
          suggestedQuestions: [
            'Show top customers by revenue',
            'Show average salary by department',
            'Show patient appointments by doctor',
            'Explain what this query does',
          ],
          tableResult: data.error
            ? { columns: [], rows: [], error: data.error.message || String(data.error) }
            : {
                columns: data.columns || [],
                rows: data.rows || [],
                executionTimeMs: data.executionTimeMs ?? Date.now() - startTime,
              },
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: msgId,
            role: 'assistant',
            content: '⚠️ Unable to execute SQL. Please verify that the API server is running.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } finally {
        setLoading(false);
      }
      return;
    }

    // ── Natural language: route through AI chat ───────────────────────────────
    try {
      const history = messages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });

      const data = await res.json();

      // If the API returned auto-executed table results, show them immediately
      const autoTableResult = data.tableResult
        ? {
            columns: data.tableResult.columns || [],
            rows: data.tableResult.rows || [],
            executionTimeMs: data.tableResult.executionTimeMs,
            error: data.tableResult.error,
            autoExecuted: true,
          }
        : undefined;

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message || 'I processed your request.',
        suggestedSql: data.suggestedSql,
        explanation: data.explanation,
        suggestedQuestions: data.suggestedQuestions,
        tableResult: autoTableResult,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: '⚠️ Unable to connect to the SQL assistant. Please verify that the API server is running.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleRunSqlInline = async (messageId: string, sql: string) => {
    setRunningQueryId(messageId);
    try {
      const startTime = Date.now();
      const res = await fetch('/api/execute-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      });
      const data = await res.json();

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === messageId) {
            return {
              ...msg,
              tableResult: {
                columns: data.columns || [],
                rows: data.rows || [],
                executionTimeMs: data.executionTimeMs ?? Date.now() - startTime,
                error: data.error?.message,
              },
            };
          }
          return msg;
        }),
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === messageId) {
            return {
              ...msg,
              tableResult: {
                columns: [],
                rows: [],
                error: 'Failed to execute query.',
              },
            };
          }
          return msg;
        }),
      );
    } finally {
      setRunningQueryId(null);
    }
  };

  const copySql = async (id: string, sql: string) => {
    await navigator.clipboard?.writeText(sql);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: '### Chat history cleared. What question or data problem would you like to solve next?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-background text-foreground">
      <Navbar />

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 min-h-0 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex w-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          {/* Chat Header Bar */}
          <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-sm">
                <Bot className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-[16px] font-bold text-foreground">
                    SQL & Data AI Mentor
                  </h1>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-code text-[10px] font-semibold text-emerald-600">
                    Online
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Ask real-world questions · Get SQL solutions · Execute live tables
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearChat}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Clear conversation"
              >
                <Trash2 className="size-3.5" />
                <span className="hidden sm:inline">Clear Chat</span>
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3.5 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary mt-1">
                    <Bot className="size-4" />
                  </div>
                )}

                <div
                  className={`max-w-3xl space-y-3 rounded-2xl p-4 sm:p-5 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground ml-12 rounded-tr-sm shadow-sm'
                      : 'border border-border bg-background text-foreground mr-12 rounded-tl-sm shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-2 text-[11px] opacity-70">
                    <span className="font-semibold">
                      {msg.role === 'user' ? 'You' : 'SQL AI Mentor'}
                    </span>
                    <span>{msg.timestamp}</span>
                  </div>

                  {/* Message Content */}
                  <div className="text-[13px] leading-relaxed space-y-2.5 whitespace-pre-line">
                    {msg.content}
                  </div>

                  {/* Suggested SQL Block */}
                  {msg.suggestedSql && (
                    <div className="mt-3 overflow-hidden rounded-xl border border-border bg-[hsl(217_29%_16%)] text-left">
                      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3.5 py-2">
                        <div className="flex items-center gap-2 font-code text-[11px] text-emerald-400">
                          <Terminal className="size-3.5" />
                          <span>Generated SQL Query</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => copySql(msg.id, msg.suggestedSql!)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 font-code text-[10px] text-white/70 hover:bg-white/10 hover:text-white"
                          >
                            {copiedId === msg.id ? (
                              <Check className="size-3 text-emerald-400" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                            <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>

                      <pre className="overflow-x-auto p-3.5 font-code text-[12px] leading-relaxed text-emerald-300">
                        <code>{msg.suggestedSql}</code>
                      </pre>

                      {/* SQL Execution Action Buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-white/5 p-2.5">
                        {/* Show auto-executed badge OR run button */}
                        {msg.tableResult && (msg.tableResult as { autoExecuted?: boolean }).autoExecuted ? (
                          <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700/60 px-3 py-1.5 font-code text-[11px] font-semibold text-emerald-300">
                            <Check className="size-3" />
                            <span>Auto-executed · {msg.tableResult.rows.length} row(s) returned</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              handleRunSqlInline(msg.id, msg.suggestedSql!)
                            }
                            disabled={runningQueryId === msg.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-code text-[11px] font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                          >
                            {runningQueryId === msg.id ? (
                              <RefreshCw className="size-3 animate-spin" />
                            ) : (
                              <Play className="size-3" />
                            )}
                            <span>
                              {runningQueryId === msg.id
                                ? 'Executing...'
                                : '⚡ Run Query & View Table'}
                            </span>
                          </button>
                        )}

                        <div className="flex items-center gap-2">
                          {msg.tableResult && (msg.tableResult as { autoExecuted?: boolean }).autoExecuted && (
                            <button
                              type="button"
                              onClick={() => handleRunSqlInline(msg.id, msg.suggestedSql!)}
                              disabled={runningQueryId === msg.id}
                              className="inline-flex items-center gap-1 rounded px-2 py-1 font-code text-[10px] text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                            >
                              <RefreshCw className="size-3" />
                              <span>Re-run</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setLocation(
                                `/query?sql=${encodeURIComponent(msg.suggestedSql!)}&q=${encodeURIComponent(
                                  msg.content.slice(0, 100) || 'AI Generated Query',
                                )}`,
                              )
                            }
                            className="inline-flex items-center gap-1 text-[11px] text-white/70 hover:text-white"
                          >
                            <span>Open in Query Studio</span>
                            <ExternalLink className="size-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Inline Live Table Preview — shown automatically for auto-executed results */}
                  {msg.tableResult && (
                    <div className="mt-3 overflow-hidden rounded-xl border border-primary/20 bg-card shadow-sm">
                      <div className="flex items-center justify-between border-b border-border/60 bg-primary/5 px-3.5 py-2.5">
                        <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
                          <Table2 className="size-3.5 text-primary" />
                          <span>Live Query Results</span>
                          {(msg.tableResult as { autoExecuted?: boolean }).autoExecuted && (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-code text-[9px] font-bold text-emerald-600">
                              AUTO-RUN
                            </span>
                          )}
                        </div>
                        <span className="font-code text-[11px] text-muted-foreground">
                          {msg.tableResult.rows.length} row(s)
                          {msg.tableResult.executionTimeMs != null ? ` · ${msg.tableResult.executionTimeMs}ms` : ''}
                        </span>
                      </div>

                      {msg.tableResult.error ? (
                        <div className="flex items-center gap-2 p-3.5 text-[12px] text-destructive">
                          <span>⚠️ {msg.tableResult.error}</span>
                        </div>
                      ) : msg.tableResult.rows.length === 0 ? (
                        <p className="py-5 text-center text-[12px] text-muted-foreground">
                          Query executed successfully — 0 rows returned.
                        </p>
                      ) : (
                        <div className="max-h-72 overflow-auto">
                          <table className="w-full border-collapse text-left font-code text-[11px]">
                            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                              <tr>
                                <th className="px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground/70 w-8">#</th>
                                {msg.tableResult.columns.map((c) => (
                                  <th
                                    key={c}
                                    className="whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground"
                                  >
                                    {c}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                              {msg.tableResult.rows.slice(0, 100).map((r, rIdx) => (
                                <tr key={rIdx} className="transition-colors hover:bg-muted/30">
                                  <td className="px-3 py-1.5 text-muted-foreground/50 text-[10px]">{rIdx + 1}</td>
                                  {(r as unknown[]).map((cell, cIdx) => (
                                    <td
                                      key={cIdx}
                                      className="whitespace-nowrap px-3 py-1.5 text-foreground/90"
                                    >
                                      {cell === null || cell === undefined ? (
                                        <span className="text-muted-foreground/40 italic">null</span>
                                      ) : String(cell)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {msg.tableResult.rows.length > 100 && (
                            <p className="border-t border-border px-4 py-2 text-center text-[11px] text-muted-foreground">
                              Showing first 100 of {msg.tableResult.rows.length} rows
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Suggested Question Chips for interactive conversation */}
                  {msg.role === 'assistant' && msg.suggestedQuestions && msg.suggestedQuestions.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-border/50">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-2">
                        <Sparkles className="size-3 text-primary" />
                        <span>Suggested questions & topics:</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.suggestedQuestions.map((q, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => sendMessage(q)}
                            disabled={loading}
                            className="rounded-xl border border-border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 hover:text-primary px-3 py-1.5 text-[11px] font-medium text-foreground text-left transition-all disabled:opacity-50 shadow-2xs"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground mt-1 shadow-sm">
                    <User className="size-4" />
                  </div>
                )}
              </div>
            ))}

            {/* Thinking indicator */}
            {loading && (
              <div className="flex gap-3.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Bot className="size-4" />
                </div>
                <div className="rounded-2xl border border-border bg-background p-4 shadow-sm space-y-2">
                  <div className="flex items-center gap-2 text-[12px] font-medium text-primary">
                    <RefreshCw className="size-3.5 animate-spin" />
                    <span>Thinking & formulating response...</span>
                  </div>
                  <div className="shimmer h-3 w-48 rounded-full" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-border bg-card p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="flex items-end gap-2"
            >
              <div className="flex-1 rounded-2xl border border-input bg-background p-2 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Chat with your AI mentor, ask questions, or describe a SQL data problem (e.g. 'What can I call you?' or 'Show top 10 labours by salary')..."
                  rows={2}
                  className="w-full resize-none bg-transparent px-2 text-[14px] text-foreground placeholder:text-muted-foreground/60 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-40 transition-all"
                title="Send message"
              >
                {loading ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
