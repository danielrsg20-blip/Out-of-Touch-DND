import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'

export type UserRecord = {
  id: string
  username: string
  password_hash: string
}

const usersByUsername = new Map<string, UserRecord>()

function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, 32)
  return `scrypt$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false
  }

  const [, saltSegment, hashSegment] = parts
  if (!saltSegment || !hashSegment) {
    return false
  }

  const salt = Buffer.from(saltSegment, 'base64url')
  const expected = Buffer.from(hashSegment, 'base64url')
  const actual = Buffer.from(scryptSync(password, salt, expected.length))

  if (actual.length !== expected.length) {
    return false
  }

  return timingSafeEqual(actual, expected)
}

export function createUser(username: string, password: string): { ok: true; user: UserRecord } | { ok: false; reason: 'username_taken' } {
  if (usersByUsername.has(username)) {
    return { ok: false, reason: 'username_taken' }
  }

  const user: UserRecord = {
    id: randomUUID(),
    username,
    password_hash: hashPassword(password),
  }
  usersByUsername.set(username, user)
  return { ok: true, user }
}

export function authenticateUser(username: string, password: string): UserRecord | null {
  const user = usersByUsername.get(username)
  if (!user) {
    return null
  }
  return verifyPassword(password, user.password_hash) ? user : null
}

export function findUserByUsername(username: string): UserRecord | null {
  return usersByUsername.get(username) ?? null
}
