import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const runbook = readFileSync('docs/runbooks/google-ai-max-readiness.md', 'utf8')
const environment = readFileSync('docs/ENVIRONMENT_VARIABLES.md', 'utf8')
const script = readFileSync('scripts/google-ai-max-readiness-check.mjs', 'utf8')
const cronWorker = readFileSync('workers/pages-cron/src/index.ts', 'utf8')
const cronConfig = readFileSync('workers/pages-cron/wrangler.toml', 'utf8')

describe('Google AI Max release runbook', () => {
  it('keeps first release notifications dormant until manual sign-off', () => {
    expect(runbook).toContain('GOOGLE_AI_MAX_NOTIFICATIONS_ENABLED')
    expect(runbook).toContain('Manual verification sign-off')
    expect(environment).toContain('GOOGLE_AI_MAX_NOTIFICATIONS_ENABLED')
    expect(environment).toContain('defaults to disabled')
  })

  it('documents migration, first scan, cron, verification and rollback', () => {
    for (const text of ['Migration', 'First manual scan', 'pages-cron', 'Google Ads comparison', 'Rollback']) {
      expect(runbook).toContain(text)
    }
    expect(runbook).toContain('pnpm deploy:check')
    expect(runbook).toContain('pnpm deploy:preview')
    expect(runbook).not.toContain('wrangler pages deploy')
  })

  it('ships a bounded database readiness check without provider mutations', () => {
    expect(script).toContain('google_ai_max_scan_runs')
    expect(script).toContain('google_ai_max_campaign_state')
    expect(script).toContain('AI_MAX_TENANT_ID')
    expect(script).not.toContain('mutate')
  })

  it('registers the daily readiness scan with the consolidated cron worker', () => {
    expect(cronWorker).toContain('\'30 6 * * *\': [\'/api/cron/google-ai-max-readiness\']')
    expect(cronConfig).toContain('"30 6 * * *"')
  })
})
