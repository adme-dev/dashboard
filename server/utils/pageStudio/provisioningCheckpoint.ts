import { checkpointStagingOrigin } from './checkpointStagingOrigin'
import { PageStudioCheckpointCommitSchema } from './controlSchemas'
import { commitPageStudioCheckpoint } from './controlStore'
import { authorizePageStudioProvisioning, PageStudioProvisioningRequestSchema, verifyPageStudioProvisioningJobAuthority } from './provisioningAuthority'
import { PageStudioProvisioningError, type PageStudioProvisionerBinding, type PageStudioProvisioningEnvironment } from './provisioningBinding'

export const PageStudioProvisioningCheckpointSchema = PageStudioCheckpointCommitSchema.extend({
  provisioning: PageStudioProvisioningRequestSchema
}).strict()

/** Only the coordinator's retained job selects the actor. D1 lease checks remain
 * with the executor; native-login authority is fenced by this metadata transaction. */
export async function commitPageStudioProvisioningCheckpoint(
  input: unknown,
  binding: PageStudioProvisionerBinding | undefined,
  environment: PageStudioProvisioningEnvironment,
  dependencies: Pick<NonNullable<Parameters<typeof commitPageStudioCheckpoint>[1]>, 'runTransaction'> = {}
) {
  const parsed = PageStudioProvisioningCheckpointSchema.safeParse(input)
  if (!parsed.success) throw new PageStudioProvisioningError('INVALID_PROVISIONING_REQUEST', 'Invalid setup checkpoint', 400)
  const { checkpoint, expectedCheckpointId, provisioning } = parsed.data
  const { job, userId } = await authorizePageStudioProvisioning(binding, provisioning, environment)
  if (job.phase !== 'content-seeded' || expectedCheckpointId !== null
    || !/^setup_[a-f0-9]{64}$/.test(checkpoint.checkpointId)
    || checkpoint.userId !== userId
    || checkpoint.scope.tenantId !== job.scope.tenantId || checkpoint.scope.clientId !== job.scope.clientId
    || checkpoint.scope.siteId !== job.scope.siteId) {
    throw new PageStudioProvisioningError('PROVISIONING_AUTHORITY_DENIED', 'Setup checkpoint does not match its retained job', 403)
  }
  return await commitPageStudioCheckpoint({ checkpoint, expectedCheckpointId }, {
    runTransaction: dependencies.runTransaction,
    stagingOrigin: async () => checkpointStagingOrigin({ formatVersion: 1, environment, source: 'provisioning',
      userId, role: job.actor!.kind === 'agency-user' ? 'agency' : 'client', loginSessionHash: job.actor!.loginSessionHash,
      requestKey: job.requestKey, proposalRevision: job.setup!.proposalRevision }),
    authorize: async (db) => { await verifyPageStudioProvisioningJobAuthority(job, environment, { transaction: db }) }
  })
}
