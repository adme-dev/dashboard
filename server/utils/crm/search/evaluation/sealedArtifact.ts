import type { H3Event } from 'h3'

const digestPattern = /^[a-f0-9]{64}$/u
const artifactIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u

export interface CrmSearchSealedHoldout {
  sealedJudgementSha256: string
  queries: unknown[]
  [key: string]: unknown
}

export interface CrmSearchSealedArtifactProvider {
  unseal(input: {
    artifactId: string
    expectedSealedJudgementSha256: string | null
  }): Promise<CrmSearchSealedHoldout>
}

export class CrmSearchSealedArtifactError extends Error {
  readonly code = 'crm_search_sealed_artifact_unavailable'

  constructor() {
    super('CRM search sealed evaluation artifact is unavailable')
    this.name = 'CrmSearchSealedArtifactError'
  }
}

function isProvider(value: unknown): value is CrmSearchSealedArtifactProvider {
  return Boolean(value && typeof value === 'object'
    && typeof (value as { unseal?: unknown }).unseal === 'function')
}

export function resolveCrmSearchSealedArtifactProvider(event: H3Event): CrmSearchSealedArtifactProvider {
  const provider = (event.context as { crmSearchSealedArtifactProvider?: unknown }).crmSearchSealedArtifactProvider
  if (!isProvider(provider)) throw new CrmSearchSealedArtifactError()
  return provider
}

export async function unsealCrmSearchHoldout(
  input: {
    artifactId: string
    expectedSealedJudgementSha256?: string | null
  },
  provider: CrmSearchSealedArtifactProvider
): Promise<CrmSearchSealedHoldout> {
  if (!artifactIdPattern.test(input.artifactId)
    || (input.expectedSealedJudgementSha256 != null
      && !digestPattern.test(input.expectedSealedJudgementSha256))) {
    throw new CrmSearchSealedArtifactError()
  }
  const holdout = await provider.unseal({
    artifactId: input.artifactId,
    expectedSealedJudgementSha256: input.expectedSealedJudgementSha256 ?? null
  })
  if (!holdout || !Array.isArray(holdout.queries)
    || !digestPattern.test(holdout.sealedJudgementSha256)
    || (input.expectedSealedJudgementSha256 != null
      && holdout.sealedJudgementSha256 !== input.expectedSealedJudgementSha256)) {
    throw new CrmSearchSealedArtifactError()
  }
  return holdout
}
