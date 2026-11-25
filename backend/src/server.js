import pg from 'pg';
import pino from 'pino';
import { config, resolveTrustProxy } from './config.js';
import { createApp } from './app.js';
import { createProxyDiagnostic } from './proxy-diagnostic.js';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (err) { if (err.code !== 'ENOENT') throw new Error('No se pudo leer backend/.env'); }
const logger = pino();
const diagnosticValue = process.env.PROXY_DIAGNOSTIC || 'false';
if (!['true', 'false'].includes(diagnosticValue)) throw new Error('PROXY_DIAGNOSTIC debe ser true o false');
const diagnostic = diagnosticValue === 'true';
let pool;
async function sendRecovery(to, url) {
  if (!process.env.MAIL_API_KEY || !process.env.MAIL_FROM) throw new Error('Correo no configurado');
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.MAIL_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject: 'Restablecer contraseña de SecureVault', text: `Abra este enlace privado, válido por 15 minutos: ${url}` }), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Error de correo');
}
let app, port;
if (diagnostic) {
  app = createProxyDiagnostic({ trustProxy: resolveTrustProxy(true), token: process.env.PROXY_DIAGNOSTIC_TOKEN, logger });
  port = Number(process.env.PORT || 3000);
  logger.info({ event: 'diagnostic_mode_active' }, 'application_routes_disabled');
} else {
  const settings = config();
  pool = new pg.Pool({ connectionString: settings.databaseUrl, ssl: settings.ssl, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, query_timeout: 5000 });
  pool.on('error', () => logger.error({ event: 'database_pool_error' }, 'database_error'));
  app = createApp({ pool, settings, logger, sendRecovery });
  port = settings.port;
}
const server = app.listen(port, '0.0.0.0', () => logger.info({ event: 'listening', port }));
let closing = false;
async function shutdown(reason) { if (closing) return; closing = true; logger.error({ event: reason }, 'shutdown'); server.close(async () => { if (pool) await pool.end(); process.exit(reason === 'signal' ? 0 : 1); }); setTimeout(() => process.exit(1), 10000).unref(); }
process.on('SIGTERM', () => shutdown('signal')); process.on('SIGINT', () => shutdown('signal'));
process.on('unhandledRejection', () => shutdown('unhandled_rejection')); process.on('uncaughtException', () => shutdown('uncaught_exception'));
