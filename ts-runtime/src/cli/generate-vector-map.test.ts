import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

type Manifest = {
  seed: number
  hashes: {
    overlay_hash: string
    grid_hash: string
    compatibility_hash?: string
  }
}

function runHarness(args: string[], cwd: string): ReturnType<typeof spawnSync> {
  const tsxCli = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url))
  const script = fileURLToPath(new URL('./generate-vector-map.ts', import.meta.url))
  return spawnSync(process.execPath, [tsxCli, script, ...args], {
    cwd,
    encoding: 'utf-8',
  })
}

function readManifest(outDir: string, seed: number): Manifest {
  return JSON.parse(readFileSync(join(outDir, `seed-${seed}`, 'manifest.json'), 'utf-8')) as Manifest
}

test('generate-vector-map writes expected files for a single seed', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'vector-map-harness-'))
  const cwd = fileURLToPath(new URL('../..', import.meta.url))

  try {
    const result = runHarness(['--seed', '123', '--allow-warnings', '--out', outDir], cwd)

    assert.equal(result.status, 0, result.stderr ? String(result.stderr) : String(result.stdout))
    assert.equal(existsSync(join(outDir, 'seed-123', 'overlay.json')), true)
    assert.equal(existsSync(join(outDir, 'seed-123', 'traversal_grid.json')), true)
    assert.equal(existsSync(join(outDir, 'seed-123', 'compatibility.json')), true)
    assert.equal(existsSync(join(outDir, 'seed-123', 'report.txt')), true)
    assert.equal(existsSync(join(outDir, 'seed-123', 'manifest.json')), true)
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
})

test('generate-vector-map is deterministic across repeated subprocess runs', () => {
  const firstOutDir = mkdtempSync(join(tmpdir(), 'vector-map-harness-a-'))
  const secondOutDir = mkdtempSync(join(tmpdir(), 'vector-map-harness-b-'))
  const cwd = fileURLToPath(new URL('../..', import.meta.url))

  try {
    const first = runHarness(['--seed', '90210', '--allow-warnings', '--out', firstOutDir], cwd)
    const second = runHarness(['--seed', '90210', '--allow-warnings', '--out', secondOutDir], cwd)

    assert.equal(first.status, 0, first.stderr ? String(first.stderr) : String(first.stdout))
    assert.equal(second.status, 0, second.stderr ? String(second.stderr) : String(second.stdout))

    const firstManifest = readManifest(firstOutDir, 90210)
    const secondManifest = readManifest(secondOutDir, 90210)
    assert.equal(firstManifest.hashes.overlay_hash, secondManifest.hashes.overlay_hash)
    assert.equal(firstManifest.hashes.grid_hash, secondManifest.hashes.grid_hash)
    assert.equal(firstManifest.hashes.compatibility_hash, secondManifest.hashes.compatibility_hash)
  } finally {
    rmSync(firstOutDir, { recursive: true, force: true })
    rmSync(secondOutDir, { recursive: true, force: true })
  }
})

test('generate-vector-map writes gallery outputs in multi-seed mode', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'vector-map-harness-gallery-'))
  const cwd = fileURLToPath(new URL('../..', import.meta.url))

  try {
    const result = runHarness(
      ['--seed-start', '200', '--count', '2', '--allow-warnings', '--out', outDir],
      cwd,
    )

    assert.equal(result.status, 0, result.stderr ? String(result.stderr) : String(result.stdout))
    assert.equal(existsSync(join(outDir, 'gallery.json')), true)
    assert.equal(existsSync(join(outDir, 'index.html')), true)
    assert.equal(existsSync(join(outDir, 'seed-200', 'manifest.json')), true)
    assert.equal(existsSync(join(outDir, 'seed-201', 'manifest.json')), true)
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
})
