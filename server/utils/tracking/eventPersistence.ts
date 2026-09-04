import { transaction as defaultTransaction } from '~~/server/utils/db'
import {
  appendCanonicalConversionEvent as defaultAppendOutbox,
  type AppendCanonicalConversionEventResult
} from '~~/server/utils/measurement/outbox'
import { buildBrowserCanonicalConversion } from '~~/server/utils/tracking/browserCanonicalConversion'
import type { TrackingEventRow } from '~~/server/utils/tracking/event-insert'

interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<{ rows?: unknown[] }>
}

type Transaction = <T>(callback: (db: TransactionClient) => Promise<T>) => Promise<T>
type AppendOutbox = (
  db: TransactionClient,
  input: Parameters<typeof defaultAppendOutbox>[1]
) => Promise<AppendCanonicalConversionEventResult>

interface TrackingEventPersistenceDeps {
  transaction: Transaction
  appendOutbox: AppendOutbox
  onPromotionError: (error: unknown, context: { clientId: string, eventId: string }) => void
}

const defaultDeps: TrackingEventPersistenceDeps = {
  transaction: defaultTransaction as unknown as Transaction,
  appendOutbox: defaultAppendOutbox,
  onPromotionError: (_error, context) => {
    console.error('[track] browser conversion promotion failed', context)
  }
}

const INSERT_TRACKING_EVENT_SQL = `
  INSERT INTO tracking_events (
    site_id, client_id, event_id, anon_id, session_id, event_name, page_url, referrer,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    gclid, gbraid, wbraid, fbclid, fbc, fbp, ttclid, ttp, msclkid, li_fat_id,
    event_data, consent, ua, ip_hash, origin, occurred_at
  )
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
          $24,$25,$26,$27,$28,$29)
  ON CONFLICT (site_id, event_id) DO NOTHING
  RETURNING event_id
`

function insertParams(row: TrackingEventRow): unknown[] {
  return [
    row.site_id, row.client_id, row.event_id, row.anon_id, row.session_id, row.event_name,
    row.page_url, row.referrer, row.utm_source, row.utm_medium, row.utm_campaign,
    row.utm_term, row.utm_content, row.gclid, row.gbraid, row.wbraid, row.fbclid,
    row.fbc, row.fbp, row.ttclid, row.ttp, row.msclkid, row.li_fat_id,
    JSON.stringify(row.event_data), JSON.stringify(row.consent), row.ua, row.ip_hash,
    row.origin, row.occurred_at
  ]
}

export function createTrackingEventPersistence(deps: TrackingEventPersistenceDeps = defaultDeps) {
  return {
    async persist(input: {
      rows: TrackingEventRow[]
      marketingConsent: 'granted' | 'denied'
      receivedAt: string
    }): Promise<{ stored: number, promoted: number, promotionFailures: number }> {
      return deps.transaction(async (db) => {
        let stored = 0
        let promoted = 0
        let promotionFailures = 0

        for (const row of input.rows) {
          const inserted = await db.query(INSERT_TRACKING_EVENT_SQL, insertParams(row))
          if (!inserted.rows?.length) continue
          stored += 1

          const conversion = buildBrowserCanonicalConversion({
            row,
            marketingConsent: input.marketingConsent,
            receivedAt: input.receivedAt
          })
          if (!conversion) continue

          await db.query('SAVEPOINT browser_conversion_promotion')
          try {
            const result = await deps.appendOutbox(db, conversion)
            if (result.status === 'created' || result.status === 'duplicate') promoted += 1
            await db.query('RELEASE SAVEPOINT browser_conversion_promotion')
          } catch (error) {
            promotionFailures += 1
            await db.query('ROLLBACK TO SAVEPOINT browser_conversion_promotion')
            await db.query('RELEASE SAVEPOINT browser_conversion_promotion')
            deps.onPromotionError(error, { clientId: row.client_id, eventId: row.event_id })
          }
        }

        return { stored, promoted, promotionFailures }
      })
    }
  }
}

export const trackingEventPersistence = createTrackingEventPersistence()
