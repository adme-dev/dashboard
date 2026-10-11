import { CustomerCmsSetupRequestSchema, CustomerCmsSetupStatusSchema, CustomerCmsAdoptionStatusSchema, type CustomerCmsSetupRequest, type CustomerCmsSetupStatus } from '~~/shared/pageStudio/customerCmsSetup'
import { CustomerSchemaUpgradeStatusSchema } from '~~/shared/pageStudio/customerSchemaUpgrade'

/** Project only the exact operation's guarded response; never infer other readiness. */
export function mergeCustomerCmsSetupResponse(snapshot: CustomerCmsSetupStatus, input: CustomerCmsSetupRequest, raw: unknown): CustomerCmsSetupStatus | null {
  const current = CustomerCmsSetupStatusSchema.parse(snapshot), body = CustomerCmsSetupRequestSchema.parse(input)
  const mismatch = () => {
    throw new Error('Refresh content setup before continuing.')
  }
  if (body.operation === 'resume' || current.resumeRequired) return null
  if (current.prerequisites.length !== 5 || new Set(current.prerequisites.map(row => row.kind)).size !== 5) return mismatch()
  if (body.operation === 'schema') {
    const value = CustomerSchemaUpgradeStatusSchema.parse(raw), request = body.request
    const prior = current.prerequisites.filter(row => row.kind === request.kind)
    if (prior.length !== 1 || value.kind !== request.kind || request.action === 'status') return mismatch()
    if (value.canConfigure !== !['disabled', 'reconciliation'].includes(value.status)) return mismatch()
    if (request.action === 'start' && value.requestId !== request.requestId) return mismatch()
    if (prior[0]!.requestId && value.requestId !== prior[0]!.requestId) return mismatch()
    if (request.action === 'recover') {
      if (!prior[0]!.requestId || value.recoveryId !== request.requestId || prior[0]!.recoveryId !== request.expectedRecoveryId) return mismatch()
    } else if (value.recoveryId !== prior[0]!.recoveryId) return mismatch()
    return CustomerCmsSetupStatusSchema.parse({ ...current, prerequisites: current.prerequisites.map(row => row.kind === value.kind ? value : row) })
  }
  const value = CustomerCmsAdoptionStatusSchema.parse(raw), request = body.request, prior = current.adoption
  if (!prior || request.action === 'status' || !value.adoptionId) return mismatch()
  if (request.action === 'start') {
    if (prior.phase !== 'idle' || prior.adoptionId !== null || prior.recoveryId !== null || value.recoveryId !== null) return mismatch()
  } else {
    if (request.adoptionId !== prior.adoptionId || value.adoptionId !== request.adoptionId) return mismatch()
    if (request.action === 'recover') {
      if (request.expectedRecoveryId !== prior.recoveryId || value.recoveryId !== request.recoveryId) return mismatch()
    } else if (request.expectedProgressDigest !== prior.progressDigest || value.recoveryId !== prior.recoveryId) return mismatch()
  }
  return CustomerCmsSetupStatusSchema.parse({ ...current, adoption: value })
}
