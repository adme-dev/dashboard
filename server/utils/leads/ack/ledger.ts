// server/utils/leads/ack/ledger.ts
// Durable send ledger for visitor auto-acknowledgements (migration 483).
// One row per submission key. Reservation runs under a per-client advisory
// lock so the 24 h recipient window and the daily cap hold under concurrency.

import { execute, queryOne, transaction } from '~~/server/utils/db'
import { LEAD_ACK_RECIPIENT_WINDOW_HOURS } from './config'

export type LeadAckLedgerStatus = 'reserved' | 'sent' | 'failed'

export interface LeadAckReservationInput {
  idempotencyKey: string
  clientId: string
  leadId: string
  ruleDestinationId: string | null
  formKey: string
  recipientHash: string
  dailyCap: number
}

export interface LeadAckLedgerTx {
  findByKey(idempotencyKey: string): Promise<{ status: LeadAckLedgerStatus } | null>
  hasRecentForRecipient(input: { clientId: string, formKey: string, recipientHash: string, excludeKey: string, windowHours: number }): Promise<boolean>
  countRecentForClient(input: { clientId: string, excludeKey: string, windowHours: number }): Promise<number>
  insertReserved(input: LeadAckReservationInput): Promise<void>
  markReserved(idempotencyKey: string): Promise<void>
}

export interface LeadAckLedger {
  withClientLock<T>(clientId: string, work: (tx: LeadAckLedgerTx) => Promise<T>): Promise<T>
  isSuppressed(address: string): Promise<boolean>
  markSent(idempotencyKey: string, providerMessageId: string | null): Promise<void>
  markFailed(idempotencyKey: string): Promise<void>
}

export type LeadAckReservation
  = | { outcome: 'reserved' }
    | { outcome: 'already_sent' | 'recipient_window' | 'daily_cap' }

export async function reserveLeadAck(
  ledger: LeadAckLedger,
  input: LeadAckReservationInput
): Promise<LeadAckReservation> {
  return ledger.withClientLock(input.clientId, async (tx) => {
    const existing = await tx.findByKey(input.idempotencyKey)
    if (existing?.status === 'sent') return { outcome: 'already_sent' }
    // An earlier attempt may have reached the provider before failing to
    // record it. It already counts toward the limits; resend under the same
    // provider idempotency key so the provider drops a true duplicate.
    if (existing?.status === 'reserved') return { outcome: 'reserved' }
    const windowHours = LEAD_ACK_RECIPIENT_WINDOW_HOURS
    if (await tx.hasRecentForRecipient({
      clientId: input.clientId,
      formKey: input.formKey,
      recipientHash: input.recipientHash,
      excludeKey: input.idempotencyKey,
      windowHours
    })) return { outcome: 'recipient_window' }
    const sentToday = await tx.countRecentForClient({
      clientId: input.clientId,
      excludeKey: input.idempotencyKey,
      windowHours
    })
    if (sentToday >= input.dailyCap) return { outcome: 'daily_cap' }
    if (existing) await tx.markReserved(input.idempotencyKey)
    else await tx.insertReserved(input)
    return { outcome: 'reserved' }
  })
}

// Rows that count toward the window and cap: anything not known to have failed.
const COUNTED = `status IN ('reserved', 'sent')`

export function createPostgresLeadAckLedger(): LeadAckLedger {
  return {
    withClientLock(clientId, work) {
      return transaction(async (db) => {
        const rows = async <T>(sql: string, params: unknown[]) => ((await db.query(sql, params)).rows ?? []) as T[]
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`lead-ack-client:${clientId}`])
        return work({
          async findByKey(key) {
            const [row] = await rows<{ status: LeadAckLedgerStatus }>(
              'SELECT status FROM lead_ack_sends WHERE idempotency_key = $1', [key])
            return row ?? null
          },
          async hasRecentForRecipient(i) {
            const found = await rows(
              `SELECT 1 FROM lead_ack_sends
                WHERE client_id = $1 AND form_key = $2 AND recipient_hash = $3
                  AND idempotency_key <> $4 AND ${COUNTED}
                  AND created_at > NOW() - ($5::integer * INTERVAL '1 hour')
                LIMIT 1`,
              [i.clientId, i.formKey, i.recipientHash, i.excludeKey, i.windowHours])
            return found.length > 0
          },
          async countRecentForClient(i) {
            const [row] = await rows<{ n: number }>(
              `SELECT COUNT(*)::int AS n FROM lead_ack_sends
                WHERE client_id = $1 AND idempotency_key <> $2 AND ${COUNTED}
                  AND created_at > NOW() - ($3::integer * INTERVAL '1 hour')`,
              [i.clientId, i.excludeKey, i.windowHours])
            return Number(row?.n ?? 0)
          },
          async insertReserved(i) {
            await db.query(
              `INSERT INTO lead_ack_sends (
                 idempotency_key, client_id, lead_id, rule_destination_id, form_key, recipient_hash, status
               ) VALUES ($1, $2, $3, $4, $5, $6, 'reserved')`,
              [i.idempotencyKey, i.clientId, i.leadId, i.ruleDestinationId, i.formKey, i.recipientHash])
          },
          async markReserved(key) {
            await db.query(
              `UPDATE lead_ack_sends SET status = 'reserved', created_at = NOW(), updated_at = NOW()
                WHERE idempotency_key = $1 AND status = 'failed'`, [key])
          }
        })
      })
    },
    async isSuppressed(address) {
      const row = await queryOne<{ suppressed: boolean }>(
        'SELECT TRUE AS suppressed FROM suppression_list WHERE email = $1 LIMIT 1', [address])
      return row?.suppressed === true
    },
    async markSent(key, providerMessageId) {
      await execute(
        `UPDATE lead_ack_sends SET status = 'sent', provider_message_id = $2, updated_at = NOW()
          WHERE idempotency_key = $1`, [key, providerMessageId])
    },
    async markFailed(key) {
      await execute(
        `UPDATE lead_ack_sends SET status = 'failed', updated_at = NOW()
          WHERE idempotency_key = $1 AND status = 'reserved'`, [key])
    }
  }
}
