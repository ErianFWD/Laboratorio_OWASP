import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { config } from '../src/config.js';

test('PostgreSQL remoto exige TLS verificado independientemente de NODE_ENV', () => {
  const keys = ['DATABASE_URL','SESSION_SECRET','DATA_ENCRYPTION_KEY','APP_ORIGIN','NODE_ENV','DATABASE_CA_PEM','TRUST_PROXY_CIDRS'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.SESSION_SECRET = randomBytes(32).toString('hex');
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.APP_ORIGIN = 'http://127.0.0.1:5173';
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_CA_PEM;
    process.env.DATABASE_URL = 'postgresql://test@db.example.invalid/test';
    assert.equal(config().ssl.rejectUnauthorized, true);
    process.env.DATABASE_URL = 'postgresql://test@db.example.invalid/test?sslmode=disable';
    assert.throws(() => config(), /opciones TLS/);
    process.env.DATABASE_URL = 'postgresql://test@127.0.0.1/test';
    assert.equal(config().ssl, undefined);
  } finally {
    for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
  }
});
