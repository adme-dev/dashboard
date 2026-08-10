import {
  createError,
  eventHandler,
  readBody,
  setResponseHeader,
  setResponseStatus,
  type H3Event
} from 'h3'
import { z } from 'zod'
import { requirePermission, requireWriteAccess, type User } from '~~/server/utils/auth'
import { startCrmSearchEvaluation } from '~~/server/utils/crm/search/evaluation/runner'

const digest = z.string().regex(/^[a-f0-9]{64}$/u)
const revision = z.string().trim().min(1).max(240)
const BodySchema = z.strictObject({
  fixtureVersion: revision,
  sealedArtifactId: z.uuid(),
  datasetSha256: digest,
  sealedJudgementSha256: digest,
  preregistrationSha256: digest,
  adjudicationSha256: digest,
  implementationGitSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u),
  artifactManifestDigest: digest,
  pagesBundleDigest: digest,
  workerBundleDigest: digest,
  bindingManifestDigest: digest,
  schemaVersion: z.string().regex(/^crm-search-v[1-9][0-9]*$/u),
  modelId: revision,
  tokenizerRevision: revision,
  rankingRevision: revision,
  thresholdRevision: revision,
  reason: z.string().trim().min(10).max(2_000)
})

type EvaluationPostBody = z.infer<typeof BodySchema>

export interface CrmSearchEvaluationPostDependencies {
  requireRole(event: H3Event, roles: readonly ['ADMIN']): Promise<User>
  requireWriteAccess(event: H3Event): Promise<User>
  readBody(event: H3Event): Promise<unknown>
  setResponseHeader(event: H3Event, name: string, value: string): void
  setResponseStatus(event: H3Event, statusCode: number): void
  startEvaluation(input: EvaluationPostBody, actorId: string, event: H3Event): Promise<unknown>
}

const defaults: CrmSearchEvaluationPostDependencies = {
  requireRole: event => requirePermission(event, 'ADMIN'),
  requireWriteAccess,
  readBody,
  setResponseHeader,
  setResponseStatus,
  startEvaluation: startCrmSearchEvaluation
}

function sanitizedFailure(error: unknown): never {
  const code = error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : 'crm_search_evaluation_start_failed'
  const statusCode = code.includes('invalid') || code.includes('caller_submitted') ? 422 : 503
  throw createError({
    statusCode,
    statusMessage: statusCode === 422
      ? 'CRM search evaluation request was not admitted'
      : 'CRM search evaluation is unavailable',
    data: { code: statusCode === 422 ? code : 'crm_search_evaluation_start_failed' }
  })
}

export function createCrmSearchEvaluationPostHandler(
  overrides: Partial<CrmSearchEvaluationPostDependencies> = {}
) {
  const dependencies = { ...defaults, ...overrides }
  return async (event: H3Event) => {
    const actor = await dependencies.requireRole(event, ['ADMIN'])
    const writable = await dependencies.requireWriteAccess(event)
    if (actor.id !== writable.id) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden - Session identity changed' })
    }
    const parsed = BodySchema.safeParse(await dependencies.readBody(event))
    if (!parsed.success) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Invalid CRM search evaluation request',
        data: { code: 'crm_search_evaluation_invalid_request' }
      })
    }
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      const result = await dependencies.startEvaluation(parsed.data, actor.id, event)
      dependencies.setResponseStatus(event, 201)
      return result
    } catch (error) {
      sanitizedFailure(error)
    }
  }
}

export default eventHandler(createCrmSearchEvaluationPostHandler())
