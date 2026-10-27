#!/usr/bin/env node
/** Owns an ephemeral loopback PostgreSQL cluster; never reads .env or DATABASE_URL. */
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createServer } from 'node:net'
import { randomUUID, createHash } from 'node:crypto'

const exec = promisify(execFile)
const root = resolve(import.meta.dirname, '../..')
const binaries = '/opt/homebrew/bin'
// Each invocation retains independent evidence; never overwrites a prior proof.
const output = join(root, `output/editable-artwork-engine-jobs/proof-${new Date().toISOString().replace(/[:.]/g, '-')}`)
await mkdir(output, { recursive: true })
const owned = await realpath(await mkdtemp('/tmp/banner-engine-jobs-proof-'))
const data = join(owned, 'data')
const token = randomUUID()
const database = `banner_engine_jobs_proof_${token.replaceAll('-', '')}`
const marker = join(owned, 'owner.json')
const port = await new Promise((accept, reject) => {
  const listener = createServer()
  listener.once('error', reject)
  listener.listen(0, '127.0.0.1', () => {
    const value = listener.address().port
    listener.close(() => accept(value))
  })
})
await writeFile(marker, JSON.stringify({ token, data, database, port }), { mode: 0o600 })
const connectionString = `postgresql://proof_owner@127.0.0.1:${port}/${database}`
let child
let startAttempted = false
let interrupted = false
let log = ''
const result = {
  startedAt: new Date().toISOString(),
  scope: 'Owned local PostgreSQL and loopback HTTP; actual engine job SQL/transport and Linux native execution; synthetic users and private in-memory storage; no hosted infrastructure acceptance',
  ownedCluster: { directory: owned, data, database, host: '127.0.0.1', port },
  passed: false, cleanedUp: false
}
const sourceFiles = [
  'nuxt.config.ts', 'scripts/banner-engine-pages-guard.mjs',
  'server/runtime/banner-engine-pages-guard.ts',
  'test/banner/enginePagesGuard.test.ts', 'test/server/utils/bannerEnginePagesBridge.test.ts',
  'test/banner/engineTermination.test.ts', 'test/banner/engineTransport.test.ts',
  'shared/bannerEngineJobs.ts', 'shared/bannerEngine.ts',
  'server/utils/banner/engineJobs.ts', 'server/utils/banner/engineJobStorage.ts',
  'server/utils/banner/engineJobHttp.ts', 'server/utils/banner/engineResult.ts',
  'server/database/migrations/483_banner_engine_jobs.sql',
  'workers/banner-engine/transport/index.ts', 'workers/banner-engine/transport/http.ts',
  'workers/banner-engine/transport/files.ts', 'scripts/banner-studio/engine-worker.ts',
  'workers/banner-engine/runner/index.ts',
  'workers/banner-engine/runtime/index.ts', 'workers/banner-engine/runtime/render-preview.mjs',
  'server/api/internal/banner-engine.post.ts',
  'server/api/agency/banner-studio/engine-jobs/index.post.ts',
  'server/api/agency/banner-studio/engine-jobs/[jobId].get.ts',
  'server/api/agency/banner-studio/engine-jobs/[jobId]/cancel.post.ts',
  'server/api/agency/banner-studio/engine-jobs/[jobId]/output.get.ts',
  'output/editable-artwork-online-engine/linux/runtime.json',
  'output/editable-artwork-online-engine/linux/photocraft-capability-proof.json',
  'output/editable-artwork-online-engine/linux/vectorcraft-capability-proof.json',
  'test/server/utils/engineJobsPostgres.test.ts',
  'scripts/banner-studio/prove-engine-jobs.mjs'
]
const hashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash('sha256').update(await readFile(join(root, file))).digest('hex')])))
const interrupt = () => {
  interrupted = true
  child?.kill('SIGTERM')
}
async function stopOwnedCluster() {
  if (!startAttempted) return
  try {
    await exec(join(binaries, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'])
  } catch (error) {
    // A failed start can already be stopped; status exit 3 is positive proof.
    try {
      await exec(join(binaries, 'pg_ctl'), ['-D', data, 'status'])
    } catch (statusError) {
      if (statusError.code === 3) return
      throw statusError
    }
    throw error
  }
}
process.on('SIGINT', interrupt)
process.on('SIGTERM', interrupt)
try {
  result.postgresVersion = (await exec(join(binaries, 'postgres'), ['--version'])).stdout.trim()
  await exec(join(binaries, 'initdb'), ['-D', data, '-U', 'proof_owner', '--auth=trust', '--encoding=UTF8', '--no-locale'])
  startAttempted = true
  await exec(join(binaries, 'pg_ctl'), ['-D', data, '-l', join(owned, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${owned}`, '-w', 'start'])
  if (interrupted) throw new Error('Proof interrupted')
  await exec(join(binaries, 'psql'), [`postgresql://proof_owner@127.0.0.1:${port}/postgres`, '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${database}`])
  const env = { ...process.env, BANNER_ENGINE_JOBS_PROOF_URL: connectionString, BANNER_ENGINE_JOBS_PROOF_OWNER: marker, BANNER_ENGINE_JOBS_PROOF_TOKEN: token, BANNER_ENGINE_JOBS_PROOF_OUTPUT: output }
  delete env.DATABASE_URL
  result.sourceHashes = await hashes()
  const code = await new Promise((accept, reject) => {
    child = spawn('pnpm', ['exec', 'vitest', 'run', 'test/server/utils/engineJobsPostgres.test.ts', '--reporter=verbose'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (bytes) => {
      log += bytes
      process.stdout.write(bytes)
    })
    child.once('error', reject)
    child.once('exit', value => accept(value ?? 1))
  })
  result.sourcesUnchangedDuringProof = JSON.stringify(result.sourceHashes) === JSON.stringify(await hashes())
  result.testExitCode = code
  result.passed = code === 0 && !interrupted && result.sourcesUnchangedDuringProof
  if (!result.passed) process.exitCode = 1
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
} finally {
  try {
    // pg_ctl targets only the private directory this invocation just created.
    await stopOwnedCluster()
    result.ownedClusterStopped = true
    await rm(owned, { recursive: true, force: true })
    result.cleanedUp = true
  } catch (error) {
    result.cleanupError = error instanceof Error ? error.message : String(error)
    process.exitCode = 1
  }
  result.finishedAt = new Date().toISOString()
  await writeFile(join(output, 'postgres-proof.log'), log)
  await writeFile(join(output, 'postgres-proof.json'), `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result, null, 2))
}
