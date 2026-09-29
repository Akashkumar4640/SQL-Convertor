import { useState, useRef, useMemo, ChangeEvent, DragEvent } from 'react';
import { useLocation } from 'wouter';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Layers,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Table2,
  Terminal,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { Navbar } from '../components/navbar';

type ColumnInfo = {
  name: string;
  type: 'INTEGER' | 'REAL' | 'TEXT';
  sampleValues: string[];
};

type SuggestedQuery = {
  name: string;
  sql: string;
  question: string;
  category: 'preview' | 'summary' | 'aggregation' | 'analysis';
};

type ImportResponse = {
  success: boolean;
  tableName: string;
  rowCount: number;
  columns: { name: string; type: string; description: string }[];
  sampleRows: (string | number | null)[][];
  suggestedQueries: SuggestedQuery[];
  error?: string;
};

type InPlaceQueryResult = {
  sql: string;
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  executionTimeMs: number;
  error?: string;
};

// Ready-to-use Medical & Clinical Sample Datasets
const SAMPLE_DATASETS = [
  {
    id: 'patient_vitals',
    title: '🏥 Patient Clinical Vitals',
    description: 'Patient admissions, vital signs, blood pressure, and diagnosis codes.',
    tableName: 'patient_vitals',
    csv: `patient_id,patient_name,age,gender,department,blood_pressure,heart_rate,oxygen_level,status,admission_date
101,Eleanor Vance,45,Female,Cardiology,130/85,76,98,Admitted,2025-06-01
102,David Miller,62,Male,Neurology,142/90,82,95,Under Observation,2025-06-02
103,Amina Diallo,29,Female,Pediatrics,118/75,68,99,Discharged,2025-06-03
104,Robert Chen,53,Male,Oncology,135/88,90,94,Admitted,2025-06-04
105,Lucas Rossi,38,Male,Orthopedics,122/80,72,99,Follow-up,2025-06-05
106,Maria Gonzalez,71,Female,Cardiology,150/95,88,93,Critical,2025-06-06
107,James Washington,50,Male,Neurology,128/82,74,97,Discharged,2025-06-07
108,Sophia Kim,34,Female,Pediatrics,115/72,66,100,Discharged,2025-06-08
109,Liam Smith,41,Male,Orthopedics,138/86,80,96,Admitted,2025-06-09
110,Chloe Martin,59,Female,Oncology,140/88,84,95,Admitted,2025-06-10`,
  },
  {
    id: 'medical_inventory',
    title: '🧪 Medical Supply Inventory',
    description: 'Hospital inventory, batch numbers, unit costs, stock units, and reorder levels.',
    tableName: 'medical_inventory',
    csv: `item_code,item_name,category,unit_cost,stock_quantity,reorder_threshold,supplier,expiry_date
MED-001,Surgical Gloves Nitrile (Box 100),PPE,14.50,450,100,MedShield Global,2027-12-31
MED-002,N95 Respirator Masks (Box 50),PPE,28.00,320,80,SafeAir Health,2026-10-15
MED-003,Digital Pulse Oximeter,Diagnostic,35.00,85,25,BioPulse Devices,2029-01-01
MED-004,Sterile Saline Solution (500ml),Solutions,3.25,820,200,Baxter Care,2026-05-30
MED-005,Infusion Pump Set,Equipment,210.00,42,15,OmniCare Tech,2030-08-20
MED-006,Disposable Syringes 5ml (Box 100),Consumables,9.80,640,150,Becton Supply,2028-03-14
MED-007,ECG Electrode Patches (Pack 50),Diagnostic,18.90,195,50,CardioTrace Inc,2026-11-20
MED-008,Antiseptic Scrub Solution (1L),Sterilization,12.40,110,40,ClinGuard Labs,2027-04-10
MED-009,Stethoscope Classic III,Diagnostic,95.00,28,10,Littmann Precision,2032-01-01
MED-010,Surgical Gauze Pads (Pack 100),Consumables,7.50,520,120,CareWrap Health,2028-09-18`,
  },
  {
    id: 'department_payroll',
    title: '💼 Clinical Staff & Wages',
    description: 'Healthcare staff salaries, overtime hours, departments, and credentials.',
    tableName: 'clinical_staff',
    csv: `staff_id,staff_name,department,role,base_salary,overtime_hours,hourly_rate,experience_years
S-01,Dr. Evelyn Harper,Cardiology,Senior Attending,185000.0,12,88.90,14
S-02,Marcus Brody,Nursing,Head Nurse,92000.0,38,44.20,9
S-03,Ananya Sharma,Laboratory,Lead Pathologist Tech,84000.0,24,40.40,7
S-04,David Kowalski,Facilities,Biomedical Tech,68000.0,45,32.70,5
S-05,Dr. Tariq Mansour,Neurology,Neurologist Consultant,198000.0,8,95.20,16
S-06,Sarah Jenkins,Pharmacy,Clinical Pharmacist,112000.0,18,53.80,8
S-07,Carlos Mendez,Radiology,MRI Specialist,89000.0,32,42.80,6
S-08,Helena Fischer,Physical Therapy,Senior Therapist,76000.0,14,36.50,10
S-09,Kenneth Vance,Logistics,Inventory Manager,62000.0,26,29.80,4
S-10,Dr. Michelle Obama-Chen,Pediatrics,Pediatric Surgeon,215000.0,16,103.40,18`,
  },
];

// Parser function on frontend
function parseClientCsv(raw: string): { headers: string[]; rows: string[][] } {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = '';
  let insideQuotes = false;

  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if (char === '\n' && !insideQuotes) {
      currentRow.push(currentVal.trim());
      if (currentRow.some((c) => c.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }

  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some((c) => c.length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) {
    throw new Error('CSV text is empty.');
  }

  const rawHeaders = lines[0];
  const headers = rawHeaders.map((h, idx) => {
    let clean = (h || `col_${idx + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!clean || /^\d/.test(clean)) {
      clean = `col_${clean || idx + 1}`;
    }
    return clean;
  });

  const rows = lines.slice(1);
  return { headers, rows };
}

export function CsvImportPage() {
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inputMode, setInputMode] = useState<'upload' | 'paste'>('upload');
  const [csvContent, setCsvContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [tableName, setTableName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [dragOver, setDragOver] = useState(false);

  // Column type overrides
  const [columnOverrides, setColumnOverrides] = useState<Record<string, 'INTEGER' | 'REAL' | 'TEXT'>>({});

  // Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // In-Place Query Run State
  const [executingQueryIdx, setExecutingQueryIdx] = useState<number | null>(null);
  const [inPlaceResult, setInPlaceResult] = useState<InPlaceQueryResult | null>(null);
  const [copiedQueryIdx, setCopiedQueryIdx] = useState<number | null>(null);

  // Table filter inside in-place result
  const [resultFilter, setResultFilter] = useState('');

  // Parse CSV for Live Preview
  const preview = useMemo(() => {
    if (!csvContent.trim()) return null;
    try {
      const { headers, rows } = parseClientCsv(csvContent);
      if (rows.length === 0) return null;

      const columns: ColumnInfo[] = headers.map((name, colIdx) => {
        let allInteger = true;
        let allReal = true;
        let nonNullCount = 0;
        const sampleValues: string[] = [];

        for (let i = 0; i < Math.min(rows.length, 50); i++) {
          const val = rows[i][colIdx];
          if (val === undefined || val === null || val === '') continue;
          nonNullCount++;
          if (sampleValues.length < 3) sampleValues.push(String(val));

          const strVal = String(val).trim();
          if (!/^-?\d+$/.test(strVal)) allInteger = false;
          if (!/^-?\d+(\.\d+)?$/.test(strVal)) allReal = false;
        }

        let type: 'INTEGER' | 'REAL' | 'TEXT' = 'TEXT';
        if (nonNullCount > 0) {
          if (allInteger) type = 'INTEGER';
          else if (allReal) type = 'REAL';
        }

        return {
          name,
          type: columnOverrides[name] || type,
          sampleValues,
        };
      });

      return {
        headers,
        columns,
        rows: rows.slice(0, 10),
        totalRows: rows.length,
      };
    } catch {
      return null;
    }
  }, [csvContent, columnOverrides]);

  // Handle file select
  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv' && !file.name.endsWith('.txt')) {
      setImportError('Please select a valid .csv file.');
      return;
    }

    setImportError(null);
    setImportResult(null);
    setInPlaceResult(null);
    setFileName(file.name);

    // Auto-generate clean table name from filename
    const cleanName = file.name
      .replace(/\.[^/.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    setTableName(cleanName || 'imported_dataset');
    setDescription(`Imported from ${file.name}`);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        setCsvContent(text);
      }
    };
    reader.onerror = () => {
      setImportError('Error reading file. Please try again.');
    };
    reader.readAsText(file);
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Load sample dataset
  const loadSample = (sample: typeof SAMPLE_DATASETS[0]) => {
    setImportError(null);
    setImportResult(null);
    setInPlaceResult(null);
    setFileName(`${sample.tableName}.csv`);
    setTableName(sample.tableName);
    setDescription(sample.description);
    setCsvContent(sample.csv);
    setColumnOverrides({});
  };

  // Perform backend import
  const handleImport = async () => {
    if (!csvContent.trim()) {
      setImportError('No CSV data available to import.');
      return;
    }

    if (!tableName.trim()) {
      setImportError('Please provide a table name.');
      return;
    }

    setIsImporting(true);
    setImportError(null);

    try {
      // Build column types if user specified overrides
      const columnsPayload = preview?.columns.map((c) => ({
        name: c.name,
        type: columnOverrides[c.name] || c.type,
      }));

      const res = await fetch('/api/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableName: tableName.trim(),
          csvData: csvContent,
          description: description.trim() || undefined,
          columns: columnsPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to import CSV dataset into database.');
      }

      setImportResult(data);

      // Automatically execute the first suggested query in place so user sees the live table!
      if (data.suggestedQueries && data.suggestedQueries.length > 0) {
        handleRunQueryInPlace(data.suggestedQueries[0], 0);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unknown error during CSV import.');
    } finally {
      setIsImporting(false);
    }
  };

  // Run Query In-Place
  const handleRunQueryInPlace = async (query: SuggestedQuery, queryIdx: number) => {
    setExecutingQueryIdx(queryIdx);
    const startTime = Date.now();
    try {
      const res = await fetch('/api/execute-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: query.sql,
          question: query.question,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setInPlaceResult({
          sql: query.sql,
          columns: [],
          rows: [],
          rowCount: 0,
          executionTimeMs: Date.now() - startTime,
          error: data.error.message || 'Execution error',
        });
      } else {
        setInPlaceResult({
          sql: query.sql,
          columns: data.columns || [],
          rows: data.rows || [],
          rowCount: data.row_count ?? (data.rows ? data.rows.length : 0),
          executionTimeMs: data.executionTimeMs ?? Date.now() - startTime,
        });
      }
    } catch (err) {
      setInPlaceResult({
        sql: query.sql,
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: Date.now() - startTime,
        error: 'Network error executing SQL query.',
      });
    } finally {
      setExecutingQueryIdx(null);
    }
  };

  // Open in full Query Studio
  const handleOpenInQueryStudio = (query: SuggestedQuery) => {
    setLocation(`/query?sql=${encodeURIComponent(query.sql)}&q=${encodeURIComponent(query.question)}`);
  };

  // Copy SQL
  const handleCopySql = async (sql: string, idx: number) => {
    await navigator.clipboard.writeText(sql);
    setCopiedQueryIdx(idx);
    setTimeout(() => setCopiedQueryIdx(null), 1800);
  };

  // Filtered rows for in-place table
  const filteredInPlaceRows = useMemo(() => {
    if (!inPlaceResult?.rows) return [];
    if (!resultFilter.trim()) return inPlaceResult.rows;
    const term = resultFilter.toLowerCase();
    return inPlaceResult.rows.filter((row) =>
      row.some((cell) => String(cell ?? '').toLowerCase().includes(term))
    );
  }, [inPlaceResult?.rows, resultFilter]);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-16">
      <Navbar />

      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {/* Header Hero */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-card via-card to-background p-6 shadow-sm sm:p-10">
          <div className="absolute right-0 top-0 -mr-16 -mt-16 size-80 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl">
            <div className="mb-3.5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-code text-[11px] font-semibold text-primary">
              <FileSpreadsheet className="size-3.5" />
              <span>CSV Dataset → SQL Table & Query Engine</span>
            </div>

            <h1 className="font-display text-[clamp(2rem,3.5vw,3.2rem)] font-bold leading-[1.08] tracking-tight text-foreground">
              Import CSV file.{' '}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Instantly create query & table.
              </span>
            </h1>

            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
              Upload any CSV spreadsheet. The system automatically infers column types (INTEGER, REAL, TEXT), creates a dedicated table in SQLite, generates analytical SQL queries, and renders live data tables.
            </p>

            {/* Quick Sample Dataset Bar */}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium text-muted-foreground">Try instant samples:</span>
              {SAMPLE_DATASETS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => loadSample(sample)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary shadow-xs"
                >
                  <span>{sample.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Upload & Configuration Section */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Dropzone & Mode Selector */}
          <div className="lg:col-span-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <UploadCloud className="size-4 text-primary" />
                <h2 className="font-display text-[16px] font-bold text-foreground">
                  Step 1: Provide CSV File
                </h2>
              </div>

              <div className="flex items-center rounded-lg bg-muted p-0.5 text-[12px] font-medium">
                <button
                  type="button"
                  onClick={() => setInputMode('upload')}
                  className={`rounded-md px-3 py-1 transition-colors ${
                    inputMode === 'upload' ? 'bg-card text-foreground shadow-xs font-semibold' : 'text-muted-foreground'
                  }`}
                >
                  File Upload
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('paste')}
                  className={`rounded-md px-3 py-1 transition-colors ${
                    inputMode === 'paste' ? 'bg-card text-foreground shadow-xs font-semibold' : 'text-muted-foreground'
                  }`}
                >
                  Paste CSV Text
                </button>
              </div>
            </div>

            {inputMode === 'upload' ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
                  dragOver
                    ? 'border-primary bg-primary/10 scale-[1.01]'
                    : 'border-border/80 bg-card/60 hover:border-primary/50 hover:bg-card'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  onChange={onFileInputChange}
                  className="hidden"
                />

                <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                  <UploadCloud className="size-7" />
                </div>

                <h3 className="font-display text-[15px] font-bold text-foreground">
                  {fileName ? fileName : 'Choose a CSV file or drag & drop here'}
                </h3>

                <p className="mt-1 text-[13px] text-muted-foreground">
                  Supports .csv with comma or tab delimited headers and records
                </p>

                <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/70 px-3.5 py-1.5 text-[12px] font-semibold text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary">
                  <Plus className="size-3.5" />
                  <span>Select CSV File</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={csvContent}
                  onChange={(e) => {
                    setCsvContent(e.target.value);
                    if (!tableName) setTableName('custom_pasted_data');
                  }}
                  placeholder="Paste raw CSV text here (including header row)...&#10;e.g.:&#10;id,name,department,salary&#10;1,Jane Doe,Cardiology,95000&#10;2,John Smith,Neurology,88000"
                  rows={8}
                  className="w-full rounded-2xl border border-input bg-card p-4 font-code text-[12px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none focus:ring-4 focus:ring-primary/10"
                />
              </div>
            )}

            {/* Error Banner */}
            {importError && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-[13px] text-destructive">
                <AlertCircle className="size-5 shrink-0" />
                <div>
                  <h4 className="font-semibold">Import Issue</h4>
                  <p className="mt-0.5">{importError}</p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Table Configuration & Settings */}
          <div className="lg:col-span-6 space-y-4">
            <div className="border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Database className="size-4 text-primary" />
                <h2 className="font-display text-[16px] font-bold text-foreground">
                  Step 2: Database Table Configuration
                </h2>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
              <div>
                <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Target SQLite Table Name
                </label>
                <div className="mt-1.5 flex items-center rounded-xl border border-input bg-background px-3 py-2 text-[13px] font-code focus-within:border-primary">
                  <span className="mr-1.5 text-muted-foreground select-none">dbo.</span>
                  <input
                    type="text"
                    value={tableName}
                    onChange={(e) =>
                      setTableName(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, '_')
                          .slice(0, 48)
                      )
                    }
                    placeholder="e.g. patient_vitals, medical_inventory"
                    className="w-full bg-transparent font-code text-[13px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/50"
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Used in queries (e.g. <code className="font-code text-primary">SELECT * FROM {tableName || 'your_table'}</code>)
                </p>
              </div>

              <div>
                <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Clinical lab results for Q2 2025"
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-[13px] text-foreground focus:border-primary outline-none placeholder:text-muted-foreground/50"
                />
              </div>

              {preview && (
                <div className="grid grid-cols-3 gap-3 rounded-xl border border-border/80 bg-muted/30 p-3 text-center">
                  <div>
                    <span className="block font-code text-[18px] font-bold text-primary">
                      {preview.totalRows}
                    </span>
                    <span className="text-[11px] text-muted-foreground">Total Rows</span>
                  </div>
                  <div>
                    <span className="block font-code text-[18px] font-bold text-foreground">
                      {preview.columns.length}
                    </span>
                    <span className="text-[11px] text-muted-foreground">Columns</span>
                  </div>
                  <div>
                    <span className="block font-code text-[18px] font-bold text-emerald-500">
                      SQLite
                    </span>
                    <span className="text-[11px] text-muted-foreground">Engine Ready</span>
                  </div>
                </div>
              )}

              {/* Import Action Button */}
              <button
                type="button"
                onClick={handleImport}
                disabled={isImporting || !preview || !tableName.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 hover:scale-[1.01] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    <span>Creating Table & Compiling Queries...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    <span>Create Database Table & Generate Query</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Live Detected Column Schema & Data Preview */}
        {preview && (
          <div className="space-y-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-4">
              <div>
                <h3 className="font-display text-[18px] font-bold text-foreground">
                  Detected Column Schema & Type Inference
                </h3>
                <p className="text-[12px] text-muted-foreground">
                  We inspected the first records and determined appropriate SQLite data types:
                </p>
              </div>

              <span className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 font-code text-[11px] font-semibold text-primary">
                {preview.columns.length} Columns Detected
              </span>
            </div>

            {/* Column Schema Badges */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {preview.columns.map((col) => {
                const currentType = columnOverrides[col.name] || col.type;
                return (
                  <div
                    key={col.name}
                    className="flex flex-col justify-between rounded-xl border border-border/70 bg-background/80 p-3.5 transition-all hover:border-primary/40"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-code text-[13px] font-bold text-foreground truncate" title={col.name}>
                          {col.name}
                        </span>
                        <select
                          value={currentType}
                          onChange={(e) =>
                            setColumnOverrides((prev) => ({
                              ...prev,
                              [col.name]: e.target.value as 'INTEGER' | 'REAL' | 'TEXT',
                            }))
                          }
                          className="rounded-md border border-border bg-card px-2 py-0.5 font-code text-[10px] font-semibold text-primary focus:outline-none"
                        >
                          <option value="INTEGER">INTEGER</option>
                          <option value="REAL">REAL</option>
                          <option value="TEXT">TEXT</option>
                        </select>
                      </div>

                      <div className="mt-2 text-[11px] text-muted-foreground">
                        <span className="text-[10px] font-medium uppercase tracking-wider block mb-1">
                          Sample Values:
                        </span>
                        <div className="flex flex-wrap gap-1 font-code text-[11px] text-foreground/80">
                          {col.sampleValues.map((s, idx) => (
                            <span key={idx} className="rounded bg-muted px-1.5 py-0.5 truncate max-w-[120px]">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Preview Data Rows Table */}
            <div className="mt-4 pt-4 border-t border-border/70">
              <h4 className="text-[13px] font-semibold text-foreground mb-3 flex items-center gap-2">
                <Table2 className="size-4 text-primary" />
                <span>First 10 Data Rows Preview</span>
              </h4>

              <div className="overflow-x-auto rounded-xl border border-border bg-background">
                <table className="w-full text-left font-code text-[12px]">
                  <thead className="border-b border-border bg-muted/60 text-muted-foreground uppercase text-[10px] font-semibold">
                    <tr>
                      <th className="py-2 px-3 w-12 text-center text-muted-foreground/60">#</th>
                      {preview.headers.map((h) => (
                        <th key={h} className="py-2.5 px-3 font-semibold text-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {preview.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-3 text-center text-muted-foreground/50 text-[11px]">
                          {rIdx + 1}
                        </td>
                        {preview.headers.map((_, cIdx) => (
                          <td key={cIdx} className="py-2 px-3 text-foreground truncate max-w-[200px]">
                            {row[cIdx] !== undefined && row[cIdx] !== '' ? row[cIdx] : <span className="text-muted-foreground/40 italic">null</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Generated Queries & Live Results Studio (Once Imported) */}
        {importResult && (
          <div className="space-y-6 rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-emerald-500/20 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-md shadow-emerald-500/20">
                  <CheckCircle2 className="size-6" />
                </div>
                <div>
                  <h3 className="font-display text-[20px] font-bold text-foreground">
                    Table <code className="text-emerald-500 font-code font-bold">"{importResult.tableName}"</code> Successfully Created!
                  </h3>
                  <p className="text-[13px] text-muted-foreground">
                    Inserted {importResult.rowCount} rows and {importResult.columns.length} columns into SQLite. We automatically generated optimal SQL queries below:
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLocation('/chat')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/20"
                >
                  <Bot className="size-3.5" />
                  <span>Ask AI Chatbot About This Table</span>
                </button>
              </div>
            </div>

            {/* Generated Queries Cards */}
            <div className="space-y-4">
              <h4 className="text-[14px] font-bold text-foreground flex items-center gap-2">
                <Code2 className="size-4 text-primary" />
                <span>Generated SQL Queries for "{importResult.tableName}":</span>
              </h4>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {importResult.suggestedQueries.map((query, qIdx) => {
                  const isExecuting = executingQueryIdx === qIdx;
                  const isCopied = copiedQueryIdx === qIdx;

                  return (
                    <div
                      key={qIdx}
                      className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:border-primary/50"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="font-display text-[14px] font-bold text-foreground">
                            {query.name}
                          </span>
                          <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-code text-[10px] uppercase text-muted-foreground">
                            {query.category}
                          </span>
                        </div>

                        <p className="text-[12px] text-muted-foreground mb-3">
                          "{query.question}"
                        </p>

                        <div className="relative rounded-xl border border-border/80 bg-background/90 p-3 font-code text-[12px] leading-relaxed text-foreground/90 overflow-x-auto">
                          <pre className="whitespace-pre-wrap">{query.sql}</pre>
                          <button
                            type="button"
                            onClick={() => handleCopySql(query.sql, qIdx)}
                            className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md border border-border bg-card/80 text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy SQL"
                          >
                            {isCopied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                        <button
                          type="button"
                          onClick={() => handleRunQueryInPlace(query, qIdx)}
                          disabled={isExecuting}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-[12px] font-semibold text-primary-foreground shadow-xs transition-all hover:bg-primary/90"
                        >
                          {isExecuting ? (
                            <RefreshCw className="size-3.5 animate-spin" />
                          ) : (
                            <Play className="size-3.5" />
                          )}
                          <span>Run In-Place</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenInQueryStudio(query)}
                          className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
                        >
                          <span>Open in Full SQL Studio</span>
                          <ChevronRight className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* In-Place Live Query Result Data Table */}
            {inPlaceResult && (
              <div className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Table2 className="size-5 text-primary" />
                      <h4 className="font-display text-[17px] font-bold text-foreground">
                        Live Query Result Table
                      </h4>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[12px] text-muted-foreground">
                      <span>{inPlaceResult.rowCount} rows returned</span>
                      <span>•</span>
                      <span>Executed in {inPlaceResult.executionTimeMs}ms</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        value={resultFilter}
                        onChange={(e) => setResultFilter(e.target.value)}
                        placeholder="Search within result rows..."
                        className="h-8 w-56 rounded-lg border border-input bg-background pl-8 pr-3 text-[12px] outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                </div>

                {inPlaceResult.error ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-[13px] text-destructive">
                    <p className="font-semibold">Execution Error</p>
                    <p className="mt-0.5">{inPlaceResult.error}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border bg-background">
                    <table className="w-full text-left font-code text-[12px]">
                      <thead className="border-b border-border bg-muted/60 text-muted-foreground uppercase text-[10px] font-semibold">
                        <tr>
                          <th className="py-2.5 px-3 w-12 text-center text-muted-foreground/60">#</th>
                          {inPlaceResult.columns.map((col) => (
                            <th key={col} className="py-2.5 px-3 font-semibold text-foreground">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {filteredInPlaceRows.length === 0 ? (
                          <tr>
                            <td colSpan={inPlaceResult.columns.length + 1} className="py-6 text-center text-muted-foreground">
                              No records match search filter.
                            </td>
                          </tr>
                        ) : (
                          filteredInPlaceRows.slice(0, 50).map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-muted/30 transition-colors">
                              <td className="py-2 px-3 text-center text-muted-foreground/50 text-[11px]">
                                {rIdx + 1}
                              </td>
                              {inPlaceResult.columns.map((_, cIdx) => (
                                <td key={cIdx} className="py-2 px-3 text-foreground truncate max-w-[240px]">
                                  {row[cIdx] !== undefined && row[cIdx] !== null ? (
                                    String(row[cIdx])
                                  ) : (
                                    <span className="text-muted-foreground/40 italic">null</span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
