import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const IMMUTABLE_WORKER_NAME = 'search-authority-publisher'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workerDirectory = resolve(root, 'workers/search-authority-publisher')
const dryRun = process.argv.slice(2).includes('--dry-run')
const unsupported = process.argv.slice(2).filter(argument => argument !== '--dry-run')

if (unsupported.length) fail(`Unsupported deployment arguments: ${unsupported.join(', ')}`)

const configPath = resolve(workerDirectory, 'wrangler.jsonc')
const config = JSON.parse(readFileSync(configPath, 'utf8'))
if (config.name !== IMMUTABLE_WORKER_NAME) {
  fail(`Refusing deployment: expected Worker ${IMMUTABLE_WORKER_NAME}, received ${String(config.name)}`)
}
if (config.main !== 'src/index.ts') fail('Refusing deployment: unexpected publisher entrypoint')
if (!Array.isArray(config.r2_buckets)
  || config.r2_buckets.length !== 1
  || config.r2_buckets[0]?.binding !== 'PUBLICATIONS'
  || config.r2_buckets[0]?.bucket_name !== 'agency-search-authority-publications') {
  fail('Refusing deployment: immutable publication R2 binding does not match the approved target')
}

run('pnpm', [
  'exec', 'vitest', 'run',
  'test/server/utils/searchAuthorityPublicationRenderer.test.ts',
  'test/server/api/searchAuthorityPublishing.test.ts',
  'test/workers/searchAuthorityPublisher.test.ts',
  'test/config/searchAuthorityPublisherDeploy.test.ts'
], root)
run('pnpm', ['--dir', 'workers/search-authority-publisher', 'typecheck'], root)
run('pnpm', ['--dir', 'workers/search-authority-publisher', 'run', dryRun ? 'deploy:dry-run' : 'deploy'], root)

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: '/tmp/search-authority-publisher-wrangler.log'
    }
  })
  if (result.error) fail(`${command} could not start: ${result.error.message}`)
  if (result.status !== 0) fail(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
