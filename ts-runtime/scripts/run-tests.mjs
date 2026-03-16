import { readdirSync } from 'node:fs'
import { relative, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('..', import.meta.url))
const srcDir = fileURLToPath(new URL('../src', import.meta.url))

function collectTestFiles(dirPath, out = []) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      collectTestFiles(entryPath, out)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      out.push(relative(rootDir, entryPath).replace(/\\/g, '/'))
    }
  }
  return out
}

const testFiles = collectTestFiles(srcDir).sort()

if (testFiles.length === 0) {
  console.error('No .test.ts files found under src/.')
  process.exit(1)
}

const tsxCli = join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const result = spawnSync(process.execPath, [tsxCli, '--test', ...testFiles], {
  cwd: rootDir,
  stdio: 'inherit',
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)