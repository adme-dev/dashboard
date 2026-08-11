import { requireCrmRecordAccess } from '~~/server/utils/crm/recordAccess'
import {
  resolveTrustedCrmSystemContext,
  type TrustedCrmSystemContext,
  type TrustedCrmSystemPurpose
} from '~~/server/utils/crm/searchContext'

export interface TrustedCrmCandidate {
  client_id: string
  target_type: 'person' | 'company'
  target_id: string
}

export interface AuthorizedTrustedCrmCandidate<T extends TrustedCrmCandidate> {
  candidate: T
  context: TrustedCrmSystemContext
}

interface TrustedCandidateAccessDependencies {
  resolveContext: typeof resolveTrustedCrmSystemContext
  authorize: typeof requireCrmRecordAccess
}

const defaultDependencies: TrustedCandidateAccessDependencies = {
  resolveContext: resolveTrustedCrmSystemContext,
  authorize: requireCrmRecordAccess
}

/**
 * Resolves one fresh active-client scope per tenant, then authorizes only opaque
 * record identifiers. No candidate contributes to limits or summaries until it
 * survives both checks.
 */
export async function authorizeTrustedCrmCandidates<T extends TrustedCrmCandidate>(
  candidates: readonly T[],
  purpose: Extract<TrustedCrmSystemPurpose, 'crm_health_compute' | 'crm_score_compute'>,
  deps: TrustedCandidateAccessDependencies = defaultDependencies
): Promise<Array<AuthorizedTrustedCrmCandidate<T>>> {
  const grouped = new Map<string, Array<{ candidate: T, index: number }>>()
  candidates.forEach((candidate, index) => {
    const group = grouped.get(candidate.client_id) ?? []
    group.push({ candidate, index })
    grouped.set(candidate.client_id, group)
  })

  const authorized: Array<AuthorizedTrustedCrmCandidate<T> & { index: number }> = []
  for (const [clientId, group] of grouped) {
    let context: TrustedCrmSystemContext
    try {
      context = await deps.resolveContext({ clientId, purpose })
    } catch (error: any) {
      if (error?.statusCode === 404) continue
      throw error
    }
    for (const item of group) {
      try {
        await deps.authorize(context, {
          type: item.candidate.target_type,
          id: item.candidate.target_id
        })
        authorized.push({ candidate: item.candidate, context, index: item.index })
      } catch (error: any) {
        if (error?.statusCode !== 404) throw error
      }
    }
  }

  return authorized
    .sort((a, b) => a.index - b.index)
    .map(({ candidate, context }) => ({ candidate, context }))
}
