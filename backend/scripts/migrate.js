import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (err) { if (err.code !== 'ENOENT') throw new Error('No se pudo leer backend/.env'); }
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('Falta MIGRATION_DATABASE_URL');
let parsed;
try { parsed = new URL(url); } catch { throw new Error('MIGRATION_DATABASE_URL no es una URL válida'); }
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname || parsed.pathname === '/') throw new Error('MIGRATION_DATABASE_URL debe incluir protocolo, host y base de datos');
if ([...parsed.searchParams.keys()].some(k => k.toLowerCase().startsWith('ssl'))) throw new Error('Quite los parámetros SSL de MIGRATION_DATABASE_URL; TLS se configura por separado');
const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase());
let ssl;
if (!local || process.env.NODE_ENV === 'production') {
  ssl = { rejectUnauthorized: true };
  if (process.env.DATABASE_CA_PEM) {
    try { ssl.ca = readFileSync(process.env.DATABASE_CA_PEM, 'utf8'); }
    catch { throw new Error('No se pudo leer DATABASE_CA_PEM'); }
  }
}
const client = new pg.Client({ connectionString: url, ssl, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  await client.query('SELECT pg_advisory_lock(772143901)');
  await client.query('CREATE TABLE IF NOT EXISTS public.securevault_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const dir = fileURLToPath(new URL('../db/migrations/', import.meta.url));
  for (const name of (await readdir(dir)).filter(x => /^\d+_[a-z_]+\.sql$/.test(x)).sort()) {
    if ((await client.query('SELECT 1 FROM public.securevault_migrations WHERE name=$1', [name])).rowCount) continue;
    // Each migration and its marker are atomic. Migration files must not include BEGIN/COMMIT.
    await client.query('BEGIN');
    try { await client.query(await readFile(`${dir}/${name}`, 'utf8')); await client.query('INSERT INTO public.securevault_migrations(name) VALUES ($1)', [name]); await client.query('COMMIT'); }
    catch (err) { await client.query('ROLLBACK'); throw err; }
    console.log(`Aplicada: ${name}`);
  }
} catch (err) {
  const code = typeof err.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(err.code) ? err.code : 'ERROR';
  console.error(`Migración no completada (código ${code}). No se muestran datos de conexión.`);
  process.exitCode = 1;
} finally { await client.query('SELECT pg_advisory_unlock(772143901)').catch(() => {}); await client.end().catch(() => {}); }
