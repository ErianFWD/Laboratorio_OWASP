import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import { randomBytes } from 'node:crypto';
import { createProxyDiagnostic } from '../src/proxy-diagnostic.js';

test('proxy simulado: cookie Secure e IP más cercana no confiable', async () => {
  const app = express();
  // Solo para el proxy simulado local; no es una recomendación para Render.
  app.set('trust proxy', ['loopback']);
  app.use(session({ secret: randomBytes(32).toString('hex'), resave: false, saveUninitialized: false, cookie: { secure: true, httpOnly: true, sameSite: 'lax' } }));
  app.get('/', (req, res) => { req.session.started = true; res.json({ ip: req.ip, protocol: req.protocol }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    const direct = await fetch(url, { headers: { 'x-forwarded-for': '203.0.113.99, 198.51.100.1', 'x-forwarded-proto': 'https' } });
    const directData = await direct.json();
    assert.equal(directData.ip, '198.51.100.1');
    assert.equal(directData.protocol, 'https');
    assert.match(direct.headers.get('set-cookie'), /; Secure/);
    const viaVercel = await fetch(url, { headers: { 'x-forwarded-for': '203.0.113.10, 198.51.100.10', 'x-forwarded-proto': 'https' } });
    assert.equal((await viaVercel.json()).ip, '198.51.100.10');
    const noHttps = await fetch(url);
    assert.equal(noHttps.headers.get('set-cookie'), null);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('diagnóstico exige token y desactiva rutas sensibles sin registrar cabeceras ni cuerpos', async () => {
  const token = randomBytes(32).toString('hex');
  const logs = [];
  const app = createProxyDiagnostic({ trustProxy: 1, token, logger: { info: entry => logs.push(entry) } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/api/__proxy_diag`)).status, 404);
    const denied = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'cookie': 'private-cookie-value' }, body: JSON.stringify({ password: 'private-body-value' }) });
    assert.equal(denied.status, 503);
    const response = await fetch(`${base}/api/__proxy_diag`, { headers: { 'x-proxy-diagnostic-token': token, 'x-forwarded-for': '203.0.113.1, 198.51.100.1', 'x-forwarded-proto': 'https', cookie: 'private-cookie-value' } });
    const info = await response.json();
    assert.equal(info.clientIp, '198.51.100.1');
    assert.equal(info.secure, true);
    assert.match(response.headers.get('set-cookie'), /; Secure/);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.doesNotMatch(JSON.stringify(logs), /private-cookie-value|private-body-value/);
    assert.ok(!JSON.stringify(logs).includes(token));
    const plain = await fetch(`${base}/api/__proxy_diag`, { headers: { 'x-proxy-diagnostic-token': token } });
    assert.equal(plain.headers.get('set-cookie'), null);
    assert.equal((await plain.json()).secure, false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
