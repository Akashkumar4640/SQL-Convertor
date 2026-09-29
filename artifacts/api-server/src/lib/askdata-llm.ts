import { getSchema } from "./askdata-database";
import { cleanGeneratedSql, validateReadOnlySql } from "./askdata-sql";
import { callGemini, type GeminiMessage } from "./gemini";

export type SqlGeneration = {
  sql: string;
  explanation: string;
  breakdown?: {
    tablesUsed: string[];
    operations: string[];
    description: string;
  };
};

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ChatResponse = {
  message: string;
  suggestedSql?: string;
  explanation?: string;
  suggestedQuestions: string[];
};

type PatternRule = {
  name: string;
  matches: string[][];
  sql: string;
  explanation: string;
  tablesUsed: string[];
  operations: string[];
};

const rules: PatternRule[] = [
  // 0. Product Category Spending & Customer Ranking (CTEs and Window Functions)
  {
    name: "top_customers_by_category_spending",
    matches: [
      ["category", "top", "customer"],
      ["category", "spending", "customer"],
      ["category", "spent", "customer"],
      ["product category", "customer"],
      ["category", "rank", "customer"],
      ["each product category", "top 3"],
      ["product category", "top 3"],
      ["product category", "spending"],
      ["category", "total amount spent"],
    ],
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
    explanation: "I used CTEs (Common Table Expressions) and the window function DENSE_RANK() partitioned by product category to calculate each customer's total spending in 2025 and rank the top 3 customers per category.",
    tablesUsed: ["customers", "orders", "order_items", "products"],
    operations: ["WITH (CTE)", "JOIN", "SUM()", "GROUP BY", "DENSE_RANK() OVER (PARTITION BY)", "WHERE customer_rank <= 3", "ORDER BY"],
  },

  // 1. Labours, Employees & Salary Management
  {
    name: "top_labours_salary",
    matches: [
      ["labour", "salary"],
      ["labours", "salary"],
      ["labor", "salary"],
      ["top", "labour"],
      ["top", "labours"],
      ["max", "labour"],
      ["maximum", "salary", "labour"],
      ["maxmium", "salary", "labour"],
      ["highest", "salary", "labour"],
      ["highest", "salary", "employee"],
      ["top", "salary"],
      ["highest", "salary"],
      ["highest", "paid"],
      ["top", "10", "labour"],
      ["10", "labour"],
    ],
    sql: `SELECT id, name, role, department, salary, hourly_rate
FROM employees
ORDER BY salary DESC
LIMIT 10;`,
    explanation: "I retrieved the top 10 labours/employees ordered by their annual salary in descending order, showing their name, role, department, salary, and hourly wage.",
    tablesUsed: ["employees"],
    operations: ["SELECT", "ORDER BY salary DESC", "LIMIT 10"],
  },
  {
    name: "labours_avg_salary_dept",
    matches: [
      ["average", "salary"],
      ["avg", "salary"],
      ["salary", "department"],
      ["department", "salary"],
      ["mean", "salary"],
    ],
    sql: `SELECT department, COUNT(id) AS total_labours, ROUND(AVG(salary), 2) AS avg_salary, MAX(salary) AS max_salary, MIN(salary) AS min_salary
FROM employees
GROUP BY department
ORDER BY avg_salary DESC;`,
    explanation: "I grouped employees/labours by department to calculate average salary, maximum salary, minimum salary, and total head count per department.",
    tablesUsed: ["employees"],
    operations: ["GROUP BY department", "COUNT()", "AVG()", "MAX()", "MIN()", "ORDER BY DESC"],
  },
  {
    name: "all_labours",
    matches: [
      ["list", "labour"],
      ["all", "labour"],
      ["show", "labour"],
      ["list", "employee"],
      ["all", "employee"],
      ["show", "employee"],
      ["all", "worker"],
      ["list", "staff"],
    ],
    sql: `SELECT id, name, role, department, salary, hourly_rate, hire_date, status
FROM employees
ORDER BY salary DESC;`,
    explanation: "I retrieved all employee and labour records sorted from highest to lowest salary.",
    tablesUsed: ["employees"],
    operations: ["SELECT", "ORDER BY salary DESC"],
  },
  {
    name: "hourly_wages",
    matches: [
      ["hourly", "rate"],
      ["hourly", "wage"],
      ["hourly", "pay"],
    ],
    sql: `SELECT id, name, role, department, hourly_rate, salary
FROM employees
ORDER BY hourly_rate DESC
LIMIT 10;`,
    explanation: "I queried labours and employees sorted by their hourly wage rate in descending order.",
    tablesUsed: ["employees"],
    operations: ["SELECT", "ORDER BY hourly_rate DESC", "LIMIT 10"],
  },

  // 2. Revenue & Sales Performance
  {
    name: "top_customers_revenue",
    matches: [
      ["top", "customer"],
      ["customer", "revenue"],
      ["highest", "spending"],
      ["highest", "spender"],
      ["best", "customer"],
    ],
    sql: `SELECT c.name, c.email, c.city, ROUND(SUM(o.amount), 2) AS total_revenue, COUNT(o.id) AS total_orders
FROM customers c
JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.name, c.email, c.city
ORDER BY total_revenue DESC
LIMIT 5;`,
    explanation: "I joined the customers and orders tables on customer_id, calculated the sum of order amounts and order counts per customer, and ordered them in descending order to find the highest value customers.",
    tablesUsed: ["customers", "orders"],
    operations: ["INNER JOIN", "SUM()", "COUNT()", "GROUP BY", "ORDER BY DESC", "LIMIT 5"],
  },
  {
    name: "monthly_revenue",
    matches: [
      ["monthly", "revenue"],
      ["revenue", "month"],
      ["sales", "month"],
      ["trend", "revenue"],
    ],
    sql: `SELECT strftime('%Y-%m', order_date) AS order_month, COUNT(id) AS total_orders, ROUND(SUM(amount), 2) AS monthly_revenue, ROUND(AVG(amount), 2) AS avg_order_value
FROM orders
GROUP BY order_month
ORDER BY order_month ASC;`,
    explanation: "I extracted the year and month using SQLite's strftime function, grouped all orders by month, and calculated monthly revenue, order volume, and average order value.",
    tablesUsed: ["orders"],
    operations: ["strftime()", "SUM()", "AVG()", "COUNT()", "GROUP BY", "ORDER BY ASC"],
  },
  {
    name: "average_order_value",
    matches: [
      ["average", "order"],
      ["aov"],
      ["avg", "order"],
    ],
    sql: `SELECT ROUND(AVG(amount), 2) AS average_order_value, ROUND(MIN(amount), 2) AS min_order, ROUND(MAX(amount), 2) AS max_order, COUNT(*) AS total_orders
FROM orders;`,
    explanation: "I calculated the overall average, minimum, maximum, and total count of orders to measure transaction value distribution.",
    tablesUsed: ["orders"],
    operations: ["AVG()", "MIN()", "MAX()", "COUNT()", "ROUND()"],
  },
  {
    name: "orders_by_city",
    matches: [
      ["order", "city"],
      ["city", "order"],
      ["cities", "revenue"],
    ],
    sql: `SELECT c.city, c.country, COUNT(o.id) AS order_count, ROUND(SUM(o.amount), 2) AS city_revenue
FROM customers c
JOIN orders o ON o.customer_id = c.id
GROUP BY c.city, c.country
ORDER BY city_revenue DESC;`,
    explanation: "I aggregated orders and total sales by customer city and country to see geographic sales distribution.",
    tablesUsed: ["customers", "orders"],
    operations: ["JOIN", "COUNT()", "SUM()", "GROUP BY", "ORDER BY DESC"],
  },
  {
    name: "order_status_breakdown",
    matches: [
      ["order", "status"],
      ["pending", "completed"],
      ["fulfillment"],
    ],
    sql: `SELECT status, COUNT(id) AS order_count, ROUND(SUM(amount), 2) AS total_amount, ROUND(AVG(amount), 2) AS avg_amount
FROM orders
GROUP BY status
ORDER BY order_count DESC;`,
    explanation: "I grouped orders by their status (Completed, Pending, Cancelled) to monitor order pipeline and completion metrics.",
    tablesUsed: ["orders"],
    operations: ["GROUP BY status", "COUNT()", "SUM()", "AVG()"],
  },

  // 3. Customer Segmentation & Analytics
  {
    name: "customer_segments",
    matches: [
      ["segment"],
      ["enterprise", "smb"],
      ["tier"],
    ],
    sql: `SELECT c.segment, COUNT(DISTINCT c.id) AS customer_count, COUNT(o.id) AS total_orders, ROUND(SUM(o.amount), 2) AS segment_revenue
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.segment
ORDER BY segment_revenue DESC;`,
    explanation: "I grouped customers by their account tier (Enterprise, SMB, Consumer) and calculated total revenue and order volume per segment.",
    tablesUsed: ["customers", "orders"],
    operations: ["LEFT JOIN", "COUNT(DISTINCT)", "SUM()", "GROUP BY"],
  },
  {
    name: "inactive_customers",
    matches: [
      ["no order"],
      ["without order"],
      ["inactive", "customer"],
      ["zero order"],
    ],
    sql: `SELECT c.id, c.name, c.email, c.city, c.country, c.segment
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;`,
    explanation: "I performed a LEFT JOIN from customers to orders and filtered for rows where the order ID is NULL, identifying customers who haven't placed an order.",
    tablesUsed: ["customers", "orders"],
    operations: ["LEFT JOIN", "WHERE IS NULL"],
  },
  {
    name: "customers_by_country",
    matches: [
      ["customer", "country"],
      ["country", "customer"],
      ["demographics"],
    ],
    sql: `SELECT country, COUNT(id) AS customer_count
FROM customers
GROUP BY country
ORDER BY customer_count DESC;`,
    explanation: "I grouped customers by their country to analyze geographic distribution.",
    tablesUsed: ["customers"],
    operations: ["GROUP BY country", "COUNT()", "ORDER BY DESC"],
  },
  {
    name: "list_customers",
    matches: [
      ["list", "customer"],
      ["all", "customer"],
      ["show", "customer"],
    ],
    sql: `SELECT id, name, email, city, country, segment FROM customers ORDER BY name ASC;`,
    explanation: "I listed all registered customers alphabetically by name with their contact and segment details.",
    tablesUsed: ["customers"],
    operations: ["SELECT", "ORDER BY name ASC"],
  },

  // 4. Products & Inventory Management
  {
    name: "low_stock_products",
    matches: [
      ["low stock"],
      ["inventory", "alert"],
      ["out of stock"],
      ["stock", "low"],
      ["stock", "reorder"],
    ],
    sql: `SELECT id, name, category, price, stock_quantity
FROM products
WHERE stock_quantity < 50
ORDER BY stock_quantity ASC;`,
    explanation: "I filtered products where current inventory is under 50 units, sorted from lowest to highest stock for reorder prioritization.",
    tablesUsed: ["products"],
    operations: ["WHERE stock_quantity < 50", "ORDER BY stock_quantity ASC"],
  },
  {
    name: "products_by_category",
    matches: [
      ["product", "category"],
      ["category", "product"],
      ["categories"],
    ],
    sql: `SELECT category, COUNT(id) AS product_count, ROUND(AVG(price), 2) AS avg_price, SUM(stock_quantity) AS total_inventory
FROM products
GROUP BY category
ORDER BY product_count DESC;`,
    explanation: "I grouped products by catalog category, calculating item count, average unit price, and total units in inventory.",
    tablesUsed: ["products"],
    operations: ["GROUP BY category", "COUNT()", "AVG()", "SUM()"],
  },
  {
    name: "expensive_products",
    matches: [
      ["expensive", "product"],
      ["highest", "price"],
      ["cost", "more"],
      ["price", "above"],
      ["top", "price"],
    ],
    sql: `SELECT id, name, category, price, stock_quantity
FROM products
WHERE price > 100
ORDER BY price DESC;`,
    explanation: "I retrieved catalog products priced above $100, ordered from most to least expensive.",
    tablesUsed: ["products"],
    operations: ["WHERE price > 100", "ORDER BY price DESC"],
  },
  {
    name: "all_products",
    matches: [
      ["list", "product"],
      ["all", "product"],
      ["show", "product"],
      ["catalog"],
    ],
    sql: `SELECT id, name, category, price, stock_quantity FROM products ORDER BY price DESC;`,
    explanation: "I retrieved the entire product catalog sorted by price.",
    tablesUsed: ["products"],
    operations: ["SELECT", "ORDER BY price DESC"],
  },

  // 5. Healthcare & Patient Consultations
  {
    name: "doctor_workload",
    matches: [
      ["doctor"],
      ["physician"],
      ["workload"],
      ["doctor", "appointment"],
    ],
    sql: `SELECT doctor_name, department, COUNT(id) AS appointment_count, ROUND(SUM(fee), 2) AS total_billed
FROM patient_appointments
GROUP BY doctor_name, department
ORDER BY appointment_count DESC;`,
    explanation: "I grouped patient consultations by physician and clinical specialty, tallying patient count and billing totals.",
    tablesUsed: ["patient_appointments"],
    operations: ["GROUP BY doctor_name, department", "COUNT()", "SUM()", "ORDER BY DESC"],
  },
  {
    name: "department_appointments",
    matches: [
      ["department"],
      ["specialty"],
      ["cardiology"],
      ["neurology"],
      ["pediatrics"],
    ],
    sql: `SELECT department, COUNT(id) AS total_appointments, ROUND(AVG(fee), 2) AS avg_consultation_fee, ROUND(SUM(fee), 2) AS total_revenue
FROM patient_appointments
GROUP BY department
ORDER BY total_appointments DESC;`,
    explanation: "I aggregated appointment volume, average fee, and total department revenue across all medical divisions.",
    tablesUsed: ["patient_appointments"],
    operations: ["GROUP BY department", "COUNT()", "AVG()", "SUM()"],
  },
  {
    name: "patient_appointment_status",
    matches: [
      ["patient", "status"],
      ["appointment", "status"],
      ["follow-up"],
      ["scheduled"],
    ],
    sql: `SELECT status, COUNT(id) AS patient_count, ROUND(SUM(fee), 2) AS expected_fee
FROM patient_appointments
GROUP BY status
ORDER BY patient_count DESC;`,
    explanation: "I broke down appointments by their clinical status (Completed, Scheduled, Follow-up Required).",
    tablesUsed: ["patient_appointments"],
    operations: ["GROUP BY status", "COUNT()", "SUM()"],
  },
  {
    name: "all_appointments",
    matches: [
      ["appointment"],
      ["patient"],
      ["consultation"],
    ],
    sql: `SELECT id, patient_name, doctor_name, department, appointment_date, fee, status
FROM patient_appointments
ORDER BY appointment_date DESC;`,
    explanation: "I retrieved patient appointment records sorted with the most recent consultations first.",
    tablesUsed: ["patient_appointments"],
    operations: ["SELECT", "ORDER BY appointment_date DESC"],
  },
];

function extractLimit(text: string, fallback = 10): number {
  const match = text.match(/\b(?:top|limit|first|show|say)\s+(\d+)\b/i) || text.match(/\b(\d+)\s+(?:labours|labour|employees|workers|customers|orders|products|patients|doctors)\b/i);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num > 0 && num <= 100) return num;
  }
  return fallback;
}

export function generateSql(question: string): SqlGeneration {
  const normalized = question.toLowerCase().replace(/[?!.,]/g, " ").trim();
  const limit = extractLimit(normalized, 10);

  // 1. Try predefined exact rule matching
  for (const rule of rules) {
    for (const matchGroup of rule.matches) {
      if (matchGroup.every((word) => normalized.includes(word))) {
        // If question specifies a custom limit number and rule has LIMIT, adjust it
        let sql = rule.sql;
        if (limit !== 10 && sql.includes("LIMIT 10")) {
          sql = sql.replace("LIMIT 10", `LIMIT ${limit}`);
        }
        return {
          sql,
          explanation: rule.explanation,
          breakdown: {
            tablesUsed: rule.tablesUsed,
            operations: rule.operations,
            description: rule.explanation,
          },
        };
      }
    }
  }

  // 2. Custom & Imported Table Direct Matching (Prioritize exact table mentions)
  const allTables = getSchema().tables;
  for (const table of allTables) {
    const tableNameLower = table.name.toLowerCase();
    const matchSimple = tableNameLower.replace(/_/g, " ");
    if (normalized.includes(tableNameLower) || (matchSimple !== tableNameLower && normalized.includes(matchSimple))) {
      if (normalized.includes("count") || normalized.includes("how many") || normalized.includes("total rows") || normalized.includes("how many records")) {
        const sql = `SELECT COUNT(*) AS total_records FROM "${table.name}";`;
        return {
          sql,
          explanation: `I calculated the total record count in table '${table.name}'.`,
          breakdown: {
            tablesUsed: [table.name],
            operations: ["SELECT", "COUNT(*)"],
            description: `Record count calculation for ${table.name}.`,
          },
        };
      }

      const numCols = table.columns.filter((c) => (c.type === "REAL" || c.type === "INTEGER") && !c.name.toLowerCase().includes("id"));
      const textCols = table.columns.filter((c) => c.type === "TEXT" && !c.name.endsWith("_id"));

      if ((normalized.includes("average") || normalized.includes("avg") || normalized.includes("max") || normalized.includes("summary")) && numCols.length > 0) {
        const numCol = numCols[0].name;
        const sql = `SELECT ROUND(AVG("${numCol}"), 2) AS avg_${numCol}, MAX("${numCol}") AS max_${numCol}, MIN("${numCol}") AS min_${numCol}, ROUND(SUM("${numCol}"), 2) AS sum_${numCol} FROM "${table.name}";`;
        return {
          sql,
          explanation: `I computed summary statistics (average, max, min, sum) for column '${numCol}' in table '${table.name}'.`,
          breakdown: {
            tablesUsed: [table.name],
            operations: ["SELECT", "AVG()", "MAX()", "MIN()", "SUM()"],
            description: `Statistical summary for ${table.name}.`,
          },
        };
      }

      if ((normalized.includes("group") || normalized.includes("breakdown") || normalized.includes("by")) && textCols.length > 0) {
        const catCol = textCols[0].name;
        const sql = `SELECT "${catCol}", COUNT(*) AS record_count FROM "${table.name}" WHERE "${catCol}" IS NOT NULL GROUP BY "${catCol}" ORDER BY record_count DESC LIMIT 10;`;
        return {
          sql,
          explanation: `I grouped and counted records by column '${catCol}' in table '${table.name}'.`,
          breakdown: {
            tablesUsed: [table.name],
            operations: ["SELECT", "COUNT(*)", "GROUP BY", "ORDER BY DESC", "LIMIT 10"],
            description: `Grouped breakdown for ${table.name}.`,
          },
        };
      }

      const sql = `SELECT * FROM "${table.name}" LIMIT ${limit};`;
      return {
        sql,
        explanation: `I retrieved records from table '${table.name}'.`,
        breakdown: {
          tablesUsed: [table.name],
          operations: ["SELECT", `LIMIT ${limit}`],
          description: `Data retrieval for ${table.name}.`,
        },
      };
    }
  }

  // 3. Intelligent Heuristics Synthesis

  // Heuristic A: Labours / Employees / Workers / Salaries / Wages
  if (
    normalized.includes("labour") ||
    normalized.includes("labor") ||
    normalized.includes("employee") ||
    normalized.includes("worker") ||
    normalized.includes("staff") ||
    normalized.includes("salary") ||
    normalized.includes("salaries") ||
    normalized.includes("wage") ||
    normalized.includes("wages") ||
    normalized.includes("hire")
  ) {
    if (normalized.includes("min") || normalized.includes("lowest")) {
      const sql = `SELECT id, name, role, department, salary, hourly_rate FROM employees ORDER BY salary ASC LIMIT ${limit};`;
      return {
        sql,
        explanation: `I retrieved the ${limit} lowest paid labours/employees sorted in ascending order of salary.`,
        breakdown: { tablesUsed: ["employees"], operations: ["SELECT", "ORDER BY salary ASC", `LIMIT ${limit}`], description: "Lowest salary labours query." },
      };
    }

    if (normalized.includes("avg") || normalized.includes("average")) {
      const sql = `SELECT department, COUNT(id) AS total_labours, ROUND(AVG(salary), 2) AS avg_salary, MAX(salary) AS max_salary, MIN(salary) AS min_salary FROM employees GROUP BY department ORDER BY avg_salary DESC;`;
      return {
        sql,
        explanation: "I aggregated labours and employees by department, computing average salary and staffing count.",
        breakdown: { tablesUsed: ["employees"], operations: ["GROUP BY department", "AVG()", "COUNT()"], description: "Average labour salary by department." },
      };
    }

    // Default for labours/salary (e.g. "give me a query for maxmium salary in top 10 labours")
    const sql = `SELECT id, name, role, department, salary, hourly_rate FROM employees ORDER BY salary DESC LIMIT ${limit};`;
    return {
      sql,
      explanation: `I queried the employees table for the top ${limit} labours with the maximum salary, ordered in descending order.`,
      breakdown: { tablesUsed: ["employees"], operations: ["SELECT", "ORDER BY salary DESC", `LIMIT ${limit}`], description: `Top ${limit} highest paid labours.` },
    };
  }

  // Heuristic B: Patient & Clinical Appointments
  if (
    normalized.includes("patient") ||
    normalized.includes("doctor") ||
    normalized.includes("clinic") ||
    normalized.includes("hospital") ||
    normalized.includes("appointment") ||
    normalized.includes("physician")
  ) {
    if (normalized.includes("fee") || normalized.includes("revenue") || normalized.includes("billed") || normalized.includes("expensive")) {
      const sql = `SELECT id, patient_name, doctor_name, department, fee, appointment_date, status FROM patient_appointments ORDER BY fee DESC LIMIT ${limit};`;
      return {
        sql,
        explanation: `I retrieved the top ${limit} patient appointments with the highest consultation fees.`,
        breakdown: { tablesUsed: ["patient_appointments"], operations: ["SELECT", "ORDER BY fee DESC", `LIMIT ${limit}`], description: "Highest fee patient appointments." },
      };
    }
    const sql = `SELECT id, patient_name, doctor_name, department, appointment_date, fee, status FROM patient_appointments ORDER BY appointment_date DESC LIMIT ${limit};`;
    return {
      sql,
      explanation: `I retrieved the ${limit} most recent patient consultations sorted chronologically.`,
      breakdown: { tablesUsed: ["patient_appointments"], operations: ["SELECT", "ORDER BY DESC", `LIMIT ${limit}`], description: "Healthcare appointments list." },
    };
  }

  // Heuristic C: Products & Catalog
  if (
    normalized.includes("product") ||
    normalized.includes("stock") ||
    normalized.includes("inventory") ||
    normalized.includes("item") ||
    normalized.includes("price")
  ) {
    if (normalized.includes("low") || normalized.includes("reorder") || normalized.includes("alert")) {
      const sql = `SELECT id, name, category, price, stock_quantity FROM products WHERE stock_quantity < 50 ORDER BY stock_quantity ASC LIMIT ${limit};`;
      return {
        sql,
        explanation: `I filtered products with low inventory under 50 units, sorted from lowest stock for reorder management.`,
        breakdown: { tablesUsed: ["products"], operations: ["WHERE stock_quantity < 50", "ORDER BY ASC", `LIMIT ${limit}`], description: "Low inventory alerts." },
      };
    }
    const sql = `SELECT id, name, category, price, stock_quantity FROM products ORDER BY price DESC LIMIT ${limit};`;
    return {
      sql,
      explanation: `I retrieved product records with pricing and stock quantities sorted by price.`,
      breakdown: { tablesUsed: ["products"], operations: ["SELECT", "ORDER BY price DESC", `LIMIT ${limit}`], description: "Product catalog records." },
    };
  }

  // Heuristic D: Revenue & Orders
  if (normalized.includes("revenue") || normalized.includes("sales") || normalized.includes("spending") || normalized.includes("amount")) {
    const sql = `SELECT ROUND(SUM(amount), 2) AS total_revenue, COUNT(id) AS total_orders, ROUND(AVG(amount), 2) AS avg_order_value FROM orders;`;
    return {
      sql,
      explanation: "I aggregated all orders to calculate total revenue, order count, and average order value.",
      breakdown: { tablesUsed: ["orders"], operations: ["SUM()", "COUNT()", "AVG()"], description: "Overall order revenue metrics." },
    };
  }

  // Heuristic E: Customers
  if (normalized.includes("customer") || normalized.includes("user") || normalized.includes("client") || normalized.includes("person") || normalized.includes("people")) {
    const sql = `SELECT id, name, email, city, country, segment FROM customers ORDER BY name ASC LIMIT ${limit};`;
    return {
      sql,
      explanation: `I queried customer records ordered alphabetically (up to ${limit} records).`,
      breakdown: { tablesUsed: ["customers"], operations: ["SELECT", "ORDER BY ASC", `LIMIT ${limit}`], description: "Customer directory." },
    };
  }

  // Heuristic F: Orders
  if (normalized.includes("order") || normalized.includes("transaction") || normalized.includes("purchase")) {
    const sql = `SELECT id, customer_id, order_date, amount, status FROM orders ORDER BY order_date DESC LIMIT ${limit};`;
    return {
      sql,
      explanation: `I retrieved transaction records ordered by most recent order date (up to ${limit} records).`,
      breakdown: { tablesUsed: ["orders"], operations: ["SELECT", "ORDER BY DESC", `LIMIT ${limit}`], description: "Order transactions." },
    };
  }

  // Explicit overview request only
  if (normalized.includes("overview") || normalized.includes("summary") || normalized.includes("all tables") || normalized.includes("database")) {
    const sql = `SELECT 'Customers' AS entity, COUNT(*) AS count FROM customers
UNION ALL
SELECT 'Orders', COUNT(*) FROM orders
UNION ALL
SELECT 'Products', COUNT(*) FROM products
UNION ALL
SELECT 'Patient Appointments', COUNT(*) FROM patient_appointments
UNION ALL
SELECT 'Employees / Labours', COUNT(*) FROM employees;`;
    return {
      sql,
      explanation: "I generated an overview query displaying row counts across all primary tables in the system.",
      breakdown: {
        tablesUsed: ["customers", "orders", "products", "patient_appointments", "employees"],
        operations: ["UNION ALL", "COUNT(*)"],
        description: "Database table volume summary.",
      },
    };
  }

  // Fallback: Smart default to employee/labour directory or general table
  const sql = `SELECT id, name, role, department, salary, hourly_rate FROM employees ORDER BY salary DESC LIMIT 10;`;
  return {
    sql,
    explanation: "I queried the database records sorted by priority.",
    breakdown: {
      tablesUsed: ["employees"],
      operations: ["SELECT", "ORDER BY DESC", "LIMIT 10"],
      description: "Default prioritized data query.",
    },
  };
}

export async function generateSqlAsync(question: string): Promise<SqlGeneration> {
  const schema = getSchema();
  const systemPrompt = [
    "You are an expert SQL Architect and Generator. Given a user question and SQLite database schema, generate a single, accurate, and optimal read-only SQLite SQL query.",
    "Rules:",
    "1. Always check the available tables and columns in the schema below. If the user mentions a specific table name from the schema (especially user-imported CSV datasets like 'patient_vitals', 'medical_inventory', etc.), you MUST generate the query against that exact table.",
    "2. For complex queries involving rankings, partitions, or multiple aggregations, feel free to use CTEs (`WITH ... AS (...)`) and SQLite window functions (`DENSE_RANK()`, `RANK()`, `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)`).",
    "3. When querying product categories, customer spending, or line items, join `customers`, `orders`, `order_items`, and `products`.",
    "4. If the user asks about 'labours', 'labor', 'workers', 'staff', or 'employees' and 'salaries', use the 'employees' table (or 'labours' view).",
    "5. Enclose your SQL query in a ```sql ... ``` markdown code block.",
    "6. Follow the code block with a short 1-2 sentence explanation of the query logic.",
    "Database Schema:",
    JSON.stringify(schema.tables, null, 2),
  ].join("\n\n");

  try {
    const aiResponse = await callGemini(systemPrompt, [], question);
    const sqlMatch = aiResponse.match(/```sql\n([\s\S]*?)```/) || aiResponse.match(/```([\s\S]*?)```/);
    if (sqlMatch) {
      const cleaned = cleanGeneratedSql(sqlMatch[1]);
      const validation = validateReadOnlySql(cleaned);
      if (validation.safe) {
        // Extract explanation after the code block
        const parts = aiResponse.split(/```[\s\S]*?```/);
        const explanation = parts[1]?.trim() || "Generated SQL query based on your question.";
        return {
          sql: validation.sql,
          explanation,
          breakdown: {
            tablesUsed: schema.tables.map((t) => t.name).filter((t) => validation.sql.toLowerCase().includes(t.toLowerCase())),
            operations: ["SELECT", validation.sql.includes("JOIN") ? "JOIN" : "", validation.sql.includes("GROUP BY") ? "GROUP BY" : "", validation.sql.includes("ORDER BY") ? "ORDER BY" : ""].filter(Boolean),
            description: explanation,
          },
        };
      }
    }
  } catch (_e) {
    // If AI fails or is offline, seamlessly fall back to deterministic synthesizer
  }

  return generateSql(question);
}

export function chatWithSqlAssistant(
  userMessage: string,
  history: ChatMessage[] = [],
  currentSql?: string,
): ChatResponse {
  const normalized = userMessage.toLowerCase().replace(/[?!.,;]/g, " ").trim();
  const rawLower = userMessage.toLowerCase().trim();

  // 1. Identity & Name ("what can i call you", "what is your name", "who are you", etc.)
  const isNameOrIdentity =
    /\b(?:what\s+(?:can|should|do|may|shall|could|to)\s+(?:i|we)\s+call\s+(?:you|u)|what\s+can\s+u\s+call|can\s+i\s+call\s+you|should\s+i\s+call\s+you|call\s+you|what(?:'s|\s+is)\s+your\s+name|whats\s+your\s+name|your\s+name|who\s+are\s+you|who\s+r\s+u|who\s+is\s+this|tell\s+me\s+about\s+yourself|introduce\s+yourself|who\s+(?:created|made|built)\s+you|what\s+are\s+you)\b/i.test(
      rawLower,
    ) ||
    rawLower.includes("call you") ||
    rawLower.includes("your name") ||
    rawLower.includes("who are you") ||
    rawLower.includes("introduce yourself");

  if (isNameOrIdentity) {
    return {
      message: `You can call me **SQL AI Mentor**, **Tech Mentor**, or simply **Mentor**! 😊\n\nI'm your friendly AI pair programmer and data mentor. I can chat with you, explain database & SQL concepts, and help you analyze data—from employee salaries and labour payrolls to patient appointments, sales trends, and product inventory.\n\nHow can I help you today?`,
      suggestedQuestions: [
        "Show top 10 labours by maximum salary",
        "How do SQL Joins work?",
        "Show patient appointments by doctor",
        "What tables are in this database?",
      ],
    };
  }

  // 2. Greetings
  const greetings = [
    "hi",
    "hello",
    "hey",
    "howdy",
    "hiya",
    "good morning",
    "good afternoon",
    "good evening",
    "greetings",
    "yo",
    "sup",
    "wassup",
    "what's up",
    "whats up",
    "namaste",
    "hola",
    "heya",
    "hoi",
  ];
  if (
    greetings.some(
      (g) =>
        normalized === g ||
        normalized.startsWith(g + " ") ||
        rawLower.startsWith(g + "!") ||
        rawLower.startsWith(g + "?"),
    )
  ) {
    return {
      message: `👋 Hello! It's great to chat with you!\n\nI'm your **SQL & Data AI Mentor**. Whether you'd like to chat, understand database concepts, or write and run SQL queries on real-world data—I'm here for you!\n\nWhat would you like to explore today?`,
      suggestedQuestions: [
        "Give me a query for maximum salary in top 10 labours",
        "Show average labour salary by department",
        "Show top 5 customers by revenue",
        "Show patient appointments by doctor",
      ],
    };
  }

  // 3. Social / Well-being ("how are you", etc.)
  const howAreYou = [
    "how are you",
    "how are you doing",
    "how r u",
    "how is it going",
    "how's it going",
    "hows it going",
    "how do you do",
    "how are you today",
    "how's your day",
    "how is everything",
    "how are things",
    "you doing good",
    "are you ok",
    "are you okay",
  ];
  if (howAreYou.some((h) => normalized.includes(h))) {
    return {
      message: `I'm doing wonderful, thank you for asking! 😊 How are you doing today?\n\nI'm ready whenever you are—whether you want to have a friendly chat, learn new SQL skills, or explore employee salaries, patient appointments, and sales metrics!`,
      suggestedQuestions: [
        "Show top 10 labours with maximum salary",
        "Show doctor workload by department",
        "What products have low stock?",
        "Show monthly sales trend",
      ],
    };
  }

  // 4. Compliments & Gratitude
  const thanks = [
    "thanks",
    "thank you",
    "thx",
    "ty",
    "cheers",
    "appreciate it",
    "you are awesome",
    "you're awesome",
    "you are great",
    "you're great",
    "good job",
    "nice job",
    "you are smart",
    "love you",
    "cool",
    "superb",
    "brilliant",
    "well done",
    "awesome",
    "great work",
    "perfect",
    "helpful",
    "good bot",
    "nice",
  ];
  if (
    thanks.some(
      (t) =>
        normalized === t ||
        normalized.startsWith(t + " ") ||
        normalized.endsWith(" " + t) ||
        rawLower.includes("thank you") ||
        rawLower.includes("thanks"),
    )
  ) {
    return {
      message: `You're very welcome! 😊 It's always a pleasure chatting and working with you. Let me know whenever you'd like to explore queries or analyze more data!`,
      suggestedQuestions: [
        "Show top 10 labours by salary",
        "Show monthly revenue trend",
        "Which doctor has the most patients?",
        "Show all products by category",
      ],
    };
  }

  // 5. Farewells
  const farewells = [
    "bye",
    "goodbye",
    "see you",
    "later",
    "cya",
    "have a good day",
    "have a nice day",
    "good night",
    "take care",
    "catch you later",
  ];
  if (farewells.some((f) => normalized.startsWith(f) || normalized.includes(f))) {
    return {
      message: `Goodbye! 👋 Have a wonderful day ahead, and feel free to drop by anytime you want to chat or write queries!`,
      suggestedQuestions: [],
    };
  }

  // 6. Humor & Jokes
  if (
    normalized.includes("joke") ||
    normalized.includes("laugh") ||
    normalized.includes("funny") ||
    normalized.includes("humor")
  ) {
    return {
      message: `Here is a database joke for you: 😄\n\n**Why did the database administrator leave their spouse?**\n*... Because they had one-to-many relationships!* 🥁💥\n\nNeed another joke or ready to query some tables?`,
      suggestedQuestions: [
        "Show top 10 labours by salary",
        "How do SQL Joins work?",
        "Show patient appointments by doctor",
      ],
    };
  }

  // 7. Human / AI inquiries
  if (
    normalized.includes("are you human") ||
    normalized.includes("are you a robot") ||
    normalized.includes("are you real") ||
    normalized.includes("are you a bot") ||
    normalized.includes("are you an ai") ||
    normalized.includes("do you have feelings")
  ) {
    return {
      message: `I'm an AI Mentor! 🤖 Think of me as your friendly virtual co-worker and SQL tutor who never sleeps and is always happy to chat or write queries with you!`,
      suggestedQuestions: [
        "What can you do?",
        "Show top 10 labours by salary",
        "Show patient appointments by doctor",
      ],
    };
  }

  // 8. Help / Capabilities / System Overview
  if (
    normalized.includes("what can you do") ||
    normalized.includes("what do you do") ||
    normalized.includes("help") ||
    normalized.includes("how to use") ||
    normalized.includes("how does this work") ||
    normalized.includes("features") ||
    normalized.includes("what tables") ||
    normalized.includes("what data") ||
    normalized.includes("capabilities")
  ) {
    return {
      message: `Here is what I can do for you: 🚀\n\n1. 💬 **Friendly Chat & Mentorship** — Ask me anything, chat naturally, or get concepts explained in plain English.\n2. 👷 **Labours & Payroll Insights** — Analyze labour salaries, hourly wages, top earners, and department headcounts.\n3. 🏥 **Healthcare & Patient Workload** — Review patient consultations, physician workload, and department billing.\n4. 📈 **Sales, Orders & Customers** — Calculate revenue trends, customer segments, and order metrics.\n5. 🛍️ **Products & Stock Management** — Identify low inventory items and catalog pricing.\n6. ⚡ **Instant Query Generation & Live Execution** — Get clean SQLite code and run it directly in the chat or in the SQL Studio!\n\nWhat would you like to try?`,
      suggestedQuestions: [
        "Show top 10 labours by salary",
        "Show doctor workload by department",
        "Show top 5 customers by revenue",
        "Explain SQL Inner Join vs Left Join",
      ],
    };
  }

  // 9. Conceptual SQL & Educational explanations
  if (
    normalized.includes("what is a join") ||
    normalized.includes("explain join") ||
    normalized.includes("inner join") ||
    normalized.includes("left join") ||
    normalized.includes("joins in sql")
  ) {
    return {
      message: `### 🔗 SQL Joins Explained\n\nJoins combine rows from two or more tables based on a related column:\n\n- **\`INNER JOIN\`**: Returns only the rows where there is a match in **both** tables.\n  \`\`\`sql\n  SELECT customers.name, orders.amount\n  FROM customers\n  INNER JOIN orders ON orders.customer_id = customers.id;\n  \`\`\`\n- **\`LEFT JOIN\`**: Returns **all** rows from the left table, plus matching rows from the right table (or \`NULL\` if no match).\n  \`\`\`sql\n  SELECT customers.name, orders.amount\n  FROM customers\n  LEFT JOIN orders ON orders.customer_id = customers.id;\n  \`\`\`\n\nWould you like me to generate a join query for our live database?`,
      suggestedQuestions: [
        "Show top 5 customers by revenue with orders join",
        "Show inactive customers with zero orders",
        "Explain GROUP BY in SQL",
      ],
    };
  }

  if (
    normalized.includes("what is group by") ||
    normalized.includes("explain group by") ||
    normalized.includes("how does group by work")
  ) {
    return {
      message: `### 📊 SQL \`GROUP BY\` Explained\n\n\`GROUP BY\` groups rows that share identical values in specified columns into summary rows (e.g. finding the average salary per department or order count per city).\n\n\`\`\`sql\nSELECT department, COUNT(id) AS headcount, ROUND(AVG(salary), 2) AS avg_salary\nFROM employees\nGROUP BY department\nORDER BY avg_salary DESC;\n\`\`\`\n\nIt is commonly paired with aggregate functions like \`COUNT()\`, \`SUM()\`, \`AVG()\`, \`MIN()\`, and \`MAX()\`.`,
      suggestedQuestions: [
        "Show average labour salary by department",
        "Show order count by status",
        "What is WHERE vs HAVING?",
      ],
    };
  }

  if (
    normalized.includes("where vs having") ||
    normalized.includes("having vs where") ||
    normalized.includes("difference between where and having")
  ) {
    return {
      message: `### ⚖️ \`WHERE\` vs \`HAVING\` in SQL\n\n- **\`WHERE\`** filters individual rows **before** any grouping or aggregation takes place:\n  \`\`\`sql\n  SELECT * FROM employees WHERE salary > 50000;\n  \`\`\`\n- **\`HAVING\`** filters aggregated groups **after** \`GROUP BY\` has calculated totals:\n  \`\`\`sql\n  SELECT department, AVG(salary) AS avg_sal\n  FROM employees\n  GROUP BY department\n  HAVING AVG(salary) > 60000;\n  \`\`\`\n\n💡 **Rule of thumb**: Use \`WHERE\` on raw column values; use \`HAVING\` on aggregate results (\`COUNT()\`, \`SUM()\`, \`AVG()\`).`,
      suggestedQuestions: [
        "Show departments with average salary above 60000",
        "Show top 10 labours by salary",
      ],
    };
  }

  if (
    normalized.includes("what is primary key") ||
    normalized.includes("primary key vs foreign key") ||
    normalized.includes("foreign key")
  ) {
    return {
      message: `### 🔑 Primary Key vs Foreign Key\n\n- **Primary Key (PK)**: A column (or combination of columns) that uniquely identifies every single row in a table (e.g., \`id\` in the \`customers\` table). It cannot be null and must be unique.\n- **Foreign Key (FK)**: A column in one table that references the Primary Key in another table (e.g., \`customer_id\` in \`orders\` referencing \`customers.id\`). It links related records together across tables.`,
      suggestedQuestions: [
        "Show customers joined with their orders",
        "Explain SQL Joins",
      ],
    };
  }

  if (normalized === "what is sql" || normalized.includes("what is sql")) {
    return {
      message: `### 💻 What is SQL?\n\n**SQL (Structured Query Language)** is the standard programming language used to interact with relational databases. With SQL, you can:\n\n- **Query Data**: \`SELECT * FROM employees WHERE salary > 70000;\`\n- **Aggregate & Summarize**: \`SELECT department, AVG(salary) FROM employees GROUP BY department;\`\n- **Combine Tables**: \`SELECT * FROM customers JOIN orders ON customers.id = orders.customer_id;\`\n\nWhat would you like to query or learn next?`,
      suggestedQuestions: [
        "Show top 10 labours with maximum salary",
        "How do SQL Joins work?",
        "Show patient appointments by doctor",
      ],
    };
  }

  // 10. Check if the message is actually a Data / SQL query request
  const hasSqlKeywords =
    /\b(?:sql|query|select|from|where|join|group\s+by|order\s+by|insert|update|delete|table|schema|database|avg|sum|max|min|limit|count)\b/i.test(
      normalized,
    );
  const hasDataAction =
    /\b(?:show|list|find|get|fetch|retrieve|display|calculate|count|sum|avg|average|max|maximum|maxmium|min|minimum|highest|lowest|top|bottom|most|least|breakdown|filter|sort|which|how\s+many|how\s+much|give\s+me)\b/i.test(
      normalized,
    );
  const hasDomainEntity =
    /\b(?:labour|labours|labor|employee|employees|worker|workers|staff|salary|salaries|wage|wages|hourly|patient|patients|doctor|doctors|appointment|appointments|clinic|hospital|customer|customers|order|orders|product|products|inventory|stock|revenue|sales|department|departments)\b/i.test(
      normalized,
    );

  const isDataQueryIntent = hasSqlKeywords || (hasDataAction && hasDomainEntity) || hasDomainEntity;

  if (isDataQueryIntent) {
    const generated = generateSql(userMessage);

    // If labour/salary scenario
    if (
      normalized.includes("labour") ||
      normalized.includes("labor") ||
      normalized.includes("employee") ||
      normalized.includes("worker") ||
      normalized.includes("salary") ||
      normalized.includes("salaries") ||
      normalized.includes("wage")
    ) {
      return {
        message: `### 👷 Labours & Salary Analysis\n\nHere is the exact SQL query to answer **"${userMessage}"**:\n\n${generated.explanation}\n\n\`\`\`sql\n${generated.sql}\n\`\`\`\n\nYou can click **Run Query** below to view the live result table with worker names, roles, departments, and salaries.`,
        suggestedSql: generated.sql,
        explanation: generated.explanation,
        suggestedQuestions: [
          "Show top 10 labours by salary",
          "What is the average salary by department?",
          "Show labours with hourly rate above $35",
          "Which department has the highest total payroll?",
        ],
      };
    }

    return {
      message: `Here is the SQL query to answer: **"${userMessage}"**\n\n${generated.explanation}\n\n\`\`\`sql\n${generated.sql}\n\`\`\`\n\nYou can run this query directly to inspect the live data table, or modify the parameters as needed.`,
      suggestedSql: generated.sql,
      explanation: generated.explanation,
      suggestedQuestions: [
        "Give me a query for maximum salary in top 10 labours",
        "Show revenue breakdown by month",
        "List products with inventory below 50 units",
        "Which doctors have the highest patient count?",
      ],
    };
  }

  // 11. Conversational Fallback for general casual statements
  return {
    message: `I'm here with you! 😊\n\nAs your **AI Mentor**, I can chat with you, explain technical concepts, or help you generate and run SQL queries for employee salaries, patient appointments, sales metrics, and product inventory.\n\nLet me know what you'd like to do, or try one of the suggestions below!`,
    suggestedQuestions: [
      "Show top 10 labours by maximum salary",
      "Show patient appointments by doctor",
      "Show top 5 customers by revenue",
      "Explain SQL Inner Join vs Left Join",
    ],
  };
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

