import pg from 'pg';
import pino from 'pino';
import { config } from './config.js';
import { createApp } from './app.js';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (err) { if (err.code !== 'ENOENT') throw new Error('No se pudo leer backend/.env'); }
const settings = config();
const logger = pino();
const pool = new pg.Pool({ connectionString: settings.databaseUrl, ssl: settings.ssl, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, query_timeout: 5000 });
pool.on('error', () => logger.error({ event: 'database_pool_error' }, 'database_error'));
async function sendRecovery(to, url) {
  if (!process.env.MAIL_API_KEY || !process.env.MAIL_FROM) throw new Error('Correo no configurado');
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.MAIL_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject: 'Restablecer contraseña de SecureVault', text: `Abra este enlace privado, válido por 15 minutos: ${url}` }), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Error de correo');
}
const app = createApp({ pool, settings, logger, sendRecovery });
const server = app.listen(settings.port, '0.0.0.0', () => logger.info({ event: 'listening', port: settings.port }));
let closing = false;
async function shutdown(reason) { if (closing) return; closing = true; logger.error({ event: reason }, 'shutdown'); server.close(async () => { await pool.end(); process.exit(reason === 'signal' ? 0 : 1); }); setTimeout(() => process.exit(1), 10000).unref(); }
process.on('SIGTERM', () => shutdown('signal')); process.on('SIGINT', () => shutdown('signal'));
process.on('unhandledRejection', () => shutdown('unhandled_rejection')); process.on('uncaughtException', () => shutdown('uncaught_exception'));
