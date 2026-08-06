import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('server/database/migrations/289_google_ai_max_notifications.sql', 'utf8')

describe('Google AI Max notification migration', () => {
  it('enforces one delivery claim per tenant, user and dedupe key', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS google_ai_max_notification_deliveries')
    expect(sql).toContain('PRIMARY KEY (tenant_id, user_id, dedupe_key)')
    expect(sql).toContain('ON DELETE CASCADE')
  })
})
