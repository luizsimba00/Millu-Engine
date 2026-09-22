import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL ?? process.env.MILLU_DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL não foi configurada.');

const sql = neon(databaseUrl);
const migrationDirectory = resolve('sql');
const files = (await readdir(migrationDirectory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();

for (const file of files) {
  const migration = await readFile(resolve(migrationDirectory, file), 'utf8');
  await sql.query(migration);
  console.log(`Migration ${file} aplicada com sucesso.`);
}
