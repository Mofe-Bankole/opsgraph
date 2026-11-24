/**
 * OpsGraph accountability questions — every one is a graph traversal.
 * These are the questions the CEO, Head of Ops, Accountant and HR actually
 * ask, expressed as Cypher against the Relate store.
 */
export const STORE_PATH = new URL("../data/opsgraph.rl", import.meta.url).pathname;

export interface OpsQuery {
  name: string;
  question: string;
  cypher: string;
  params?: Record<string, unknown>;
}

export const OPS_QUERIES: OpsQuery[] = [
  {
    name: "agents-at-risk",
    question: "Which agents are one red flag away from suspension (2 flags), and which closers keep assigning to them?",
    cypher: `
      MATCH (a:Agent {status: 'active'})<-[:GIVEN_TO]-(f:Flag)
      WITH a, count(f) AS flags
      WHERE flags = 2
      OPTIONAL MATCH (cl:SalesCloser)-[:ASSIGNED]->(o:Order)-[:ASSIGNED_TO]->(a)
      RETURN a.name AS agent, a.points AS points, flags,
             collect(DISTINCT cl.name) AS closersAssigningToThem
      ORDER BY a.points`,
  },
  {
    name: "payment-ban-imminent",
    question: "Which agents are one payment warning away from a ban (2 warnings in the 48h/24h cadence)?",
    cypher: `
      MATCH (w:PaymentWarning)-[:ISSUED_TO]->(a:Agent)
      WITH a, count(w) AS warnings, max(w.issuedAt) AS lastWarning
      WHERE warnings = 2
      RETURN a.name AS agent, warnings, lastWarning,
             duration.between(lastWarning, datetime()).hours AS hoursSinceLastWarning
      ORDER BY lastWarning`,
  },
  {
    name: "bounced-orders",
    question: "Which orders bounced back to closers unconfirmed, and what did it cost each agent?",
    cypher: `
      MATCH (o:Order)-[:BOUNCED_BACK_TO]->(cl:SalesCloser)
      MATCH (o)-[:ASSIGNED_TO]->(a:Agent)
      OPTIONAL MATCH (f:Flag)-[:TRIGGERED_BY]->(o)
      RETURN o.id AS order, cl.name AS returnedTo, a.name AS missedBy,
             o.assignedAt AS assignedAt, o.confirmDeadline AS deadline,
             f.id AS flagIssued
      ORDER BY o.assignedAt`,
  },
  {
    name: "tier-candidates",
    question: "Which closers are within 2 confirmed orders of the next tier?",
    cypher: `
      MATCH (c:SalesCloser {status: 'active'})-[:IN_TIER]->(t:Tier)
      MATCH (up:Tier) WHERE up.minOrders = t.maxOrders + 1
      WITH c, t, up, up.minOrders - c.confirmedOrders AS ordersToGo
      WHERE ordersToGo <= 2
      RETURN c.name AS closer, t.name AS currentTier, c.confirmedOrders AS confirmed,
             up.name AS nextTier, ordersToGo
      ORDER BY ordersToGo`,
  },
  {
    name: "suspension-chain",
    question: "Who is suspended right now, for what, and exactly which role can lift each suspension?",
    cypher: `
      MATCH (s:Suspension {active: true})-[:ON]->(x)
      MATCH (s)-[:LIFTABLE_BY]->(r:Role)
      RETURN s.id AS suspension, s.kind AS kind, s.reason AS reason,
             labels(x)[0] AS entityType, coalesce(x.name, x.id) AS who,
             r.name AS onlyRoleThatCanLift`,
  },
  {
    name: "closer-leaderboard",
    question: "Confirmation rate per closer, with their tier (80% baseline; <55% twice bans a new closer)",
    cypher: `
      MATCH (c:SalesCloser)-[:ASSIGNED]->(o:Order)
      OPTIONAL MATCH (c)-[:IN_TIER]->(t:Tier)
      WITH c, t, count(o) AS assigned,
           count(CASE WHEN o.status IN ['confirmed','delivered'] THEN 1 END) AS confirmed
      RETURN c.name AS closer, c.isNew AS isNew, t.name AS tier,
             assigned, confirmed,
             round(100.0 * confirmed / assigned) AS confirmationPct
      ORDER BY confirmationPct DESC`,
  },
  {
    name: "why-bounced",
    question: "Full accountability trail for one order: closer -> order -> agent -> flag -> points",
    cypher: `
      MATCH path = (cl:SalesCloser)-[:ASSIGNED]->(o:Order {id: $orderId})-[:ASSIGNED_TO]->(a:Agent)
      OPTIONAL MATCH (f:Flag)-[:TRIGGERED_BY]->(o)
      OPTIONAL MATCH (o)-[:BOUNCED_BACK_TO]->(cl2:SalesCloser)
      RETURN cl.name AS assignedBy, o.id AS order, o.status AS status,
             a.name AS agentResponsible, a.points AS agentPointsNow,
             f.id AS flag, f.reason AS flagReason,
             cl2.name AS bouncedBackTo`,
    params: { orderId: "O-1004" },
  },
  {
    name: "agent-full-history",
    question: "Everything that happened around one agent: orders, flags, warnings, reports, customers",
    cypher: `
      MATCH (a:Agent {id: $agentId})
      OPTIONAL MATCH (a)<-[:GIVEN_TO]-(f:Flag)
      OPTIONAL MATCH (a)<-[:ISSUED_TO]-(w:PaymentWarning)
      OPTIONAL MATCH (r:Report)-[:AGAINST]->(a)
      OPTIONAL MATCH (a)-[:REGISTERED]->(cu:Customer)
      OPTIONAL MATCH (o:Order)-[:ASSIGNED_TO]->(a)
      RETURN a.name AS agent, a.points AS points, a.status AS status,
             count(DISTINCT o) AS ordersHandled,
             collect(DISTINCT f.id) AS flags,
             count(DISTINCT w) AS paymentWarnings,
             collect(DISTINCT r.subject) AS reportsAgainst,
             collect(DISTINCT cu.accountNumber) AS customersRegistered`,
    params: { agentId: "A-03" },
  },
];
