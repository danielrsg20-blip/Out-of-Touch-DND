import fs from 'node:fs/promises'
import path from 'node:path'

const PYTHON_BASE = process.env.PYTHON_BASE_URL || 'http://127.0.0.1:8011'
const TS_BASE = process.env.TS_BASE_URL || 'http://127.0.0.1:19022'

const FIXTURE_PATH = path.resolve(process.cwd(), 'contracts', 'fixtures', 'vector-map-bridge.json')

async function loadFixture() {
  const raw = await fs.readFile(FIXTURE_PATH, 'utf8')
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || !parsed.request || typeof parsed.request !== 'object') {
    throw new Error(`Invalid fixture format: ${FIXTURE_PATH}`)
  }
  return parsed
}

async function postJson(baseUrl, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = { parse_error: 'non-json response' }
  }

  if (!response.ok) {
    throw new Error(`Request failed: ${baseUrl}${route} -> ${response.status} ${JSON.stringify(payload)}`)
  }

  return payload
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertVectorPayloadShape(payload, label) {
  assert(payload && typeof payload === 'object', `${label}: response must be an object`)
  assert(payload.overlay && typeof payload.overlay === 'object', `${label}: missing overlay`)
  assert(payload.traversal_grid && typeof payload.traversal_grid === 'object', `${label}: missing traversal_grid`)
  assert(payload.compatibility && typeof payload.compatibility === 'object', `${label}: missing compatibility`)
  assert(payload.hashes && typeof payload.hashes === 'object', `${label}: missing hashes`)

  assert(typeof payload.hashes.overlay_hash === 'string' && payload.hashes.overlay_hash.length > 0, `${label}: missing overlay_hash`)
  assert(typeof payload.hashes.grid_hash === 'string' && payload.hashes.grid_hash.length > 0, `${label}: missing grid_hash`)
  assert(typeof payload.hashes.compatibility_hash === 'string' && payload.hashes.compatibility_hash.length > 0, `${label}: missing compatibility_hash`)

  const rolloutFlags = payload.overlay?.metadata?.rollout_flags
  assert(rolloutFlags && typeof rolloutFlags === 'object', `${label}: missing overlay.metadata.rollout_flags`)
  assert(Object.prototype.hasOwnProperty.call(rolloutFlags, 'vector_grid_derivation_enabled'), `${label}: missing vector_grid_derivation_enabled rollout flag`)
}

function pickHashBundle(payload) {
  return {
    overlay_hash: payload.hashes?.overlay_hash,
    grid_hash: payload.hashes?.grid_hash,
    compatibility_hash: payload.hashes?.compatibility_hash,
  }
}

async function main() {
  const fixture = await loadFixture()
  const requestBody = fixture.request

  const pythonFirst = await postJson(PYTHON_BASE, '/api/tools/generate_vector_map', requestBody)
  const pythonSecond = await postJson(PYTHON_BASE, '/api/tools/generate_vector_map', requestBody)
  const tsDirect = await postJson(TS_BASE, '/api/tools/generate_vector_map', requestBody)

  assertVectorPayloadShape(pythonFirst, 'pythonFirst')
  assertVectorPayloadShape(pythonSecond, 'pythonSecond')
  assertVectorPayloadShape(tsDirect, 'tsDirect')

  const firstHashes = pickHashBundle(pythonFirst)
  const secondHashes = pickHashBundle(pythonSecond)
  const tsHashes = pickHashBundle(tsDirect)

  assert(JSON.stringify(firstHashes) === JSON.stringify(secondHashes), 'python deterministic hash bundle mismatch across repeated runs')
  assert(JSON.stringify(firstHashes) === JSON.stringify(tsHashes), 'python forward hash bundle mismatch against direct TS response')

  console.log('Vector map bridge fixture check passed.')
  console.log(JSON.stringify({
    fixture: fixture.name || 'vector-map-bridge-fixture',
    python_base: PYTHON_BASE,
    ts_base: TS_BASE,
    hashes: firstHashes,
  }, null, 2))
}

main().catch((error) => {
  console.error('Vector map bridge fixture check failed.')
  console.error(error)
  process.exit(1)
})
