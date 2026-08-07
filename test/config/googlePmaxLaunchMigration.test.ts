import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('../../server/database/migrations/351_google_pmax_launch_foundation.sql', import.meta.url)

describe('Google PMax launch foundation migration', () => {
  it('persists immutable versioned launches with explicit idempotency and constrained states', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS campaign_launches')
    expect(sql).toContain('UNIQUE (brief_id, config_version)')
    expect(sql).toContain('UNIQUE (tenant_id, idempotency_key)')
    expect(sql).toContain('UNIQUE (id, config_version, config_hash)')
    expect(sql).toMatch(/config_hash TEXT NOT NULL CHECK[\s\S]*\^\[a-f0-9\]\{64\}\$/)
    expect(sql).toContain('platform = \'google_ads\'')
    expect(sql).toContain('campaign_type = \'G_PMaxInventory\'')
    expect(sql).toContain('\'RECOVERY_REQUIRED\'')
    expect(sql).toContain('\'ENABLED_VERIFIED\'')
    expect(sql).toContain('normalized_config JSONB NOT NULL')
    expect(sql).toContain('jsonb_typeof(normalized_config) = \'object\'')
    expect(sql).toContain('retry_from_state TEXT')
  })

  it('binds approvals and events to an exact launch version and hash', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS campaign_launch_approvals')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS campaign_launch_events')
    expect(sql).toMatch(/FOREIGN KEY \(launch_id, config_version, config_hash\)[\s\S]*REFERENCES campaign_launches \(id, config_version, config_hash\)/)
    expect(sql).toContain('approval_kind IN (\'create\', \'activate\')')
    expect(sql).toContain('UNIQUE (launch_id, config_version, approval_kind, approved_by)')
    expect(sql).toContain('provider_request_id')
    expect(sql).toContain('TG_OP = \'INSERT\'')
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF state ON campaign_launches')
    expect(sql).toContain('DEFERRABLE INITIALLY DEFERRED')
    expect(sql).toContain('approval and state transition must commit atomically')
  })

  it('enforces append-only approval/event ledgers and immutable launch identity', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('prevent_campaign_launch_ledger_mutation')
    expect(sql).toContain('trg_campaign_launch_approvals_append_only')
    expect(sql).toContain('trg_campaign_launch_events_append_only')
    expect(sql).toContain('BEFORE UPDATE OR DELETE')
    expect(sql).toContain('BEFORE TRUNCATE')
    expect(sql).toContain('prevent_campaign_launch_identity_mutation')
    expect(sql).toContain('normalized_config IS DISTINCT FROM OLD.normalized_config')
    expect(sql).toContain('TG_OP = \'DELETE\'')
  })

  it('can reconcile a database where an earlier draft already created the triggers', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_campaign_launch_state_transition')
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_campaign_launch_approval_source_state')
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_campaign_launch_approval_final_state')
  })

  it('bounds stored audit and error payloads and rejects sensitive keys', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('octet_length(payload::text) <= 32768')
    expect(sql).toContain('campaign_launch_payload_has_sensitive_keys')
    expect(sql).toContain('NOT campaign_launch_payload_has_sensitive_keys(payload)')
    expect(sql).toContain('char_length(last_error_message) <= 2000')
  })
})
