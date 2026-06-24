import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

// Server-only Drizzle client over the direct Postgres connection
// (DATABASE_URL). Bypasses RLS — never import from client components.
// `prepare: false` is required for the Supabase transaction pooler.
//
// Cache the underlying connection on globalThis in dev so Next.js hot-reloads
// reuse one pool instead of leaking a new one each time (which exhausts
// Postgres connection slots).
const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.pgClient ??
  postgres(process.env.DATABASE_URL!, { prepare: false, max: 5 });

if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
