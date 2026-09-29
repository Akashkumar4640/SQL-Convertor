import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Database,
  Download,
  FileCode,
  FileSpreadsheet,
  Layers,
  ListFilter,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Table2,
  Terminal,
  Trash2,
  Wand2,
} from 'lucide-react';
import { Navbar } from '../components/navbar';
import { supabase } from '../lib/supabase';

type QueryResponseData = {
  question: string;
  sql: string;
  explanation?: string;
  breakdown?: {
    tablesUsed: string[];
    operations: string[];
    description: string;
  };
  columns: string[];
  rows: unknown[][];
  row_count: number;
  cached?: boolean;
  executionTimeMs?: number;
  error?: { code: string; message: string } | null;
};

type SchemaTable = {
  name: string;
  description: string;
  columns: { name: string; type: string; description: string }[];
};

const SAMPLE_TEMPLATES = [
  {
    name: '🏆 Top 3 Customers by Category Spending (CTE & Window Function)',
    sql: `WITH customer_category_sales AS (
    SELECT
        p.category,
        c.customer_id,
        c.customer_name,
        SUM(oi.quantity * oi.unit_price) AS total_spending,
        COUNT(DISTINCT o.order_id) AS completed_orders
    FROM customers AS c
    JOIN orders AS o
        ON c.customer_id = o.customer_id
    JOIN order_items AS oi
        ON o.order_id = oi.order_id
    JOIN products AS p
        ON oi.product_id = p.product_id
    WHERE (o.status = 'completed' OR o.status = 'Completed')
      AND o.order_date >= '2025-01-01'
      AND o.order_date < '2026-01-01'
    GROUP BY
        p.category,
        c.customer_id,
        c.customer_name
    HAVING COUNT(DISTINCT o.order_id) >= 1
),

ranked_customers AS (
    SELECT
        category,
        customer_id,
        customer_name,
        ROUND(total_spending, 2) AS total_spending,
        DENSE_RANK() OVER (
            PARTITION BY category
            ORDER BY total_spending DESC
        ) AS customer_rank
    FROM customer_category_sales
)

SELECT
    category,
    customer_id,
    customer_name,
    total_spending,
    customer_rank
FROM ranked_customers
WHERE customer_rank <= 3
ORDER BY category, customer_rank, customer_name;`,
    question: 'For each product category, find the top 3 customers by total amount spent in 2025.',
  },
  {
    name: '👷 Top 10 Labours by Maximum Salary',
    sql: `SELECT id, name, role, department, salary, hourly_rate
FROM employees
ORDER BY salary DESC
LIMIT 10;`,
    question: 'Show top 10 labours with maximum salary',
  },
  {
    name: '📊 Average Labour Salary & Headcount by Department',
    sql: `SELECT department, COUNT(id) AS total_workers, ROUND(AVG(salary), 2) AS avg_salary, MAX(salary) AS max_salary
FROM employees
GROUP BY department
ORDER BY avg_salary DESC;`,
    question: 'What is the average salary and headcount by department?',
  },
  {
    name: '📈 Monthly Revenue & Order Volume Breakdown',
    sql: `SELECT strftime('%Y-%m', order_date) AS order_month, COUNT(id) AS total_orders, ROUND(SUM(amount), 2) AS monthly_revenue, ROUND(AVG(amount), 2) AS avg_order_value
FROM orders
GROUP BY order_month
ORDER BY order_month ASC;`,
    question: 'Show monthly revenue and order volume trend',
  },
  {
    name: '🏥 Doctor Appointment Workload & Department Billing',
    sql: `SELECT doctor_name, department, COUNT(id) AS appointment_count, ROUND(SUM(fee), 2) AS total_billed
FROM patient_appointments
GROUP BY doctor_name, department
ORDER BY appointment_count DESC;`,
    question: 'Show doctor workload and total consultation fees billed by department',
  },
  {
    name: '⚠️ Low Stock Products Inventory Alert (< 50 units)',
    sql: `SELECT id, name, category, price, stock_quantity
FROM products
WHERE stock_quantity < 50
ORDER BY stock_quantity ASC;`,
    question: 'List products with inventory below 50 units',
  },
];

export function QueryResultsPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const initialQuestion = searchParams.get('q') || '';
  const initialSql = searchParams.get('sql') || '';

  const [questionInput, setQuestionInput] = useState(
    initialQuestion || (initialSql ? 'Custom Query Execution' : 'For each product category, find the top 3 customers by total amount spent in 2025')
  );
  const [data, setData] = useState<QueryResponseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Online SQL Compiler State
  const [sqlCode, setSqlCode] = useState(initialSql || SAMPLE_TEMPLATES[0].sql);
  const [isExecutingSql, setIsExecutingSql] = useState(false);
  const [showSchemaDrawer, setShowSchemaDrawer] = useState(false);
  const [schemaTables, setSchemaTables] = useState<SchemaTable[]>([]);

  // Table filtering & pagination
  const [tableSearch, setTableSearch] = useState('');
  const [sortColumnIndex, setSortColumnIndex] = useState<number | null>(null);
  const [sortAscending, setSortAscending] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch Database Schema for Explorer
  useEffect(() => {
    fetch('/api/schema')
      .then((res) => res.json())
      .then((resData) => {
        if (resData.tables) {
          setSchemaTables(resData.tables);
        }
      })
      .catch(() => {});
  }, []);

  // Save query result to Supabase
  const saveToSupabase = async (json: QueryResponseData) => {
    try {
      const { error } = await supabase.from('query_history').insert({
        question: json.question,
        sql: json.sql,
        columns: json.columns,
        rows: json.rows,
        row_count: json.row_count,
        execution_time_ms: json.executionTimeMs ?? 0,
      });
      if (error) console.warn('Supabase save:', error.message);
    } catch (e) {
      console.warn('Supabase insert error:', e);
    }
  };

  // Generate & Run via AI Question
  const handleAskAi = async (qText?: string) => {
    const q = (qText || questionInput).trim();
    if (!q) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const json: QueryResponseData = await res.json();
      setData(json);
      if (json.sql) {
        setSqlCode(json.sql);
      }
      setCurrentPage(1);

      if (!json.error && json.rows.length > 0) {
        saveToSupabase(json);
      }
    } catch (err) {
      setData({
        question: q,
        sql: '',
        columns: [],
        rows: [],
        row_count: 0,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Unable to reach backend service. Please verify the API server is running.',
        },
      });
    } finally {
      setLoading(false);
    }
  };

  // Execute Raw SQL in the Online Compiler
  const handleExecuteSql = async (rawCode?: string) => {
    const codeToRun = (rawCode ?? sqlCode).trim();
    if (!codeToRun) return;

    setIsExecutingSql(true);
    const startTime = Date.now();
    try {
      const res = await fetch('/api/execute-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: codeToRun, question: questionInput }),
      });
      const json: QueryResponseData = await res.json();

      setData({
        question: questionInput || 'Custom SQL Execution',
        sql: codeToRun,
        columns: json.columns || [],
        rows: json.rows || [],
        row_count: json.row_count ?? (json.rows ? json.rows.length : 0),
        executionTimeMs: json.executionTimeMs ?? (Date.now() - startTime),
        error: json.error,
        explanation: 'Executed custom query in Online SQL Compiler.',
      });
      setCurrentPage(1);

      if (!json.error && json.rows && json.rows.length > 0) {
        saveToSupabase({
          ...json,
          question: questionInput || 'Custom SQL Execution',
          sql: codeToRun,
        });
      }
    } catch (err) {
      setData({
        question: questionInput || 'Custom SQL Execution',
        sql: codeToRun,
        columns: [],
        rows: [],
        row_count: 0,
        error: {
          code: 'EXECUTION_ERROR',
          message: err instanceof Error ? err.message : 'Failed to execute query.',
        },
      });
    } finally {
      setIsExecutingSql(false);
    }
  };

  useEffect(() => {
    if (initialSql) {
      setSqlCode(initialSql);
      if (initialQuestion) {
        setQuestionInput(initialQuestion);
      }
      handleExecuteSql(initialSql);
    } else if (initialQuestion) {
      setQuestionInput(initialQuestion);
      handleAskAi(initialQuestion);
    } else {
      // Execute the default template on load
      handleExecuteSql(SAMPLE_TEMPLATES[0].sql);
    }
  }, [initialQuestion, initialSql]);

  const copySql = async () => {
    if (!sqlCode) return;
    await navigator.clipboard?.writeText(sqlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const formatSql = () => {
    // Quick SQL keyword beautifier
    let formatted = sqlCode;
    const keywords = ['SELECT', 'FROM', 'WHERE', 'LEFT JOIN', 'INNER JOIN', 'JOIN', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'WITH', 'AS', 'UNION ALL', 'UNION', 'AND', 'OR', 'ON', 'PARTITION BY', 'OVER', 'DENSE_RANK'];
    keywords.forEach((kw) => {
      const regex = new RegExp(`\\b${kw}\\b`, 'gi');
      formatted = formatted.replace(regex, kw);
    });
    setSqlCode(formatted);
  };

  const loadTemplate = (template: typeof SAMPLE_TEMPLATES[0]) => {
    setSqlCode(template.sql);
    setQuestionInput(template.question);
    handleExecuteSql(template.sql);
  };

  const loadTableSample = (tableName: string) => {
    const sampleQuery = `SELECT * FROM ${tableName} LIMIT 25;`;
    setSqlCode(sampleQuery);
    setQuestionInput(`Explore table: ${tableName}`);
    handleExecuteSql(sampleQuery);
  };

  const exportCSV = () => {
    if (!data || data.rows.length === 0) return;
    const csvValue = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value);
      return `"${text.replaceAll('"', '""')}"`;
    };
    const csv = [
      data.columns.map(csvValue).join(','),
      ...data.rows.map((row) => row.map(csvValue).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `query-results-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    if (!data || data.rows.length === 0) return;
    const records = data.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      data.columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
    const blob = new Blob([JSON.stringify(records, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `query-results-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Filtered and sorted table rows
  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    let rows = [...data.rows];

    if (tableSearch.trim()) {
      const searchLower = tableSearch.toLowerCase();
      rows = rows.filter((row) =>
        row.some((cell) =>
          cell !== null && cell !== undefined
            ? String(cell).toLowerCase().includes(searchLower)
            : false,
        ),
      );
    }

    if (sortColumnIndex !== null) {
      rows.sort((a, b) => {
        const valA = a[sortColumnIndex];
        const valB = b[sortColumnIndex];
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortAscending ? valA - valB : valB - valA;
        }
        return sortAscending
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    return rows;
  }, [data?.rows, tableSearch, sortColumnIndex, sortAscending]);

  // Paginated Rows
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Line numbers calculation for the editor
  const lineCount = (sqlCode.match(/\n/g) || []).length + 1;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-12">
      <Navbar />

      <main className="mx-auto max-w-[1640px] px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Navigation & Header Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setLocation('/')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-[13px] font-medium text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span>Back to Question Studio</span>
            </button>
            <div className="hidden h-5 w-px bg-border sm:block" />
            <div className="hidden items-center gap-2 text-[13px] text-muted-foreground sm:flex">
              <span className="font-code font-semibold text-emerald-600 dark:text-emerald-400">⚡ Online SQL Compiler</span>
              <span>·</span>
              <span className="font-medium text-foreground">Interactive Studio</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLocation('/import')}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-[13px] font-semibold text-foreground hover:bg-muted transition-colors shadow-sm"
              title="Upload CSV to create new SQL table and generate queries"
            >
              <FileSpreadsheet className="size-4 text-primary" />
              <span>Import CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSchemaDrawer(!showSchemaDrawer)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition-colors shadow-sm ${
                showSchemaDrawer
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              <Database className="size-4" />
              <span>{showSchemaDrawer ? 'Hide Tables' : 'View Tables & Schema'}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setLocation(
                  `/chat?context=${encodeURIComponent(
                    `I ran query with SQL: \n${sqlCode}`,
                  )}`,
                )
              }
              className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-[13px] font-semibold text-primary hover:bg-primary/20 transition-colors shadow-sm"
            >
              <Bot className="size-4" />
              <span className="hidden sm:inline">Ask AI Mentor</span>
            </button>
          </div>
        </div>

        {/* Database Schema Drawer (When toggled) */}
        {showSchemaDrawer && (
          <div className="rounded-3xl border border-border bg-card p-5 shadow-md space-y-4 animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Database className="size-5 text-primary" />
                <h3 className="font-display text-[16px] font-bold text-foreground">
                  Database Tables & Column Catalog
                </h3>
              </div>
              <span className="text-[12px] text-muted-foreground">
                Click any table to load a quick query into the compiler
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {schemaTables.map((table) => (
                <div
                  key={table.name}
                  onClick={() => loadTableSample(table.name)}
                  className="group flex flex-col justify-between rounded-2xl border border-border bg-background p-3.5 hover:border-primary/60 hover:shadow-md cursor-pointer transition-all"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-code text-[13px] font-bold text-primary group-hover:underline">
                        {table.name}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-code text-[10px] text-muted-foreground">
                        {table.columns.length} cols
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {table.description}
                    </p>
                    <div className="space-y-1 pt-1">
                      {table.columns.slice(0, 4).map((c) => (
                        <div
                          key={c.name}
                          className="flex items-center justify-between text-[11px] text-muted-foreground font-code"
                        >
                          <span className="truncate">{c.name}</span>
                          <span className="text-[10px] opacity-60">{c.type}</span>
                        </div>
                      ))}
                      {table.columns.length > 4 && (
                        <span className="text-[10px] text-primary/80 font-code">
                          + {table.columns.length - 4} more columns...
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="pt-2.5 mt-2 border-t border-border/50 text-[10px] font-semibold text-primary flex items-center justify-between">
                    <span>⚡ Run SELECT</span>
                    <span>→</span>
                  </div>
                </div>
              ))}

              {/* Import CSV Table Drawer Tile */}
              <div
                onClick={() => setLocation('/import')}
                className="group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/80 bg-background/50 p-4 text-center hover:border-primary/60 hover:bg-background cursor-pointer transition-all"
              >
                <div className="mb-2 flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                  <Plus className="size-4" />
                </div>
                <span className="font-display text-[12px] font-bold text-foreground group-hover:text-primary">
                  + Import CSV Table
                </span>
                <span className="text-[10px] text-muted-foreground mt-1">
                  Upload file & generate queries
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Natural Language Prompt & AI Generator Input Bar */}
        <div className="rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-primary">
            <Sparkles className="size-4" />
            <span>AI SQL Query Generator & Prompt Input</span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="flex-1 relative">
              <input
                type="text"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAskAi();
                  }
                }}
                placeholder="Ask any SQL data question (e.g. 'For each category find top 3 customers by spending' or 'Top 10 labours by salary')..."
                className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <button
              type="button"
              onClick={() => handleAskAi()}
              disabled={loading || !questionInput.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-[13px] font-bold text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-50 transition-all shrink-0"
            >
              {loading ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Wand2 className="size-4" />
              )}
              <span>{loading ? 'Synthesizing...' : '✨ Generate & Run SQL'}</span>
            </button>
          </div>
        </div>

        {/* SECTION: ONLINE SQL COMPILER & INTERACTIVE CODE STUDIO */}
        <div className="rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-sm space-y-4">
          {/* Editor Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 font-code font-bold">
                &gt;_
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-[16px] font-bold text-foreground">
                    Online SQL Compiler & Playground
                  </h2>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-code text-[10px] font-semibold text-emerald-600">
                    SQLite 3.40 Engine
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Edit, paste, or test any SQL query (CTEs, Window functions, Joins, Aggregations)
                </p>
              </div>
            </div>

            {/* Template Selector & Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <select
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    if (!isNaN(idx) && SAMPLE_TEMPLATES[idx]) {
                      loadTemplate(SAMPLE_TEMPLATES[idx]);
                    }
                  }}
                  defaultValue=""
                  className="rounded-xl border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground outline-none focus:border-primary cursor-pointer hover:bg-muted transition-colors pr-8"
                >
                  <option value="" disabled>
                    📁 Load Sample Query...
                  </option>
                  {SAMPLE_TEMPLATES.map((tmpl, idx) => (
                    <option key={idx} value={idx}>
                      {tmpl.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={formatSql}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Format SQL Keywords"
              >
                <FileCode className="size-3.5" />
                <span>Format</span>
              </button>

              <button
                type="button"
                onClick={copySql}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Copy SQL to clipboard"
              >
                {copied ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>

              <button
                type="button"
                onClick={() => setSqlCode('')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-destructive transition-colors"
                title="Clear code editor"
              >
                <Trash2 className="size-3.5" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Interactive Code Editor Box with Line Numbers */}
          <div className="overflow-hidden rounded-2xl border border-border bg-[hsl(217_29%_16%)] shadow-inner">
            <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-2 text-[11px] text-white/70 font-code">
              <div className="flex items-center gap-2 text-emerald-400">
                <Terminal className="size-3.5" />
                <span>main.sql</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white/50">Shortcut: Ctrl + Enter</span>
                <span>{lineCount} lines</span>
              </div>
            </div>

            <div className="flex min-h-[220px]">
              {/* Line Numbers Gutter */}
              <div className="select-none bg-black/20 px-3 py-3 font-code text-[13px] leading-relaxed text-white/30 text-right">
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i + 1}>{i + 1}</div>
                ))}
              </div>

              {/* Textarea Editor */}
              <textarea
                ref={textareaRef}
                value={sqlCode}
                onChange={(e) => setSqlCode(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleExecuteSql();
                  }
                }}
                rows={Math.max(8, lineCount)}
                spellCheck={false}
                placeholder="Write your SQLite query here (e.g. SELECT * FROM customers;)..."
                className="flex-1 resize-y bg-transparent p-3 font-code text-[13px] leading-relaxed text-emerald-300 outline-none placeholder:text-white/20 selection:bg-emerald-500/30"
              />
            </div>

            {/* Run Button Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-white/5 p-3">
              <span className="font-code text-[11px] text-white/60">
                Tip: You can write CTEs (`WITH ...`), JOINs, Window functions (`DENSE_RANK`), or any valid SQLite statement.
              </span>

              <button
                type="button"
                onClick={() => handleExecuteSql()}
                disabled={isExecutingSql || !sqlCode.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-code text-[12px] font-bold text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-500 disabled:opacity-50 transition-all"
              >
                {isExecutingSql ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4 fill-current" />
                )}
                <span>{isExecutingSql ? 'Executing Query...' : '⚡ Run Query (Ctrl + Enter)'}</span>
              </button>
            </div>
          </div>

          {/* AI Explanation & Breakdown (If available) */}
          {data?.explanation && (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-[13px] text-primary">
                <Sparkles className="size-4" />
                <span>Query Logic & Explanation</span>
              </div>
              <p className="text-[13px] leading-relaxed text-foreground/90">
                {data.explanation}
              </p>
              {data.breakdown?.operations && data.breakdown.operations.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] font-medium text-muted-foreground mr-1">
                    Operations:
                  </span>
                  {data.breakdown.operations.map((op, idx) => (
                    <span
                      key={idx}
                      className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-code text-[10px] font-semibold text-primary"
                    >
                      {op}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error Alert Box */}
        {data?.error && (
          <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-5 shadow-sm space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-destructive font-bold text-[14px]">
              <AlertTriangle className="size-4" />
              <span>SQL Execution Error: {data.error.code}</span>
            </div>
            <p className="text-[13px] text-foreground font-code leading-relaxed bg-background/80 p-3 rounded-xl border border-destructive/20">
              {data.error.message}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Please check your SQL syntax or choose one of the working templates above.
            </p>
          </div>
        )}

        {/* SECTION: LIVE TABLE RESULTS & EXPLORER */}
        {data && !data.error && (
          <div className="rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-sm space-y-4">
            {/* Results Header Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Table2 className="size-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-[16px] font-bold text-foreground">
                      Execution Result Table
                    </h3>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-code text-[11px] font-bold text-emerald-600">
                      {data.rows.length} rows returned
                    </span>
                    {data.executionTimeMs !== undefined && (
                      <span className="text-[11px] text-muted-foreground">
                        · {data.executionTimeMs} ms
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    {data.columns.length} columns · Real-time filter & sortable
                  </p>
                </div>
              </div>

              {/* Table Search & Export Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={tableSearch}
                    onChange={(e) => {
                      setTableSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search in rows..."
                    className="h-9 w-44 sm:w-60 rounded-xl border border-input bg-background pl-8 pr-3 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary"
                  />
                </div>

                <button
                  type="button"
                  onClick={exportCSV}
                  disabled={data.rows.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  <Download className="size-3.5" />
                  <span>Export CSV</span>
                </button>

                <button
                  type="button"
                  onClick={exportJSON}
                  disabled={data.rows.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  <Code2 className="size-3.5" />
                  <span>JSON</span>
                </button>
              </div>
            </div>

            {/* Table Area */}
            {data.rows.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground space-y-2">
                <Table2 className="size-8 mx-auto opacity-40" />
                <p className="text-[14px] font-medium">Query executed successfully, but returned 0 rows.</p>
                <p className="text-[12px] opacity-70">Try adjusting your WHERE filters or testing another query.</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <p className="text-[13px]">No rows match your search filter "{tableSearch}".</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full border-collapse text-left font-code text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/60 text-muted-foreground">
                      <th className="w-12 px-3 py-2.5 text-center font-semibold text-[11px] opacity-60">
                        #
                      </th>
                      {data.columns.map((col, idx) => (
                        <th
                          key={col}
                          onClick={() => {
                            if (sortColumnIndex === idx) {
                              setSortAscending(!sortAscending);
                            } else {
                              setSortColumnIndex(idx);
                              setSortAscending(true);
                            }
                          }}
                          className="cursor-pointer whitespace-nowrap px-4 py-2.5 font-bold hover:text-foreground hover:bg-muted/90 transition-colors select-none"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>{col}</span>
                            {sortColumnIndex === idx && (
                              <span className="text-primary font-bold">
                                {sortAscending ? '▲' : '▼'}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {paginatedRows.map((row, rIdx) => {
                      const absoluteIndex = (currentPage - 1) * pageSize + rIdx + 1;
                      return (
                        <tr
                          key={rIdx}
                          className="hover:bg-muted/40 transition-colors"
                        >
                          <td className="px-3 py-2.5 text-center text-[11px] text-muted-foreground opacity-60">
                            {absoluteIndex}
                          </td>
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="whitespace-nowrap px-4 py-2.5 text-foreground/90 font-medium"
                            >
                              {cell === null || cell === undefined ? (
                                <span className="italic text-muted-foreground/60">
                                  null
                                </span>
                              ) : (
                                String(cell)
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {filteredRows.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-[12px] text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="rounded-lg border border-border bg-background px-2 py-1 text-[12px] text-foreground outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>
                    Showing {(currentPage - 1) * pageSize + 1}–
                    {Math.min(currentPage * pageSize, filteredRows.length)} of{' '}
                    {filteredRows.length} rows
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-40"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="px-2 font-medium text-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-40"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
