export interface QueryResult<T> {
  rows: T[];
}
export interface SqlClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}
export interface Database extends SqlClient {
  transaction<T>(work: (client: SqlClient) => Promise<T>): Promise<T>;
}
export async function initializeDatabase(db: SqlClient): Promise<void> {
  for (const sql of [
    "CREATE TABLE IF NOT EXISTS feedback_entities (kind TEXT NOT NULL, id TEXT NOT NULL, payload JSONB NOT NULL, PRIMARY KEY (kind,id))",
    "CREATE TABLE IF NOT EXISTS feedback_guard (id INTEGER PRIMARY KEY)",
    "INSERT INTO feedback_guard (id) VALUES (1) ON CONFLICT DO NOTHING",
    "CREATE TABLE IF NOT EXISTS feedback_attempts (digest TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, receipt TEXT NOT NULL, expires BIGINT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS feedback_limits (id TEXT PRIMARY KEY, digest TEXT NOT NULL, expires BIGINT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS feedback_limits_source ON feedback_limits (digest, expires)",
    "CREATE TABLE IF NOT EXISTS feedback_budget (day TEXT PRIMARY KEY, writes INTEGER NOT NULL)",
  ])
    await db.query(sql);
}
export async function locked<T>(
  db: Database,
  work: (client: SqlClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (client) => {
    await client.query("SELECT id FROM feedback_guard WHERE id=1 FOR UPDATE");
    return work(client);
  });
}
export async function purgeExpired(
  db: SqlClient,
  now = Date.now(),
): Promise<void> {
  await db.query("DELETE FROM feedback_attempts WHERE expires <= $1", [now]);
  await db.query("DELETE FROM feedback_limits WHERE expires <= $1", [now]);
  await db.query("DELETE FROM feedback_budget WHERE day < $1", [
    new Date(now - 2 * 86400000).toISOString().slice(0, 10),
  ]);
}
