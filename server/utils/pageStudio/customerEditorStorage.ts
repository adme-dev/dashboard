import { createError } from 'h3'
import { CmsStorageTargetSchema } from '~~/shared/pageStudio/cmsManaged'
import { cmsEqual } from './cmsVisibility'
import { createCmsGraphStorage } from './cmsGraphStorage'
import type { PageStudioQueryClient, RunPageStudioTransaction } from './sites'

const denied = () => createError({ statusCode: 409, statusMessage: 'Editor content is unavailable or has changed.' })
type StorageSnapshot = Parameters<typeof createCmsGraphStorage>[1] & { checkpoint: { id: string, digest: string, object_key: string } }
/** SQL authority and graph heads are checked around bounded remote reads. No
 * storage I/O holds SQL locks; a timeout can never reach the finish callback. */
export async function withVerifiedCustomerEditorStorage<S extends StorageSnapshot, T>(
  snapshot: (db: PageStudioQueryClient) => Promise<S>,
  options: { env: Record<string, unknown>, runTransaction: RunPageStudioTransaction },
  finish: (db: PageStudioQueryClient, snapshot: S) => Promise<T>
): Promise<T> {
  const run = options.runTransaction
  const before = await run(snapshot)
  if (options.env.PAGE_STUDIO_CONTENT_ENVIRONMENT !== before.scope.environment) throw denied()
  const service = options.env.PAGE_STUDIO_CONTENT_ROUTER as { readManagedCmsTarget?: (input: unknown) => Promise<unknown> } | undefined
  if (!service?.readManagedCmsTarget) throw denied()
  // Remote reads never hold native SQL locks and cannot issue a ticket on timeout.
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      (async () => {
        const target = CmsStorageTargetSchema.parse(await service.readManagedCmsTarget!({ scope: before.scope }))
        if (!cmsEqual(target, before.context.state.target)) throw denied()
        await createCmsGraphStorage(options.env, before).readCheckpoint(before.checkpoint)
        const after = CmsStorageTargetSchema.parse(await service.readManagedCmsTarget!({ scope: before.scope }))
        if (!cmsEqual(after, target)) throw denied()
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(denied()), 8000) })
    ])
  } finally { if (timer) clearTimeout(timer) }
  return await run(async (db) => {
    const after = await snapshot(db)
    if (!cmsEqual(before, after)) throw denied()
    return await finish(db, after)
  })
}
