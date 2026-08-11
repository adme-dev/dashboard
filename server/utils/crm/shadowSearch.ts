import type { CrmSearchContext } from './searchContext'
import type { NormalizedCrmSearchRequest } from './searchRequest'
import type { CrmSearchHit } from './search'

export const CRM_SEARCH_SHADOW_CONTRACT = Object.freeze({
  revision: 'crm-search-shadow-v1',
  maximumSampleRate: 0.1,
  maximumConcurrent: 4
} as const)

export interface CrmShadowSearchInput {
  context: CrmSearchContext
  request: NormalizedCrmSearchRequest
  keyword: readonly CrmSearchHit[]
  providerEnabled?: boolean
}

export interface CrmShadowSearchDependencies<Bindings = unknown> {
  sample: () => number
  captureBindings: () => Bindings
  retrieveSemantic: (bindings: Bindings) => Promise<unknown>
  runBackgroundTask: (
    promise: Promise<unknown>,
    metadata: { label: 'crm-search-shadow', correlationId: string }
  ) => void
  log?: (record: {
    event: 'crm_search_shadow_failed'
    correlationId: string
    status: 'provider_failure'
  }) => void
}

let runningShadowTasks = 0

export function runCrmShadowSearch<Bindings>(
  input: CrmShadowSearchInput,
  dependencies: CrmShadowSearchDependencies<Bindings>
): { results: CrmSearchHit[], mode: 'shadow' } {
  const results = input.keyword.slice(0, input.request.limit)
  if (input.providerEnabled === false
    || input.request.semanticEligible !== true
    || runningShadowTasks >= CRM_SEARCH_SHADOW_CONTRACT.maximumConcurrent) {
    return { results, mode: 'shadow' }
  }
  const sample = dependencies.sample()
  if (!Number.isFinite(sample) || sample < 0
    || sample >= CRM_SEARCH_SHADOW_CONTRACT.maximumSampleRate) {
    return { results, mode: 'shadow' }
  }

  // Capture request-scoped bindings before the endpoint returns. The
  // background promise receives only the captured bindings and safe IDs.
  const bindings = dependencies.captureBindings()
  runningShadowTasks += 1
  let semanticWork: Promise<unknown>
  try {
    semanticWork = Promise.resolve(dependencies.retrieveSemantic(bindings))
  } catch {
    semanticWork = Promise.reject(new Error('crm_search_shadow_provider_failure'))
  }
  const work = semanticWork
    .catch(() => {
      dependencies.log?.({
        event: 'crm_search_shadow_failed',
        correlationId: input.context.correlationId,
        status: 'provider_failure'
      })
    })
    .finally(() => { runningShadowTasks -= 1 })
  try {
    dependencies.runBackgroundTask(work, {
      label: 'crm-search-shadow',
      correlationId: input.context.correlationId
    })
  } catch {
    dependencies.log?.({
      event: 'crm_search_shadow_failed',
      correlationId: input.context.correlationId,
      status: 'provider_failure'
    })
  }
  return { results, mode: 'shadow' }
}
