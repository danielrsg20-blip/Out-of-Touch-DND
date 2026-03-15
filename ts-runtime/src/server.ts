import Fastify from 'fastify'
import { registerAuthRoutes } from './routes/auth.js'
import { registerRuntimeCompatRoutes } from './routes/runtimeCompat.js'
import { registerOverlayGenerateRoute } from './routes/overlayGenerate.js'
import { registerCampaignRoutes } from './routes/campaign.js'
import { registerSessionRoutes } from './routes/session.js'
import { registerVectorMapGenerateRoute } from './routes/vectorMapGenerate.js'

const PORT = Number(process.env.TS_RUNTIME_PORT || 9020)
const HOST = process.env.TS_RUNTIME_HOST || '0.0.0.0'

async function buildServer() {
  const app = Fastify({ logger: true })

  // Allow frontend dev origin to call runtime APIs with auth/content-type headers.
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*')
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    reply.header('Access-Control-Allow-Headers', 'Authorization,Content-Type')

    if (request.method === 'OPTIONS') {
      reply.code(204).send()
    }
  })

  await registerRuntimeCompatRoutes(app)
  await registerAuthRoutes(app)
  await registerSessionRoutes(app)
  await registerOverlayGenerateRoute(app)
  await registerVectorMapGenerateRoute(app)
  await registerCampaignRoutes(app)

  return app
}

async function start() {
  const app = await buildServer()
  await app.listen({ host: HOST, port: PORT })
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error)
  process.exit(1)
})
