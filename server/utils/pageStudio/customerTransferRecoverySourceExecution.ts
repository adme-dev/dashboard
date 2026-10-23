import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { ManagedTransferExecutionRequestSchema } from '~~/shared/pageStudio/managed-transfer-execution'
import {
  TransferRecoverySourceInputSchema,
  TransferRecoverySourceDiscoveryRequestSchema,
  TransferRecoverySourceDiscoveryResultSchema
} from '~~/shared/pageStudio/transferRecoveryPhase'
import {
  recoverySourceConfiguration,
  recoverySourcePhaseAuthority
} from './customerTransferRecoveryPhaseAuthority'
import { finishRecoveryAdmissionAuthority } from './customerTransferRecoveryAdmissionAuthority'
import { reviewDenied, reviewSame } from './customerTransferRecoveryCurrentAuthority'
import type { RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

type Dependencies = {
  env: Record<string, unknown>
  runTransaction?: RunPageStudioTransaction
}
/** Server-derived private envelope only. Actual enabled/event proof remains the
 * Studio A5 reader's responsibility; this function makes no D1 claim. */
export async function readCustomerTransferRecoveryEnabled(input: unknown, d: Dependencies) {
  const value = TransferRecoverySourceInputSchema.parse(input)
  return (d.runTransaction ?? transactionWithoutRetry)(async (db) => {
    const current = await recoverySourcePhaseAuthority(db, value, d.env)
    const result = structuredClone(current.enabled)
    await finishRecoveryAdmissionAuthority(db, current.proof)
    if (!reviewSame(recoverySourceConfiguration(d.env), current.config)) throw reviewDenied()
    return result
  })
}
/** Read-only discovery outside PG locks, then exact original request plus immutable
 * recovery association in ONE SQL transaction. Never uploads, installs or dispatches. */
export async function prepareCustomerTransferRecoverySourceExecution(input: unknown, d: Dependencies) {
  const value = TransferRecoverySourceInputSchema.parse(input),
    config = recoverySourceConfiguration(d.env)
  const service = d.env.PAGE_STUDIO_PROVISIONER as Record<string, unknown> | undefined
  const method = service?.discoverManagedTransferRecoveryExecution
  if (!service || typeof method !== 'function') throw reviewDenied()
  const current = () => {
    if (
      d.env.PAGE_STUDIO_PROVISIONER !== service ||
      service.discoverManagedTransferRecoveryExecution !== method ||
      !reviewSame(recoverySourceConfiguration(d.env), config)
    )
      throw reviewDenied()
  }
  const run = d.runTransaction ?? transactionWithoutRetry
  const result = async (proof: Awaited<ReturnType<typeof recoverySourcePhaseAuthority>>) => {
    if (!proof.saved) throw reviewDenied()
    return {
      operationId: proof.saved.operationId,
      state: 'execution-reserved' as const,
      requestDigest: await collectionDigest(proof.saved),
      recoveryId: proof.enabled.recovery.recoveryId,
      admissionId: proof.enabled.applied.body.admissionId,
      appliedDigest: proof.enabled.applied.digest
    }
  }
  const before = await run(async (db) => {
    const proof = await recoverySourcePhaseAuthority(db, value, d.env)
    const receipt = proof.saved ? await result(proof) : null
    await finishRecoveryAdmissionAuthority(db, proof.proof)
    current()
    return { proof, receipt }
  })
  if (before.receipt) return before.receipt
  const envelope = TransferRecoverySourceDiscoveryRequestSchema.parse({
    ...before.proof.enabled,
    purpose: 'recovery-phase',
    command: {
      phase: 'source-execution',
      verb: 'read',
      action: 'discover',
      request: before.proof.request,
      requestDigest: await collectionDigest(before.proof.request),
      invocationId: value.body.invocationId
    }
  })
  const envelopeDigest = await collectionDigest(envelope)
  current()
  const raw = structuredClone(await method.call(service, structuredClone(envelope)))
  current()
  const observed = TransferRecoverySourceDiscoveryResultSchema.parse(raw)
  if (observed.envelopeDigest !== envelopeDigest) throw reviewDenied()
  const { predecessor, freeze, formReceipt, ...source } = observed.discovery
  if (!reviewSame(source, before.proof.request)) throw reviewDenied()
  const { digest: freezeDigest, ...freezeBody } = freeze
  if (freezeDigest !== source.freezeDigest || (await collectionDigest(freezeBody)) !== freezeDigest)
    throw reviewDenied()
  const reference = {
    operationId: source.operationId,
    intentDigest: source.intentDigest
  }
  const policy = {
    version: config.descriptor.execution.version,
    kind: config.descriptor.execution.kind,
    from: config.descriptor.execution.from,
    to: config.descriptor.execution.to,
    formReceiptDigest: await collectionDigest(formReceipt)
  }
  const identity = await collectionDigest({
    ...reference,
    predecessor,
    policy
  })
  const successor = {
    ...predecessor,
    runtimeDigest: config.descriptor.execution.to.digest,
    compatibilityDate: config.descriptor.execution.to.compatibilityDate,
    scriptName: `ps-content-${identity.slice(0, 32)}`,
    ownerTag: `ps-owner-${(await collectionDigest({ identity, purpose: 'owner' })).slice(0, 32)}`
  }
  const request = ManagedTransferExecutionRequestSchema.parse({
    formatVersion: 1,
    ...reference,
    sourceScope: source.sourceScope,
    sourceTarget: source.sourceTarget,
    predecessor,
    successor,
    freeze,
    formReceipt,
    policy
  })
  const requestDigest = await collectionDigest(request)
  current()
  return run(async (db) => {
    const proof = await recoverySourcePhaseAuthority(db, value, d.env)
    if (
      !reviewSame(proof.enabled, before.proof.enabled) ||
      !reviewSame(proof.request, before.proof.request) ||
      !reviewSame(proof.config, config) ||
      (proof.saved && !reviewSame(proof.saved, request))
    )
      throw reviewDenied()
    current()
    if (!proof.saved) {
      await db.query(
        `INSERT INTO page_studio_managed_transfer_executions(operation_id,intent_digest,request,request_digest,account_id,namespace,script_name)
        VALUES($1,$2,$3::jsonb,$4,$5,$6,$7)`,
        [
          request.operationId,
          request.intentDigest,
          JSON.stringify(request),
          requestDigest,
          request.successor.accountId,
          request.successor.namespace,
          request.successor.scriptName
        ]
      )
      await db.query(
        `INSERT INTO page_studio_transfer_recovery_source_executions
        (operation_id,intent_digest,recovery_id,epoch,admission_id,applied_digest,request_digest,recovery_descriptor,descriptor_digest) VALUES($1,$2,$3,1,$4,$5,$6,$7::jsonb,$8)`,
        [
          request.operationId,
          request.intentDigest,
          proof.enabled.recovery.recoveryId,
          proof.enabled.applied.body.admissionId,
          proof.enabled.applied.digest,
          requestDigest,
          JSON.stringify(config.descriptor),
          await collectionDigest(config.descriptor)
        ]
      )
    }
    const after = await recoverySourcePhaseAuthority(db, value, d.env)
    if (!reviewSame(after.saved, request) || !reviewSame(after.enabled, before.proof.enabled))
      throw reviewDenied()
    const receipt = await result(after)
    await finishRecoveryAdmissionAuthority(db, after.proof)
    current()
    return receipt
  })
}
