import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SchemaColumn = {
  name: string;
  type: string;
  nullable: boolean;
  description: string;
};

export type SchemaTable = {
  name: string;
  description: string;
  columns: SchemaColumn[];
};

export type DatabaseSchema = {
  tables: SchemaTable[];
  relationships: {
    from_table: string;
    from_column: string;
    to_table: string;
    to_column: string;
  }[];
  row_count: number;
};

const databasePath = join(process.cwd(), "artifacts", "api-server", "data.db");

const schema: DatabaseSchema = {
  tables: [
    {
      name: "customers",
      description: "People and organizations who place orders.",
      columns: [
        { name: "id", type: "INTEGER", nullable: false, description: "Unique customer identifier." },
        { name: "name", type: "TEXT", nullable: false, description: "Customer display name." },
        { name: "city", type: "TEXT", nullable: true, description: "Customer city." },
        { name: "country", type: "TEXT", nullable: true, description: "Customer country." },
      ],
    },
    {
      name: "orders",
      description: "Orders placed by customers, including their total amount.",
      columns: [
        { name: "id", type: "INTEGER", nullable: false, description: "Unique order identifier." },
        { name: "customer_id", type: "INTEGER", nullable: false, description: "Customer who placed the order." },
        { name: "order_date", type: "TEXT", nullable: false, description: "Order date in YYYY-MM-DD format." },
        { name: "amount", type: "REAL", nullable: false, description: "Order total in USD." },
      ],
    },
    {
      name: "products",
      description: "Products available in the sample catalog.",
      columns: [
        { name: "id", type: "INTEGER", nullable: false, description: "Unique product identifier." },
        { name: "name", type: "TEXT", nullable: false, description: "Product name." },
        { name: "category", type: "TEXT", nullable: true, description: "Product category." },
        { name: "price", type: "REAL", nullable: false, description: "Unit price in USD." },
      ],
    },
  ],
  relationships: [
    { from_table: "orders", from_column: "customer_id", to_table: "customers", to_column: "id" },
  ],
  row_count: 0,
};

function seedDatabase(): void {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);

  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT,
      country TEXT
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      order_date TEXT NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      price REAL NOT NULL
    );
  `);

  const customerCount = database.prepare("SELECT COUNT(*) AS count FROM customers").get() as { count: number };
  if (Number(customerCount.count) === 0) {
    const insert = database.prepare("INSERT INTO customers (id, name, city, country) VALUES (?, ?, ?, ?)");
    [
      [1, "Maya Patel", "Austin", "United States"],
      [2, "Jon Bell", "London", "United Kingdom"],
      [3, "Sofia Rossi", "Milan", "Italy"],
      [4, "Daniel Kim", "Austin", "United States"],
      [5, "Amara Okafor", "Lagos", "Nigeria"],
      [6, "Leo Nguyen", "Toronto", "Canada"],
    ].forEach((customer) => insert.run(...customer));
  }

  const orderCount = database.prepare("SELECT COUNT(*) AS count FROM orders").get() as { count: number };
  if (Number(orderCount.count) === 0) {
    const insert = database.prepare("INSERT INTO orders (id, customer_id, order_date, amount) VALUES (?, ?, ?, ?)");
    [
      [1001, 1, "2025-01-14", 540.0],
      [1002, 1, "2025-02-08", 285.5],
      [1003, 1, "2025-03-21", 425.0],
      [1004, 2, "2025-01-20", 780.25],
      [1005, 2, "2025-04-03", 190.0],
      [1006, 3, "2025-02-12", 1190.0],
      [1007, 3, "2025-05-18", 345.75],
      [1008, 4, "2025-03-04", 920.0],
      [1009, 4, "2025-05-29", 210.0],
      [1010, 4, "2025-06-11", 605.0],
      [1011, 5, "2025-02-26", 460.5],
      [1012, 6, "2025-04-17", 875.0],
    ].forEach((order) => insert.run(...order));
  }

  const productCount = database.prepare("SELECT COUNT(*) AS count FROM products").get() as { count: number };
  if (Number(productCount.count) === 0) {
    const insert = database.prepare("INSERT INTO products (id, name, category, price) VALUES (?, ?, ?, ?)");
    [
      [1, "Atlas Desk Lamp", "Workspace", 129.0],
      [2, "Field Notes Set", "Stationery", 24.0],
      [3, "Arc Monitor Stand", "Workspace", 189.0],
      [4, "Moss Ceramic Mug", "Kitchen", 38.5],
      [5, "Daily Planner", "Stationery", 42.0],
      [6, "Wave Headphones", "Audio", 149.0],
      [7, "Cloud Keyboard", "Workspace", 112.0],
      [8, "Canvas Tote", "Accessories", 58.0],
    ].forEach((product) => insert.run(...product));
  }

  database.close();
}

seedDatabase();

export function getSchema(): DatabaseSchema {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const tableCounts = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM customers) + (SELECT COUNT(*) FROM orders) + (SELECT COUNT(*) FROM products) AS count
  `).get() as { count: number };
  database.close();
  return { ...schema, row_count: Number(tableCounts.count) };
}

export type QueryResult = {
  columns: string[];
  rows: unknown[][];
};

export function executeReadOnlyQuery(sql: string): QueryResult {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const statement = database.prepare(sql);
    const rows = statement.all() as Record<string, unknown>[];
    const columns = statement.columns().map((column) => column.name);
    return { columns, rows: rows.map((row) => columns.map((column) => row[column])) };
  } finally {
    database.close();
  }
}
