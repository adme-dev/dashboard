#!/usr/bin/env node
// Deploy the standalone Cloudflare cron-dispatcher Workers.
//
// `pnpm deploy:production` only ships the Pages app (wrangler pages deploy) — it
// does NOT deploy the companion Workers under workers/*. Those drive every
// /api/cron/* route (Pages has no scheduled() handler) and only update when
// deployed with `wrangler deploy`, which is also what registers the
// [triggers] crons from each wrangler.toml. This script closes that gap.
//
// Usage:  pnpm deploy:workers            # deploy all cron workers
//         pnpm deploy:workers pages-cron # deploy just one
//
// These are stateless cron dispatchers — safe to redeploy. Durable-Object /
// room / queue-consumer workers are intentionally NOT included here.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const CRON_WORKERS = [
  'pages-cron',
  'ai-agent-worker',
  'meta-status-cron',
  'leads-cron',
  'social-dispatch-cron',
  'social-inbox-cron',
  'social-listening-cron',
  'social-metrics-cron',
  'social-report-cron',
  'crm-cron',
]

const targets = process.argv.slice(2).length ? process.argv.slice(2) : CRON_WORKERS
const failed = []

for (const name of targets) {
  const cwd = join(root, 'workers', name)
  if (!existsSync(join(cwd, 'wrangler.toml'))) {
    console.error(`✗ ${name}: workers/${name}/wrangler.toml not found — skipping`)
    failed.push(name)
    continue
  }
  console.log(`\n▶ deploying ${name} …`)
  const res = spawnSync('npx', ['wrangler', 'deploy'], { cwd, stdio: 'inherit' })
  if (res.status !== 0) {
    console.error(`✗ ${name}: wrangler deploy exited ${res.status}`)
    failed.push(name)
  } else {
    console.log(`✓ ${name} deployed`)
  }
}

if (failed.length) {
  console.error(`\nFailed: ${failed.join(', ')}`)
  process.exit(1)
}
console.log('\nAll cron workers deployed.')
