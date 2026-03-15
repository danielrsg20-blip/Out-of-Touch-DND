import type { FastifyInstance } from 'fastify'
import { authenticateUser, createUser } from '../lib/userStore.js'
import { createAccessToken, decodeAndVerifyAccessToken } from '../lib/authToken.js'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/register', async (request, reply) => {
    const body = asRecord(request.body) ?? {}
    const username = asString(body.username)
    const password = asString(body.password)

    if (!username || username.length < 3) {
      reply.status(400)
      return { detail: 'Username must be at least 3 characters' }
    }

    if (!password || password.length < 6) {
      reply.status(400)
      return { detail: 'Password must be at least 6 characters' }
    }

    const created = createUser(username, password)
    if (!created.ok) {
      reply.status(409)
      return { detail: 'Username already taken' }
    }

    const token = createAccessToken(created.user.id, created.user.username)
    return {
      token,
      user_id: created.user.id,
      username: created.user.username,
    }
  })

  app.post('/api/auth/login', async (request, reply) => {
    const body = asRecord(request.body) ?? {}
    const username = asString(body.username)
    const password = asString(body.password)

    if (!username || !password) {
      reply.status(401)
      return { detail: 'Invalid username or password' }
    }

    const user = authenticateUser(username, password)
    if (!user) {
      reply.status(401)
      return { detail: 'Invalid username or password' }
    }

    const token = createAccessToken(user.id, user.username)
    return {
      token,
      user_id: user.id,
      username: user.username,
    }
  })

  app.get('/api/auth/me', async (request, reply) => {
    const authorization = (request.headers as Record<string, unknown>).authorization
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      reply.status(401)
      return { detail: 'Missing token' }
    }

    const token = authorization.slice('Bearer '.length).trim()
    const payload = decodeAndVerifyAccessToken(token)
    if (!payload) {
      reply.status(401)
      return { detail: 'Invalid or expired token' }
    }

    return {
      user_id: payload.sub,
      username: payload.username,
    }
  })
}
