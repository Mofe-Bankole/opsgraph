#!/usr/bin/env tsx
/**
 * OpsGraph demo CLI — ask the accountability questions against the Relate store.
 *
 *   npm run ask                     list all questions
 *   npm run ask -- agents-at-risk   run one
 *   npm run ask -- --all            run every question
 *   npm run ask -- why-bounced O-1005   run with a param override
 */
import { Database } from "@relate/relate";
import { OPS_QUERIES, STORE_PATH } from "./queries.js";

const [, , name, paramValue] = process.argv;

if (!name) {
  console.log("OpsGraph — Ishop accountability questions (graph traversals over data/opsgraph.rl)\n");
  for (const q of OPS_QUERIES) console.log(`  ${q.name.padEnd(22)} ${q.question}`);
  console.log("\nRun one: npm run ask -- <name> [paramValue]   |   all: npm run ask -- --all");
  process.exit(0);
}

const db = Database.open(STORE_PATH, { readOnly: true });
const conn = db.connect();

function run(q: (typeof OPS_QUERIES)[number], override?: string) {
  const params = { ...(q.params ?? {}) };
  if (override) {
    const key = Object.keys(params)[0];
    if (key) params[key] = override;
  }
  console.log(`\n=== ${q.name} ===`);
  console.log(q.question + "\n");
  const res = conn.query(q.cypher, params);
  if (res.rows.length === 0) console.log("(no rows)");
  for (const row of res.rows) console.log(JSON.stringify(row));
}

if (name === "--all") {
  for (const q of OPS_QUERIES) run(q);
} else {
  const q = OPS_QUERIES.find((x) => x.name === name);
  if (!q) {
    console.error(`Unknown question "${name}". Run without args to list.`);
    process.exit(1);
  }
  run(q, paramValue);
}

conn.close?.();
db.close?.();
