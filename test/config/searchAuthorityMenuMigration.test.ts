import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Search Authority menu configuration migration', () => {
  it('stores one tenant-scoped config, public installation id, health and append-only audit evidence', () => {
    const sql = readFileSync('server/database/migrations/338_search_authority_menu_agent.sql', 'utf8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS search_authority_menu_configs')
    expect(sql).toContain('UNIQUE (client_id, site_id)')
    expect(sql).toContain('public_id UUID')
    expect(sql).toContain('last_observed_at')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS search_authority_site_audit_events')
    expect(sql).toContain('FOREIGN KEY (client_id, site_id)')
    expect(sql).toContain('trg_search_authority_site_audit_immutable')
  })
})
