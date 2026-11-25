import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import argon2 from 'argon2';
import { z } from 'zod';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { encrypt, decrypt, randomToken, digest } from './crypto.js';

const password = z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/);
const email = z.string().trim().toLowerCase().email().max(254);
const name = z.string().trim().min(1).max(100);
const content = z.string().min(1).max(10000);
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const regenerate = req => new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
const destroy = req => new Promise((resolve, reject) => req.session.destroy(err => err ? reject(err) : resolve()));
const hashPassword = value => argon2.hash(value, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
const loginResponse = { error: 'Credenciales inválidas o acceso temporalmente limitado.' };

export function createApp({ pool, settings, logger, sendRecovery }) {
  const app = express();
  app.disable('x-powered-by');
  if (settings.trustProxy) app.set('trust proxy', settings.trustProxy);
  app.use(helmet());
  app.use(express.json({ limit: '32kb' }));
  app.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.set('Referrer-Policy', 'no-referrer'); next(); });
  const PgStore = connectPgSimple(session);
  app.use(session({ name: 'sv.sid', secret: settings.sessionSecret, store: new PgStore({ pool, schemaName: 'securevault', tableName: 'sessions', createTableIfMissing: false }), resave: false, saveUninitialized: false, rolling: true, cookie: { httpOnly: true, secure: settings.production, sameSite: 'lax', maxAge: 15 * 60 * 1000 } }));
  const event = async (type, result, userId = null, client = pool) => {
    await client.query('INSERT INTO securevault.security_events(event_type,result,user_id) VALUES ($1,$2,$3)', [type, result, userId]);
    logger.info({ event: type, result, userId }, 'security_event');
  };
  app.get('/health', async (_req, res) => { try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); } catch { res.status(503).json({ status: 'unavailable' }); } });
  app.get('/api/auth/csrf', (req, res) => { req.session.csrf ||= randomToken(); res.json({ csrfToken: req.session.csrf }); });
  app.use('/api', asyncRoute(async (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('origin') !== settings.origin || !safeEqual(req.get('x-csrf-token'), req.session.csrf)) { await event('access_denied', 'csrf_or_origin'); return res.status(403).json({ error: 'Solicitud rechazada.' }); }
    next();
  }));
  const auth = asyncRoute(async (req, res, next) => {
    if (!req.session.userId || !req.session.authenticatedAt || Date.now() - req.session.authenticatedAt > 8 * 60 * 60 * 1000) return res.status(401).json({ error: 'Inicie sesión.' });
    const result = await pool.query('SELECT id,email,name,role,session_version FROM securevault.users WHERE id=$1', [req.session.userId]);
    const user = result.rows[0];
    if (!user || user.session_version !== req.session.version) return res.status(401).json({ error: 'Inicie sesión.' });
    req.user = user; next();
  });
  const admin = asyncRoute(async (req, res, next) => { if (req.user.role !== 'administrador') { await event('access_denied', 'denied', req.user.id); return res.status(403).json({ error: 'Acceso denegado.' }); } next(); });
  app.post('/api/auth/registro', asyncRoute(async (req, res) => {
    const parsed = z.object({ name, email, password }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos.' });
    const { name: userName, email: mail, password: pass } = parsed.data;
    try { const result = await pool.query('INSERT INTO securevault.users(id,email,name,password_hash) VALUES ($1,$2,$3,$4) RETURNING id,email,name,role', [randomUUID(), mail, userName, await hashPassword(pass)]); return res.status(201).json({ user: result.rows[0] }); }
    catch (err) { if (err.code === '23505') return res.status(409).json({ error: 'No se pudo registrar la cuenta.' }); throw err; }
  }));
  app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const parsed = z.object({ email, password: z.string().max(128) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos.' });
    const keys = [`account:${digest(parsed.data.email)}`, `network:${digest(req.ip)}`].sort();
    const client = await pool.connect(); let user; let limited = false; let valid = false;
    try {
      await client.query('BEGIN');
      for (const key of keys) { await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]); await client.query('INSERT INTO securevault.login_limits(bucket) VALUES ($1) ON CONFLICT DO NOTHING', [key]); }
      const limits = await client.query('SELECT bucket,failures,blocked_until FROM securevault.login_limits WHERE bucket=ANY($1::text[])', [keys]);
      limited = limits.rows.some(row => row.blocked_until && row.blocked_until > new Date());
      if (!limited) {
        const result = await client.query('SELECT id,password_hash,session_version FROM securevault.users WHERE email=$1', [parsed.data.email]); user = result.rows[0];
        // A missing account still incurs Argon2 work, without disclosing an account's existence.
        valid = user ? await argon2.verify(user.password_hash, parsed.data.password) : (await hashPassword(parsed.data.password), false);
        for (const row of limits.rows) {
          if (valid) await client.query('UPDATE securevault.login_limits SET failures=0,blocked_until=NULL,updated_at=now() WHERE bucket=$1', [row.bucket]);
          else { const count = row.failures + 1; const seconds = count >= 5 ? Math.min(900, 30 * (2 ** Math.min(count - 5, 5))) : 0; await client.query("UPDATE securevault.login_limits SET failures=$2,blocked_until=CASE WHEN $3::int > 0 THEN now()+($3::int * interval '1 second') ELSE NULL END,updated_at=now() WHERE bucket=$1", [row.bucket, count, seconds]); }
        }
        await event('login', valid ? 'success' : 'failure', user?.id || null, client);
        if (!valid && limits.rows.some(row => row.failures + 1 === 5)) await event('login_alert', 'threshold', user?.id || null, client);
      }
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
    if (limited) return res.status(429).json(loginResponse);
    if (!valid) return res.status(401).json(loginResponse);
    await regenerate(req); req.session.userId = user.id; req.session.version = user.session_version; req.session.authenticatedAt = Date.now(); req.session.csrf = randomToken();
    res.json({ csrfToken: req.session.csrf });
  }));
  app.get('/api/auth/me', auth, (req, res) => res.json({ user: { id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role } }));
  app.post('/api/auth/logout', auth, asyncRoute(async (req, res) => { await pool.query('UPDATE securevault.users SET session_version=session_version+1 WHERE id=$1', [req.user.id]); await destroy(req); res.clearCookie('sv.sid', { httpOnly: true, secure: settings.production, sameSite: 'lax' }); res.json({ ok: true }); }));
  app.get('/api/notas', auth, asyncRoute(async (req, res) => { const result = await pool.query('SELECT id,content_encrypted,created_at,updated_at FROM securevault.notes WHERE owner_id=$1 ORDER BY updated_at DESC,id LIMIT 100', [req.user.id]); res.json({ notes: result.rows.map(row => ({ id: row.id, content: decrypt(row.content_encrypted, settings.key), createdAt: row.created_at, updatedAt: row.updated_at })) }); }));
  app.post('/api/notas', auth, asyncRoute(async (req, res) => {
    const parsed = z.object({ content }).strict().safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos.' });
    const client = await pool.connect(); let row;
    try { await client.query('BEGIN'); await client.query('SELECT id FROM securevault.users WHERE id=$1 FOR UPDATE', [req.user.id]); const count = await client.query('SELECT count(*)::int AS count FROM securevault.notes WHERE owner_id=$1', [req.user.id]); if (count.rows[0].count >= 100) { await client.query('ROLLBACK'); return res.status(429).json({ error: 'Límite de 100 notas alcanzado.' }); } const result = await client.query('INSERT INTO securevault.notes(id,owner_id,content_encrypted) VALUES ($1,$2,$3) RETURNING id,created_at,updated_at', [randomUUID(), req.user.id, encrypt(parsed.data.content, settings.key)]); row = result.rows[0]; await client.query('COMMIT'); }
    catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
    res.status(201).json({ note: { id: row.id, content: parsed.data.content, createdAt: row.created_at, updatedAt: row.updated_at } });
  }));
  const noteId = (req, res, next) => z.uuid().safeParse(req.params.id).success ? next() : res.status(404).json({ error: 'Nota no encontrada.' });
  app.get('/api/notas/:id', auth, noteId, asyncRoute(async (req, res) => { const result = await pool.query('SELECT id,content_encrypted,created_at,updated_at FROM securevault.notes WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]); if (!result.rowCount) return res.status(404).json({ error: 'Nota no encontrada.' }); const row = result.rows[0]; res.json({ note: { id: row.id, content: decrypt(row.content_encrypted, settings.key), createdAt: row.created_at, updatedAt: row.updated_at } }); }));
  app.patch('/api/notas/:id', auth, noteId, asyncRoute(async (req, res) => { const parsed = z.object({ content }).strict().safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos.' }); const result = await pool.query('UPDATE securevault.notes SET content_encrypted=$3,updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING id', [req.params.id, req.user.id, encrypt(parsed.data.content, settings.key)]); if (!result.rowCount) return res.status(404).json({ error: 'Nota no encontrada.' }); res.json({ ok: true }); }));
  app.delete('/api/notas/:id', auth, noteId, asyncRoute(async (req, res) => { const result = await pool.query('DELETE FROM securevault.notes WHERE id=$1 AND owner_id=$2 RETURNING id', [req.params.id, req.user.id]); if (!result.rowCount) return res.status(404).json({ error: 'Nota no encontrada.' }); res.json({ ok: true }); }));
  app.get('/api/perfil', auth, asyncRoute(async (req, res) => { const result = await pool.query('SELECT phone_encrypted FROM securevault.users WHERE id=$1', [req.user.id]); const phone = result.rows[0].phone_encrypted ? decrypt(result.rows[0].phone_encrypted, settings.key) : ''; res.json({ name: req.user.name, email: req.user.email, phoneMasked: phone ? `****${phone.slice(-4)}` : '' }); }));
  app.patch('/api/perfil', auth, asyncRoute(async (req, res) => { const parsed = z.object({ name, phone: z.string().trim().max(30) }).strict().safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos.' }); await pool.query('UPDATE securevault.users SET name=$2,phone_encrypted=$3 WHERE id=$1', [req.user.id, parsed.data.name, parsed.data.phone ? encrypt(parsed.data.phone, settings.key) : null]); res.json({ ok: true }); }));
  app.post('/api/auth/recuperar', asyncRoute(async (req, res) => {
    const parsed = z.object({ email }).strict().safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos.' });
    const keys = [`recovery-account:${digest(parsed.data.email)}`, `recovery-network:${digest(req.ip)}`].sort();
    const client = await pool.connect(); let allowed;
    try {
      await client.query('BEGIN');
      for (const key of keys) { await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]); await client.query('INSERT INTO securevault.login_limits(bucket) VALUES ($1) ON CONFLICT DO NOTHING', [key]); }
      const limits = await client.query("SELECT bucket,CASE WHEN updated_at < now()-interval '15 minutes' THEN 0 ELSE failures END AS attempts FROM securevault.login_limits WHERE bucket=ANY($1::text[])", [keys]);
      allowed = limits.rows.every(row => row.attempts < 3);
      if (allowed) for (const row of limits.rows) await client.query('UPDATE securevault.login_limits SET failures=$2,updated_at=now() WHERE bucket=$1', [row.bucket, row.attempts + 1]);
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
    if (allowed) { const result = await pool.query('SELECT id,email FROM securevault.users WHERE email=$1', [parsed.data.email]); if (result.rowCount) { const token = randomToken(); await pool.query("INSERT INTO securevault.recoveries(id,owner_id,token_hash,expires_at) VALUES ($1,$2,$3,now()+interval '15 minutes')", [randomUUID(), result.rows[0].id, digest(token)]); try { await sendRecovery(result.rows[0].email, `${settings.origin}/restablecer#${token}`); } catch { logger.error({ event: 'mail_delivery_failed' }, 'delivery_failed'); } } }
    res.json({ message: 'Si la cuenta existe, se enviarán instrucciones.' });
  }));
  app.post('/api/auth/restablecer', asyncRoute(async (req, res) => {
    const parsed = z.object({ token: z.string().min(40).max(100), password }).strict().safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos.' });
    const newHash = await hashPassword(parsed.data.password); const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const lookup = await client.query('SELECT owner_id FROM securevault.recoveries WHERE token_hash=$1', [digest(parsed.data.token)]);
      if (!lookup.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Enlace inválido o vencido.' }); }
      const owner = lookup.rows[0].owner_id;
      await client.query('SELECT id FROM securevault.users WHERE id=$1 FOR UPDATE', [owner]);
      const tokenRow = await client.query('SELECT id FROM securevault.recoveries WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE', [digest(parsed.data.token)]);
      if (!tokenRow.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Enlace inválido o vencido.' }); }
      await client.query('UPDATE securevault.recoveries SET consumed_at=now() WHERE owner_id=$1 AND consumed_at IS NULL', [owner]);
      await client.query('UPDATE securevault.users SET password_hash=$2,session_version=session_version+1 WHERE id=$1', [owner, newHash]);
      await client.query("DELETE FROM securevault.sessions WHERE sess->>'userId'=$1", [owner]); await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
    res.json({ ok: true });
  }));
  const pagination = req => { const page = Number(req.query.page || 1); return Number.isSafeInteger(page) && page >= 1 && page <= 10000 ? (page - 1) * 25 : null; };
  app.get('/api/admin/usuarios', auth, admin, asyncRoute(async (req, res) => { const offset = pagination(req); if (offset === null) return res.status(400).json({ error: 'Página inválida.' }); const result = await pool.query('SELECT id,email,name,role,created_at FROM securevault.users ORDER BY created_at DESC,id LIMIT 25 OFFSET $1', [offset]); res.json({ users: result.rows }); }));
  app.get('/api/admin/eventos', auth, admin, asyncRoute(async (req, res) => { const offset = pagination(req); if (offset === null) return res.status(400).json({ error: 'Página inválida.' }); const result = await pool.query('SELECT id,created_at,event_type,result,user_id FROM securevault.security_events ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET $1', [offset]); res.json({ events: result.rows }); }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  app.use((err, _req, res, _next) => { const id = randomUUID(); logger.error({ errorId: id, type: err.name }, 'request_failed'); if (!res.headersSent) res.status(err.type === 'entity.too.large' ? 413 : err.type === 'entity.parse.failed' ? 400 : 500).json({ error: 'No se pudo completar la solicitud.', reference: id }); });
  return app;
}
