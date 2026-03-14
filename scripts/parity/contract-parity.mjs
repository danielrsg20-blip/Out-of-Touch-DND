import fs from 'node:fs/promises'
import path from 'node:path'

const FIXTURE_DIR = path.resolve(process.cwd(), 'contracts', 'fixtures')
const PYTHON_BASE = process.env.PYTHON_BASE_URL || 'http://127.0.0.1:8010'
const TS_BASE = process.env.TS_BASE_URL
const NUMERIC_EPSILON = Number(process.env.PARITY_NUMERIC_EPSILON || '1e-9')

if (!TS_BASE) {
  console.error('TS_BASE_URL is required. Example: TS_BASE_URL=http://127.0.0.1:9010')
  process.exit(1)
}

function deletePath(obj, dottedPath) {
  const parts = dottedPath.split('.')
  let ref = obj
  for (let i = 0; i < parts.length - 1; i += 1) {
    const p = parts[i]
    if (!ref || typeof ref !== 'object' || !(p in ref)) return
    ref = ref[p]
  }
  if (ref && typeof ref === 'object') {
    delete ref[parts[parts.length - 1]]
  }
}

function normalize(payload, rules = {}) {
  const copy = JSON.parse(JSON.stringify(payload))
  const removePaths = Array.isArray(rules.removePaths) ? rules.removePaths : []
  for (const p of removePaths) {
    deletePath(copy, p)
  }

  if (rules.removeAllIds === true) {
    stripIdsRecursive(copy)
  }

  return copy
}

function nearlyEqualNumber(a, b, epsilon = NUMERIC_EPSILON) {
  if (Number.isNaN(a) && Number.isNaN(b)) {
    return true
  }
  return Math.abs(a - b) <= epsilon
}

function deepEqualWithTolerance(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    return nearlyEqualNumber(a, b)
  }

  if (a === b) {
    return true
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false
    }
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualWithTolerance(a[i], b[i])) {
        return false
      }
    }
    return true
  }

  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    if (aKeys.length !== bKeys.length) {
      return false
    }
    aKeys.sort()
    bKeys.sort()
    for (let i = 0; i < aKeys.length; i += 1) {
      if (aKeys[i] !== bKeys[i]) {
        return false
      }
    }
    for (const key of aKeys) {
      if (!deepEqualWithTolerance(a[key], b[key])) {
        return false
      }
    }
    return true
  }

  return false
}

function stripIdsRecursive(value) {
  if (!value || typeof value !== 'object') {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      stripIdsRecursive(item)
    }
    return
  }

  if (Object.prototype.hasOwnProperty.call(value, 'id')) {
    delete value.id
  }

  for (const key of Object.keys(value)) {
    stripIdsRecursive(value[key])
  }
}

function hasRequiredKeys(obj, requiredKeys = []) {
  if (!obj || typeof obj !== 'object') {
    return false
  }
  return requiredKeys.every((key) => Object.prototype.hasOwnProperty.call(obj, key))
}

function typeOfValue(value) {
  if (Array.isArray(value)) {
    return 'array'
  }
  if (value === null) {
    return 'null'
  }
  return typeof value
}

function requiredKeyTypesMatch(py, ts, requiredKeys = []) {
  return requiredKeys.every((key) => typeOfValue(py[key]) === typeOfValue(ts[key]))
}

function getByPath(obj, dottedPath) {
  if (!dottedPath) {
    return obj
  }

  const parts = dottedPath.split('.')
  let ref = obj
  for (const part of parts) {
    if (ref === null || ref === undefined) {
      return undefined
    }

    if (Array.isArray(ref) && /^\d+$/.test(part)) {
      ref = ref[Number(part)]
      continue
    }

    if (typeof ref !== 'object' || !(part in ref)) {
      return undefined
    }
    ref = ref[part]
  }

  return ref
}

function resolveValueFrom(pointer, requestSpec, runtimeContext, scenarioContext) {
  if (typeof pointer !== 'string' || !pointer.includes('.')) {
    return undefined
  }

  const [scope, ...rest] = pointer.split('.')
  const path = rest.join('.')
  if (!path) {
    return undefined
  }

  if (scope === 'request') {
    return getByPath(requestSpec, path)
  }
  if (scope === 'runtime') {
    return getByPath(runtimeContext, path)
  }
  if (scope === 'scenario') {
    return getByPath(scenarioContext, path)
  }

  return undefined
}

function evaluateAssertions(assertions, responseJson, requestSpec, runtimeContext, scenarioContext) {
  if (!Array.isArray(assertions) || assertions.length === 0) {
    return { ok: true, failures: [] }
  }

  const failures = []

  for (const assertion of assertions) {
    const path = typeof assertion.path === 'string' ? assertion.path : ''
    const actual = getByPath(responseJson, path)
    const label = path || '<root>'

    if (Object.prototype.hasOwnProperty.call(assertion, 'type')) {
      const expectedType = assertion.type
      if (typeOfValue(actual) !== expectedType) {
        failures.push(`${label}: expected type ${expectedType}, got ${typeOfValue(actual)}`)
      }
    }

    if (Array.isArray(assertion.oneOfTypes) && assertion.oneOfTypes.length > 0) {
      const actualType = typeOfValue(actual)
      if (!assertion.oneOfTypes.includes(actualType)) {
        failures.push(`${label}: expected oneOfTypes=${JSON.stringify(assertion.oneOfTypes)}, got ${actualType}`)
      }
    }

    if (Object.prototype.hasOwnProperty.call(assertion, 'equals')) {
      if (!deepEqualWithTolerance(actual, assertion.equals)) {
        failures.push(`${label}: expected equals ${JSON.stringify(assertion.equals)}, got ${JSON.stringify(actual)}`)
      }
    }

    if (typeof assertion.equalsFrom === 'string') {
      const expected = resolveValueFrom(assertion.equalsFrom, requestSpec, runtimeContext, scenarioContext)
      if (!deepEqualWithTolerance(actual, expected)) {
        failures.push(`${label}: expected equalsFrom ${assertion.equalsFrom} => ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
      }
    }

    if (typeof assertion.lengthAtLeast === 'number') {
      const length = typeof actual === 'string' || Array.isArray(actual) ? actual.length : -1
      if (length < assertion.lengthAtLeast) {
        failures.push(`${label}: expected lengthAtLeast ${assertion.lengthAtLeast}, got ${length}`)
      }
    }

    if (typeof assertion.numericAtLeast === 'number') {
      const numberValue = typeof actual === 'number' && Number.isFinite(actual) ? actual : Number.NaN
      if (!Number.isFinite(numberValue) || numberValue < assertion.numericAtLeast) {
        failures.push(`${label}: expected numericAtLeast ${assertion.numericAtLeast}, got ${JSON.stringify(actual)}`)
      }
    }
  }

  return { ok: failures.length === 0, failures }
}

function applyCaptures(captures, responseJson, runtimeContext) {
  if (!Array.isArray(captures)) {
    return
  }

  for (const capture of captures) {
    if (!capture || typeof capture !== 'object') {
      continue
    }
    const fromPath = typeof capture.from === 'string' ? capture.from : null
    const asKey = typeof capture.as === 'string' ? capture.as : null
    if (!fromPath || !asKey) {
      continue
    }

    runtimeContext[asKey] = getByPath(responseJson, fromPath)
  }
}

async function call(baseUrl, fixture) {
  const req = fixture.request
  const response = await fetch(`${baseUrl}${req.path}`, {
    method: req.method,
    headers: req.headers || {},
    body: req.body ? JSON.stringify(req.body) : undefined,
  })
  const text = await response.text()
  let json = {}
  try {
    json = text.trim() ? JSON.parse(text) : {}
  } catch {
    json = { _raw: text }
  }
  return { status: response.status, json }
}

async function callRaw(baseUrl, requestSpec) {
  const response = await fetch(`${baseUrl}${requestSpec.path}`, {
    method: requestSpec.method,
    headers: requestSpec.headers || {},
    body: requestSpec.body ? JSON.stringify(requestSpec.body) : undefined,
  })

  const text = await response.text()
  let json = {}
  try {
    json = text.trim() ? JSON.parse(text) : {}
  } catch {
    json = { _raw: text }
  }
  return { status: response.status, json }
}

function makeAuthHeader(token) {
  return { Authorization: `Bearer ${token}` }
}

async function setupCampaignScenario() {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`
  const username = `parity_${suffix}`
  const password = `pw_${suffix}`

  const register = await callRaw(PYTHON_BASE, {
    path: '/api/auth/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { username, password },
  })

  if (register.status !== 200 || typeof register.json.token !== 'string') {
    throw new Error(`Campaign scenario setup failed during register: status=${register.status}`)
  }

  const token = register.json.token

  const sourceSessionPy = await callRaw(PYTHON_BASE, {
    path: '/api/session/create',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { player_name: 'Parity Source Host' },
  })

  if (sourceSessionPy.status !== 200 || typeof sourceSessionPy.json.room_code !== 'string') {
    throw new Error(`Campaign scenario setup failed during source session create: status=${sourceSessionPy.status}`)
  }
  if (typeof sourceSessionPy.json.player_id !== 'string') {
    throw new Error('Campaign scenario setup failed: source Python session missing player_id')
  }

  const loadSessionPy = await callRaw(PYTHON_BASE, {
    path: '/api/session/create',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { player_name: 'Parity Load Host' },
  })

  if (loadSessionPy.status !== 200 || typeof loadSessionPy.json.room_code !== 'string') {
    throw new Error(`Campaign scenario setup failed during load session create: status=${loadSessionPy.status}`)
  }

  const sourceSessionTs = await callRaw(TS_BASE, {
    path: '/api/session/create',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...makeAuthHeader(token),
    },
    body: { player_name: 'Parity Source Host' },
  })

  if (sourceSessionTs.status !== 200 || typeof sourceSessionTs.json.room_code !== 'string') {
    throw new Error(`Campaign scenario setup failed during TS source session create: status=${sourceSessionTs.status}`)
  }
  if (typeof sourceSessionTs.json.player_id !== 'string') {
    throw new Error('Campaign scenario setup failed: source TS session missing player_id')
  }

  const loadSessionTs = await callRaw(TS_BASE, {
    path: '/api/session/create',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...makeAuthHeader(token),
    },
    body: { player_name: 'Parity Load Host' },
  })

  if (loadSessionTs.status !== 200 || typeof loadSessionTs.json.room_code !== 'string') {
    throw new Error(`Campaign scenario setup failed during TS load session create: status=${loadSessionTs.status}`)
  }

  const characterPayload = {
    name: 'Parity Hero',
    race: 'Human',
    char_class: 'Fighter',
    abilities: {
      STR: 15,
      DEX: 13,
      CON: 14,
      INT: 10,
      WIS: 12,
      CHA: 8,
    },
  }

  const [characterPy, characterTs] = await Promise.all([
    callRaw(PYTHON_BASE, {
      path: '/api/character/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...makeAuthHeader(token),
      },
      body: {
        room_code: sourceSessionPy.json.room_code,
        player_id: sourceSessionPy.json.player_id,
        ...characterPayload,
      },
    }),
    callRaw(TS_BASE, {
      path: '/api/character/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...makeAuthHeader(token),
      },
      body: {
        room_code: sourceSessionTs.json.room_code,
        player_id: sourceSessionTs.json.player_id,
        ...characterPayload,
      },
    }),
  ])

  if (characterPy.status !== 200 || typeof characterPy.json.character !== 'object') {
    throw new Error(`Campaign scenario setup failed during Python character create: status=${characterPy.status}`)
  }
  if (characterTs.status !== 200 || typeof characterTs.json.character !== 'object') {
    throw new Error(`Campaign scenario setup failed during TS character create: status=${characterTs.status}`)
  }

  return {
    token,
    campaignName: `Parity Campaign ${suffix}`,
    py: {
      sourceRoomCode: sourceSessionPy.json.room_code,
      loadRoomCode: loadSessionPy.json.room_code,
    },
    ts: {
      sourceRoomCode: sourceSessionTs.json.room_code,
      loadRoomCode: loadSessionTs.json.room_code,
    },
  }
}

function buildCampaignRequest(contract, scenarioContext, runtimeName) {
  const headers = { 'Content-Type': 'application/json' }
  const runtimeContext = scenarioContext[runtimeName]

  if (!runtimeContext) {
    throw new Error(`Missing runtime context for ${runtimeName}`)
  }

  const activeCampaignId = runtimeContext.savedCampaignId || runtimeContext.sourceRoomCode

  if (contract.path === '/api/campaign/list') {
    return {
      path: contract.path,
      method: contract.method,
      headers: {
        ...headers,
        ...makeAuthHeader(scenarioContext.token),
      },
      body: null,
    }
  }

  if (contract.path === '/api/campaign/save') {
    return {
      path: contract.path,
      method: contract.method,
      headers: {
        ...headers,
        ...makeAuthHeader(scenarioContext.token),
      },
      body: {
        room_code: runtimeContext.sourceRoomCode,
        campaign_name: scenarioContext.campaignName,
      },
    }
  }

  if (contract.path === '/api/campaign/load') {
    return {
      path: contract.path,
      method: contract.method,
      headers,
      body: {
        campaign_id: activeCampaignId,
        room_code: runtimeContext.loadRoomCode,
      },
    }
  }

  if (contract.path === '/api/campaign/resume') {
    return {
      path: contract.path,
      method: contract.method,
      headers: {
        ...headers,
        ...makeAuthHeader(scenarioContext.token),
      },
      body: {
        campaign_id: activeCampaignId,
        player_name: 'Parity Resume Player',
      },
    }
  }

  throw new Error(`Unsupported campaign contract path: ${contract.path}`)
}

async function runCampaignScenarioFixture(fixture) {
  const scenarioContext = await setupCampaignScenario()
  const contracts = Array.isArray(fixture.contracts) ? fixture.contracts : []

  if (contracts.length === 0) {
    throw new Error(`No contracts declared for scenario fixture ${fixture.name}`)
  }

  let failures = 0

  for (const contract of contracts) {
    const pyRequestSpec = buildCampaignRequest(contract, scenarioContext, 'py')
    const tsRequestSpec = buildCampaignRequest(contract, scenarioContext, 'ts')
    const [py, ts] = await Promise.all([
      callRaw(PYTHON_BASE, pyRequestSpec),
      callRaw(TS_BASE, tsRequestSpec),
    ])

    const pyNorm = normalize(py.json, fixture.normalize)
    const tsNorm = normalize(ts.json, fixture.normalize)
    const requiredKeys = Array.isArray(contract.requiredKeys) ? contract.requiredKeys : []

    const sameStatus = py.status === ts.status
    const pyHasRequired = hasRequiredKeys(pyNorm, requiredKeys)
    const tsHasRequired = hasRequiredKeys(tsNorm, requiredKeys)
    const typeMatch = requiredKeyTypesMatch(pyNorm, tsNorm, requiredKeys)
    const pyAssertions = evaluateAssertions(contract.assertions, pyNorm, pyRequestSpec, scenarioContext.py, scenarioContext)
    const tsAssertions = evaluateAssertions(contract.assertions, tsNorm, tsRequestSpec, scenarioContext.ts, scenarioContext)

    if (!sameStatus || !pyHasRequired || !tsHasRequired || !typeMatch || !pyAssertions.ok || !tsAssertions.ok) {
      failures += 1
      console.error(`FAIL: ${fixture.name} -> ${contract.path}`)
      console.error(`  status: py=${py.status} ts=${ts.status}`)
      console.error(`  requiredKeys: ${JSON.stringify(requiredKeys)}`)
      console.error(`  pyHasRequired=${pyHasRequired} tsHasRequired=${tsHasRequired} typeMatch=${typeMatch}`)
      if (!pyAssertions.ok) {
        console.error(`  pyAssertions: ${JSON.stringify(pyAssertions.failures)}`)
      }
      if (!tsAssertions.ok) {
        console.error(`  tsAssertions: ${JSON.stringify(tsAssertions.failures)}`)
      }
      console.error(`  py: ${JSON.stringify(pyNorm).slice(0, 1200)}`)
      console.error(`  ts: ${JSON.stringify(tsNorm).slice(0, 1200)}`)
      continue
    }

    applyCaptures(contract.capture, pyNorm, scenarioContext.py)
    applyCaptures(contract.capture, tsNorm, scenarioContext.ts)

    console.log(`PASS: ${fixture.name} -> ${contract.path}`)
  }

  return failures
}

async function run() {
  const files = await fs.readdir(FIXTURE_DIR)
  const fixtures = files.filter((f) => f.endsWith('.json'))

  if (fixtures.length === 0) {
    console.log('No contract fixtures found.')
    return
  }

  let failures = 0

  for (const file of fixtures) {
    const raw = await fs.readFile(path.join(FIXTURE_DIR, file), 'utf8')
    const fixture = JSON.parse(raw)

    if (fixture.scenario === 'campaign-save-load-resume') {
      failures += await runCampaignScenarioFixture(fixture)
      continue
    }

    if (!fixture.request) {
      console.log(`SKIP: ${fixture.name || file} (no request/scenario)`)
      continue
    }

    const py = await call(PYTHON_BASE, fixture)
    const ts = await call(TS_BASE, fixture)

    const pyNorm = normalize(py.json, fixture.normalize)
    const tsNorm = normalize(ts.json, fixture.normalize)

    const sameStatus = py.status === ts.status
    const sameBody = deepEqualWithTolerance(pyNorm, tsNorm)

    if (!sameStatus || !sameBody) {
      failures += 1
      console.error(`FAIL: ${fixture.name}`)
      console.error(`  status: py=${py.status} ts=${ts.status}`)
      console.error(`  py: ${JSON.stringify(pyNorm).slice(0, 1200)}`)
      console.error(`  ts: ${JSON.stringify(tsNorm).slice(0, 1200)}`)
      continue
    }

    console.log(`PASS: ${fixture.name}`)
  }

  if (failures > 0) {
    process.exit(2)
  }

  console.log('Contract parity check passed.')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
