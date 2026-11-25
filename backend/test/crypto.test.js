import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt, randomToken, digest } from '../src/crypto.js';

test('GCM utiliza IV distinto y recupera el texto', () => {
  const key = randomBytes(32); const first = encrypt("Nota de O'Brien", key); const second = encrypt("Nota de O'Brien", key);
  assert.notEqual(first, second); assert.equal(decrypt(first, key), "Nota de O'Brien"); assert.equal(decrypt(second, key), "Nota de O'Brien");
});
test('GCM rechaza modificación y llave incorrecta', () => {
  const key = randomBytes(32); const parts = encrypt('secreto', key).split(':');
  const tag = Buffer.from(parts[2], 'base64url'); tag[0] ^= 1; parts[2] = tag.toString('base64url');
  assert.throws(() => decrypt(parts.join(':'), key)); assert.throws(() => decrypt(encrypt('secreto', key), randomBytes(32)));
});
test('tokens de recuperación contienen 32 bytes aleatorios', () => {
  const token = randomToken(); assert.equal(Buffer.from(token, 'base64url').length, 32); assert.equal(digest(token).length, 64); assert.notEqual(token, randomToken());
});
