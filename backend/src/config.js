import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
const required = name => { const value = process.env[name]; if (!value) throw new Error(`Falta ${name}`); return value; };
function parseTrustedProxies(value) {
  if (!value) return false;
  const entries = value.split(',').map(entry => entry.trim());
  for (const entry of entries) {
    if (['loopback', 'linklocal', 'uniquelocal'].includes(entry)) continue;
    const parts = entry.split('/');
    const family = isIP(parts[0]);
    if (parts.length > 2 || !family) throw new Error('TRUST_PROXY_CIDRS debe contener IP o CIDR válidos separados por comas');
    if (parts.length === 2) {
      const max = family === 4 ? 32 : 128;
      if (!/^[0-9]+$/.test(parts[1]) || Number(parts[1]) < 1 || Number(parts[1]) > max) throw new Error('TRUST_PROXY_CIDRS contiene una máscara inválida o demasiado amplia');
    }
  }
  return entries;
}
export function resolveTrustProxy(requiredInProduction = false) {
  const cidrs = process.env.TRUST_PROXY_CIDRS?.trim();
  const hops = process.env.TRUST_PROXY_HOPS?.trim();
  if (cidrs && hops) throw new Error('Configure solo TRUST_PROXY_CIDRS o TRUST_PROXY_HOPS');
  if (hops) {
    if (!/^[1-9][0-9]*$/.test(hops) || Number(hops) > 10) throw new Error('TRUST_PROXY_HOPS debe ser un entero entre 1 y 10');
    return Number(hops);
  }
  const value = parseTrustedProxies(cidrs);
  if (requiredInProduction && !value) throw new Error('Falta TRUST_PROXY_CIDRS o TRUST_PROXY_HOPS: verificar la topología antes de configurar');
  return value;
}
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
  const trustProxy = resolveTrustProxy(production);
  return { databaseUrl, sessionSecret, key, origin, production, ssl, trustProxy, port: Number(process.env.PORT || 3000) };
}
