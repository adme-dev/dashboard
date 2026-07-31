import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL(
  '../../server/database/migrations/329_search_authority_phase_1.sql',
  import.meta.url
)
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : ''
const hardeningMigrationUrl = new URL(
  '../../server/database/migrations/330_search_authority_evidence_hardening.sql',
  import.meta.url
)
const hardeningSql = existsSync(hardeningMigrationUrl)
  ? readFileSync(hardeningMigrationUrl, 'utf8')
  : ''

describe('Search Authority migration 329', () => {
  it('creates every client-scoped Search Console and opportunity relation', () => {
    expect(sql).not.toBe('')

    for (const table of [
      'search_authority_sites',
      'search_console_connections',
      'search_console_property_maps',
      'gsc_sync_runs',
      'gsc_daily_query_page',
      'gsc_daily_page',
      'gsc_daily_property',
      'gsc_url_inspections',
      'search_authority_opportunities',
      'search_authority_opportunity_evidence'
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
    }
  })

  it('stores only a reference to encrypted Google credentials', () => {
    const connectionDefinition = sql.match(
      /CREATE TABLE IF NOT EXISTS search_console_connections \(([\s\S]*?)\n\);/
    )?.[1] ?? ''

    expect(connectionDefinition).toContain('google_credential_profile_id UUID NOT NULL')
    expect(connectionDefinition).not.toMatch(/\baccess_token\b/i)
    expect(connectionDefinition).not.toMatch(/\brefresh_token\b/i)
  })

  it('purpose-binds Google OAuth attempts', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS purpose TEXT')
    expect(sql).toContain(`ADD COLUMN IF NOT EXISTS context JSONB NOT NULL DEFAULT '{}'::jsonb`)
    expect(sql).toContain('idx_google_oauth_attempts_pending_purpose')
  })

  it('deduplicates Search Console reconnects by client and Google subject', () => {
    expect(sql).toContain('idx_search_console_connections_client_subject')
    expect(sql).toContain('(client_id, google_subject)')
  })

  it('enforces client identity and deterministic opportunity deduplication', () => {
    expect(sql).toContain('UNIQUE (client_id, id)')
    expect(sql).toContain('UNIQUE (client_id, property_uri)')
    expect(sql).toContain('UNIQUE (site_id, fingerprint)')
    expect(sql).toContain('REFERENCES agency_clients(id) ON DELETE CASCADE')
  })

  it('supports atomic daily replacement and provisional provider metadata', () => {
    expect(sql).toContain(
      'PRIMARY KEY (property_map_id, metric_date, search_type, query_text, page_url)'
    )
    expect(sql).toContain('provisional BOOLEAN NOT NULL DEFAULT FALSE')
    expect(sql).toContain('first_incomplete_date DATE')
  })

  it('is additive and documents rollback and provider limitations', () => {
    expect(sql).not.toMatch(/^\s*DROP\s+/im)
    expect(sql).toContain('Rollback guidance:')
    expect(sql).toContain('Search Console does not guarantee every result row')
  })
})

describe('Search Authority migration 330', () => {
  it('enforces one selected property and records empty successful projections', () => {
    expect(hardeningSql).toContain(
      'idx_search_console_property_maps_one_selected_per_site'
    )
    expect(hardeningSql).toContain(
      `WHERE status IN ('active', 'restricted')`
    )
    expect(hardeningSql).toContain(
      'CREATE TABLE IF NOT EXISTS gsc_projection_checks'
    )
    expect(hardeningSql).toContain(
      `CHECK (projection IN ('property', 'page', 'query_page'))`
    )
    expect(hardeningSql).toContain('row_count INTEGER NOT NULL')
  })

  it('adds bounded sync lease state without destructive rollback statements', () => {
    expect(hardeningSql).toContain('sync_lease_token UUID')
    expect(hardeningSql).toContain('sync_lease_expires_at TIMESTAMPTZ')
    expect(hardeningSql).toContain('baseline_start_date DATE')
    expect(hardeningSql).toContain('baseline_end_date DATE')
    expect(hardeningSql).toContain('baseline_completed_at TIMESTAMPTZ')
    expect(hardeningSql).not.toMatch(/^\s*DROP\s+/im)
  })
})
