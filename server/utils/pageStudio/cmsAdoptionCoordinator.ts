import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { CmsAdoptionIntentSchema, CmsStorageTargetSchema } from '~~/shared/pageStudio/cmsManaged'
import { PageStudioContentScopeSchema } from '~~/shared/pageStudio/businessContent'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { authorizePageStudioCollections } from './collections'
import { PageStudioBusinessContentError } from './businessContent'
import {
  beginCmsAdoption,
  registerCmsFreeze,
  importFrozenCmsPage,
  activateCmsAdoption,
  recoverCmsAdoption,
  readCmsAdoptionControl
} from './cmsAdoption'
import { createCmsAdoptionStorage } from './cmsAdoptionStorage'

const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
export const CmsAdoptionControlRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status') }).strict(),
  z.object({ action: z.literal('start') }).strict(),
  z
    .object({
      action: z.literal('advance'),
      adoptionId: id,
      expectedProgressDigest: z.string().regex(/^[a-f0-9]{64}$/)
    })
    .strict(),
  z
    .object({
      action: z.literal('recover'),
      adoptionId: id,
      recoveryId: id,
      expectedRecoveryId: id.nullable()
    })
    .strict()
])
type Principal = Parameters<typeof beginCmsAdoption>[1]
type Dependencies = NonNullable<Parameters<typeof beginCmsAdoption>[2]>
type Control = Awaited<ReturnType<typeof readCmsAdoptionControl>>
async function project(value: Control) {
  const adoption = value.adoption
  const phase = !adoption
    ? 'idle'
    : adoption.state === 'importing' && adoption.progress?.done
      ? 'ready'
      : adoption.state
  const result = {
    phase,
    adoptionId: adoption?.intent.adoptionId ?? null,
    progress: adoption?.progress
      ? { consumed: adoption.progress.consumed, done: adoption.progress.done }
      : null,
    recoveryId: adoption?.recoveryId ?? null,
    recoveryRequired: Boolean(adoption && !adoption.canAdvance && adoption.state !== 'managed'),
    recoveryReason:
      adoption && !adoption.canAdvance && adoption.state !== 'managed'
        ? 'This session needs explicit recovery before setup can continue.'
        : null,
    receiptDigest: adoption?.receipt?.digest ?? null,
    application: adoption?.receipt?.application ?? null
  }
  const progressDigest = await collectionDigest({
    adoptionDigest: adoption?.digest ?? null,
    state: adoption?.state ?? null,
    freezeDigest: adoption?.freezeDigest ?? null,
    progress: adoption?.progress ?? null,
    recoveryId: adoption?.recoveryId ?? null,
    receiptDigest: adoption?.receipt?.digest ?? null
  })
  return { ...result, progressDigest }
}
const denied = (message: string) =>
  new PageStudioBusinessContentError('CMS_ADOPTION_CONFLICT', 409, message)
/** One explicit phase/page per call. No automatic retry or side effects on status. */
export async function coordinateCmsAdoption(
  raw: unknown,
  principal: Principal,
  deps: Dependencies = {}
) {
  const parsed = CmsAdoptionControlRequestSchema.safeParse(raw)
  if (!parsed.success)
    throw new PageStudioBusinessContentError(
      'CMS_ADOPTION_INVALID',
      400,
      'Invalid content setup request'
    )
  const input = parsed.data
  const env = principal.source === 'native-login' ? principal.request.env : principal.env
  const runTransaction
    = deps.runTransaction ?? (work => transactionWithoutRetry(db => work(db)))
  const scope
    = principal.source === 'studio-session'
      ? PageStudioContentScopeSchema.parse({
          tenantId: principal.claims.tenantId,
          clientId: principal.claims.clientId,
          businessId: principal.claims.clientId,
          siteId: principal.claims.siteId,
          environment: env.PAGE_STUDIO_CONTENT_ENVIRONMENT
        })
      : (
          await runTransaction(async db =>
            authorizePageStudioCollections(principal.request, true, true, {
              policyOnly: true,
              query: async (sql, params) =>
                (await db.query<import('./businessContent').ScopeRow>(sql, params)).rows[0] ?? null
            })
          )
        ).scope
  const control = await readCmsAdoptionControl(scope, principal, deps)
  const current = await project(control)
  if (input.action === 'status') return current
  if (input.action === 'start') {
    if (control.adoption) return current
    if (!control.checkpoint) throw denied('Save a durable website checkpoint before content setup')
    const router = env.PAGE_STUDIO_CONTENT_ROUTER as {
      readManagedCmsTarget?: (input: unknown) => Promise<unknown>
    }
    if (!router?.readManagedCmsTarget) throw denied('Private content storage is unavailable')
    const target = CmsStorageTargetSchema.parse(await router.readManagedCmsTarget({ scope }))
    const intent = CmsAdoptionIntentSchema.parse({
      formatVersion: 1,
      scope,
      actor: control.current.actor,
      adoptionId: `adoption_${randomUUID()}`,
      generation: randomUUID(),
      target,
      expectedCheckpoint: { id: control.checkpoint.id, digest: control.checkpoint.digest }
    })
    try {
      await beginCmsAdoption(intent, principal, deps)
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'CMS adoption identity conflict')
        throw error
      // A competing start won definitively; discover its original intent.
    }
    return await project(await readCmsAdoptionControl(scope, principal, deps))
  }
  const adoption = control.adoption
  if (!adoption || input.adoptionId !== adoption.intent.adoptionId)
    throw denied('Content setup identity changed; reload its status')
  if (input.action === 'recover') {
    await recoverCmsAdoption(
      {
        intent: adoption.intent,
        expectedAdoptionDigest: adoption.digest,
        recoveryId: input.recoveryId,
        expectedRecoveryId: input.expectedRecoveryId,
        actor: control.current.actor
      },
      principal,
      deps
    )
    return await project(await readCmsAdoptionControl(scope, principal, deps))
  }
  if (input.expectedProgressDigest !== current.progressDigest || adoption.state === 'managed')
    return current
  if (!adoption.canAdvance) throw denied('This session requires explicit content setup recovery')
  const storage = createCmsAdoptionStorage(env, adoption.intent, control.checkpoint)
  await storage.assertTarget()
  // Immediately recheck original/recovery authority before private dispatch.
  await beginCmsAdoption(adoption.intent, principal, deps)
  if (adoption.state === 'freezing') {
    await storage.freeze()
    await registerCmsFreeze(adoption.intent, principal, { ...deps, readFreeze: storage.readFreeze })
  } else if (adoption.state === 'importing' && !adoption.progress?.done) {
    await importFrozenCmsPage(
      {
        intent: adoption.intent,
        freezeDigest: adoption.freezeDigest,
        cursor: adoption.progress?.cursor ?? null,
        limit: 20
      },
      principal,
      { ...deps, ...storage.inventory }
    )
  } else if (adoption.state === 'importing' && adoption.progress?.done) {
    await activateCmsAdoption(adoption.intent, principal, { ...deps, ...storage.graph })
  } else throw denied('Content setup is unavailable in its current state')
  return await project(await readCmsAdoptionControl(scope, principal, deps))
}
