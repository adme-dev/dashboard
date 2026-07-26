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
    for (const assignment of assignments) {
      await db.query(
        `INSERT INTO crm_persona_tier_memberships (
           client_id, profile_id, tier_key, matched_signals, computed_at
         ) VALUES ($1, $2, $3, $4, NOW())`,
        [clientId, assignment.profileId, assignment.tierKey, assignment.matchedSignals]
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
      results.push({
        clientId,
        tiered: 0,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return results
}
