import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL não foi configurada.');

const sql = neon(databaseUrl);
const migration = await readFile(resolve('sql/001_create_automation_orders.sql'), 'utf8');
await sql.query(migration);
console.log('Migration 001 aplicada com sucesso.');
