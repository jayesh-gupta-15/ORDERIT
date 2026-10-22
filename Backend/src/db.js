const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.poolSize,
  decimalNumbers: true, // DECIMAL columns come back as numbers (2 d.p. money)
  timezone: 'Z',
  charset: 'utf8mb4',
});

// Every connection speaks UTC so TIMESTAMPs round-trip unambiguously.
pool.pool.on('connection', conn => conn.query("SET time_zone = '+00:00'"));

const RETRYABLE = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);

/** Runs fn(conn) inside a transaction; retries on deadlock. */
async function withTransaction(fn) {
  for (let attempt = 1; ; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      try { await conn.rollback(); } catch (_) { /* connection already gone */ }
      if (RETRYABLE.has(err.code) && attempt < 3) continue;
      throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = { pool, withTransaction };
