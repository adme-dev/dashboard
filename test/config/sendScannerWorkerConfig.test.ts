import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(readFileSync(
  new URL('../../workers/send-scanner/package.json', import.meta.url),
  'utf8'
))
const workerConfig = readFileSync(
  new URL('../../workers/send-scanner/wrangler.jsonc', import.meta.url),
  'utf8'
)
const deploymentGuard = readFileSync(
  new URL('../../workers/send-scanner/scripts/verify-config.mjs', import.meta.url),
  'utf8'
)

describe('Send scanner Worker deployment configuration', () => {
  it('keeps the dormant adapter visibly unconfigured', () => {
    expect(workerConfig).toContain('"EXPECTED_R2_ACCOUNT_ID": "CONFIGURE_BEFORE_DEPLOY"')
  })

  it('blocks dry-run and deployment until the account ID passes the preflight', () => {
    expect(packageJson.scripts['deploy:dry-run']).toContain('node scripts/verify-config.mjs')
    expect(packageJson.scripts.deploy).toContain('node scripts/verify-config.mjs')
    expect(deploymentGuard).toContain('/^[0-9a-f]{32}$/i')
    expect(deploymentGuard).toContain('process.exitCode = 1')
  })
})
