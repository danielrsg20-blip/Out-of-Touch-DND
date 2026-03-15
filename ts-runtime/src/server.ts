import Fastify from 'fastify'
import { registerAuthRoutes } from './routes/auth.js'
import { registerRuntimeCompatRoutes } from './routes/runtimeCompat.js'
import { registerOverlayGenerateRoute } from './routes/overlayGenerate.js'
import { registerCampaignRoutes } from './routes/campaign.js'
import { registerSessionRoutes } from './routes/session.js'
import { registerVectorMapGenerateRoute } from './routes/vectorMapGenerate.js'

const PORT = Number(process.env.TS_RUNTIME_PORT || 9010)
const HOST = process.env.TS_RUNTIME_HOST || '0.0.0.0'

async function buildServer() {
  const app = Fastify({ logger: true })

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
