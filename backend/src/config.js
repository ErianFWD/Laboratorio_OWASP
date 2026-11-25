import { readFileSync } from 'node:fs';
const required = name => { const value = process.env[name]; if (!value) throw new Error(`Falta ${name}`); return value; };
export function config() {
  const databaseUrl = required('DATABASE_URL'); const sessionSecret = required('SESSION_SECRET'); const keyText = required('DATA_ENCRYPTION_KEY'); const origin = required('APP_ORIGIN');
  if (Buffer.byteLength(sessionSecret) < 32) throw new Error('SESSION_SECRET debe tener al menos 32 bytes');
  const key = Buffer.from(keyText, 'base64'); if (key.length !== 32 || key.toString('base64') !== keyText) throw new Error('DATA_ENCRYPTION_KEY debe ser base64 de 32 bytes');
  const parsed = new URL(origin); if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) throw new Error('APP_ORIGIN debe ser un origen exacto');
  const production = process.env.NODE_ENV === 'production';
  let dbUrl;
  try { dbUrl = new URL(databaseUrl); } catch { throw new Error('DATABASE_URL debe ser una URL válida'); }
  if (!['postgres:', 'postgresql:'].includes(dbUrl.protocol) || !dbUrl.hostname || !dbUrl.pathname || dbUrl.pathname === '/') throw new Error('DATABASE_URL debe incluir protocolo, host y base de datos');
  if ([...dbUrl.searchParams.keys()].some(k => k.toLowerCase().startsWith('ssl'))) throw new Error('DATABASE_URL no debe sobrescribir opciones TLS');
  if (production && parsed.protocol !== 'https:') throw new Error('APP_ORIGIN debe usar HTTPS');
  let ssl;
  const localDatabase = ['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname.toLowerCase());
  if (!localDatabase || production) {
    ssl = { rejectUnauthorized: true };
    const caPath = production ? required('DATABASE_CA_PEM') : process.env.DATABASE_CA_PEM;
    if (caPath) { try { ssl.ca = readFileSync(caPath, 'utf8'); } catch { throw new Error('No se pudo leer DATABASE_CA_PEM'); } }
  }
  const trustProxy = process.env.TRUST_PROXY_CIDRS ? process.env.TRUST_PROXY_CIDRS.split(',').map(s => s.trim()) : false;
  if (production && !trustProxy) throw new Error('Falta TRUST_PROXY_CIDRS: verificar la topología antes de configurar');
  return { databaseUrl, sessionSecret, key, origin, production, ssl, trustProxy, port: Number(process.env.PORT || 3000) };
}
