import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from './db.js';

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(20260929)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const dir = join(import.meta.dirname, '../sql');
    for (const name of (await readdir(dir)).filter((item) => item.endsWith('.sql')).sort()) {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (applied.rowCount) continue;
      await client.query('BEGIN');
      try {
        await client.query(await readFile(join(dir, name), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        console.log('Applied migration ' + name);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(20260929)');
    client.release();
  }
}

if (process.argv[1] && /migrate\.(ts|js)$/.test(process.argv[1])) {
  migrate().then(() => pool.end()).catch((error) => {
    console.error(error);
    process.exitCode = 1;
    void pool.end();
  });
}
