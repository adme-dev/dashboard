import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, expect, it } from 'vitest'

const RAW_RELEASE_BUDGET_BYTES = 25 * 1024 * 1024 - 256 * 1024
const GZIP_RELEASE_BUDGET_BYTES = 9_750_000
const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []
const sizeGuard = path.resolve('scripts/check-worker-size.mjs')

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true })
  ))
})

async function createWorkerDirectory(prefix: string) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  const workerDirectory = path.join(directory, 'dist', '_worker.js')
  await mkdir(workerDirectory, { recursive: true })
  return { directory, workerDirectory }
}

function deterministicIncompressibleBytes(length: number) {
  const bytes = Buffer.allocUnsafe(length)
  let state = 0x9e3779b9
  for (let index = 0; index < bytes.length; index += 1) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    bytes[index] = state & 0xff
  }
  return bytes
}

it('accepts a Worker exactly at the immutable raw safety budget and reports exact dual margins', async () => {
  const { directory, workerDirectory } = await createWorkerDirectory('worker-size-boundary-')
  const workerModule = path.join(workerDirectory, 'worker.mjs')
  await writeFile(workerModule, '')
  await truncate(workerModule, RAW_RELEASE_BUDGET_BYTES)

  const { stdout } = await execFileAsync(process.execPath, [sizeGuard], {
    cwd: directory
  })

  const metrics = stdout.match(
    /raw (\d+) \/ (\d+) bytes \((-?\d+) remaining\); gzip (\d+) \/ (\d+) bytes \((-?\d+) remaining\)/u
  )
  expect(metrics).not.toBeNull()
  expect(metrics?.slice(1).map(Number)).toEqual([
    RAW_RELEASE_BUDGET_BYTES,
    RAW_RELEASE_BUDGET_BYTES,
    0,
    expect.any(Number),
    GZIP_RELEASE_BUDGET_BYTES,
    GZIP_RELEASE_BUDGET_BYTES - Number(metrics?.[4])
  ])
})

it('rejects a Worker one byte over the raw safety budget before overrides can raise or disable it', async () => {
  const { directory, workerDirectory } = await createWorkerDirectory('worker-size-raw-over-')
  const workerModule = path.join(workerDirectory, 'worker.mjs')
  await writeFile(workerModule, '')
  await truncate(workerModule, RAW_RELEASE_BUDGET_BYTES + 1)

  await expect(execFileAsync(process.execPath, [sizeGuard], {
    cwd: directory,
    env: {
      ...process.env,
      WORKER_SIZE_BUDGET_BYTES: '999999999',
      WORKER_RAW_SIZE_BUDGET_BYTES: '999999999',
      WORKER_GZIP_SIZE_BUDGET_BYTES: 'not-a-number'
    }
  })).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringMatching(/raw[^\n]*1 over/u)
  })
})

it('rejects a bounded incompressible Worker over the gzip safety budget before overrides can raise it', async () => {
  const { directory, workerDirectory } = await createWorkerDirectory('worker-size-gzip-over-')
  await writeFile(
    path.join(workerDirectory, 'worker.mjs'),
    deterministicIncompressibleBytes(GZIP_RELEASE_BUDGET_BYTES + 1)
  )

  await expect(execFileAsync(process.execPath, [sizeGuard], {
    cwd: directory,
    env: {
      ...process.env,
      WORKER_SIZE_BUDGET_BYTES: 'not-a-number',
      WORKER_RAW_SIZE_BUDGET_BYTES: 'not-a-number',
      WORKER_GZIP_SIZE_BUDGET_BYTES: '999999999'
    }
  })).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringMatching(/gzip[^\n]*over/u)
  })
})

it('recursively excludes source maps and Wrangler artifacts from both measurements', async () => {
  const { directory, workerDirectory } = await createWorkerDirectory('worker-size-exclusions-')
  const chunksDirectory = path.join(workerDirectory, 'chunks', 'nested')
  await mkdir(chunksDirectory, { recursive: true })
  const deployedModules = ['export default {}\n', 'export const value = 1\n']
  await writeFile(path.join(workerDirectory, 'index.js'), deployedModules[0]!)
  await writeFile(path.join(chunksDirectory, 'module.mjs'), deployedModules[1]!)
  const sourceMap = path.join(chunksDirectory, 'module.mjs.map')
  await writeFile(sourceMap, '')
  await truncate(sourceMap, RAW_RELEASE_BUDGET_BYTES + 1)
  await writeFile(
    path.join(chunksDirectory, 'wrangler.generated'),
    deterministicIncompressibleBytes(GZIP_RELEASE_BUDGET_BYTES + 1)
  )

  const { stdout } = await execFileAsync(process.execPath, [sizeGuard], {
    cwd: directory
  })

  expect(stdout).toContain(
    `raw ${deployedModules.reduce((total, module) => total + Buffer.byteLength(module), 0)} `
  )
  expect(stdout).toMatch(/gzip \d+ \/ 9750000 bytes \(\d+ remaining\)/u)
})
