import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

// Formato: versión:IV:etiqueta:texto, bytes codificados en base64url.
export function encrypt(plaintext, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid encryption key');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join(':');
}
export function decrypt(payload, key) {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1' || !Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid encrypted payload');
  const [iv, tag, ciphertext] = parts.slice(1).map(x => Buffer.from(x, 'base64url'));
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted payload');
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');
