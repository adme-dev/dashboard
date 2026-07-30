import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/288-crm-conversations-email-foundation.sql',
  import.meta.url
)

describe('CRM conversations email foundation migration 288', () => {
  it('defines the canonical tenant-scoped email data model', () => {
    const exists = existsSync(migrationPath)
    expect(exists).toBe(true)
    if (!exists) return

    const sql = readFileSync(migrationPath, 'utf8')

    for (const table of [
      'crm_conversations',
      'crm_messages',
      'crm_message_events',
      'crm_message_attachments',
      'crm_email_routes',
      'crm_email_sender_identities',
      'crm_email_credentials'
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
    }

    expect(sql).toContain('CHECK (delivery_status IN (\'draft\',\'queued\',\'sending\',\'sent\',\'delivered\',\'deferred\',\'bounced\',\'failed\',\'rejected\',\'complained\',\'cancelled\'))')
    expect(sql).toMatch(/FOREIGN KEY \(client_id, conversation_id\)[\s\S]*REFERENCES crm_conversations \(client_id, id\)/)
    expect(sql).toMatch(/FOREIGN KEY \(client_id, message_id\)[\s\S]*REFERENCES crm_messages \(client_id, id\)/)
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]*\(client_id, provider, provider_message_id\)/i)
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]*\(client_id, provider, provider_event_id\)/i)
    expect(sql).not.toMatch(/^\s*(api[_ ]?token|cloudflare[_ ]?token)\s+/im)
  })

  it('stores only hashed routing and compatibility credential secrets', () => {
    const exists = existsSync(migrationPath)
    expect(exists).toBe(true)
    if (!exists) return

    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('route_token_hash TEXT NOT NULL')
    expect(sql).toContain('secret_hash TEXT NOT NULL')
    expect(sql).not.toMatch(/^\s*(route_token|secret|password)\s+TEXT/im)
  })

  it('is additive and rerunnable', () => {
    const exists = existsSync(migrationPath)
    expect(exists).toBe(true)
    if (!exists) return

    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('BEGIN;')
    expect(sql).toContain('COMMIT;')
    expect(sql).not.toMatch(/^\s*(DROP|TRUNCATE|DELETE\s+FROM)\b/im)
    expect(sql.match(/CREATE TABLE IF NOT EXISTS/g)).toHaveLength(7)
    expect(sql).not.toMatch(/CREATE INDEX (?!IF NOT EXISTS)/)
    expect(sql).not.toMatch(/CREATE UNIQUE INDEX (?!IF NOT EXISTS)/)
  })
})
