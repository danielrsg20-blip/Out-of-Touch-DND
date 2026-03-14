import Fastify from 'fastify'
import { registerOverlayGenerateRoute } from './routes/overlayGenerate.js'
import { registerCampaignRoutes } from './routes/campaign.js'
import { registerSessionRoutes } from './routes/session.js'

const PORT = Number(process.env.TS_RUNTIME_PORT || 9010)
const HOST = process.env.TS_RUNTIME_HOST || '0.0.0.0'

async function buildServer() {
  const app = Fastify({ logger: true })

  app.get('/api/health', async () => ({ status: 'ok', service: 'ts-runtime' }))

  await registerSessionRoutes(app)
  await registerOverlayGenerateRoute(app)
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
