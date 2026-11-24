/**
 * OpsGraph seed — builds the Ishop delivery-ops graph into data/opsgraph.rl
 *
 * Source domain: the CEO's office meeting notes (23 Nov 2026):
 *  - Orders assigned by sales closers to delivery agents; agent must confirm
 *    within 1 hour (orders from 5pm+ by 12pm next day) or the order bounces
 *    back to the closer for reassignment and the agent loses 15 points.
 *  - 3 red flags => agent loses ability to collect orders (suspension).
 *  - Payment due 48h => warning; +24h second; +24h third => payment ban.
 *  - Only the ACCOUNTANT lifts payment suspensions; only HEAD OF OPERATIONS
 *    lifts delivery suspensions; HR lifts sales-closer bans.
 *  - Closers have tiers by confirmed orders: Beginner (<15), Standard (15-20),
 *    Superstar (>20). New closers under 55% confirmation twice => banned.
 *  - Closers can file misconduct reports against agents; HR resolves.
 *  - When an agent meets a customer, an account number is generated.
 */
import { Database } from "@relate/relate";
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const STORE = new URL("../data/opsgraph.rl", import.meta.url).pathname;
mkdirSync(dirname(STORE), { recursive: true });
rmSync(STORE, { force: true }); // rebuild from scratch for a deterministic store

const db = Database.open(STORE);
const conn = db.connect();

function run(cypher: string, params?: Record<string, unknown>) {
  return conn.query(cypher, params).consume();
}

// --- uniqueness (best-effort; engine versions differ in constraint syntax)
for (const c of [
  "CREATE CONSTRAINT agent_id IF NOT EXISTS FOR (a:Agent) REQUIRE a.id IS UNIQUE",
  "CREATE CONSTRAINT closer_id IF NOT EXISTS FOR (c:SalesCloser) REQUIRE c.id IS UNIQUE",
  "CREATE CONSTRAINT order_id IF NOT EXISTS FOR (o:Order) REQUIRE o.id IS UNIQUE",
  "CREATE CONSTRAINT tier_name IF NOT EXISTS FOR (t:Tier) REQUIRE t.name IS UNIQUE",
  "CREATE CONSTRAINT role_name IF NOT EXISTS FOR (r:Role) REQUIRE r.name IS UNIQUE",
]) {
  try { run(c); } catch { /* constraint unsupported in this build; MERGE still guards */ }
}

// --- reference nodes
run(`UNWIND $tiers AS t MERGE (:Tier {name: t.name, minOrders: t.min, maxOrders: t.max})`, {
  tiers: [
    { name: "Beginner", min: 0, max: 14 },
    { name: "Standard", min: 15, max: 20 },
    { name: "Superstar", min: 21, max: 9999 },
  ],
});
run(`UNWIND $roles AS r MERGE (:Role {name: r})`, {
  roles: ["Accountant", "HeadOfOperations", "HR"],
});

// --- people
const agents = [
  { id: "A-01", name: "Tunde Adeyemi", points: 100, status: "active" },   // 2 bounces -> 70 pts: one from suspension
  { id: "A-02", name: "Chidinma Okafor", points: 100, status: "active" },
  { id: "A-03", name: "Ibrahim Musa", points: 85, status: "active" },     // 2 payment warnings: one from ban
  { id: "A-04", name: "Ngozi Eze", points: 95, status: "active" },
  { id: "A-05", name: "Seun Balogun", points: 100, status: "suspended" },  // 3 bounces -> 55 pts, 3 flags -> suspended
  { id: "A-06", name: "Fatima Abubakar", points: 100, status: "active" },
  { id: "A-07", name: "Emeka Obi", points: 90, status: "active" },
  { id: "A-08", name: "Yetunde Alabi", points: 100, status: "active" },
];
const closers = [
  { id: "C-01", name: "Amara Nwosu", isNew: false, status: "active", confirmed: 19 }, // one order from Superstar
  { id: "C-02", name: "Kunle Adebayo", isNew: false, status: "active", confirmed: 24 },
  { id: "C-03", name: "Blessing Okoro", isNew: true, status: "active", confirmed: 6 }, // new, 50% rate twice -> at risk
  { id: "C-04", name: "Damilola Fashola", isNew: false, status: "active", confirmed: 12 },
];
run(`UNWIND $agents AS a MERGE (n:Agent {id: a.id}) SET n.name=a.name, n.points=a.points, n.status=a.status, n.onboardedAt=date('2026-09-01')`, { agents });
run(`UNWIND $closers AS c MERGE (n:SalesCloser {id: c.id}) SET n.name=c.name, n.isNew=c.isNew, n.status=c.status, n.confirmedOrders=c.confirmed`, { closers });
run(`MATCH (c:SalesCloser), (t:Tier)
     WHERE c.confirmedOrders >= t.minOrders AND c.confirmedOrders <= t.maxOrders
     MERGE (c)-[:IN_TIER]->(t)`);

// --- customers + orders
// helper timeline: "now" fixed at 2026-11-24T14:00 for deterministic demos
const customers = [
  { acct: "ISH-100234", name: "Mama Nkechi Stores", agent: "A-01" },
  { acct: "ISH-100235", name: "Emir Pharmacy", agent: "A-03" },
  { acct: "ISH-100236", name: "Divine Favour Boutique", agent: "A-02" },
  { acct: "ISH-100237", name: "City Electronics Hub", agent: "A-07" },
];
run(`UNWIND $customers AS cu
     MERGE (c:Customer {accountNumber: cu.acct}) SET c.name = cu.name
     WITH c, cu MATCH (a:Agent {id: cu.agent}) MERGE (a)-[:REGISTERED]->(c)`, { customers });

interface SeedOrder {
  id: string; closer: string; agent: string; customer: string;
  assignedAt: string; status: "confirmed" | "bounced" | "pending" | "delivered";
  confirmedAt?: string; value: number;
}
const orders: SeedOrder[] = [
  // normal confirmed/delivered flow
  { id: "O-1001", closer: "C-01", agent: "A-02", customer: "ISH-100236", assignedAt: "2026-11-23T09:15:00", confirmedAt: "2026-11-23T09:41:00", status: "delivered", value: 45000 },
  { id: "O-1002", closer: "C-01", agent: "A-06", customer: "ISH-100234", assignedAt: "2026-11-23T10:00:00", confirmedAt: "2026-11-23T10:52:00", status: "delivered", value: 12800 },
  { id: "O-1003", closer: "C-02", agent: "A-04", customer: "ISH-100237", assignedAt: "2026-11-23T11:30:00", confirmedAt: "2026-11-23T12:05:00", status: "delivered", value: 152000 },
  // THE STORY ORDER: assigned 6pm, never confirmed by next-day noon -> bounced back
  { id: "O-1004", closer: "C-01", agent: "A-01", customer: "ISH-100234", assignedAt: "2026-11-23T18:10:00", status: "bounced", value: 33500 },
  // reassigned after bounce and confirmed by another agent
  { id: "O-1005", closer: "C-01", agent: "A-08", customer: "ISH-100234", assignedAt: "2026-11-24T08:05:00", confirmedAt: "2026-11-24T08:30:00", status: "confirmed", value: 33500 },
  // Tunde's earlier miss -> flag #2
  { id: "O-1006", closer: "C-03", agent: "A-01", customer: "ISH-100235", assignedAt: "2026-11-22T13:00:00", status: "bounced", value: 8900 },
  // Ibrahim's late deliveries feeding payment warnings
  { id: "O-1007", closer: "C-02", agent: "A-03", customer: "ISH-100235", assignedAt: "2026-11-20T09:00:00", confirmedAt: "2026-11-20T09:20:00", status: "delivered", value: 61000 },
  { id: "O-1008", closer: "C-04", agent: "A-07", customer: "ISH-100237", assignedAt: "2026-11-23T15:40:00", confirmedAt: "2026-11-23T16:10:00", status: "delivered", value: 27400 },
  // pending right now, inside the 1h window
  { id: "O-1009", closer: "C-04", agent: "A-06", customer: "ISH-100234", assignedAt: "2026-11-24T13:35:00", status: "pending", value: 19900 },
  // Blessing (new closer) unconfirmed assignments -> underperformance streak
  { id: "O-1010", closer: "C-03", agent: "A-04", customer: "ISH-100236", assignedAt: "2026-11-21T10:00:00", status: "bounced", value: 7600 },
  { id: "O-1011", closer: "C-03", agent: "A-02", customer: "ISH-100236", assignedAt: "2026-11-21T14:00:00", status: "bounced", value: 11200 },
  { id: "O-1012", closer: "C-03", agent: "A-07", customer: "ISH-100237", assignedAt: "2026-11-22T09:30:00", confirmedAt: "2026-11-22T09:55:00", status: "delivered", value: 5400 },
  // Seun's pre-suspension misses
  { id: "O-1013", closer: "C-02", agent: "A-05", customer: "ISH-100235", assignedAt: "2026-11-18T11:00:00", status: "bounced", value: 41000 },
  { id: "O-1014", closer: "C-02", agent: "A-05", customer: "ISH-100235", assignedAt: "2026-11-19T12:00:00", status: "bounced", value: 22500 },
  { id: "O-1015", closer: "C-04", agent: "A-05", customer: "ISH-100237", assignedAt: "2026-11-19T17:30:00", status: "bounced", value: 15800 },
];
for (const o of orders) {
  run(`MATCH (cl:SalesCloser {id: $closer}), (ag:Agent {id: $agent}), (cu:Customer {accountNumber: $customer})
       MERGE (o:Order {id: $id})
         SET o.status=$status, o.value=$value,
             o.assignedAt=datetime($assignedAt),
             o.confirmDeadline=CASE WHEN datetime($assignedAt).hour >= 17
                 THEN datetime({date: date(datetime($assignedAt)) + duration({days:1}), time: time('12:00')})
                 ELSE datetime($assignedAt) + duration({hours:1}) END
       MERGE (cl)-[:ASSIGNED {at: datetime($assignedAt)}]->(o)
       MERGE (o)-[:ASSIGNED_TO]->(ag)
       MERGE (cu)-[:PLACED]->(o)`, o as unknown as Record<string, unknown>);
  if (o.status === "bounced") {
    run(`MATCH (o:Order {id: $id}), (cl:SalesCloser {id: $closer}), (ag:Agent {id: $agent})
         MERGE (o)-[:BOUNCED_BACK_TO {reason: 'confirmation_window_expired'}]->(cl)
         WITH o, ag
         MATCH (o2:Order {id: $id})
         SET ag.points = ag.points - 15`, o as unknown as Record<string, unknown>);
    run(`MATCH (o:Order {id: $id}), (ag:Agent {id: $agent})
         CREATE (f:Flag {id: 'F-' + $id, reason: 'missed_confirmation_window', issuedAt: o.confirmDeadline})
         CREATE (f)-[:GIVEN_TO]->(ag)
         CREATE (f)-[:TRIGGERED_BY]->(o)`, o as unknown as Record<string, unknown>);
  }
  if (o.confirmedAt) {
    run(`MATCH (o:Order {id: $id}), (ag:Agent {id: $agent})
         MERGE (o)-[:CONFIRMED_BY {at: datetime($confirmedAt)}]->(ag)`, o as unknown as Record<string, unknown>);
  }
}

// --- Seun's third flag tipped him into suspension (delivery kind)
run(`MATCH (a:Agent {id:'A-05'})
     CREATE (s:Suspension {id:'S-01', kind:'delivery', active:true, issuedAt:datetime('2026-11-19T18:00:00'),
             reason:'3 red flags: repeated missed confirmation windows'})
     CREATE (s)-[:ON]->(a)
     WITH s, a MATCH (r:Role {name:'HeadOfOperations'}) MERGE (s)-[:LIFTABLE_BY]->(r)
     SET a.status='suspended'`);

// --- Ibrahim's payment warnings (48h, +24h cadence). Third warning => ban.
const warnings = [
  { id: "W-01", agent: "A-03", seq: 1, at: "2026-11-20T18:00:00" },
  { id: "W-02", agent: "A-03", seq: 2, at: "2026-11-21T18:00:00" },
];
for (const w of warnings) {
  run(`MATCH (a:Agent {id: $agent})
       CREATE (w:PaymentWarning {id: $id, sequence: $seq, issuedAt: datetime($at)})
       CREATE (w)-[:ISSUED_TO]->(a)`, w);
}

// --- misconduct report: closer -> agent, resolved by HR
run(`MATCH (cl:SalesCloser {id:'C-02'}), (ag:Agent {id:'A-03'})
     CREATE (r:Report {id:'R-01', filedAt:datetime('2026-11-21T09:00:00'),
             status:'resolved', subject:'customer payment collected late',
             resolution:'warning issued; payment plan agreed'})
     CREATE (cl)-[:FILED]->(r)
     CREATE (r)-[:AGAINST]->(ag)
     WITH r MATCH (hr:Role {name:'HR'}) MERGE (r)-[:RESOLVED_BY]->(hr)`);

const counts = conn.query(`MATCH (n) RETURN count(n) AS nodes`).single();
const rels = conn.query(`MATCH ()-[r]->() RETURN count(r) AS rels`).single();
console.log(`Seeded ${STORE}`);
console.log(`nodes=${counts.nodes} relationships=${rels.rels}`);

conn.close?.();
db.close?.();
