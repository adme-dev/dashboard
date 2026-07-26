import { queryRows, transaction } from '~~/server/utils/db'
import { listPersonaIdentityEnabledClientIds } from '~~/server/utils/persona/feature'
import { activeTierDefinitions, resolveHighestTier } from '~~/server/utils/persona/cohorts'

interface SignalRow {
  profile_id: string
  signal_keys: string[]
}

interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<{ rows?: unknown[] }>
}

export interface ClientTierRecomputeResult {
  clientId: string
  tiered: number
  error?: string
}

export async function recomputeClientTiers(clientId: string): Promise<ClientTierRecomputeResult> {
  const tierDefinitions = await activeTierDefinitions(clientId)
  if (!tierDefinitions.length) return { clientId, tiered: 0 }

  const signalRows = await queryRows<SignalRow>(
    `SELECT signal.profile_id,
            ARRAY_AGG(DISTINCT signal.signal_key) AS signal_keys
       FROM crm_customer_signals signal
      WHERE signal.client_id = $1
        AND signal.profile_id IS NOT NULL
        AND signal.occurred_at >= NOW() - INTERVAL '30 days'
      GROUP BY signal.profile_id`,
    [clientId]
  )

  const assignments = signalRows.flatMap((row) => {
    const resolved = resolveHighestTier(tierDefinitions, row.signal_keys)
    return resolved
      ? [{ profileId: row.profile_id, tierKey: resolved.personaKey, matchedSignals: resolved.matchedSignals }]
      : []
  })

  await transaction(async (db: TransactionClient) => {
    await db.query(
      'DELETE FROM crm_persona_tier_memberships WHERE client_id = $1',
      [clientId]
    )
    if (assignments.length) {
      await db.query(
        `INSERT INTO crm_persona_tier_memberships (
           client_id, profile_id, tier_key, matched_signals, computed_at
         )
         SELECT $1, item.profile_id, item.tier_key, item.matched_signals, NOW()
           FROM jsonb_to_recordset($2::jsonb) AS item(
             profile_id uuid, tier_key text, matched_signals text[]
           )`,
        [clientId, JSON.stringify(assignments.map(assignment => ({
          profile_id: assignment.profileId,
          tier_key: assignment.tierKey,
          matched_signals: assignment.matchedSignals
        })))]
      )
    }
  })

  return { clientId, tiered: assignments.length }
}

export async function recomputePersonaTiers(): Promise<ClientTierRecomputeResult[]> {
  const clientIds = await listPersonaIdentityEnabledClientIds()
  const results: ClientTierRecomputeResult[] = []
  for (const clientId of clientIds) {
    try {
      results.push(await recomputeClientTiers(clientId))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[persona-tier-recompute] client ${clientId} failed: ${message}`)
      results.push({ clientId, tiered: 0, error: message })
    }
  }
  return results
}
