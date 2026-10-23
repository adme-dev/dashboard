import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { ManagedTransferSourceDraftsRequestSchema } from '~~/shared/pageStudio/managed-transfer-source-drafts'
import { TransferRecoverySourceInputSchema } from '~~/shared/pageStudio/transferRecoveryPhase'
import {
  TransferRecoverySourceFreezeDescriptorSchema,
  TransferRecoverySourceReadyRequestSchema,
  verifyRecoverySourceReady,
  recoverySourceFreezeAssociation
} from '~~/shared/pageStudio/transferRecoverySourceFreeze'
import { recoverySourceConfiguration } from './customerTransferRecoveryPhaseAuthority'
import { recoverySourceFreezeContext } from './customerTransferRecoverySourceFreezeAuthority'
import { finishRecoveryAdmissionAuthority } from './customerTransferRecoveryAdmissionAuthority'
import { reviewDenied, reviewSame } from './customerTransferRecoveryCurrentAuthority'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

/** Required private read-only capability. No implicit service fallback: production
 * exposure waits for reviewed native readiness and freeze-capable artifact proof.
 * Initial inspection runs outside PG locks; exact pair replay never calls the
 * old source-only callback, which correctly denies after source_drafts exists. */
export async function prepareCustomerTransferRecoverySourceFreeze(
  input: unknown,
  d: {
    env: Record<string, unknown>
    freezeDescriptor: unknown
    readReady: (input: unknown) => Promise<unknown>
    runTransaction?: RunPageStudioTransaction
  }
) {
  const value = TransferRecoverySourceInputSchema.parse(structuredClone(input)),
    env = d.env,
    runner = d.runTransaction,
    run = runner ?? transactionWithoutRetry,
    readReady = d.readReady,
    descriptorIdentity = d.freezeDescriptor,
    descriptor = TransferRecoverySourceFreezeDescriptorSchema.parse(structuredClone(descriptorIdentity)),
    config = recoverySourceConfiguration(env)
  if (typeof readReady !== 'function') throw reviewDenied()
  const current = () => {
    if (
      d.env !== env ||
      d.runTransaction !== runner ||
      d.readReady !== readReady ||
      d.freezeDescriptor !== descriptorIdentity ||
      !reviewSame(TransferRecoverySourceFreezeDescriptorSchema.parse(d.freezeDescriptor), descriptor) ||
      !reviewSame(recoverySourceConfiguration(env), config)
    )
      throw reviewDenied()
  }
  const read = async (db: PageStudioQueryClient) => {
    current()
    const proof = await recoverySourceFreezeContext(db, value, env, descriptor)
    if (proof.freeze && proof.freeze.association.invocationId !== value.body.invocationId)
      throw reviewDenied()
    await finishRecoveryAdmissionAuthority(db, proof.proof)
    current()
    return proof
  }
  const before = await run(read)
  current()
  if (before.freeze) return structuredClone(before.freeze)
  const wire = TransferRecoverySourceReadyRequestSchema.parse({
    ...before.enabled,
    purpose: 'recovery-source-freeze-ready',
    request: before.saved,
    requestDigest: await collectionDigest(before.saved),
    descriptor: config.descriptor,
    descriptorDigest: await collectionDigest(config.descriptor),
    freezeDescriptor: descriptor
  })
  current()
  const raw = structuredClone(await readReady(structuredClone(wire)))
  current()
  const ready = await verifyRecoverySourceReady(wire, raw),
    source = ready.selection.execution.recovery,
    request = ManagedTransferSourceDraftsRequestSchema.parse({
      formatVersion: 1,
      operationId: before.saved.operationId,
      intentDigest: before.saved.intentDigest,
      executionIdentity: ready.selection.execution.identity,
      fenceIntent: {
        formatVersion: 1,
        nativeIntentDigest: before.saved.intentDigest,
        transferId: before.saved.operationId,
        scope: before.saved.sourceScope,
        target: before.saved.sourceTarget
      }
    }),
    association = await recoverySourceFreezeAssociation({
      enabled: before.enabled,
      request,
      source,
      sourceReceiptDigest: ready.install.receipt.digest,
      sourceSelectionIdentity: ready.selection.execution.identity,
      descriptor,
      invocationId: value.body.invocationId
    }),
    associationDigest = await collectionDigest(association),
    requestDigest = await collectionDigest(request),
    descriptorDigest = await collectionDigest(descriptor),
    expected = { request, association, associationDigest, descriptor }
  current()
  return run(async (db) => {
    const proof = await read(db)
    if (
      !reviewSame(proof.enabled, before.enabled) ||
      !reviewSame(proof.saved, before.saved) ||
      !reviewSame(proof.config, config) ||
      (proof.freeze && !reviewSame(proof.freeze, expected))
    )
      throw reviewDenied()
    if (!proof.freeze) {
      await db.query(
        'INSERT INTO page_studio_managed_transfer_source_drafts(operation_id,intent_digest,request,request_digest) VALUES($1,$2,$3::jsonb,$4)',
        [request.operationId, request.intentDigest, JSON.stringify(request), requestDigest]
      )
      current()
      await db.query(
        `INSERT INTO page_studio_transfer_recovery_source_freezes(operation_id,intent_digest,recovery_id,epoch,admission_id,applied_digest,request_digest,invocation_id,association,association_json,association_digest,descriptor,descriptor_digest)
        VALUES($1,$2,$3,1,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb,$12)`,
        [
          request.operationId,
          request.intentDigest,
          association.recoveryId,
          association.admissionId,
          association.appliedDigest,
          requestDigest,
          association.invocationId,
          JSON.stringify(association),
          collectionCanonical(association),
          associationDigest,
          JSON.stringify(descriptor),
          descriptorDigest
        ]
      )
    }
    const after = await read(db)
    if (
      !reviewSame(after.freeze, expected) ||
      !reviewSame(after.enabled, before.enabled) ||
      !reviewSame(after.saved, before.saved)
    )
      throw reviewDenied()
    // Final clock follows all post-insert reads and pure proof comparisons.
    await finishRecoveryAdmissionAuthority(db, after.proof)
    current()
    return structuredClone(expected)
  })
}
