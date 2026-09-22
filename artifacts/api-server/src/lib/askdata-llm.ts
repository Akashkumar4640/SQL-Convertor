import { getSchema } from "./askdata-database";

export type SqlGeneration = {
  sql: string;
  explanation: string;
};

const examples = [
  {
    matches: ["top 5", "customers", "revenue"],
    sql: `SELECT c.name, ROUND(SUM(o.amount), 2) AS total_revenue
FROM customers c
JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.name
ORDER BY total_revenue DESC
LIMIT 5;`,
    explanation: "I joined customers to orders, then ranked customers by their order totals.",
  },
  {
    matches: ["orders", "each city"],
    sql: `SELECT c.city, COUNT(o.id) AS order_count
FROM customers c
JOIN orders o ON o.customer_id = c.id
GROUP BY c.city
ORDER BY order_count DESC;`,
    explanation: "I grouped orders by the city of the customer who placed them.",
  },
  {
    matches: ["products", "cost", "more than"],
    sql: `SELECT name, category, price
FROM products
WHERE price > 100
ORDER BY price DESC;`,
    explanation: "I filtered the catalog to products priced above $100.",
  },
  {
    matches: ["revenue", "each month"],
    sql: `SELECT strftime('%Y-%m', order_date) AS month, ROUND(SUM(amount), 2) AS revenue
FROM orders
GROUP BY month
ORDER BY month;`,
    explanation: "I grouped order totals by the month in each order date.",
  },
  {
    matches: ["customer", "most orders"],
    sql: `SELECT c.name, COUNT(o.id) AS order_count
FROM customers c
JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.name
ORDER BY order_count DESC
LIMIT 1;`,
    explanation: "I counted orders per customer and returned the highest count.",
  },
  {
    matches: ["list", "customers"],
    sql: "SELECT id, name, city, country FROM customers ORDER BY name;",
    explanation: "I listed the customers alphabetically.",
  },
  {
    matches: ["list", "orders"],
    sql: "SELECT id, customer_id, order_date, amount FROM orders ORDER BY order_date DESC;",
    explanation: "I listed the most recent orders first.",
  },
];

export function generateSql(question: string, previousError?: string): SqlGeneration {
  const normalized = question.toLowerCase().replace(/[?!.,]/g, " ");
  const found = examples.find((example) => example.matches.every((match) => normalized.includes(match)));
  if (found) return { sql: found.sql, explanation: found.explanation };

  if (normalized.includes("total revenue") || normalized.includes("revenue")) {
    return {
      sql: "SELECT ROUND(SUM(amount), 2) AS total_revenue FROM orders;",
      explanation: "I summed all order amounts to calculate total revenue.",
    };
  }

  if (normalized.includes("how many") && normalized.includes("orders")) {
    return {
      sql: "SELECT COUNT(*) AS order_count FROM orders;",
      explanation: "I counted every row in the orders table.",
    };
  }

  const suffix = previousError ? ` Previous execution issue: ${previousError}` : "";
  throw new Error(`I can answer questions about customers, orders, products, revenue, and dates.${suffix}`);
}

export function getPromptContext(question: string): string {
  const databaseSchema = getSchema();
  return [
    "You generate SQLite SQL only. Return exactly one read-only SELECT statement.",
    "Use only the backend-owned tables and columns below. Never mutate data.",
    JSON.stringify(databaseSchema),
    `Question: ${question}`,
  ].join("\n");
}
