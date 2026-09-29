export type SqlValidation =
  | { safe: true; sql: string }
  | { safe: false; message: string };

const dangerousKeywords = /\b(DROP|ATTACH|DETACH|PRAGMA|LOAD_EXTENSION|TRUNCATE|REINDEX|ALTER)\b/i;

function stripComments(sql: string): string {
  // Remove single line comments -- and block comments /* */
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

export function validateReadOnlySql(input: string): SqlValidation {
  const rawSql = input.trim();
  if (!rawSql) return { safe: false, message: "No SQL statement was provided." };

  const cleanedSql = stripComments(rawSql);
  if (!cleanedSql) return { safe: false, message: "SQL statement cannot be empty or only comments." };

  if (dangerousKeywords.test(cleanedSql)) {
    return { safe: false, message: "The query contains a blocked database administration operation." };
  }

  if (/\b(readfile|writefile|load_extension|attach|detach)\s*\(/i.test(cleanedSql)) {
    return { safe: false, message: "File and external database access are not allowed." };
  }

  // Ensure it starts with a valid query statement
  if (!/^(SELECT|WITH|EXPLAIN|VALUES)\b/i.test(cleanedSql)) {
    return { safe: false, message: "Only read-only queries (SELECT, WITH, EXPLAIN) are supported." };
  }

  return { safe: true, sql: rawSql };
}

export function cleanGeneratedSql(raw: string): string {
  // Strip markdown code fences if present
  let withoutFences = raw.replace(/```(?:sql)?/gi, "").replace(/```/g, "").trim();

  // Find where the query starts (SELECT or WITH)
  const match = withoutFences.match(/\b(WITH\s+[\s\S]*|SELECT\s+[\s\S]*)/i);
  if (match) {
    withoutFences = match[0].trim();
  }

  return withoutFences.replace(/;?\s*$/, ";");
}
