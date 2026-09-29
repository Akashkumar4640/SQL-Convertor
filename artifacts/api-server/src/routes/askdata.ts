import { Router, type IRouter } from "express";
import { executeReadOnlyQuery, getSchema, importCsvTable, deleteCustomTable } from "../lib/askdata-database";
import { cleanGeneratedSql, validateReadOnlySql } from "../lib/askdata-sql";
import { chatWithSqlAssistant, generateSql, generateSqlAsync, getPromptContext } from "../lib/askdata-llm";
import { callGemini, type GeminiMessage } from "../lib/gemini";

const router: IRouter = Router();

// Predefined system table names (not user-imported)
const SYSTEM_TABLES = ["customers", "orders", "order_items", "products", "patient_appointments", "employees"];

router.get("/schema", (_req, res) => {
  res.json(getSchema());
});

router.post("/ask", async (req, res) => {
  const startTime = Date.now();
  const rawQuestion = req.body?.question;

  if (typeof rawQuestion !== "string" || rawQuestion.trim().length === 0) {
    res.status(400).json({
      question: "",
      sql: "",
      columns: [],
      rows: [],
      row_count: 0,
      cached: false,
      executionTimeMs: 0,
      error: { code: "INVALID_QUESTION", message: "Please enter a question between 1 and 500 characters." },
    });
    return;
  }

  const question = rawQuestion.trim();
  const targetTable = typeof req.body?.targetTable === "string" && req.body.targetTable.trim().length > 0 ? req.body.targetTable.trim() : undefined;
  try {
    getPromptContext(question);
    const generated = await generateSqlAsync(question, targetTable);
    const validation = validateReadOnlySql(cleanGeneratedSql(generated.sql));

    if (!validation.safe) {
      res.json({
        question,
        sql: generated.sql,
        explanation: generated.explanation,
        breakdown: generated.breakdown,
        columns: [],
        rows: [],
        row_count: 0,
        cached: false,
        executionTimeMs: Date.now() - startTime,
        error: { code: "SQL_VALIDATION_ERROR", message: validation.message },
      });
      return;
    }

    const result = executeReadOnlyQuery(validation.sql);
    res.json({
      question,
      sql: validation.sql,
      explanation: generated.explanation,
      breakdown: generated.breakdown,
      columns: result.columns,
      rows: result.rows,
      row_count: result.rows.length,
      cached: false,
      executionTimeMs: Date.now() - startTime,
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The query could not be completed.";
    res.json({
      question,
      sql: "",
      columns: [],
      rows: [],
      row_count: 0,
      cached: false,
      executionTimeMs: Date.now() - startTime,
      error: { code: "QUERY_ERROR", message: message.startsWith("I can answer") ? message : "The database could not answer that question." },
    });
  }
});

router.post("/execute-sql", (req, res) => {
  const startTime = Date.now();
  const rawSql = req.body?.sql;
  const question = typeof req.body?.question === "string" ? req.body.question : "Custom SQL Query";

  if (typeof rawSql !== "string" || rawSql.trim().length === 0) {
    res.status(400).json({
      question,
      sql: "",
      columns: [],
      rows: [],
      row_count: 0,
      executionTimeMs: 0,
      error: { code: "EMPTY_SQL", message: "Please provide a valid SQL query." },
    });
    return;
  }

  try {
    const validation = validateReadOnlySql(cleanGeneratedSql(rawSql));
    if (!validation.safe) {
      res.json({
        question,
        sql: rawSql,
        columns: [],
        rows: [],
        row_count: 0,
        executionTimeMs: Date.now() - startTime,
        error: { code: "SQL_VALIDATION_ERROR", message: validation.message },
      });
      return;
    }

    const result = executeReadOnlyQuery(validation.sql);
    res.json({
      question,
      sql: validation.sql,
      columns: result.columns,
      rows: result.rows,
      row_count: result.rows.length,
      executionTimeMs: Date.now() - startTime,
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to execute SQL query.";
    res.json({
      question,
      sql: rawSql,
      columns: [],
      rows: [],
      row_count: 0,
      executionTimeMs: Date.now() - startTime,
      error: { code: "EXECUTION_ERROR", message },
    });
  }
});

router.post("/chat", async (req, res) => {
  const message = req.body?.message;
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  const currentSql = typeof req.body?.currentSql === "string" ? req.body.currentSql : undefined;

  if (typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "Message is required." });
    return;
  }

  // Build enriched system prompt — includes ALL tables + explicitly calls out imported CSV tables
  const schema = getSchema();
  const importedTables = schema.tables.filter((t) => !SYSTEM_TABLES.includes(t.name));

  const importedTablesSummary = importedTables.length > 0
    ? importedTables.map((t) =>
        `  Table: "${t.name}"\n  Columns: ${t.columns.map((c) => `${c.name} (${c.type})`).join(", ")}\n  Description: ${t.description}`
      ).join("\n\n")
    : "  No user-imported tables yet.";

  const systemPrompt = [
    "You are a friendly, intelligent, and natural AI Mentor & Assistant embedded in Patient Tech Mentor & SQL Studio.",
    "Your personality is warm, approachable, encouraging, and natural.",
    "",
    "CONVERSATIONAL & CHAT RULES:",
    "1. If the user asks 'what can i call you', 'what is your name', 'who are you', or introduces themselves, respond as 'SQL AI Mentor' or 'Mentor'. DO NOT generate SQL for identity/greeting questions.",
    "2. If the user greets you or asks how you are doing, reply warmly without any SQL code.",
    "3. If the user asks conceptual questions ('what is a JOIN', 'explain group by'), explain in plain English without forcing a live query.",
    "4. If the user expresses gratitude or says goodbye, respond politely.",
    "",
    "DATABASE & SQL QUERY RULES:",
    "5. Generate SQL ONLY when the user is asking to retrieve, filter, aggregate, calculate, or inspect data.",
    "6. Enclose SQL in a ```sql ... ``` code block followed by a clear explanation.",
    "7. CRITICAL: Use ONLY the exact table names and column names listed in the SCHEMA below. Do NOT invent names.",
    "8. For user-imported CSV tables, use the EXACT table name (e.g. if table is 'ipl_matches', write SELECT ... FROM ipl_matches). Check IMPORTED TABLES section for available column names.",
    "9. When the user asks about their imported dataset (e.g. 'how many matches did CSK win', 'show top scorers', 'average score by team'), query those imported tables using their exact column names.",
    "10. Your SQL will be AUTOMATICALLY EXECUTED against the live SQLite database — results appear instantly as a table. Always write correct, executable SQLite SQL.",
    "11. IMPORTANT: If the user asks a question that clearly refers to data in an imported table (e.g. mentions a team name, player name, or any column value visible in the imported table description), write SQL that queries that imported table.",
    "",
    "FULL DATABASE SCHEMA (system tables + imported CSV tables):",
    JSON.stringify(schema.tables, null, 2),
    "",
    "USER-IMPORTED CSV TABLES — answer ALL data questions about these using SQL:",
    importedTablesSummary,
    "",
    currentSql ? `Current SQL query in context:\`\`\`sql\n${currentSql}\n\`\`\`` : "",
  ].filter(Boolean).join("\n\n");

  // Convert history to Gemini format
  const geminiHistory: GeminiMessage[] = history
    .filter((m: { role: string; content: string }) => m.role === "user" || m.role === "assistant")
    .map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  try {
    // Call AI
    const aiResponse = await callGemini(systemPrompt, geminiHistory, message.trim());

    // Extract SQL block from the response if present
    const sqlMatch = aiResponse.match(/```sql\n([\s\S]*?)```/) || aiResponse.match(/```([\s\S]*?)```/);
    const suggestedSql = sqlMatch ? sqlMatch[1].trim() : undefined;

    // AUTO-EXECUTE the SQL — results shown immediately in chat as an inline table
    let tableResult:
      | { columns: string[]; rows: unknown[][]; rowCount: number; executionTimeMs: number; error?: string }
      | undefined;

    if (suggestedSql) {
      const execStart = Date.now();
      try {
        const validation = validateReadOnlySql(cleanGeneratedSql(suggestedSql));
        if (validation.safe) {
          const result = executeReadOnlyQuery(validation.sql);
          tableResult = {
            columns: result.columns,
            rows: result.rows,
            rowCount: result.rows.length,
            executionTimeMs: Date.now() - execStart,
          };
        } else {
          tableResult = {
            columns: [],
            rows: [],
            rowCount: 0,
            executionTimeMs: 0,
            error: `SQL validation: ${validation.message}`,
          };
        }
      } catch (execErr) {
        tableResult = {
          columns: [],
          rows: [],
          rowCount: 0,
          executionTimeMs: 0,
          error: execErr instanceof Error ? execErr.message : "SQL execution failed.",
        };
      }
    }

    // Build smart suggested questions that include imported table names
    const importedSuggestions = importedTables.slice(0, 2).flatMap((t) => {
      const numCol = t.columns.find((c) => c.type === "REAL" || c.type === "INTEGER");
      const textCol = t.columns.find((c) => c.type === "TEXT");
      const suggestions: string[] = [`Show all records from ${t.name}`];
      if (numCol && textCol) {
        suggestions.push(`Show top 10 ${t.name} by ${numCol.name}`);
        suggestions.push(`Group ${t.name} by ${textCol.name} and count`);
      }
      return suggestions;
    });

    const defaultSuggestions = [
      "Give me a query for maximum salary in top 10 labours",
      "Show average salary by department",
      "Show top customers by revenue",
      "Show patient appointments by doctor",
    ];

    res.json({
      message: aiResponse,
      suggestedSql,
      tableResult,
      suggestedQuestions: importedSuggestions.length > 0
        ? [...importedSuggestions.slice(0, 3), ...defaultSuggestions.slice(0, 1)]
        : defaultSuggestions,
    });
  } catch (_aiError) {
    // Graceful fallback to deterministic assistant
    const response = chatWithSqlAssistant(message.trim(), history, currentSql);
    res.json(response);
  }
});

router.post("/import-csv", (req, res) => {
  try {
    const { tableName, csvData, description, columns, rows } = req.body || {};

    if (!csvData && (!columns || !rows)) {
      res.status(400).json({
        error: "Please provide CSV data content or structured columns and rows.",
      });
      return;
    }

    const result = importCsvTable({
      tableName: typeof tableName === "string" ? tableName : "imported_dataset",
      csvContent: typeof csvData === "string" ? csvData : undefined,
      columns: Array.isArray(columns) ? columns : undefined,
      rows: Array.isArray(rows) ? rows : undefined,
      description: typeof description === "string" ? description : undefined,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import CSV dataset.";
    res.status(400).json({
      error: message,
    });
  }
});

router.delete("/table/:tableName", (req, res) => {
  try {
    const { tableName } = req.params;
    deleteCustomTable(tableName);
    res.json({ success: true, message: `Table '${tableName}' has been removed.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete table.";
    res.status(400).json({ error: message });
  }
});

export default router;