const blockedKeywords = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|VACUUM|ATTACH|DETACH|PRAGMA|LOAD_EXTENSION|TRUNCATE|REINDEX)\b/i;

export type SqlValidation =
  | { safe: true; sql: string }
  | { safe: false; message: string };

export function validateReadOnlySql(input: string): SqlValidation {
  const sql = input.trim();
  if (!sql) return { safe: false, message: "No SQL statement was generated." };
  if (sql.includes("--") || sql.includes("/*") || sql.includes("*/")) {
    return { safe: false, message: "Comments are not allowed in generated SQL." };
  }
  const withoutTrailingSemicolon = sql.replace(/;\s*$/, "");
  if (withoutTrailingSemicolon.includes(";")) {
    return { safe: false, message: "Only one SQL statement is allowed." };
  }
  if (!/^(SELECT|WITH)\b/i.test(withoutTrailingSemicolon)) {
    return { safe: false, message: "Only read-only SELECT queries are allowed." };
  }
  if (blockedKeywords.test(withoutTrailingSemicolon)) {
    return { safe: false, message: "The query contains a blocked database operation." };
  }
  if (/\b(readfile|writefile|load_extension|attach|detach)\s*\(/i.test(withoutTrailingSemicolon)) {
    return { safe: false, message: "File and external database access are not allowed." };
  }

  const limitedSql = /\bLIMIT\s+\d+\b/i.test(withoutTrailingSemicolon)
    ? withoutTrailingSemicolon
    : `${withoutTrailingSemicolon} LIMIT 100`;
  return { safe: true, sql: limitedSql };
}

export function cleanGeneratedSql(raw: string): string {
  const withoutFences = raw.replace(/```(?:sql)?/gi, "").replace(/```/g, "").trim();
  const match = withoutFences.match(/\b(SELECT|WITH)\b[\s\S]*/i);
  return (match?.[0] ?? withoutFences).replace(/;?\s*$/, ";");
}
