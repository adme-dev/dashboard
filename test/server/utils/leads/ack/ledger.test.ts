import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  queryOne: vi.fn()
}))
vi.mock('~~/server/utils/db', () => ({
  execute: db.execute,
  queryOne: db.queryOne,
  transaction: (work: (client: { query: typeof db.query }) => unknown) => work({ query: db.query })
}))

const { createPostgresLeadAckLedger, reserveLeadAck } = await import('~~/server/utils/leads/ack/ledger')

const input = {
  idempotencyKey: 'a'.repeat(64),
  clientId: '11111111-1111-4111-8111-111111111111',
  leadId: '22222222-2222-4222-8222-222222222222',
  ruleDestinationId: '33333333-3333-4333-8333-333333333333',
  formKey: 'meta:form-a',
  recipientHash: 'b'.repeat(64),
  dailyCap: 5
}

type Step = { match: RegExp, rows: unknown[] }
function script(steps: Step[]) {
  db.query.mockImplementation(async (sql: string) => {
    const step = steps.find(s => s.match.test(sql))
    return { rows: step?.rows ?? [] }
  })
}
const sqlCalls = () => db.query.mock.calls.map(([sql]) => String(sql))

describe('Postgres lead ack ledger', () => {
  beforeEach(() => vi.clearAllMocks())

  it('takes the per-client advisory lock before reading or writing', async () => {
    script([{ match: /COUNT/, rows: [{ n: 0 }] }])
    await expect(reserveLeadAck(createPostgresLeadAckLedger(), input)).resolves.toEqual({ outcome: 'reserved' })
    const calls = sqlCalls()
    expect(calls[0]).toContain('pg_advisory_xact_lock')
    expect(db.query.mock.calls[0]![1]).toEqual([`lead-ack-client:${input.clientId}`])
    expect(calls.at(-1)).toContain('INSERT INTO lead_ack_sends')
  })

  it('checks the recipient window per client, form and recipient, excluding its own key', async () => {
    script([{ match: /recipient_hash = \$3/, rows: [{ '?column?': 1 }] }])
    await expect(reserveLeadAck(createPostgresLeadAckLedger(), input)).resolves.toEqual({ outcome: 'recipient_window' })
    const [sql, params] = db.query.mock.calls.find(([s]) => /recipient_hash = \$3/.test(String(s)))!
    expect(sql).toContain('client_id = $1 AND form_key = $2')
    expect(sql).toContain('idempotency_key <> $4')
    expect(sql).toContain(`status IN ('reserved', 'sent')`)
    expect(params).toEqual([input.clientId, input.formKey, input.recipientHash, input.idempotencyKey, 24])
    expect(sqlCalls().some(s => s.includes('INSERT'))).toBe(false)
  })

  it('stops at the daily cap', async () => {
    script([{ match: /COUNT/, rows: [{ n: 5 }] }])
    await expect(reserveLeadAck(createPostgresLeadAckLedger(), input)).resolves.toEqual({ outcome: 'daily_cap' })
    const [sql, params] = db.query.mock.calls.find(([s]) => /COUNT/.test(String(s)))!
    expect(sql).toContain(`status IN ('reserved', 'sent')`)
    expect(params).toEqual([input.clientId, input.idempotencyKey, 24])
    expect(sqlCalls().some(s => s.includes('INSERT'))).toBe(false)
  })

  it('returns already_sent for a sent key without further checks', async () => {
    script([{ match: /SELECT status FROM lead_ack_sends/, rows: [{ status: 'sent' }] }])
    await expect(reserveLeadAck(createPostgresLeadAckLedger(), input)).resolves.toEqual({ outcome: 'already_sent' })
    expect(sqlCalls()).toHaveLength(2)
  })

  it('re-reserves a failed key instead of inserting a duplicate', async () => {
    script([
      { match: /SELECT status FROM lead_ack_sends/, rows: [{ status: 'failed' }] },
      { match: /COUNT/, rows: [{ n: 0 }] }
    ])
    await expect(reserveLeadAck(createPostgresLeadAckLedger(), input)).resolves.toEqual({ outcome: 'reserved' })
    expect(sqlCalls().at(-1)).toContain(`SET status = 'reserved'`)
    expect(sqlCalls().some(s => s.includes('INSERT'))).toBe(false)
  })

  it('looks up suppression by address (citext) in the global suppression list', async () => {
    db.queryOne.mockResolvedValue({ suppressed: true })
    await expect(createPostgresLeadAckLedger().isSuppressed('Visitor@Example.net')).resolves.toBe(true)
    expect(db.queryOne.mock.calls[0]![0]).toContain('FROM suppression_list WHERE email = $1')
  })
})
