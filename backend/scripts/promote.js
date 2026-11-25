import pg from 'pg';
import pino from 'pino';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (err) { if (err.code !== 'ENOENT') throw new Error('No se pudo leer backend/.env'); }
const mail = process.argv[2]?.trim().toLowerCase();
if (!mail) throw new Error('Uso: npm run promote -- correo-registrado');
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('Falta MIGRATION_DATABASE_URL');
let ssl;
let parsed;
try { parsed = new URL(url); } catch { throw new Error('MIGRATION_DATABASE_URL no es una URL válida'); }
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname || parsed.pathname === '/') throw new Error('MIGRATION_DATABASE_URL debe incluir protocolo, host y base de datos');
if ([...parsed.searchParams.keys()].some(k => k.toLowerCase().startsWith('ssl'))) throw new Error('MIGRATION_DATABASE_URL no debe sobrescribir opciones TLS');
if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase()) || process.env.NODE_ENV === 'production') {
  ssl = { rejectUnauthorized: true };
  if (process.env.DATABASE_CA_PEM) {
    try { ssl.ca = readFileSync(process.env.DATABASE_CA_PEM, 'utf8'); }
    catch { throw new Error('No se pudo leer DATABASE_CA_PEM'); }
  }
}
const client = new pg.Client({ connectionString: url, ssl, connectionTimeoutMillis: 5000 });
await client.connect();
try {
  await client.query('BEGIN');
  const user = await client.query("UPDATE securevault.users SET role='administrador',session_version=session_version+1 WHERE email=$1 RETURNING id", [mail]);
  if (!user.rowCount) throw new Error('Cuenta no encontrada');
  await client.query("DELETE FROM securevault.sessions WHERE sess->>'userId'=$1", [user.rows[0].id]);
  await client.query("INSERT INTO securevault.security_events(event_type,result,user_id) VALUES ('role_change','promoted',$1)", [user.rows[0].id]);
  await client.query('COMMIT'); pino().info({ event: 'role_change', result: 'promoted', userId: user.rows[0].id });
} catch (err) { await client.query('ROLLBACK'); throw err; } finally { await client.end(); }
