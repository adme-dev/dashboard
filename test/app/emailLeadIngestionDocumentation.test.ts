import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('universal email lead ingestion documentation', () => {
  it('keeps the operator runbook grounded in real paths and deployment guards', () => {
    const runbook = read('docs/runbooks/email-lead-ingestion.md')
    const requiredPaths = [
      'workers/email-lead-intake',
      'workers/leads-cron',
      'shared/leads/email',
      'server/api/internal/leads/email-ingest.post.ts',
      'server/api/leads/email-endpoints',
      'server/api/leads/email-ingestions',
      'server/utils/leads/emailIngestion.ts',
      'server/utils/leads/emailRecovery.ts',
      'server/utils/leads/emailHealth.ts',
      'server/database/migrations/315_universal_email_lead_ingestion.sql',
      'server/database/migrations/324_email_ingestion_health_state.sql'
    ]
    for (const path of requiredPaths) expect(existsSync(path), path).toBe(true)

    expect(runbook).toContain('pnpm deploy:workers leads-cron')
    expect(runbook).toContain('pnpm deploy:check')
    expect(runbook).toContain('event.context.cloudflare.env')
    expect(runbook).toContain('active minute buckets')
    expect(runbook).toContain('test/workers/email-provider-conformance.test.ts')
    expect(runbook).toMatch(/does not reply to, message, or draft\s+responses for customers/)
    expect(JSON.parse(read('workers/email-lead-intake/package.json')).scripts.test)
      .toContain('test/workers/email-provider-conformance.test.ts')
  })

  it('gives operators client-scoped, accessible, non-autonomous setup guidance', () => {
    const setup = read('app/components/leads/SetupGuide.vue')

    for (const claim of [
      'Close setup guide',
      'Copy address',
      'client-scoped address',
      'Show test leads',
      'first-response SLA',
      'parsed deterministically',
      'privacy-approved fallback capability',
      'same canonical lead',
      'deploy <strong>leads-cron</strong>'
    ]) {
      expect(setup).toContain(claim)
    }
    expect(setup).toContain('<caption class="sr-only">')
    expect(setup).toContain('scope="col"')
    expect(setup).not.toContain('Auto-ingestion is wired and waiting')
    expect(setup).not.toContain('replay events archived during the wait period')
  })

  it('publishes dedicated inbound email as the sixth canonical lead source', () => {
    const index = read('app/pages/features/index.vue')
    const detail = read('app/pages/features/[slug].vue')
    const navigation = read('app/components/MarketingNav.vue')

    expect(index).toContain('dedicated inbound email')
    expect(detail).toContain('Six ways in, one inbox')
    expect(detail).toContain('deterministic ADF/provider parsing')
    expect(detail).toContain('optional privacy-approved structured AI fallback')
    expect(detail).toContain('inbound email does not reply to customers')
    expect(detail).not.toContain('Five ways in, one inbox')
    expect(navigation).toContain('Webhooks, inbound email, CSV, and manual leads')
  })

  it('teaches future agents to reuse the canonical pipeline and privacy boundary', () => {
    const agents = read('AGENTS.md')

    expect(agents).toContain('## Universal email lead ingestion')
    expect(agents).toContain('migrations 315–324')
    expect(agents).toContain('Never insert directly')
    expect(agents).toContain('test/workers/email-provider-conformance.test.ts')
    expect(agents).toContain('event.context.cloudflare.env')
    expect(agents).toContain('it never replies')
  })
})
