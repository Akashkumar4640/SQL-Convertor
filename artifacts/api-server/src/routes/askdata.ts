import { Router, type IRouter } from "express";
import { AskDataBody, AskDataResponse, GetSchemaResponse } from "@workspace/api-zod";
import { executeReadOnlyQuery, getSchema } from "../lib/askdata-database";
import { cleanGeneratedSql, validateReadOnlySql } from "../lib/askdata-sql";
import { generateSql, getPromptContext } from "../lib/askdata-llm";

const router: IRouter = Router();

router.get("/schema", (_req, res) => {
  res.json(GetSchemaResponse.parse(getSchema()));
});

router.post("/ask", (req, res) => {
  const parsed = AskDataBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(AskDataResponse.parse({
      question: typeof req.body?.question === "string" ? req.body.question : "",
      sql: "",
      columns: [],
      rows: [],
      row_count: 0,
      cached: false,
      error: { code: "INVALID_QUESTION", message: "Please enter a question between 1 and 500 characters." },
    }));
    return;
  }

  const { question } = parsed.data;
  try {
    getPromptContext(question);
    const generated = generateSql(question);
    const validation = validateReadOnlySql(cleanGeneratedSql(generated.sql));
    if (!validation.safe) {
      res.json(AskDataResponse.parse({
        question, sql: generated.sql, columns: [], rows: [], row_count: 0, cached: false,
        error: { code: "SQL_VALIDATION_ERROR", message: validation.message },
      }));
      return;
    }

    const result = executeReadOnlyQuery(validation.sql);
    res.json(AskDataResponse.parse({
      question,
      sql: validation.sql,
      columns: result.columns,
      rows: result.rows,
      row_count: result.rows.length,
      cached: false,
      error: null,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The query could not be completed.";
    res.json(AskDataResponse.parse({
      question, sql: "", columns: [], rows: [], row_count: 0, cached: false,
      error: { code: "QUERY_ERROR", message: message.startsWith("I can answer") ? message : "The sample database could not answer that question." },
    }));
  }
});

export default router;