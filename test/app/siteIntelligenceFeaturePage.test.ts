import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('public site intelligence product copy', () => {
  it('surfaces the capability under Analytics & Reporting', () => {
    const index = readFileSync('app/pages/features/index.vue', 'utf8')

    expect(index).toContain('Website Audience Intelligence')
    expect(index).toContain('public competitor changes')
    expect(index).toContain('client-owned')
  })

  it('explains the four evidence boundaries without invented performance or activation claims', () => {
    const detail = readFileSync('app/pages/features/[slug].vue', 'utf8')
    const entry = detail.slice(
      detail.indexOf('\'website-audience-intelligence\':'),
      detail.indexOf('\'analytics-ask\':')
    )

    expect(entry).toContain('Owned-site context')
    expect(entry).toContain('Public competitor changes')
    expect(entry).toContain('Evidence-backed gaps')
    expect(entry).toContain('Controlled AI interpretation')
    expect(entry).not.toMatch(/competitor traffic estimate|estimate competitor traffic|automatic(?:ally)? activate|auto-activate/i)
  })

  it('documents provisioning, observation, pause, deletion, and rollback gates', () => {
    const runbook = readFileSync('docs/runbooks/site-intelligence-pilot.md', 'utf8')

    for (const requirement of [
      'agency-site-intelligence',
      'Lifecycle Rules',
      'automotive-site-intelligence --dimensions=768',
      'create-metadata-index',
      'Browser Rendering - Edit',
      'AI Gateway pilot budget',
      'manual-only pilot',
      'observe for 24 hours',
      'agency-jobs-dlq',
      'Tenant deletion procedure',
      'Pause and rollback',
      'pnpm deploy:production',
      'pnpm deploy:workers pages-cron'
    ]) expect(runbook).toContain(requirement)
    expect(runbook).not.toMatch(/^\s*(?:pnpm exec |npx )?wrangler pages deploy/gm)
  })
})
