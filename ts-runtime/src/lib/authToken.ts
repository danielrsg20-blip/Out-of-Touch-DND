import { createHmac } from 'node:crypto'

type AuthTokenPayload = {
  sub: string
  username: string
  exp: number
}

const JWT_SECRET = process.env.TS_RUNTIME_JWT_SECRET || 'change-me-to-a-long-random-secret'
const TOKEN_TTL_SECONDS = Number(process.env.TS_RUNTIME_ACCESS_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 7)

function base64UrlEncode(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url')
}

function base64UrlDecode(text: string): string {
  return Buffer.from(text, 'base64url').toString('utf8')
}

function sign(value: string): string {
  return createHmac('sha256', JWT_SECRET).update(value).digest('base64url')
}

export function createAccessToken(userId: string, username: string): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload: AuthTokenPayload = {
    sub: userId,
    username,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  }

  const headerSegment = base64UrlEncode(JSON.stringify(header))
  const payloadSegment = base64UrlEncode(JSON.stringify(payload))
  const data = `${headerSegment}.${payloadSegment}`
  return `${data}.${sign(data)}`
}

export function decodeAndVerifyAccessToken(token: string): AuthTokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return null
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts
  if (!headerSegment || !payloadSegment || !signatureSegment) {
    return null
  }

  const data = `${headerSegment}.${payloadSegment}`
  if (sign(data) !== signatureSegment) {
    return null
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadSegment)) as Partial<AuthTokenPayload>
    if (typeof payload.sub !== 'string' || typeof payload.username !== 'string' || typeof payload.exp !== 'number') {
      return null
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null
    }
    return {
      sub: payload.sub,
      username: payload.username,
      exp: payload.exp,
    }
  } catch {
    return null
  }
}

export function decodeSubjectWithoutVerify(token: string): string | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }
  const payloadSegment = parts[1]
  if (!payloadSegment) {
    return null
  }
  try {
    const payload = JSON.parse(base64UrlDecode(payloadSegment)) as { sub?: unknown }
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}
