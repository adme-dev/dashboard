import { loadPageStudioCheckpoint, type PageStudioCheckpointBucket } from '~~/shared/pageStudio/checkpointReader'
import { verifyCustomerAdoptionStorageProof } from '~~/shared/pageStudio/customerAdoptionGrant'
import { PageStudioProvisioningJobSchema } from './provisioningBinding'
import { adoptionDenied, adoptionEqual, type readCustomerAdoptionContext } from './customerAdoptionContext'

type Context = Awaited<ReturnType<typeof readCustomerAdoptionContext>>
export interface CustomerAdoptionStorageDependencies {
  env?: Record<string, unknown>
  /** Private test/worker adapter, never deserialized from customer input. */
  readSource?: (context: Context) => Promise<{ job: unknown; storage: unknown }>
  bucket?: PageStudioCheckpointBucket
}
/** Capture only the fixed native read bindings, before the first await. No
 * dispatch/provisioning mutation or production/staging fallback exists here. */
export function customerAdoptionStorageReader(dependencies: CustomerAdoptionStorageDependencies) {
  const provisioner = dependencies.env?.PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER as
    { readProvisioning?: (key: string, scope: unknown) => Promise<unknown> } | undefined
  const router = dependencies.env?.PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER as
    { readExistingSourceAdoptionProof?: (input: unknown) => Promise<unknown> } | undefined
  const bucket =
    dependencies.bucket ??
    (dependencies.env?.PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS as PageStudioCheckpointBucket | undefined)
  const readJob = provisioner?.readProvisioning?.bind(provisioner),
    readStorage = router?.readExistingSourceAdoptionProof?.bind(router),
    get = bucket?.get?.bind(bucket)
  const trustedReader = dependencies.readSource
  const readSource =
    trustedReader ??
    (readJob && readStorage
      ? async (context: Context) => {
          current()
          const job = await readJob(context.job.requestKey, context.source.scope)
          current()
          const storage = await readStorage({ scope: context.source.scope })
          current()
          return { job, storage }
        }
      : undefined)
  const current = () => {
    if (dependencies.readSource !== trustedReader) throw adoptionDenied()
    if (trustedReader) return
    const env = dependencies.env
    if (
      !env ||
      env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED !== 'true' ||
      env.PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER !== provisioner ||
      env.PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER !== router ||
      env.PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS !== bucket ||
      provisioner?.readProvisioning !== originalReadJob ||
      router?.readExistingSourceAdoptionProof !== originalReadStorage ||
      bucket?.get !== originalGet
    )
      throw adoptionDenied()
  }
  const originalReadJob = provisioner?.readProvisioning,
    originalReadStorage = router?.readExistingSourceAdoptionProof,
    originalGet = bucket?.get
  const identity = (job: Context['job']) => ({
    actor: job.actor,
    id: job.id,
    requestKey: job.requestKey,
    generationVersion: job.generationVersion,
    scope: job.scope,
    templateId: job.templateId,
    plan: job.plan,
    setup: job.setup
  })
  const verify = async (context: Context) => {
    if (!readSource) throw adoptionDenied()
    current()
    const result = await readSource(structuredClone(context)),
      job = PageStudioProvisioningJobSchema.parse(result.job)
    const storage = await verifyCustomerAdoptionStorageProof(result.storage),
      selection = storage.selection
    if (
      job.phase !== 'complete' ||
      !adoptionEqual(identity(job), identity(context.job)) ||
      !adoptionEqual(selection.scope, context.source.scope) ||
      job.resources.database !== selection.target.databaseId ||
      job.resources.contentBinding !== selection.scriptName ||
      job.resources.site !== context.source.scope.siteId
    )
      throw adoptionDenied()
    current()
    return storage
  }
  return async (context: Context) => {
    if (!get) throw adoptionDenied()
    const first = await verify(context)
    await loadPageStudioCheckpoint({
      scope: context.source.scope,
      bucket: {
        get: async (key) => {
          current()
          const value = await get(key)
          current()
          return value
        }
      },
      checkpointId: context.source.checkpoint.id,
      objectKey: context.source.checkpoint.objectKey,
      digests: [context.source.checkpoint.digest]
    })
    const final = await verify(context)
    if (!adoptionEqual(first, final)) throw adoptionDenied()
    current()
    return final
  }
}
