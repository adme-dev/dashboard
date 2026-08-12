import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/365_google_pmax_launch_project_template.sql', import.meta.url),
  'utf8'
)

describe('Google PMax launch project template migration 365', () => {
  it('creates the governed template and binds unconfigured Google PMax briefs', () => {
    expect(migration).toContain('Google PMax Inventory Launch')
    expect(migration).toMatch(/UPDATE brief_templates[\s\S]*project_template_id[\s\S]*slug = 'google-pmax'[\s\S]*project_template_id IS NULL/)
  })

  it('covers bootstrap, evidence, feed, paused creation, activation, and monitoring', () => {
    for (const title of [
      'Resolve Google account and Vehicle Ads onboarding',
      'Review whole-platform campaign evidence',
      'Bind and reconcile the exact Google vehicle feed',
      'Create the campaign paused',
      'Approve campaign activation',
      'Monitor first 24 hours and 7 days'
    ]) {
      expect(migration).toContain(title)
    }
  })

  it('makes creation and activation separate approval tasks', () => {
    expect(migration).toContain('Approve paused campaign creation')
    expect(migration).toContain('Approve campaign activation')
    expect(migration).not.toMatch(/Create and activate/i)
  })

  it('preserves Cloudflare AI Gateway as advisory and human-controlled', () => {
    expect(migration).toContain('Cloudflare AI Gateway')
    expect(migration).toContain('must not approve, mutate Google, or override deterministic gates')
  })

  it('is transactional and owns only its system template rows', () => {
    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('COMMIT;')
    expect(migration).toMatch(/DELETE FROM template_tasks WHERE template_id = tmpl_id/)
    expect(migration).toMatch(/DELETE FROM template_phases WHERE template_id = tmpl_id/)
  })
})
