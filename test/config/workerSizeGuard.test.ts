import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []
const sizeGuard = path.resolve('scripts/check-worker-size.mjs')

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true })
  ))
})

it('rejects a Worker that exceeds the immutable 24,750,000-byte release budget', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'worker-size-guard-'))
  temporaryDirectories.push(directory)
  const workerDirectory = path.join(directory, 'dist', '_worker.js')
  await mkdir(workerDirectory, { recursive: true })
  const workerModule = path.join(workerDirectory, 'worker.mjs')
  await writeFile(workerModule, '')
  await truncate(workerModule, 24_750_001)

  await expect(execFileAsync(process.execPath, [sizeGuard], {
    cwd: directory
  })).rejects.toMatchObject({
    code: 1
  })
})

it('does not allow a higher environment override to raise the release budget', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'worker-size-high-override-'))
  temporaryDirectories.push(directory)
  const workerDirectory = path.join(directory, 'dist', '_worker.js')
  await mkdir(workerDirectory, { recursive: true })
  const workerModule = path.join(workerDirectory, 'worker.mjs')
  await writeFile(workerModule, '')
  await truncate(workerModule, 24_750_001)

  await expect(execFileAsync(process.execPath, [sizeGuard], {
    cwd: directory,
    env: {
      ...process.env,
      WORKER_SIZE_BUDGET_BYTES: '25000000'
    }
  })).rejects.toMatchObject({
    code: 1
  })
})

it('does not allow a nonnumeric environment override to disable the release budget', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'worker-size-invalid-override-'))
  temporaryDirectories.push(directory)
  const workerDirectory = path.join(directory, 'dist', '_worker.js')
  await mkdir(workerDirectory, { recursive: true })
  const workerModule = path.join(workerDirectory, 'worker.mjs')
  await writeFile(workerModule, '')
  await truncate(workerModule, 24_750_001)

  await expect(execFileAsync(process.execPath, [sizeGuard], {
    cwd: directory,
    env: {
      ...process.env,
      WORKER_SIZE_BUDGET_BYTES: 'not-a-number'
    }
  })).rejects.toMatchObject({
    code: 1
  })
})

it('accepts a Worker exactly at the immutable release budget', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'worker-size-boundary-'))
  temporaryDirectories.push(directory)
  const workerDirectory = path.join(directory, 'dist', '_worker.js')
  await mkdir(workerDirectory, { recursive: true })
  const workerModule = path.join(workerDirectory, 'worker.mjs')
  await writeFile(workerModule, '')
  await truncate(workerModule, 24_750_000)

  await expect(execFileAsync(process.execPath, [sizeGuard], {
    cwd: directory
  })).resolves.toMatchObject({
    stdout: expect.stringContaining('(0.00 MiB remaining)')
  })
})

it('counts deployed entry modules while excluding adjacent source maps', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'worker-size-maps-'))
  temporaryDirectories.push(directory)
  const workerDirectory = path.join(directory, 'dist', '_worker.js')
  await mkdir(workerDirectory, { recursive: true })
  await writeFile(path.join(workerDirectory, 'index.js'), 'export default {}\n')
  await writeFile(path.join(workerDirectory, '_nitro.js'), 'export default {}\n')
  const sourceMap = path.join(workerDirectory, '_nitro.js.map')
  await writeFile(sourceMap, '')
  await truncate(sourceMap, 24_750_001)

  await expect(execFileAsync(process.execPath, [sizeGuard], {
    cwd: directory
  })).resolves.toMatchObject({
    stdout: expect.stringContaining('remaining')
  })
})
