import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const migrationPath = new URL('../../server/database/migrations/345_god_mode_audit_events.sql', import.meta.url)
const preExecutionMigrationPath = new URL('../../server/database/migrations/346_god_mode_pre_execution_audit.sql', import.meta.url)
const executionMigrationPath = new URL('../../server/database/migrations/347_god_mode_execution_reconciliation.sql', import.meta.url)
const migrationPaths = [migrationPath, preExecutionMigrationPath, executionMigrationPath]
const auditDatabaseUrl = process.env.GOD_MODE_AUDIT_TEST_DATABASE_URL
const schemaName = `god_mode_audit_test_${crypto.randomUUID().replaceAll('-', '')}`
let client: Client | undefined

async function connectToAuditSchema(): Promise<Client> {
  const connection = new Client({ connectionString: auditDatabaseUrl })
  await connection.connect()
  return connection
}

async function beginInAuditSchema(connection: Client): Promise<void> {
  await connection.query('BEGIN')
  await connection.query(`SET LOCAL search_path TO ${schemaName}, pg_catalog`)
  const result = await connection.query<{ schema: string | null }>('SELECT current_schema() AS schema')
  if (result.rows[0]?.schema !== schemaName) {
    throw new Error('generated God mode audit schema was not selected')
  }
}

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

  it('adds immutable, attempt-bound, idempotent pre-execution bypass evidence', () => {
    const migration = readFileSync(preExecutionMigrationPath, 'utf8')

    expect(migration).toMatch(/phase[\s\S]*'bypass'/i)
    expect(migration).toMatch(/CREATE UNIQUE INDEX[\s\S]*WHERE phase = 'bypass'/i)
    expect(migration).toMatch(/bypass event requires matching attempt/i)
    expect(migration).toContain('NEW.actor_user_id')
    expect(migration).toContain('NEW.session_digest')
    expect(migration).toContain('NEW.channel')
    expect(migration).toContain('NEW.route_or_tool')
    expect(migration).toContain('NEW.emergency_disabled')
    expect(migration).not.toMatch(/\b(prompt|raw_payload|access_token|provider_body|claims)\b/i)
  })

  it('adds hashed chat submissions, persisted tool claims, hidden proposal binding, and ambiguous evidence', () => {
    const migration = readFileSync(executionMigrationPath, 'utf8')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS ai_chat_submissions')
    expect(migration).toContain('transport_token_hash')
    expect(migration).not.toMatch(/transport_retry_token|raw_token/i)
    expect(migration).toContain('UNIQUE (actor_user_id, conversation_id, transport_token_hash)')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS god_mode_tool_call_claims')
    expect(migration).toContain('UNIQUE (message_id, ordinal)')
    expect(migration).toContain('god_mode_execution_key')
    expect(migration).toContain('proposal_id')
    expect(migration).toContain('execution_metadata')
    expect(migration).toMatch(/phase[\s\S]*'ambiguous'/i)
  })
})

const databaseDescribe = auditDatabaseUrl ? describe : describe.skip

databaseDescribe('God mode audit migration database regression', () => {
  beforeAll(async () => {
    client = await connectToAuditSchema()
    await client.query(`CREATE SCHEMA ${schemaName}`)
    await beginInAuditSchema(client)
    await client.query(`
      CREATE TABLE ai_conversations (id UUID PRIMARY KEY);
      CREATE TABLE ai_messages (
        id UUID PRIMARY KEY,
        conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        context_sources JSONB DEFAULT '[]'::jsonb
      );
      CREATE TABLE ai_pending_actions (
        id UUID PRIMARY KEY,
        conversation_id UUID,
        user_id UUID NOT NULL,
        source TEXT NOT NULL DEFAULT 'chat',
        status TEXT NOT NULL DEFAULT 'proposed'
      );
    `)
    for (const path of migrationPaths) {
      const migration = readFileSync(path, 'utf8')
        .replace(/^\s*BEGIN;\s*/, '')
        .replace(/\s*COMMIT;\s*$/, '')
      await client.query(migration)
    }
    const tableSchema = await client.query<{ schema: string }>(
      `SELECT namespace.nspname AS schema
         FROM pg_catalog.pg_class relation
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE relation.oid = 'god_mode_audit_events'::REGCLASS`
    )
    expect(tableSchema.rows).toEqual([{ schema: schemaName }])
    await client.query('COMMIT')
  })

  beforeEach(async () => beginInAuditSchema(client!))
  afterEach(async () => client!.query('ROLLBACK').catch(() => {}))

  afterAll(async () => {
    if (!client) return
    await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
    await client.end()
  })

  it('rejects orphan terminals and prevents audit-history mutation', async () => {
    const actor = '11111111-1111-4111-8111-111111111111'
    const correlation = '22222222-2222-4222-8222-222222222222'
    const digest = 'a'.repeat(64)
    await client!.query('SAVEPOINT audit_test')
    await expect(client!.query(
      `INSERT INTO god_mode_audit_events (actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase, bypassed_controls, outcome_code, emergency_disabled)
       VALUES ($1, $2, $3, 'application', 'admin.god-mode', 'succeeded', '{}', 'ok', FALSE)`,
      [actor, correlation, digest]
    )).rejects.toThrow(/matching attempt/i)
    await client!.query('ROLLBACK TO SAVEPOINT audit_test')
    await client!.query(
      `INSERT INTO god_mode_audit_events (actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase, bypassed_controls, outcome_code, emergency_disabled)
       VALUES ($1, $2, $3, 'application', 'admin.god-mode', 'attempt', '{}', 'started', FALSE)`,
      [actor, correlation, digest]
    )
    await client!.query('SAVEPOINT immutable_test')
    await expect(client!.query('UPDATE god_mode_audit_events SET outcome_code = \'changed\' WHERE correlation_id = $1', [correlation])).rejects.toThrow(/immutable/i)
    await client!.query('ROLLBACK TO SAVEPOINT immutable_test')
    await client!.query('SAVEPOINT delete_test')
    await expect(client!.query('DELETE FROM god_mode_audit_events WHERE correlation_id = $1', [correlation])).rejects.toThrow(/immutable/i)
  })

  it('rejects duplicate nonces atomically', async () => {
    const nonce = '33333333-3333-4333-8333-333333333333'
    const actor = '44444444-4444-4444-8444-444444444444'
    await client!.query(`INSERT INTO god_mode_mcp_request_nonces (jti, actor_user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`, [nonce, actor])
    await client!.query('SAVEPOINT nonce_test')
    await expect(client!.query(`INSERT INTO god_mode_mcp_request_nonces (jti, actor_user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`, [nonce, actor])).rejects.toThrow(/duplicate key/i)
  })

  it('binds bypass evidence to the exact attempt and deduplicates normalized controls', async () => {
    const actor = '12111111-1111-4111-8111-111111111111'
    const otherActor = '13111111-1111-4111-8111-111111111111'
    const correlation = '24222222-2222-4222-8222-222222222222'
    const digest = 'e'.repeat(64)
    await client!.query(
      `INSERT INTO god_mode_audit_events (actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase, bypassed_controls, outcome_code, emergency_disabled)
       VALUES ($1, $2, $3, 'application', 'POST /api/agency/ai/chat', 'attempt', '{}', 'started', FALSE)`,
      [actor, correlation, digest]
    )
    await client!.query(
      `INSERT INTO god_mode_audit_events (actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase, bypassed_controls, outcome_code, emergency_disabled)
       VALUES ($1, $2, $3, 'application', 'POST /api/agency/ai/chat', 'bypass', ARRAY['rate_limit', 'budget'], 'pre_execution', FALSE)`,
      [actor, correlation, digest]
    )

    await client!.query('SAVEPOINT duplicate_bypass')
    await expect(client!.query(
      `INSERT INTO god_mode_audit_events (actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase, bypassed_controls, outcome_code, emergency_disabled)
       VALUES ($1, $2, $3, 'application', 'POST /api/agency/ai/chat', 'bypass', ARRAY['budget', 'rate_limit'], 'pre_execution', FALSE)`,
      [actor, correlation, digest]
    )).rejects.toThrow(/duplicate key/i)
    await client!.query('ROLLBACK TO SAVEPOINT duplicate_bypass')

    await client!.query('SAVEPOINT mismatched_bypass')
    await expect(client!.query(
      `INSERT INTO god_mode_audit_events (actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase, bypassed_controls, outcome_code, emergency_disabled)
       VALUES ($1, $2, $3, 'application', 'POST /api/agency/ai/chat', 'bypass', ARRAY['budget'], 'pre_execution', FALSE)`,
      [otherActor, correlation, digest]
    )).rejects.toThrow(/matching attempt/i)
    await client!.query('ROLLBACK TO SAVEPOINT mismatched_bypass')

    const result = await client!.query<{ controls: string[] }>(
      `SELECT bypassed_controls AS controls
         FROM god_mode_audit_events
        WHERE correlation_id = $1 AND phase = 'bypass'`,
      [correlation]
    )
    expect(result.rows).toEqual([{ controls: ['rate_limit', 'budget'] }])
  })

  it('rejects NULL entries in an otherwise allowlisted control array', async () => {
    await expect(client!.query(
      `INSERT INTO god_mode_audit_events (actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase, bypassed_controls, outcome_code, emergency_disabled)
       VALUES ('55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', $1, 'application', 'admin.god-mode', 'attempt', ARRAY['permission', NULL]::VARCHAR[], 'started', FALSE)`,
      ['b'.repeat(64)]
    )).rejects.toThrow()
  })

  it('accepts a terminal after its concurrent attempt commits', async () => {
    await client!.query('ROLLBACK')
    const attempt = await connectToAuditSchema()
    const terminal = await connectToAuditSchema()
    const verify = await connectToAuditSchema()
    const actor = '77777777-7777-4777-8777-777777777777'
    const correlation = '88888888-8888-4888-8888-888888888888'
    const digest = 'c'.repeat(64)
    try {
      await beginInAuditSchema(attempt)
      await attempt.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [correlation])
      await beginInAuditSchema(terminal)
      const terminalResult = terminal.query(
        `INSERT INTO god_mode_audit_events (actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase, bypassed_controls, outcome_code, emergency_disabled)
         VALUES ($1, $2, $3, 'application', 'admin.god-mode', 'succeeded', '{}', 'ok', FALSE)`, [actor, correlation, digest]
      ).then(() => ({ ok: true }), error => ({ ok: false, error }))
      await attempt.query(`INSERT INTO god_mode_audit_events (actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase, bypassed_controls, outcome_code, emergency_disabled)
        VALUES ($1, $2, $3, 'application', 'admin.god-mode', 'attempt', '{}', 'started', FALSE)`, [actor, correlation, digest])
      await attempt.query('COMMIT')
      expect(await terminalResult).toEqual({ ok: true })
      await terminal.query('COMMIT')
      await beginInAuditSchema(verify)
      const result = await verify.query<{ phase: string }>('SELECT phase FROM god_mode_audit_events WHERE correlation_id = $1 ORDER BY phase', [correlation])
      expect(result.rows.map(row => row.phase)).toEqual(['attempt', 'succeeded'])
    } finally {
      await Promise.all([attempt.query('ROLLBACK').catch(() => {}), terminal.query('ROLLBACK').catch(() => {}), verify.query('ROLLBACK').catch(() => {})])
      await Promise.all([attempt.end(), terminal.end(), verify.end()])
    }
  }, 30_000)

  it('keeps exactly one terminal outcome when succeeded and failed inserts compete', async () => {
    await client!.query('ROLLBACK')
    const setup = await connectToAuditSchema()
    const succeeded = await connectToAuditSchema()
    const failed = await connectToAuditSchema()
    const verify = await connectToAuditSchema()
    const actor = '99999999-9999-4999-8999-999999999999'
    const correlation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const digest = 'd'.repeat(64)
    try {
      await beginInAuditSchema(setup)
      await setup.query(`INSERT INTO god_mode_audit_events (actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase, bypassed_controls, outcome_code, emergency_disabled)
        VALUES ($1, $2, $3, 'application', 'admin.god-mode', 'attempt', '{}', 'started', FALSE)`, [actor, correlation, digest])
      await setup.query('COMMIT')
      await beginInAuditSchema(succeeded)
      await succeeded.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [correlation])
      await beginInAuditSchema(failed)
      const failedResult = failed.query(`INSERT INTO god_mode_audit_events (actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase, bypassed_controls, outcome_code, emergency_disabled)
        VALUES ($1, $2, $3, 'application', 'admin.god-mode', 'failed', '{}', 'provider_failed', FALSE)`, [actor, correlation, digest]).then(() => ({ ok: true }), error => ({ ok: false, error }))
      await succeeded.query(`INSERT INTO god_mode_audit_events (actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase, bypassed_controls, outcome_code, emergency_disabled)
        VALUES ($1, $2, $3, 'application', 'admin.god-mode', 'succeeded', '{}', 'ok', FALSE)`, [actor, correlation, digest])
      await succeeded.query('COMMIT')
      expect(await failedResult).toMatchObject({ ok: false, error: { code: '23505' } })
      await failed.query('ROLLBACK')
      await beginInAuditSchema(verify)
      const result = await verify.query<{ phase: string }>('SELECT phase FROM god_mode_audit_events WHERE correlation_id = $1 ORDER BY phase', [correlation])
      expect(result.rows.map(row => row.phase)).toEqual(['attempt', 'succeeded'])
    } finally {
      await Promise.all([setup.query('ROLLBACK').catch(() => {}), succeeded.query('ROLLBACK').catch(() => {}), failed.query('ROLLBACK').catch(() => {}), verify.query('ROLLBACK').catch(() => {})])
      await Promise.all([setup.end(), succeeded.end(), failed.end(), verify.end()])
    }
  }, 30_000)

  it('scopes hashed submission keys to actor and conversation and fixes tool ordinals to the persisted message', async () => {
    const conversation = '10111111-1111-4111-8111-111111111111'
    const messageOne = '10222222-2222-4222-8222-222222222222'
    const messageTwo = '10333333-3333-4333-8333-333333333333'
    const actorOne = '10444444-4444-4444-8444-444444444444'
    const actorTwo = '10555555-5555-4555-8555-555555555555'
    await client!.query('INSERT INTO ai_conversations (id) VALUES ($1)', [conversation])
    await client!.query(
      `INSERT INTO ai_messages (id, conversation_id, role, content) VALUES
       ($1, $3, 'user', 'one'), ($2, $3, 'user', 'two')`,
      [messageOne, messageTwo, conversation]
    )
    await client!.query(
      `INSERT INTO ai_chat_submissions
        (actor_user_id, conversation_id, transport_token_hash, request_digest, user_message_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [actorOne, conversation, 'a'.repeat(64), 'b'.repeat(64), messageOne]
    )
    await client!.query('SAVEPOINT duplicate_submission')
    await expect(client!.query(
      `INSERT INTO ai_chat_submissions
        (actor_user_id, conversation_id, transport_token_hash, request_digest, user_message_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [actorOne, conversation, 'a'.repeat(64), 'b'.repeat(64), messageTwo]
    )).rejects.toThrow(/duplicate key/i)
    await client!.query('ROLLBACK TO SAVEPOINT duplicate_submission')
    await expect(client!.query(
      `INSERT INTO ai_chat_submissions
        (actor_user_id, conversation_id, transport_token_hash, request_digest, user_message_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [actorTwo, conversation, 'a'.repeat(64), 'b'.repeat(64), messageTwo]
    )).resolves.toBeDefined()

    await client!.query(
      `INSERT INTO god_mode_tool_call_claims (message_id, ordinal, tool_name, args_digest)
       VALUES ($1, 0, 'create_task', $2)`,
      [messageOne, 'c'.repeat(64)]
    )
    await client!.query('SAVEPOINT duplicate_ordinal')
    await expect(client!.query(
      `INSERT INTO god_mode_tool_call_claims (message_id, ordinal, tool_name, args_digest)
       VALUES ($1, 0, 'propose_budget_change', $2)`,
      [messageOne, 'd'.repeat(64)]
    )).rejects.toThrow(/duplicate key/i)
  })

  it('allows one immutable ambiguous checkpoint followed by one terminal', async () => {
    const actor = '10666666-6666-4666-8666-666666666666'
    const correlation = '10777777-7777-4777-8777-777777777777'
    const digest = 'e'.repeat(64)
    await client!.query(
      `INSERT INTO god_mode_audit_events
        (actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase,
         bypassed_controls, outcome_code, emergency_disabled)
       VALUES ($1, $2, $3, 'application', 'create_task', 'attempt', '{}', 'started', FALSE)`,
      [actor, correlation, digest]
    )
    await client!.query(
      `INSERT INTO god_mode_audit_events
        (actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase,
         bypassed_controls, outcome_code, emergency_disabled)
       VALUES ($1, $2, $3, 'application', 'create_task', 'ambiguous', ARRAY['confirmation'], 'dispatch_outcome_unknown', FALSE)`,
      [actor, correlation, digest]
    )
    await client!.query('SAVEPOINT duplicate_ambiguous')
    await expect(client!.query(
      `INSERT INTO god_mode_audit_events
        (actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase,
         bypassed_controls, outcome_code, emergency_disabled)
       VALUES ($1, $2, $3, 'application', 'create_task', 'ambiguous', ARRAY['confirmation'], 'dispatch_outcome_unknown', FALSE)`,
      [actor, correlation, digest]
    )).rejects.toThrow(/duplicate key/i)
    await client!.query('ROLLBACK TO SAVEPOINT duplicate_ambiguous')
    await expect(client!.query(
      `INSERT INTO god_mode_audit_events
        (actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase,
         bypassed_controls, outcome_code, emergency_disabled)
       VALUES ($1, $2, $3, 'application', 'create_task', 'succeeded', ARRAY['confirmation'], 'reconciled_succeeded', FALSE)`,
      [actor, correlation, digest]
    )).resolves.toBeDefined()
  })
})
