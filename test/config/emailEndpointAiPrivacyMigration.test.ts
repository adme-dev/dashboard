import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/325_email_endpoint_ai_privacy_approval.sql', import.meta.url),
  'utf8'
)

describe('email endpoint AI privacy approval migration', () => {
  it('adds bound raw-content identity and quarantines unrecoverable legacy work before constraining it', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS header_from_domain TEXT')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS raw_size INTEGER')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS raw_content_hash_version SMALLINT')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS raw_content_hash TEXT')
    expect(migration).toMatch(
      /UPDATE lead_email_ingestions[\s\S]*status = 'quarantined'[\s\S]*error_class = 'legacy_evidence'[\s\S]*WHERE terminal_at IS NULL[\s\S]*raw_content_hash IS NULL/
    )
    expect(migration).toMatch(
      /lead_email_ingestions_raw_content_hash_check[\s\S]*raw_content_hash ~ '\^\[a-f0-9\]\{64\}\$'/
    )
    expect(migration).toMatch(
      /lead_email_ingestions_bound_content_identity_check[\s\S]*terminal_at IS NOT NULL[\s\S]*raw_size IS NOT NULL[\s\S]*raw_content_hash_version = 1[\s\S]*raw_content_hash IS NOT NULL/
    )
  })

  it('fails existing unapproved fallback endpoints closed before enforcing versioned approval integrity', () => {
    expect(migration).toMatch(
      /UPDATE lead_email_endpoints[\s\S]*ai_extraction_mode = 'disabled'[\s\S]*WHERE ai_extraction_mode = 'fallback'/
    )
    expect(migration).toContain('ai_privacy_approval_version')
    expect(migration).toContain('ai_privacy_approved_at')
    expect(migration).toContain('ai_privacy_approved_by')
    expect(migration).toMatch(
      /CHECK \([\s\S]*ai_extraction_mode = 'fallback'[\s\S]*ai_privacy_approval_version IS NOT NULL[\s\S]*ai_extraction_mode <> 'fallback'[\s\S]*ai_privacy_approval_version IS NULL/
    )
  })

  it('is forward-only and safe to reapply', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS ai_privacy_approval_version')
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS lead_email_endpoints_ai_privacy_approval_check')
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS lead_email_ingestions_bound_content_identity_check')
  })
})
