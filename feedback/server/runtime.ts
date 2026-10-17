import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import pg from "pg";
import type { Database, SqlClient } from "./database.ts";
import type { FeedbackConfig } from "./app.ts";
export function originOnly(value: string, local = false): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        local &&
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error("Invalid origin configuration");
  return url.origin;
}
export function readConfig(env: NodeJS.ProcessEnv): FeedbackConfig {
  const local = env.FEEDBACK_ENV === "local";
  if (
    env.VERCEL === "1" &&
    !["preview", "production"].includes(env.FEEDBACK_ENV || "")
  )
    throw new Error("Hosted environment must be explicit");
  if (env.VERCEL_ENV === "production" && env.FEEDBACK_ENV !== "production")
    throw new Error("Production environment must be explicit");
  if (env.VERCEL_ENV === "preview" && env.FEEDBACK_ENV !== "preview")
    throw new Error("Preview isolation is required");
  const origin = originOnly(
    env.FEEDBACK_ORIGIN || (local ? "http://127.0.0.1:4323" : ""),
    local,
  );
  const parents = (
    env.FEEDBACK_PARENT_ORIGINS || (local ? "http://127.0.0.1:4321" : "")
  )
    .split(",")
    .filter(Boolean)
    .map((value) => originOnly(value.trim(), local));
  if (parents.includes(origin))
    throw new Error("Separate parent origin is required");
  const jwtSecret =
    env.FEEDBACK_JWT_SECRET || (local ? randomBytes(32).toString("hex") : "");
  const sourceSalt =
    env.FEEDBACK_SOURCE_SALT || (local ? randomBytes(32).toString("hex") : "");
  if (
    jwtSecret.length < 32 ||
    sourceSalt.length < 32 ||
    jwtSecret === sourceSalt
  )
    throw new Error("Independent server secrets are required");
  const dailyBudget = Number(
    env.FEEDBACK_DAILY_WRITE_BUDGET || (local ? "100" : "0"),
  );
  if (!Number.isInteger(dailyBudget) || dailyBudget < 0 || dailyBudget > 10000)
    throw new Error("Invalid write budget");
  return {
    origin,
    parents,
    jwtSecret,
    sourceSalt,
    dailyBudget,
    writesPaused:
      env.FEEDBACK_WRITES_PAUSED === "1" ||
      (!local && env.FEEDBACK_QUALIFIED !== "1"),
  };
}
export function trustedVercelSource(
  request: Request,
  platform = process.env.VERCEL,
): string | undefined {
  if (platform !== "1") return undefined;
  const value = request.headers.get("x-vercel-forwarded-for")?.trim();
  return value && isIP(value) ? value : undefined;
}
export async function openDatabase(
  env: NodeJS.ProcessEnv,
): Promise<{ db: Database; close: () => Promise<void> }> {
  if (!env.DATABASE_URL) {
    if (env.FEEDBACK_ENV !== "local")
      throw new Error("Database configuration is required");
    const { PGlite } = await import("@electric-sql/pglite");
    const client = new PGlite(env.FEEDBACK_LOCAL_DATA);
    await client.waitReady;
    const db: Database = {
      query: (sql, values) => client.query(sql, values),
      transaction: (work) => client.transaction((tx) => work(tx as SqlClient)),
    };
    return { db, close: () => client.close() };
  }
  if (env.FEEDBACK_ENV === "local" && env.FEEDBACK_ALLOW_LOCAL_POSTGRES !== "1")
    throw new Error(
      "Local PostgreSQL requires explicit opt-in; use synthetic memory by default",
    );
  const url = new URL(env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("PostgreSQL is required");
  const localHost = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey"])
    url.searchParams.delete(key);
  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl:
      localHost && env.FEEDBACK_ENV === "local"
        ? false
        : { rejectUnauthorized: true },
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    statement_timeout: 5000,
    query_timeout: 7000,
  });
  pool.on("error", () => {});
  const db: Database = {
    query: (sql, values) => pool.query(sql, values),
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {}
        throw error;
      } finally {
        client.release();
      }
    },
  };
  return { db, close: () => pool.end() };
}
