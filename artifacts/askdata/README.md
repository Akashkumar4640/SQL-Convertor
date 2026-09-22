# AskData

AskData is a small, understandable data workbench. Type a question in plain
English, and the app turns it into a safe read-only SQL query against a seeded
sample database.

## How it works

1. The React frontend sends the question to `POST /api/ask`.
2. The API loads the schema it owns on the server.
3. The mock SQL provider selects a known-good SQLite query for supported
   question patterns.
4. The generated SQL is cleaned and checked before it runs.
5. The API executes the query through a read-only SQLite connection.
6. The response includes the SQL, column names, rows, row count, and any
   user-friendly error.

The UI keeps the SQL visible on purpose: the result is useful, but learning
why the result is correct is the main product goal.

## Project map

- `src/App.tsx` — the single-page workspace, conversation history, question
  composer, schema browser, result table, and CSV export.
- `src/index.css` — the AskData visual theme, responsive layout helpers, and
  small motion utilities.
- `../api-server/src/lib/askdata-database.ts` — creates and seeds
  `artifacts/api-server/data.db`, describes the schema, and executes queries.
- `../api-server/src/lib/askdata-llm.ts` — the replaceable SQL-generation
  boundary. The current provider is deterministic mock mode.
- `../api-server/src/lib/askdata-sql.ts` — strips accidental Markdown,
  rejects unsafe statements and comments, enforces one statement, and adds a
  maximum result limit.
- `../api-server/src/routes/askdata.ts` — validates API input and returns the
  consistent AskData response envelope.
- `../../lib/api-spec/openapi.yaml` — the source of truth for the API contract.

## Run it

From the workspace root:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/askdata run dev
```

The managed preview starts both services for the app. The sample database is
created and seeded automatically the first time the API starts. Seeding is
idempotent: existing rows are not duplicated.

## API examples

```bash
curl http://localhost:80/api/healthz
curl http://localhost:80/api/schema

curl -X POST http://localhost:80/api/ask \
  -H 'content-type: application/json' \
  -d '{"question":"Show the top 5 customers by total revenue."}'
```

## Safety choices

- The frontend never supplies the schema used to build a query.
- Only one `SELECT` or `WITH` statement is accepted.
- Mutating keywords, comments, file functions, and external database access are
  rejected.
- Results are capped at 100 rows unless the generated query asks for a
  smaller limit.
- The database connection used for execution is read-only.
- The mock provider does not pretend to understand unsupported questions; it
  returns a clear explanation instead.

## Replacing mock mode

`askdata-llm.ts` is intentionally small so a cloud or local provider can be
introduced without changing the route or UI. Keep provider-specific code
behind the `generateSql(question, previousError)` boundary, load any API key
from the environment, and run the same safety validation on every provider
response. Never send provider credentials to the browser.

## Known limitations

The first version uses a deterministic mock provider for the sample question
patterns. It is ideal for learning and local demos without an API key. A future
provider can expand natural-language coverage, add bounded repair attempts, and
return richer explanations while keeping the database and safety boundary
unchanged.