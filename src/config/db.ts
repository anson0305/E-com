import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME ?? 'e_comdb',
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD,
  // Pool-specific settings
  max: 10,                // Maximum connections in pool (default 10)
  idleTimeoutMillis: 30000,  // Close idle connections after 30s
  connectionTimeoutMillis: 5000,  // Fail if can't connect within 5s
});