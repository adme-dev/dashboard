import { queryOne } from '~~/server/utils/db'
import {
  getPersonaMetrics,
  type PersonaMetricsFilters
} from '~~/server/utils/persona/metrics'

type PersonaMetricsPayload = Awaited<ReturnType<typeof getPersonaMetrics>>

interface SnapshotRow {
  payload: PersonaMetricsPayload
}

function canonicalFilters(filters: PersonaMetricsFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
      .sort(([left], [right]) => left.localeCompare(right))
  )
}

async function scopeHash(filters: PersonaMetricsFilters): Promise<string> {
  const input = new TextEncoder().encode(JSON.stringify(canonicalFilters(filters)))
  const digest = await crypto.subtle.digest('SHA-256', input)
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function freshnessSeconds(filters: PersonaMetricsFilters): number {
  if (!filters.endDate) return 15 * 60
  const end = new Date(`${filters.endDate}T00:00:00Z`).getTime()
  const recentCutoff = Date.now() - 2 * 86_400_000
  return end >= recentCutoff ? 15 * 60 : 24 * 60 * 60
}

export async function getCachedPersonaMetrics(
  clientId: string,
  filters: PersonaMetricsFilters
): Promise<PersonaMetricsPayload> {
  const hash = await scopeHash(filters)
  const cached = await queryOne<SnapshotRow>(
    `SELECT payload
       FROM crm_persona_metric_snapshots
      WHERE client_id = $1
        AND scope_hash = $2
        AND snapshot_date = CURRENT_DATE
        AND expires_at > NOW()
      LIMIT 1`,
    [clientId, hash]
  )
  if (cached?.payload) return cached.payload

  const payload = await getPersonaMetrics(clientId, filters)
  const ttl = freshnessSeconds(filters)
  await queryOne(
    `INSERT INTO crm_persona_metric_snapshots (
       client_id, scope_hash, snapshot_date, filters, payload,
       generated_at, expires_at, created_at, updated_at
     ) VALUES (
       $1, $2, CURRENT_DATE, $3::jsonb, $4::jsonb,
       NOW(), NOW() + ($5::int * INTERVAL '1 second'), NOW(), NOW()
     )
     ON CONFLICT (client_id, scope_hash, snapshot_date)
     DO UPDATE SET filters = EXCLUDED.filters,
                   payload = EXCLUDED.payload,
                   generated_at = EXCLUDED.generated_at,
                   expires_at = EXCLUDED.expires_at,
                   updated_at = NOW()
     RETURNING id`,
    [
      clientId,
      hash,
      JSON.stringify(canonicalFilters(filters)),
      JSON.stringify(payload),
      ttl
    ]
  )
  return payload
}
