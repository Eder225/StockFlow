import crypto from 'crypto'

const SALT_LEN = 16
const KEY_LEN = 32
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const
const SCRYPT_PREFIX = '$scrypt$'

function isScryptHash(hash: string): boolean {
  return hash.startsWith(SCRYPT_PREFIX)
}

function isSha256Hash(hash: string): boolean {
  return /^[0-9a-f]{64}$/i.test(hash)
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LEN)
  const derivedKey = crypto.scryptSync(password, salt, KEY_LEN, SCRYPT_PARAMS)
  return `${SCRYPT_PREFIX}${salt.toString('base64')}$${derivedKey.toString('base64')}`
}

export function verifyPassword(password: string, hash: string): boolean {
  if (isSha256Hash(hash)) {
    return crypto.createHash('sha256').update(password).digest('hex') === hash
  }
  if (!isScryptHash(hash)) return false

  const parts = hash.slice(SCRYPT_PREFIX.length).split('$')
  if (parts.length !== 2) return false

  const salt = Buffer.from(parts[0], 'base64')
  const expected = Buffer.from(parts[1], 'base64')
  const derived = crypto.scryptSync(password, salt, KEY_LEN, SCRYPT_PARAMS)

  if (derived.length !== expected.length) return false
  return crypto.timingSafeEqual(derived, expected)
}

export function needsHashUpgrade(hash: string): boolean {
  return isSha256Hash(hash)
}
