import { queryRows, transaction } from '~~/server/utils/db'
import { listPersonaIdentityEnabledClientIds } from '~~/server/utils/persona/feature'
import {
  activeExclusionDefinitions,
  activeTierDefinitions,
  resolveHighestTier,
  resolveIsExcluded
} from '~~/server/utils/persona/cohorts'

interface SignalRow {
  profile_id: string
  signal_keys: string[]
}

interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<{ rows?: unknown[] }>
}

export interface ClientPersonaMembershipRecomputeResult {
  clientId: string
  tiered: number
  excluded: number
  error?: string
}

export async function recomputeClientPersonaMemberships(clientId: string): Promise<ClientPersonaMembershipRecomputeResult> {
  const [tierDefinitions, exclusionDefinitions] = await Promise.all([
    activeTierDefinitions(clientId),
    activeExclusionDefinitions(clientId)
  ])
  if (!tierDefinitions.length && !exclusionDefinitions.length) {
    return { clientId, tiered: 0, excluded: 0 }
  }

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

  const tierAssignments = tierDefinitions.length
    ? signalRows.flatMap((row) => {
        const resolved = resolveHighestTier(tierDefinitions, row.signal_keys)
        return resolved
          ? [{ profileId: row.profile_id, tierKey: resolved.personaKey, matchedSignals: resolved.matchedSignals }]
          : []
      })
    : []

  const exclusionAssignments = exclusionDefinitions.length
    ? signalRows.flatMap((row) => {
        const resolved = resolveIsExcluded(exclusionDefinitions, row.signal_keys)
        return resolved.excluded
          ? [{ profileId: row.profile_id, matchedSignals: resolved.matchedSignals }]
          : []
      })
    : []

  await transaction(async (db: TransactionClient) => {
    await db.query(
      'DELETE FROM crm_persona_tier_memberships WHERE client_id = $1',
      [clientId]
    )
    if (tierAssignments.length) {
      await db.query(
        `INSERT INTO crm_persona_tier_memberships (
           client_id, profile_id, tier_key, matched_signals, computed_at
         )
         SELECT $1, item.profile_id, item.tier_key, item.matched_signals, NOW()
           FROM jsonb_to_recordset($2::jsonb) AS item(
             profile_id uuid, tier_key text, matched_signals text[]
           )`,
        [clientId, JSON.stringify(tierAssignments.map(assignment => ({
          profile_id: assignment.profileId,
          tier_key: assignment.tierKey,
          matched_signals: assignment.matchedSignals
        })))]
      )
    }
    await db.query(
      'DELETE FROM crm_persona_exclusion_memberships WHERE client_id = $1',
      [clientId]
    )
    if (exclusionAssignments.length) {
      await db.query(
        `INSERT INTO crm_persona_exclusion_memberships (
           client_id, profile_id, matched_signals, computed_at
         )
         SELECT $1, item.profile_id, item.matched_signals, NOW()
           FROM jsonb_to_recordset($2::jsonb) AS item(
             profile_id uuid, matched_signals text[]
           )`,
        [clientId, JSON.stringify(exclusionAssignments.map(assignment => ({
          profile_id: assignment.profileId,
          matched_signals: assignment.matchedSignals
        })))]
      )
    }
  })

  return { clientId, tiered: tierAssignments.length, excluded: exclusionAssignments.length }
}

export async function recomputePersonaMemberships(): Promise<ClientPersonaMembershipRecomputeResult[]> {
  const clientIds = await listPersonaIdentityEnabledClientIds()
  const results: ClientPersonaMembershipRecomputeResult[] = []
  for (const clientId of clientIds) {
    try {
      results.push(await recomputeClientPersonaMemberships(clientId))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[persona-tier-recompute] client ${clientId} failed: ${message}`)
      results.push({ clientId, tiered: 0, excluded: 0, error: message })
    }
  }
  return results
}
