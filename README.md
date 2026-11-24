# OpsGraph

Delivery-ops accountability, answered as graph traversals: an embedded Relate store of Ishop's agents, closers, orders, flags, warnings and suspensions that tells you *who is about to break a rule, why, and who is allowed to fix it*.

## Use case

Ishop (a Nigerian e-commerce logistics operation) runs a points-and-flags accountability system between **sales closers** and **delivery agents**:

- A closer assigns an order to an agent; the agent must **confirm within 1 hour** (orders from 5pm+ by 12pm next day) or the order **bounces back** to the closer and the agent **loses 15 points**.
- **3 red flags** on an agent → delivery suspension. Only the **Head of Operations** can lift it.
- **Payment due 48h** → warning → +24h → +24h → **ban**. Only the **Accountant** lifts payment suspensions.
- Closers sit in **tiers** by confirmed orders (Beginner <15, Standard 15–20, Superstar >20); new closers under 55% confirmation twice are banned; **HR** handles closer bans and misconduct reports.

Every accountability question in that system is a traversal, not a table scan: *"which agent is one flag from suspension and which closers keep feeding them orders?"*, *"who can lift this suspension?"*, *"trace why order O-1004 bounced"*. OpsGraph models the whole operation as a graph so those questions are single `MATCH` statements.

## How it uses Relate

- **Mode: single file** (`data/opsgraph.rl`). One artifact to clone, commit and inspect — a judge opens it with `relate info` or the CLI shell and sees the same graph the demo used, with zero setup.
- **Why this mode:** the store *is* the deliverable. A single `.rl` file survives `git clone`, needs no server, and can still be served live over MCP/HTTP/Bolt with `relate serve` when an agent or Neo4j Browser wants it.
- **What the graph models:** `Agent`, `SalesCloser`, `Order`, `Customer`, `Flag`, `PaymentWarning`, `Suspension`, `Tier`, `Role`, `Report` — connected by `ASSIGNED`, `ASSIGNED_TO`, `CONFIRMED_BY`, `BOUNCED_BACK_TO`, `GIVEN_TO`, `TRIGGERED_BY`, `ISSUED_TO`, `ON`, `LIFTABLE_BY`, `IN_TIER`, `FILED`, `AGAINST`, `RESOLVED_BY`, `REGISTERED`, `PLACED`. Authority paths (`Suspension -[:LIFTABLE_BY]-> Role`) make "who is allowed to undo this" a graph query, which is the whole point of the domain.

## Setup and run

Prerequisites: Node.js 18+, and the [Relate CLI](https://relatedb.ai/docs/get-started/install/) for the inspect/serve steps.

```bash
npm install
npm run seed        # rebuild data/opsgraph.rl deterministically
npm run ask         # list the 8 accountability questions
npm run ask -- --all
npm run ask -- why-bounced O-1005     # parameter override
npm run inspect     # relate info: store metadata, node/rel counts
npm run serve       # relate serve --mcp 8080 --http 7474 (agent-ready surfaces)
```

## Where the data lives

`data/opsgraph.rl` — the committed, persistent Relate single-file store. `npm run seed` regenerates it deterministically; the checked-in copy is the one the demo ran against.

## Demo

`npm run ask -- --all` walks the seeded stories end to end: Tunde one flag from suspension (and the two closers still assigning to him), Ibrahim one payment warning from a ban, Seun's suspension that only Head of Ops can lift, Amara two orders from Superstar, and the full trail of the 6pm order that bounced back at noon the next day.
