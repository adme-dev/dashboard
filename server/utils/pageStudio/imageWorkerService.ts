import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { PageStudioContentScopeSchema } from '~~/shared/pageStudio/businessContent'
import { ImageAssetSchema } from '~~/shared/pageStudio/imageGeneration'
import type { PageStudioControlQueryClient } from './controlStore'
import { ImageCreditError } from './imageCredits'
import { withImageGenerationAuthority, withStudioImageAuthority, type ImageGenerationContext } from './imageGenerationAuthority'
import { readImageJobAuthority, claimImageJob, completeImageJob, failImageJob, markImageJobUncertain, cancelQueuedImageJob, takeImageDispatchBatch, recoverStaleImageJobs, expireQueuedImageJobs } from './imageJobs'

type Dependencies = Parameters<typeof withImageGenerationAuthority>[3]
const JobKey = z.object({ scope: PageStudioContentScopeSchema, jobId: z.string().uuid() }).strict()
const Callback = JobKey.extend({ dispatchToken: z.string().uuid() })
const schemas = {
  poll: z.object({ scope: PageStudioContentScopeSchema }).strict(), claim: JobKey,
  complete: Callback.extend({ asset: ImageAssetSchema }).strict(),
  fail: Callback.extend({ reason: z.enum(['provider-rejected', 'invalid-output']) }).strict(),
  uncertain: Callback.strict()
}
export type ImageWorkerOperation = keyof typeof schemas
export function parseImageWorkerInput(operation: ImageWorkerOperation, input: unknown) {
  const parsed = schemas[operation].safeParse(input)
  if (!parsed.success) throw new ImageCreditError('IMAGE_WORKER_INVALID', 400, 'Invalid image worker request')
  return parsed.data
}
/** Dedicated worker credential required by transport. Completion intentionally
 * survives user logout; it settles only the saved job's private dispatch token. */
export async function executeImageWorkerOperation(env: Record<string, unknown>, operation: ImageWorkerOperation, input: unknown, dependencies: Dependencies = {}) {
  const parsed = parseImageWorkerInput(operation, input)
  const run = dependencies.runTransaction ?? (callback => transactionWithoutRetry(db => callback(db as unknown as PageStudioControlQueryClient)))
  const scope = PageStudioContentScopeSchema.parse('scope' in parsed ? parsed.scope : null)
  if (scope.environment !== 'staging' || scope.businessId !== scope.clientId) throw new ImageCreditError('IMAGE_WORKER_DENIED', 403, 'Image worker scope denied')
  if (operation === 'poll') {
    // Scope comes from the separately authenticated private worker. Its static
    // recovery inventory survives disabling native generation/model settings.
    return run(async (db) => {
      await expireQueuedImageJobs(db, scope)
      const stale = await recoverStaleImageJobs(db, scope)
      const queued = await takeImageDispatchBatch(db, scope, 20)
      return { deliveries: [...queued.map(item => ({ ...item, kind: 'generate' as const })), ...stale.map(item => ({ ...item, kind: 'reconcile' as const }))] }
    })
  }
  const { jobId } = JobKey.parse({ scope, jobId: 'jobId' in parsed ? parsed.jobId : null })
  if (operation === 'claim') {
    const discovery = await run(db => readImageJobAuthority(db, scope, jobId))
    if (discovery.state !== 'queued') return { admitted: false as const }
    const work = async (db: PageStudioControlQueryClient, context: ImageGenerationContext) => {
      if (!context.config || context.config.gatewayId !== discovery.quote.gatewayId || !context.config.models.some(model => model.id === discovery.quote.modelId)) {
        throw new ImageCreditError('IMAGE_GENERATION_UNAVAILABLE', 503, 'The quoted image model is not currently available')
      }
      return claimImageJob(db, scope, jobId)
    }
    try {
      if (discovery.principal.source === 'studio-session') {
        return await withStudioImageAuthority(discovery.principal.claims, env, true, work, dependencies)
      }
      const { login } = discovery.principal
      const actor = login.role === 'agency'
        ? { role: 'agency' as const, actorId: login.userId, tenantId: scope.tenantId, canEdit: true }
        : { role: 'client' as const, actorId: login.userId, clientId: scope.clientId }
      return await withImageGenerationAuthority({ siteId: scope.siteId, actor, env, login: {
        ...login, issuedAt: new Date(login.issuedAt), expiresAt: new Date(login.expiresAt)
      } }, true, work, dependencies)
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error && [401, 403, 404].includes(Number(error.statusCode))) {
        await run(db => cancelQueuedImageJob(db, scope, jobId, 'authority-revoked'))
        return { admitted: false as const }
      }
      throw error
    }
  }
  const callback = Callback.parse({ scope, jobId, dispatchToken: 'dispatchToken' in parsed ? parsed.dispatchToken : null })
  if (operation === 'complete') return run(db => completeImageJob(db, scope, jobId, callback.dispatchToken, schemas.complete.parse(parsed).asset))
  if (operation === 'fail') return run(db => failImageJob(db, scope, jobId, callback.dispatchToken, schemas.fail.parse(parsed).reason))
  return run(db => markImageJobUncertain(db, scope, jobId, callback.dispatchToken))
}
