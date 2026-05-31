/**
 * Shared time-window for analytics endpoints. Range bounds are derived from the
 * client's LOCAL day boundaries (not raw UTC), so day-bucketing in the client tz
 * lines up exactly with the filter — no spurious leading/trailing partial day.
 *
 * The bounds are expressed against `received_at` (a timestamptz) so the
 * (client_id, received_at) index is still usable:
 *   received_at >= (fromDate 00:00 in tz)  AND  received_at < (toDate+1 00:00 in tz)
 *
 * Params convention for every analytics query: $1 clientId, $2 fromDate (text
 * 'YYYY-MM-DD'), $3 toDate (text), $4 tz (text).
 */
import { queryOne } from '~~/server/utils/db'

export const WINDOW_SQL
  = `received_at >= ($2::timestamp AT TIME ZONE $4) AND received_at < (($3::date + 1)::timestamp AT TIME ZONE $4)`

let _validZones: Set<string> | null = null
function validZones(): Set<string> {
  if (!_validZones) {
    try {
      _validZones = new Set((Intl as any).supportedValuesOf?.('timeZone') ?? [])
    } catch {
      _validZones = new Set()
    }
  }
  return _validZones
}

/** Fetch + validate a client's reporting timezone. Falls back to Australia/Brisbane
 *  for unknown/invalid IANA names so a bad stored value can't 500 the query. */
export async function resolveClientTimezone(clientId: string | undefined): Promise<string> {
  const row = await queryOne<any>(`SELECT reporting_timezone FROM agency_clients WHERE id = $1`, [clientId])
  const tz = row?.reporting_timezone
  if (tz && (validZones().size === 0 || validZones().has(tz))) return tz
  return 'Australia/Brisbane'
}
