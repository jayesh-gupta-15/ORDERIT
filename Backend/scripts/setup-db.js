/* Creates the database, tables, view, function and sample data from ../DataBase/*.sql.
 *   npm run db:setup   - create everything (skips if tables already exist)
 *   npm run db:reset   - DROP the database and recreate it with fresh sample data
 *   add --no-data to load the schema only
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

const DB_DIR = path.join(__dirname, '..', '..', 'DataBase');
const args = new Set(process.argv.slice(2));

/** Splits a mysql-client style script into statements, honouring DELIMITER changes. */
function splitSql(text) {
  const statements = [];
  let delimiter = ';';
  let buffer = [];
  for (const rawLine of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    const dm = /^DELIMITER\s+(\S+)\s*$/i.exec(trimmed);
    if (dm) { delimiter = dm[1]; continue; }
    if (!buffer.length && (trimmed === '' || trimmed.startsWith('--'))) continue; // comment/blank between statements
    if (trimmed.startsWith('--')) continue; // comment inside a statement (also catches "--Foo" with no space)
    buffer.push(line);
    if (trimmed.endsWith(delimiter)) {
      const stmt = buffer.join('\n');
      statements.push(stmt.slice(0, stmt.lastIndexOf(delimiter)).trim());
      buffer = [];
    }
  }
  if (buffer.join('').trim()) statements.push(buffer.join('\n').trim());
  return statements.filter(Boolean);
}

async function runFile(conn, file) {
  const statements = splitSql(fs.readFileSync(path.join(DB_DIR, file), 'utf8'));
  for (const [i, sql] of statements.entries()) {
    try {
      await conn.query(sql);
    } catch (err) {
      err.message = `${file} statement #${i + 1} failed: ${err.message}\n--- SQL ---\n${sql.slice(0, 300)}`;
      throw err;
    }
  }
  console.log(`  ran ${file} (${statements.length} statements)`);
}

async function main() {
  const { host, port, user, password, database } = config.db;
  const conn = await mysql.createConnection({ host, port, user, password, charset: 'utf8mb4' });
  try {
    await conn.query("SET time_zone = '+00:00'");
    if (args.has('--reset')) {
      console.log(`Dropping database ${database}...`);
      await conn.query(`DROP DATABASE IF EXISTS \`${database}\``);
    }
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4`);
    await conn.query(`USE \`${database}\``);

    const [tables] = await conn.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = 'users'", [database]);
    if (tables[0].n > 0) {
      console.log(`Database "${database}" already has tables - nothing to do. Use "npm run db:reset" to start over.`);
      return;
    }
    console.log(`Creating "${database}"...`);
    await runFile(conn, 'schema.sql');
    if (!args.has('--no-data')) await runFile(conn, 'data.sql');
    console.log('Done.');
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('\nDatabase setup failed:\n' + err.message);
  if (err.code === 'ECONNREFUSED') console.error('\nMySQL is not running on ' + config.db.host + ':' + config.db.port + '. Start it, then retry.');
  if (err.code === 'ER_ACCESS_DENIED_ERROR') console.error('\nWrong DB_USER / DB_PASSWORD in Backend/.env.');
  process.exit(1);
});
