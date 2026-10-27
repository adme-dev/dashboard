// In-memory LeadAckLedger with the same semantics as the Postgres ledger:
// per-client serialisation, counted statuses, rolling windows.
import type { LeadAckLedger, LeadAckLedgerStatus, LeadAckReservationInput } from '~~/server/utils/leads/ack/ledger'

export interface FakeRow extends LeadAckReservationInput { status: LeadAckLedgerStatus, createdAt: number, providerId?: string | null }

export function createFakeLedger(now: () => number = Date.now) {
  const rows: FakeRow[] = []
  const suppressed = new Set<string>()
  const locks = new Map<string, Promise<unknown>>()
  const counted = (r: FakeRow) => r.status === 'reserved' || r.status === 'sent'
  const within = (r: FakeRow, hours: number) => r.createdAt > now() - hours * 3_600_000
  const ledger: LeadAckLedger = {
    withClientLock(clientId, work) {
      const previous = locks.get(clientId) ?? Promise.resolve()
      const next = previous.catch(() => {}).then(() => work({
        async findByKey(key, windowHours) {
          const row = rows.find(r => r.idempotencyKey === key)
          return row ? { status: row.status, fresh: within(row, windowHours) } : null
        },
        async hasRecentForRecipient(i) {
          await Promise.resolve()
          return rows.some(r => r.clientId === i.clientId && r.formKey === i.formKey
            && r.recipientHash === i.recipientHash && r.idempotencyKey !== i.excludeKey
            && counted(r) && within(r, i.windowHours))
        },
        async countRecentForClient(i) {
          await Promise.resolve()
          return rows.filter(r => r.clientId === i.clientId && r.idempotencyKey !== i.excludeKey
            && counted(r) && within(r, i.windowHours)).length
        },
        async insertReserved(i) {
          if (rows.some(r => r.idempotencyKey === i.idempotencyKey)) throw new Error('unique violation')
          rows.push({ ...i, status: 'reserved', createdAt: now() })
        },
        async markReserved(key) {
          const row = rows.find(r => r.idempotencyKey === key && r.status !== 'sent')
          if (row) Object.assign(row, { status: 'reserved', createdAt: now() })
        }
      }))
      locks.set(clientId, next)
      return next
    },
    async isSuppressed(address) {
      return suppressed.has(address.toLowerCase())
    },
    async markSent(key, providerId) {
      const row = rows.find(r => r.idempotencyKey === key)
      if (row) Object.assign(row, { status: 'sent', providerId, createdAt: now() })
    },
    async markFailed(key) {
      const row = rows.find(r => r.idempotencyKey === key && r.status === 'reserved')
      if (row) row.status = 'failed'
    }
  }
  return { ledger, rows, suppressed }
}
