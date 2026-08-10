import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from 'smol-toml'

const IMMUTABLE_WORKER_NAME = 'agency-crm-search-consumer'
const IMMUTABLE_CONFIG_NAME = 'wrangler.toml'
const IMMUTABLE_COMPATIBILITY_DATE = '2026-08-10'
const REQUIRED_MODE = '--dry-run'
const PRIMARY_QUEUE = 'agency-crm-search-index'
const DEAD_LETTER_QUEUE = 'agency-crm-search-index-dlq'
const REQUIRED_SECRET_NAMES = Object.freeze([
  'CRM_SEARCH_SERVICE_KEYRING',
  'CRM_SEARCH_IMPLEMENTATION_SHA',
  'CRM_SEARCH_WORKER_ARTIFACT_DIGEST',
  'CRM_SEARCH_BINDING_MANIFEST_DIGEST',
  'CRM_SEARCH_EXPECTED_PAGES_SHA',
  'CRM_SEARCH_EXPECTED_PAGES_ARTIFACT_DIGEST',
  'CRM_SEARCH_EXPECTED_PAGES_BINDING_MANIFEST_DIGEST',
  'CRM_SEARCH_RESOURCE_MANIFEST',
  'CRM_SEARCH_RESOURCE_MANIFEST_VERIFICATION_KEYRING'
])

const workerDirectory = fileURLToPath(new URL('..', import.meta.url))
const repositoryRoot = path.resolve(workerDirectory, '../..')
const configPath = path.join(workerDirectory, IMMUTABLE_CONFIG_NAME)
const wranglerEntry = path.join(repositoryRoot, 'node_modules/wrangler/bin/wrangler.js')

function fail(message) {
  throw new Error(`crm-search consumer dry-run guard: ${message}`)
}

function assert(condition, message) {
  if (!condition) fail(message)
}

assert(process.versions.node === '24.18.0', 'Node version must be exactly 24.18.0')

function assertConsumer(actual, expected, label) {
  assert(actual && typeof actual === 'object', `${label} consumer is missing`)
  const allowedKeys = new Set(Object.keys(expected))
  assert(Object.keys(actual).every(key => allowedKeys.has(key)), `${label} has unexpected fields`)
  for (const [key, value] of Object.entries(expected)) {
    assert(actual[key] === value, `${label}.${key} does not match the immutable contract`)
  }
}

function assertExactArray(actual, expected, label) {
  assert(Array.isArray(actual), `${label} is missing`)
  assert(actual.length === expected.length, `${label} length changed`)
  assert(expected.every((value, index) => actual[index] === value), `${label} changed`)
}

if (process.argv.length !== 3 || process.argv[2] !== REQUIRED_MODE) {
  fail(`only ${REQUIRED_MODE} is permitted; production deployment is intentionally disabled`)
}

assert(path.basename(configPath) === IMMUTABLE_CONFIG_NAME, 'config filename changed')
assert(realpathSync(configPath) === configPath, 'config path must not traverse a symlink')
const config = parse(readFileSync(configPath, 'utf8'))
assert(config.name === IMMUTABLE_WORKER_NAME, 'Worker name changed')
assert(config.main === 'src/index.ts', 'entry point changed')
assert(config.compatibility_date === IMMUTABLE_COMPATIBILITY_DATE, 'compatibility date changed')
assertExactArray(config.compatibility_flags, ['nodejs_compat'], 'compatibility flags')
assert(config.workers_dev === false, 'workers_dev must remain disabled')
assert(config.observability?.enabled === true, 'observability must remain enabled')
assert(config.vars?.CRM_SEARCH_ENVIRONMENT === 'production', 'environment identity changed')
assert(Object.keys(config.vars ?? {}).length === 1, 'unexpected public variables were added')
assertExactArray(config.secrets?.required, REQUIRED_SECRET_NAMES, 'required secrets')
assert(config.ai === undefined, 'Workers AI bindings are forbidden')
assert(config.vectorize === undefined, 'Vectorize bindings are forbidden')
assert(config.queues?.producers === undefined, 'a queue producer was added')
assert(Array.isArray(config.queues?.consumers), 'queue consumers are missing')
assert(config.queues.consumers.length === 2, 'exactly two queue consumers are required')
assertConsumer(config.queues.consumers[0], {
  queue: PRIMARY_QUEUE,
  max_batch_size: 5,
  max_batch_timeout: 5,
  max_retries: 5,
  retry_delay: 30,
  max_concurrency: 4,
  dead_letter_queue: DEAD_LETTER_QUEUE
}, 'primary')
assertConsumer(config.queues.consumers[1], {
  queue: DEAD_LETTER_QUEUE,
  max_batch_size: 5,
  max_batch_timeout: 5,
  max_retries: 3,
  retry_delay: 30,
  max_concurrency: 2
}, 'dead-letter')

assert(config.env?.preview?.name === 'agency-crm-search-consumer-preview', 'preview Worker name changed')
assert(config.env.preview.workers_dev === false, 'preview workers_dev must remain disabled')
assert(config.env.preview.vars?.CRM_SEARCH_ENVIRONMENT === 'preview', 'preview environment changed')
assert(Object.keys(config.env.preview.vars ?? {}).length === 1, 'unexpected preview variables were added')
assertExactArray(config.env.preview.secrets?.required, REQUIRED_SECRET_NAMES, 'preview required secrets')
assert(Array.isArray(config.env.preview.queues?.consumers), 'preview queue consumers are missing')
assert(config.env.preview.queues.consumers.length === 2, 'exactly two preview queue consumers are required')
assertConsumer(config.env.preview.queues.consumers[0], {
  queue: 'agency-crm-search-index-preview',
  max_batch_size: 5,
  max_batch_timeout: 5,
  max_retries: 5,
  retry_delay: 30,
  max_concurrency: 4,
  dead_letter_queue: 'agency-crm-search-index-preview-dlq'
}, 'preview primary')
assertConsumer(config.env.preview.queues.consumers[1], {
  queue: 'agency-crm-search-index-preview-dlq',
  max_batch_size: 5,
  max_batch_timeout: 5,
  max_retries: 3,
  retry_delay: 30,
  max_concurrency: 2
}, 'preview dead-letter')

const outputDirectory = mkdtempSync(path.join(tmpdir(), 'crm-search-consumer-dry-run-'))
let status
try {
  const result = spawnSync(process.execPath, [
    wranglerEntry,
    'versions', 'upload', '--dry-run', '--env', '',
    '--config', configPath,
    '--outdir', outputDirectory
  ], {
    cwd: tmpdir(),
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: path.join(outputDirectory, 'wrangler.log')
    },
    stdio: 'inherit'
  })
  if (result.error) throw result.error
  status = result.status ?? 1
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
process.exit(status)
