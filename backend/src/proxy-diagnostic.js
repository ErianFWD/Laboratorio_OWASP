import express from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

const hash = value => createHash('sha256').update(value).digest();
const ipOrNull = value => typeof value === 'string' && isIP(value.trim()) ? value.trim() : null;

// Only safe after PROXY_DIAGNOSTIC=true has been explicitly configured.
// This app has no database, authentication routes, or application session store.
export function createProxyDiagnostic({ trustProxy, token, logger }) {
  if (typeof token !== 'string' || Buffer.byteLength(token) < 32) throw new Error('PROXY_DIAGNOSTIC_TOKEN debe tener al menos 32 bytes aleatorios');
  if (!trustProxy) throw new Error('Configure TRUST_PROXY_HOPS o TRUST_PROXY_CIDRS para el diagnóstico');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.set('X-Content-Type-Options', 'nosniff'); next(); });
  app.get('/health', (_req, res) => res.json({ status: 'diagnostic' }));
  const tokenHash = hash(token);
  app.get('/api/__proxy_diag', (req, res, next) => {
    if (!timingSafeEqual(hash(req.get('x-proxy-diagnostic-token') || ''), tokenHash)) return res.sendStatus(404);
    next();
  }, (req, res) => {
    const raw = req.get('x-forwarded-for') || '';
    const items = raw && raw.length <= 2048 ? raw.split(',') : [];
    const parts = items.slice(0, 16).map(part => ipOrNull(part));
    const forwardedFor = parts.filter(Boolean);
    const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
    const info = {
      peer: ipOrNull(req.socket.remoteAddress),
      forwardedFor,
      forwardedForInvalid: raw.length > 2048 || items.length > 16 || parts.some(part => !part),
      forwardedProto: ['http', 'https'].includes(forwardedProto) ? forwardedProto : null,
      vercelForwardedFor: ipOrNull(req.get('x-vercel-forwarded-for')),
      clientIp: ipOrNull(req.ip),
      protocol: ['http', 'https'].includes(req.protocol) ? req.protocol : 'other',
      secure: req.secure,
      probeCookieExpected: req.secure,
    };
    // This is a disposable, non-authenticating cookie, not an application session.
    // The real express-session cookie must still be verified in normal mode.
    if (req.secure) res.cookie('sv.proxycheck', randomBytes(16).toString('hex'), { secure: true, httpOnly: true, sameSite: 'lax', maxAge: 60000 });
    logger.info({ event: 'proxy_diagnostic', ...info }, 'proxy_diagnostic');
    res.json(info);
  });
  app.use((_req, res) => res.status(503).json({ error: 'Servicio temporalmente en diagnóstico.' }));
  return app;
}
