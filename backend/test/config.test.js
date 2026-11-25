import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { config } from '../src/config.js';

test('PostgreSQL remoto exige TLS verificado independientemente de NODE_ENV', () => {
  const keys = ['DATABASE_URL','SESSION_SECRET','DATA_ENCRYPTION_KEY','APP_ORIGIN','NODE_ENV','DATABASE_CA_PEM','TRUST_PROXY_CIDRS','TRUST_PROXY_HOPS'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.SESSION_SECRET = randomBytes(32).toString('hex');
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.APP_ORIGIN = 'http://127.0.0.1:5173';
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_CA_PEM;
    delete process.env.TRUST_PROXY_HOPS;
    process.env.DATABASE_URL = 'postgresql://test@db.example.invalid/test';
    assert.equal(config().ssl.rejectUnauthorized, true);
    process.env.DATABASE_URL = 'postgresql://test@db.example.invalid/test?sslmode=disable';
    assert.throws(() => config(), /opciones TLS/);
    process.env.DATABASE_URL = 'postgresql://test@127.0.0.1/test';
    assert.equal(config().ssl, undefined);
    process.env.TRUST_PROXY_CIDRS = '127.0.0.1, 192.0.2.0/24';
    assert.deepEqual(config().trustProxy, ['127.0.0.1', '192.0.2.0/24']);
    for (const invalid of ['1', 'true', '0.0.0.0/0', '::/0', '127.0.0.1,', '192.0.2.0/33']) {
      process.env.TRUST_PROXY_CIDRS = invalid;
      assert.throws(() => config(), /TRUST_PROXY_CIDRS/);
    }
    delete process.env.TRUST_PROXY_CIDRS;
    process.env.TRUST_PROXY_HOPS = '1';
    assert.equal(config().trustProxy, 1);
    process.env.TRUST_PROXY_CIDRS = '127.0.0.1';
    assert.throws(() => config(), /solo TRUST_PROXY_CIDRS/);
    delete process.env.TRUST_PROXY_CIDRS;
    for (const invalid of ['0', 'true', '-1', '1.5', '11']) {
      process.env.TRUST_PROXY_HOPS = invalid;
      assert.throws(() => config(), /TRUST_PROXY_HOPS/);
    }
  } finally {
    for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
  }
});
