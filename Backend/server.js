const config = require('./src/config');
const app = require('./src/app');
const { pool } = require('./src/db');

async function main() {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error(`\nCould not connect to MySQL at ${config.db.host}:${config.db.port} (db "${config.db.database}"): ${err.message}`);
    console.error('Check Backend/.env and make sure you ran "npm run db:setup".\n');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`ORDERIT running at http://localhost:${config.port}  (API: /api, health: /api/health)`);
  });

  const shutdown = signal => {
    console.log(`\n${signal} received, shutting down...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', err => console.error('[unhandledRejection]', err));
main();
