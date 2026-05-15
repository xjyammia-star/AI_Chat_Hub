// api/_lib/crypto.ts
// API Key 加密/解密工具

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY || 'fallback-32-char-key-change-this!'
  return createHash('sha256').update(key).digest()
}

export function encryptKey(plaintext: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', getKey(), iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

export function decryptKey(encrypted: string): string {
  const [ivHex, encryptedHex] = encrypted.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = createDecipheriv('aes-256-cbc', getKey(), iv)
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
