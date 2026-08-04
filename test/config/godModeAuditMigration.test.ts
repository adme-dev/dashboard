import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/345_god_mode_audit_events.sql',
  import.meta.url
)
const auditDatabaseUrl = process.env.GOD_MODE_AUDIT_TEST_DATABASE_URL
const schemaName = `god_mode_audit_test_${crypto.randomUUID().replaceAll('-', '')}`
let client: Client | undefined

describe('God mode audit migration', () => {
  it('defines immutable audit history, replay protection, and a separate execution ledger', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS god_mode_audit_events')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS god_mode_mcp_request_nonces')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS god_mode_execution_ledger')
    expect(migration).toContain("WHERE phase = 'attempt'")
    expect(migration).toContain("WHERE phase IN ('succeeded', 'failed')")
    expect(migration).toMatch(/terminal event requires matching attempt/i)
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON god_mode_audit_events')
    expect(migration).not.toMatch(/\b(prompt|raw_payload|access_token|provider_body|claims)\b/i)
  })
})

const databaseDescribe = auditDatabaseUrl ? describe : describe.skip

databaseDescribe('God mode audit migration database regression', () => {
  beforeAll(async () => {
    client = new Client({ connectionString: auditDatabaseUrl })
    await client.connect()
    await client.query(`CREATE SCHEMA ${schemaName}`)
    await client.query(`SET search_path TO ${schemaName}, public`)
    await client.query(readFileSync(migrationPath, 'utf8'))
  })

  afterAll(async () => {
    if (!client) return
    await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
    await client.end()
  })

  it('rejects orphan terminal audit events and prevents history mutation', async () => {
    const actor = '11111111-1111-4111-8111-111111111111'
    const correlation = '22222222-2222-4222-8222-222222222222'
    const digest = 'a'.repeat(64)

    await expect(client!.query(
      `INSERT INTO god_mode_audit_events (
         actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase,
         bypassed_controls, outcome_code, emergency_disabled
       ) VALUES ($1, $2, $3, 'application', 'admin.god-mode', 'succeeded', '{}', 'ok', FALSE)`,
      [actor, correlation, digest]
    )).rejects.toThrow(/matching attempt/i)

    await client!.query(
      `INSERT INTO god_mode_audit_events (
         actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase,
         bypassed_controls, outcome_code, emergency_disabled
       ) VALUES ($1, $2, $3, 'application', 'admin.god-mode', 'attempt', '{}', 'started', FALSE)`,
      [actor, correlation, digest]
    )

    await expect(client!.query(
      `UPDATE god_mode_audit_events SET outcome_code = 'changed' WHERE correlation_id = $1`,
      [correlation]
    )).rejects.toThrow(/immutable/i)
    await expect(client!.query(
      `DELETE FROM god_mode_audit_events WHERE correlation_id = $1`,
      [correlation]
    )).rejects.toThrow(/immutable/i)
  })

  it('rejects duplicate nonces atomically', async () => {
    const nonce = '33333333-3333-4333-8333-333333333333'
    const actor = '44444444-4444-4444-8444-444444444444'

    await client!.query(
      `INSERT INTO god_mode_mcp_request_nonces (jti, actor_user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`,
      [nonce, actor]
    )
    await expect(client!.query(
      `INSERT INTO god_mode_mcp_request_nonces (jti, actor_user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`,
      [nonce, actor]
    )).rejects.toThrow(/duplicate key/i)
  })
})
