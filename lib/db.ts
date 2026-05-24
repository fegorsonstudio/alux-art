import postgres from "postgres";

const connectionString = process.env.DATABASE_URL!;

// Reuse the same pool across hot-reloads in dev
const globalForDb = global as unknown as { _db?: postgres.Sql };

export const sql: postgres.Sql =
  globalForDb._db ??
  postgres(connectionString, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    // Disable SSL for local VPS connections (localhost)
    ssl: connectionString?.includes("localhost") || connectionString?.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb._db = sql;
}

export default sql;
