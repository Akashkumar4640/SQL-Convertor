import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import initSqlJs, { type Database } from "sql.js";

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
      description: "Customer directory with location, demographics, and account tiers.",
      columns: [
        { name: "id", type: "INTEGER", nullable: false, description: "Unique customer identifier (primary key)." },
        { name: "customer_id", type: "INTEGER", nullable: false, description: "Alias for id." },
        { name: "name", type: "TEXT", nullable: false, description: "Customer full display name." },
        { name: "customer_name", type: "TEXT", nullable: false, description: "Alias for name." },
        { name: "email", type: "TEXT", nullable: false, description: "Customer contact email." },
        { name: "city", type: "TEXT", nullable: true, description: "Customer residence city." },
        { name: "country", type: "TEXT", nullable: true, description: "Customer country." },
        { name: "segment", type: "TEXT", nullable: true, description: "Customer tier (Enterprise, SMB, Consumer)." },
      ],
    },
    {
      name: "orders",
      description: "Order transactions with date, total value, and fulfillment status.",
      columns: [
        { name: "id", type: "INTEGER", nullable: false, description: "Unique order identifier." },
        { name: "order_id", type: "INTEGER", nullable: false, description: "Alias for id." },
        { name: "customer_id", type: "INTEGER", nullable: false, description: "Foreign key referencing customers(id)." },
        { name: "order_date", type: "TEXT", nullable: false, description: "Order placement date in YYYY-MM-DD format." },
        { name: "amount", type: "REAL", nullable: false, description: "Total order dollar amount in USD." },
        { name: "status", type: "TEXT", nullable: false, description: "Order status (completed, pending, cancelled)." },
      ],
    },
    {
      name: "order_items",
      description: "Line item purchases linking orders to individual products with quantity and pricing.",
      columns: [
        { name: "id", type: "INTEGER", nullable: false, description: "Line item identifier." },
        { name: "order_id", type: "INTEGER", nullable: false, description: "Foreign key referencing orders(id)." },
        { name: "product_id", type: "INTEGER", nullable: false, description: "Foreign key referencing products(id)." },
        { name: "quantity", type: "INTEGER", nullable: false, description: "Number of units purchased." },
        { name: "unit_price", type: "REAL", nullable: false, description: "Unit price per item in USD." },
      ],
    },
    {
      name: "products",
      description: "Product inventory, category classifications, and pricing.",
      columns: [
        { name: "id", type: "INTEGER", nullable: false, description: "Unique product identifier." },
        { name: "product_id", type: "INTEGER", nullable: false, description: "Alias for id." },
        { name: "name", type: "TEXT", nullable: false, description: "Product commercial title." },
        { name: "product_name", type: "TEXT", nullable: false, description: "Alias for name." },
        { name: "category", type: "TEXT", nullable: true, description: "Product category grouping (Workspace, Stationery, Kitchen, Audio, Furniture, Accessories)." },
        { name: "price", type: "REAL", nullable: false, description: "Unit sale price in USD." },
        { name: "stock_quantity", type: "INTEGER", nullable: false, description: "Available stock inventory." },
      ],
    },
    {
      name: "patient_appointments",
      description: "Healthcare appointment records, physician assignments, and consultation fees.",
      columns: [
        { name: "id", type: "INTEGER", nullable: false, description: "Unique appointment record ID." },
        { name: "patient_name", type: "TEXT", nullable: false, description: "Patient full name." },
        { name: "doctor_name", type: "TEXT", nullable: false, description: "Attending physician name." },
        { name: "department", type: "TEXT", nullable: false, description: "Clinical department (Cardiology, Neurology, Pediatrics, Oncology, Orthopedics)." },
        { name: "appointment_date", type: "TEXT", nullable: false, description: "Date of consultation (YYYY-MM-DD)." },
        { name: "fee", type: "REAL", nullable: false, description: "Consultation charge in USD." },
        { name: "status", type: "TEXT", nullable: false, description: "Appointment status (Completed, Scheduled, Follow-up Required)." },
      ],
    },
    {
      name: "employees",
      description: "Employee and labour records with job roles, departments, salaries, and employment status (also accessible via 'labours', 'workers', 'staff').",
      columns: [
        { name: "id", type: "INTEGER", nullable: false, description: "Unique employee / labour identifier." },
        { name: "name", type: "TEXT", nullable: false, description: "Full name of the worker / employee." },
        { name: "role", type: "TEXT", nullable: false, description: "Job title / role (e.g. Senior Tech, Lead Laborer, Maintenance Specialist)." },
        { name: "department", type: "TEXT", nullable: false, description: "Department (Operations, Clinical Tech, Maintenance, Logistics, Laboratory, Facilities)." },
        { name: "salary", type: "REAL", nullable: false, description: "Annual base salary in USD." },
        { name: "hourly_rate", type: "REAL", nullable: false, description: "Standard hourly wage rate in USD." },
        { name: "hire_date", type: "TEXT", nullable: false, description: "Hire date in YYYY-MM-DD format." },
        { name: "status", type: "TEXT", nullable: false, description: "Employment status (Active, Full-Time, Contract, Part-Time)." },
      ],
    },
  ],
  relationships: [
    { from_table: "orders", from_column: "customer_id", to_table: "customers", to_column: "id" },
    { from_table: "order_items", from_column: "order_id", to_table: "orders", to_column: "id" },
    { from_table: "order_items", from_column: "product_id", to_table: "products", to_column: "id" },
  ],
  row_count: 0,
};

const SQL = await initSqlJs();

function initDatabase(): Database {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new SQL.Database();

  database.run(`
    PRAGMA foreign_keys = ON;
    DROP VIEW IF EXISTS staff;
    DROP VIEW IF EXISTS workers;
    DROP VIEW IF EXISTS labours;
    DROP TABLE IF EXISTS order_items;
    DROP TABLE IF EXISTS employees;
    DROP TABLE IF EXISTS patient_appointments;
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS customers;

    CREATE TABLE customers (
      id INTEGER PRIMARY KEY,
      customer_id INTEGER GENERATED ALWAYS AS (id) VIRTUAL,
      name TEXT NOT NULL,
      customer_name TEXT GENERATED ALWAYS AS (name) VIRTUAL,
      email TEXT NOT NULL,
      city TEXT,
      country TEXT,
      segment TEXT
    );

    CREATE TABLE products (
      id INTEGER PRIMARY KEY,
      product_id INTEGER GENERATED ALWAYS AS (id) VIRTUAL,
      name TEXT NOT NULL,
      product_name TEXT GENERATED ALWAYS AS (name) VIRTUAL,
      category TEXT,
      price REAL NOT NULL,
      stock_quantity INTEGER NOT NULL
    );

    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      order_id INTEGER GENERATED ALWAYS AS (id) VIRTUAL,
      customer_id INTEGER NOT NULL,
      order_date TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL COLLATE NOCASE,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE patient_appointments (
      id INTEGER PRIMARY KEY,
      patient_name TEXT NOT NULL,
      doctor_name TEXT NOT NULL,
      department TEXT NOT NULL,
      appointment_date TEXT NOT NULL,
      fee REAL NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE employees (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT NOT NULL,
      salary REAL NOT NULL,
      hourly_rate REAL NOT NULL,
      hire_date TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE VIEW labours AS SELECT * FROM employees;
    CREATE VIEW workers AS SELECT * FROM employees;
    CREATE VIEW staff AS SELECT * FROM employees;
  `);

  // Seed Customers
  const insertCustomer = database.prepare("INSERT INTO customers (id, name, email, city, country, segment) VALUES (?, ?, ?, ?, ?, ?)");
  [
    [1, "Maya Patel", "maya.patel@example.com", "Austin", "United States", "Enterprise"],
    [2, "Jon Bell", "jon.bell@example.co.uk", "London", "United Kingdom", "SMB"],
    [3, "Sofia Rossi", "sofia.rossi@example.it", "Milan", "Italy", "Consumer"],
    [4, "Daniel Kim", "daniel.kim@example.com", "Austin", "United States", "Enterprise"],
    [5, "Amara Okafor", "amara.okafor@example.ng", "Lagos", "Nigeria", "SMB"],
    [6, "Leo Nguyen", "leo.nguyen@example.ca", "Toronto", "Canada", "Consumer"],
    [7, "Elena Vance", "elena.vance@example.de", "Berlin", "Germany", "Enterprise"],
    [8, "Marcus Thorne", "marcus.thorne@example.com", "San Francisco", "United States", "Enterprise"],
    [9, "Ananya Rao", "ananya.rao@example.in", "Bengaluru", "India", "SMB"],
    [10, "Gabriel Silva", "gabriel.silva@example.br", "São Paulo", "Brazil", "Consumer"],
  ].forEach((c) => insertCustomer.run(c));
  insertCustomer.free();

  // Seed Products
  const insertProduct = database.prepare("INSERT INTO products (id, name, category, price, stock_quantity) VALUES (?, ?, ?, ?, ?)");
  [
    [1, "Atlas Desk Lamp", "Workspace", 129.0, 45],
    [2, "Field Notes Set", "Stationery", 24.0, 180],
    [3, "Arc Monitor Stand", "Workspace", 189.0, 32],
    [4, "Moss Ceramic Mug", "Kitchen", 38.5, 95],
    [5, "Daily Planner", "Stationery", 42.0, 110],
    [6, "Wave Headphones", "Audio", 149.0, 60],
    [7, "Cloud Keyboard", "Workspace", 112.0, 40],
    [8, "Canvas Tote", "Accessories", 58.0, 150],
    [9, "Pro Ergonomic Chair", "Furniture", 480.0, 18],
    [10, "Noise Cancelling Pods", "Audio", 219.0, 75],
  ].forEach((p) => insertProduct.run(p));
  insertProduct.free();

  // Seed Orders
  const insertOrder = database.prepare("INSERT INTO orders (id, customer_id, order_date, amount, status) VALUES (?, ?, ?, ?, ?)");
  [
    [1001, 1, "2025-01-14", 540.0, "completed"],
    [1002, 1, "2025-02-08", 285.5, "completed"],
    [1003, 1, "2025-03-21", 425.0, "completed"],
    [1004, 1, "2025-04-10", 630.0, "completed"],
    [1005, 1, "2025-05-15", 380.0, "completed"],
    [1006, 1, "2025-06-20", 720.0, "completed"],
    [1007, 2, "2025-01-20", 780.25, "completed"],
    [1008, 2, "2025-02-14", 450.0, "completed"],
    [1009, 2, "2025-03-18", 510.0, "completed"],
    [1010, 2, "2025-04-03", 190.0, "completed"],
    [1011, 2, "2025-05-22", 600.0, "completed"],
    [1012, 3, "2025-02-12", 1190.0, "completed"],
    [1013, 3, "2025-03-01", 340.0, "completed"],
    [1014, 3, "2025-04-11", 520.0, "completed"],
    [1015, 3, "2025-05-18", 345.75, "pending"],
    [1016, 4, "2025-01-05", 810.0, "completed"],
    [1017, 4, "2025-02-19", 640.0, "completed"],
    [1018, 4, "2025-03-04", 920.0, "completed"],
    [1019, 4, "2025-04-15", 430.0, "completed"],
    [1020, 4, "2025-05-29", 210.0, "completed"],
    [1021, 4, "2025-06-11", 605.0, "completed"],
    [1022, 5, "2025-02-26", 460.5, "completed"],
    [1023, 6, "2025-04-17", 875.0, "completed"],
    [1024, 7, "2025-01-09", 1450.0, "completed"],
    [1025, 7, "2025-02-15", 890.0, "completed"],
    [1026, 7, "2025-03-15", 980.0, "completed"],
    [1027, 7, "2025-04-20", 1120.0, "completed"],
    [1028, 7, "2025-05-12", 740.0, "completed"],
    [1029, 8, "2025-01-18", 1200.0, "completed"],
    [1030, 8, "2025-02-24", 950.0, "completed"],
    [1031, 8, "2025-03-30", 1400.0, "completed"],
    [1032, 8, "2025-05-02", 2300.0, "completed"],
    [1033, 8, "2025-06-18", 1750.0, "completed"],
    [1034, 8, "2025-07-22", 890.0, "completed"],
    [1035, 9, "2025-04-22", 640.0, "completed"],
    [1036, 10, "2025-06-01", 310.0, "pending"],
  ].forEach((o) => insertOrder.run(o));
  insertOrder.free();

  // Seed Order Items
  const insertItem = database.prepare("INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)");
  [
    // Customer 1 (Maya Patel - Workspace, Stationery)
    [1, 1001, 1, 2, 129.0],
    [2, 1001, 2, 5, 24.0],
    [3, 1002, 3, 1, 189.0],
    [4, 1003, 1, 3, 129.0],
    [5, 1004, 7, 4, 112.0],
    [6, 1005, 3, 2, 189.0],
    [7, 1006, 1, 4, 129.0],

    // Customer 2 (Jon Bell - Audio, Stationery)
    [8, 1007, 6, 3, 149.0],
    [9, 1008, 10, 2, 219.0],
    [10, 1009, 2, 10, 24.0],
    [11, 1010, 5, 4, 42.0],
    [12, 1011, 6, 4, 149.0],

    // Customer 3 (Sofia Rossi - Kitchen, Furniture)
    [13, 1012, 9, 2, 480.0],
    [14, 1013, 4, 8, 38.5],
    [15, 1014, 8, 8, 58.0],

    // Customer 4 (Daniel Kim - Workspace, Audio)
    [16, 1016, 1, 4, 129.0],
    [17, 1017, 3, 3, 189.0],
    [18, 1018, 7, 6, 112.0],
    [19, 1019, 1, 3, 129.0],
    [20, 1020, 3, 1, 189.0],
    [21, 1021, 7, 5, 112.0],

    // Customer 7 (Elena Vance - Workspace, Furniture)
    [22, 1024, 9, 3, 480.0],
    [23, 1025, 1, 6, 129.0],
    [24, 1026, 3, 5, 189.0],
    [25, 1027, 7, 8, 112.0],
    [26, 1028, 1, 5, 129.0],

    // Customer 8 (Marcus Thorne - Workspace, Audio, Furniture)
    [27, 1029, 9, 2, 480.0],
    [28, 1030, 6, 6, 149.0],
    [29, 1031, 10, 6, 219.0],
    [30, 1032, 1, 10, 129.0],
    [31, 1033, 3, 8, 189.0],
    [32, 1034, 7, 7, 112.0],

    // Other items
    [33, 1022, 4, 10, 38.5],
    [34, 1023, 6, 5, 149.0],
    [35, 1035, 8, 10, 58.0],
    [36, 1036, 5, 7, 42.0],
  ].forEach((item) => insertItem.run(item));
  insertItem.free();

  // Seed Patient Appointments
  const insertAppointment = database.prepare("INSERT INTO patient_appointments (id, patient_name, doctor_name, department, appointment_date, fee, status) VALUES (?, ?, ?, ?, ?, ?, ?)");
  [
    [1, "Claire Redfield", "Dr. Robert Vance", "Cardiology", "2025-05-10", 250.0, "Completed"],
    [2, "Arthur Pendelton", "Dr. Sarah Chen", "Neurology", "2025-05-11", 320.0, "Completed"],
    [3, "Grace Hopper", "Dr. Michael Adams", "Pediatrics", "2025-05-12", 180.0, "Completed"],
    [4, "David Sterling", "Dr. Robert Vance", "Cardiology", "2025-05-14", 250.0, "Completed"],
    [5, "Samantha Reed", "Dr. Emily Taylor", "Oncology", "2025-05-15", 450.0, "Follow-up Required"],
    [6, "Lucas Meyer", "Dr. Sarah Chen", "Neurology", "2025-05-18", 320.0, "Completed"],
    [7, "Hanna Zimmerman", "Dr. James Wilson", "Orthopedics", "2025-05-20", 290.0, "Completed"],
    [8, "Victor Alvarez", "Dr. Robert Vance", "Cardiology", "2025-05-22", 250.0, "Scheduled"],
    [9, "Zoe Washington", "Dr. Emily Taylor", "Oncology", "2025-05-25", 450.0, "Completed"],
    [10, "Liam O'Connor", "Dr. James Wilson", "Orthopedics", "2025-05-28", 290.0, "Completed"],
  ].forEach((a) => insertAppointment.run(a));
  insertAppointment.free();

  // Seed Employees / Labours / Staff
  const insertEmployee = database.prepare("INSERT INTO employees (id, name, role, department, salary, hourly_rate, hire_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  [
    [1, "Robert Jenkins", "Lead Operations Engineer", "Operations", 98000.0, 48.50, "2020-03-15", "Active"],
    [2, "Maria Hernandez", "Senior Biomedical Specialist", "Clinical Tech", 94500.0, 46.00, "2021-06-10", "Active"],
    [3, "David Kim", "Maintenance Supervisor", "Maintenance", 89000.0, 43.50, "2019-11-20", "Active"],
    [4, "Sarah Patel", "Senior Lab Systems Tech", "Laboratory", 85000.0, 41.00, "2022-01-14", "Active"],
    [5, "James Wilson", "Logistics & Supply Director", "Logistics", 81000.0, 39.00, "2020-08-25", "Active"],
    [6, "Elena Rostova", "Floor Safety Lead", "Operations", 76500.0, 37.00, "2021-04-05", "Active"],
    [7, "Marcus Chen", "HVAC Lead Specialist", "Facilities", 72000.0, 35.00, "2022-09-18", "Active"],
    [8, "Chloe Bennett", "Sterilization Technician", "Clinical Tech", 68500.0, 33.00, "2023-02-11", "Active"],
    [9, "Anthony Taylor", "Instrumentation Technician", "Maintenance", 65000.0, 31.50, "2021-10-30", "Active"],
    [10, "Nina Morales", "Machine Operator Lead", "Operations", 61000.0, 29.50, "2022-05-19", "Active"],
    [11, "Siddharth Rao", "Facilities Electrician", "Facilities", 57500.0, 28.00, "2023-01-08", "Active"],
    [12, "Amina Diallo", "Pharmacy Technical Assistant", "Laboratory", 54000.0, 26.00, "2022-11-15", "Active"],
    [13, "Carlos Gomez", "Warehouse Laborer Specialist", "Logistics", 51000.0, 24.50, "2023-03-22", "Active"],
    [14, "Hannah Schmidt", "Medical Equipment Technician", "Clinical Tech", 48000.0, 23.00, "2023-07-14", "Active"],
    [15, "Samuel Jackson", "Field Service Worker", "Maintenance", 44000.0, 21.00, "2024-01-10", "Active"],
  ].forEach((e) => insertEmployee.run(e));
  insertEmployee.free();

  const data = database.export();
  writeFileSync(databasePath, Buffer.from(data));
  return database;
}

const db = initDatabase();

export function getSchema(): DatabaseSchema {
  let totalCount = 0;
  for (const table of schema.tables) {
    try {
      const res = db.exec(`SELECT COUNT(*) FROM "${table.name}"`);
      if (res.length > 0 && res[0].values.length > 0) {
        totalCount += Number(res[0].values[0][0]) || 0;
      }
    } catch {
      // ignore
    }
  }
  return { ...schema, row_count: totalCount };
}

export type QueryResult = {
  columns: string[];
  rows: unknown[][];
};

export function executeReadOnlyQuery(sql: string): QueryResult {
  const result = db.exec(sql);
  if (result.length === 0) {
    return { columns: [], rows: [] };
  }
  const lastSet = result[result.length - 1];
  return {
    columns: lastSet.columns,
    rows: lastSet.values,
  };
}

export type SuggestedQuery = {
  name: string;
  sql: string;
  question: string;
  category: "preview" | "summary" | "aggregation" | "analysis";
};

export type CsvImportResult = {
  tableName: string;
  rowCount: number;
  columns: SchemaColumn[];
  sampleRows: (string | number | null)[][];
  suggestedQueries: SuggestedQuery[];
};

export function parseCsv(csvText: string): { headers: string[]; rows: (string | number | null)[][] } {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = "";
  let insideQuotes = false;

  const text = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentVal += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = "";
    } else if (char === "\n" && !insideQuotes) {
      currentRow.push(currentVal.trim());
      if (currentRow.some((c) => c.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentVal = "";
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
    throw new Error("The uploaded CSV file is empty.");
  }

  const rawHeaders = lines[0];
  const dataRows = lines.slice(1);

  if (dataRows.length === 0) {
    throw new Error("The CSV file contains header columns but no data rows.");
  }

  // Clean and unique column headers
  const headers: string[] = [];
  const used = new Set<string>();

  for (let idx = 0; idx < rawHeaders.length; idx++) {
    let h = (rawHeaders[idx] || `col_${idx + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!h || /^\d/.test(h)) {
      h = `col_${h || idx + 1}`;
    }
    let base = h;
    let counter = 1;
    while (used.has(h)) {
      h = `${base}_${counter++}`;
    }
    used.add(h);
    headers.push(h);
  }

  const rows = dataRows.map((r) => {
    return headers.map((_, colIdx) => {
      const val = r[colIdx];
      if (val === undefined || val === null || val === "") return null;
      return val;
    });
  });

  return { headers, rows };
}

function sanitizeTableName(name: string): string {
  let clean = name
    .toLowerCase()
    .replace(/\.csv$/i, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!clean || /^\d/.test(clean)) {
    clean = `table_${clean || "dataset"}`;
  }
  return clean.slice(0, 48);
}

export function importCsvTable(params: {
  tableName: string;
  csvContent?: string;
  columns?: { name: string; type: string }[];
  rows?: (string | number | null)[][];
  description?: string;
}): CsvImportResult {
  let headers: string[] = [];
  let rows: (string | number | null)[][] = [];

  if (params.csvContent) {
    const parsed = parseCsv(params.csvContent);
    headers = parsed.headers;
    rows = parsed.rows;
  } else if (params.columns && params.rows) {
    headers = params.columns.map((c) => c.name);
    rows = params.rows;
  } else {
    throw new Error("Missing CSV content or rows data for table import.");
  }

  const tableName = sanitizeTableName(params.tableName || "imported_dataset");

  // Determine or validate column types
  const schemaColumns: SchemaColumn[] = headers.map((name, colIdx) => {
    // If user explicitly provided column type
    const explicitType = params.columns?.find((c) => c.name.toLowerCase() === name.toLowerCase())?.type?.toUpperCase();
    if (explicitType === "INTEGER" || explicitType === "REAL" || explicitType === "TEXT") {
      return {
        name,
        type: explicitType,
        nullable: true,
        description: `${explicitType} column`,
      };
    }

    // Auto-infer type
    let allInteger = true;
    let allReal = true;
    let nonNullCount = 0;

    for (const row of rows) {
      const val = row[colIdx];
      if (val === null || val === undefined || val === "") continue;
      nonNullCount++;
      const strVal = String(val).trim();
      if (!/^-?\d+$/.test(strVal)) {
        allInteger = false;
      }
      if (!/^-?\d+(\.\d+)?$/.test(strVal)) {
        allReal = false;
      }
    }

    let type = "TEXT";
    if (nonNullCount > 0) {
      if (allInteger) type = "INTEGER";
      else if (allReal) type = "REAL";
    }

    return {
      name,
      type,
      nullable: true,
      description: `${type} column from CSV import (${nonNullCount} values)`,
    };
  });

  // Convert row values to proper types for SQLite binding
  const typedRows = rows.map((row) => {
    return schemaColumns.map((col, idx) => {
      const val = row[idx];
      if (val === null || val === undefined || val === "") return null;
      if (col.type === "INTEGER") {
        const num = parseInt(String(val), 10);
        return isNaN(num) ? null : num;
      }
      if (col.type === "REAL") {
        const flt = parseFloat(String(val));
        return isNaN(flt) ? null : flt;
      }
      return String(val);
    });
  });

  // Create SQLite table
  const colDefs = schemaColumns.map((c) => `"${c.name}" ${c.type}`).join(", ");
  db.run(`DROP TABLE IF EXISTS "${tableName}";`);
  db.run(`CREATE TABLE "${tableName}" (${colDefs});`);

  // Insert data rows in batch transaction
  if (typedRows.length > 0) {
    const placeholders = schemaColumns.map(() => "?").join(", ");
    const insertSql = `INSERT INTO "${tableName}" VALUES (${placeholders});`;
    const stmt = db.prepare(insertSql);
    db.run("BEGIN TRANSACTION;");
    try {
      for (const row of typedRows) {
        stmt.run(row as (string | number | null)[]);
      }
      db.run("COMMIT;");
    } catch (e) {
      db.run("ROLLBACK;");
      stmt.free();
      throw e;
    }
    stmt.free();
  }

  // Update schema in memory
  schema.tables = schema.tables.filter((t) => t.name !== tableName);
  schema.tables.push({
    name: tableName,
    description:
      params.description ||
      `User imported CSV table containing ${typedRows.length} rows and ${schemaColumns.length} columns.`,
    columns: schemaColumns,
  });

  // Persist updated database
  try {
    const exported = db.export();
    writeFileSync(databasePath, Buffer.from(exported));
  } catch (err) {
    console.warn("Could not persist database to disk:", err);
  }

  // Generate Suggested Queries tailored to this imported table
  const suggestedQueries: SuggestedQuery[] = [];

  // Query 1: Basic Preview
  suggestedQueries.push({
    name: "📋 View Top 25 Records",
    sql: `SELECT * FROM "${tableName}" LIMIT 25;`,
    question: `Show first 25 records from ${tableName}`,
    category: "preview",
  });

  // Query 2: Total Count
  suggestedQueries.push({
    name: "🔢 Total Rows Count",
    sql: `SELECT COUNT(*) AS total_records FROM "${tableName}";`,
    question: `How many records are in ${tableName}?`,
    category: "summary",
  });

  // Find categorical (TEXT) columns
  const textCols = schemaColumns.filter((c) => c.type === "TEXT" && !c.name.endsWith("_id"));
  if (textCols.length > 0) {
    const catCol = textCols[0].name;
    suggestedQueries.push({
      name: `📊 Group & Count by ${catCol}`,
      sql: `SELECT "${catCol}", COUNT(*) AS record_count\nFROM "${tableName}"\nWHERE "${catCol}" IS NOT NULL\nGROUP BY "${catCol}"\nORDER BY record_count DESC\nLIMIT 10;`,
      question: `Show distribution by ${catCol} in ${tableName}`,
      category: "aggregation",
    });
  }

  // Find numeric (INTEGER/REAL) columns
  const numCols = schemaColumns.filter(
    (c) => (c.type === "REAL" || c.type === "INTEGER") && !c.name.toLowerCase().includes("id")
  );
  if (numCols.length > 0) {
    const numCol = numCols[0].name;
    suggestedQueries.push({
      name: `📈 Summary Stats for ${numCol}`,
      sql: `SELECT\n    ROUND(AVG("${numCol}"), 2) AS avg_${numCol},\n    MAX("${numCol}") AS max_${numCol},\n    MIN("${numCol}") AS min_${numCol},\n    ROUND(SUM("${numCol}"), 2) AS sum_${numCol}\nFROM "${tableName}";`,
      question: `Calculate average, maximum, and total for ${numCol} in ${tableName}`,
      category: "analysis",
    });

    if (textCols.length > 0) {
      const catCol = textCols[0].name;
      suggestedQueries.push({
        name: `💡 Top ${catCol} by Average ${numCol}`,
        sql: `SELECT\n    "${catCol}",\n    COUNT(*) AS total_count,\n    ROUND(AVG("${numCol}"), 2) AS avg_${numCol}\nFROM "${tableName}"\nGROUP BY "${catCol}"\nORDER BY avg_${numCol} DESC\nLIMIT 10;`,
        question: `Find top ${catCol} by average ${numCol} in ${tableName}`,
        category: "analysis",
      });
    }
  }

  return {
    tableName,
    rowCount: typedRows.length,
    columns: schemaColumns,
    sampleRows: typedRows.slice(0, 5),
    suggestedQueries,
  };
}

export function deleteCustomTable(tableName: string): boolean {
  const clean = sanitizeTableName(tableName);
  const baseTables = ["customers", "orders", "order_items", "products", "patient_appointments", "employees"];
  if (baseTables.includes(clean)) {
    throw new Error(`Cannot delete default system table '${clean}'.`);
  }
  db.run(`DROP TABLE IF EXISTS "${clean}";`);
  schema.tables = schema.tables.filter((t) => t.name !== clean);
  try {
    const exported = db.export();
    writeFileSync(databasePath, Buffer.from(exported));
  } catch {}
  return true;
}

