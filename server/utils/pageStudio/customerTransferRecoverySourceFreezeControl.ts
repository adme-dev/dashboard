import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { TransferRecoverySourceInputSchema } from '~~/shared/pageStudio/transferRecoveryPhase'
import {
  TransferRecoverySourceFreezeDescriptorSchema,
  TransferRecoverySourceReadyRequestSchema,
  recoverySourceFreezeResourceDigest,
  verifyRecoverySourceFreezeLinkage,
  verifyRecoverySourceReady
} from '~~/shared/pageStudio/transferRecoverySourceFreeze'
import { verifyRecoverySourceFreezeResult } from '~~/shared/pageStudio/transferRecoverySourceFreezeResult'
import { recoverySourceConfiguration } from './customerTransferRecoveryPhaseAuthority'
import { recoverySourceFreezeContext } from './customerTransferRecoverySourceFreezeAuthority'
import { finishRecoveryAdmissionAuthority } from './customerTransferRecoveryAdmissionAuthority'
import { reviewDenied, reviewSame } from './customerTransferRecoveryCurrentAuthority'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

/** Explicit execution of an already-prepared freeze pair. The fixed private
 * adapter owns acquired-only dispatch, physical readback and D1 settlement.
 * Both remote calls occur outside PG locks; no automatic retry or inferred claim.
 * These invocation-scoped capabilities must be supplied by the trusted host.
 */
export async function executeCustomerTransferRecoverySourceFreeze(
  input: unknown,
  d: {
    env: Record<string, unknown>
    freezeDescriptor: unknown
    readReady: (input: unknown) => Promise<unknown>
    executeFreeze: (input: unknown) => Promise<unknown>
    runTransaction?: RunPageStudioTransaction
  }
) {
  const value = TransferRecoverySourceInputSchema.parse(structuredClone(input)),
    env = d.env,
    runner = d.runTransaction,
    run = runner ?? transactionWithoutRetry,
    readReady = d.readReady,
    executeFreeze = d.executeFreeze,
    descriptorIdentity = d.freezeDescriptor,
    descriptor = TransferRecoverySourceFreezeDescriptorSchema.parse(structuredClone(descriptorIdentity)),
    config = recoverySourceConfiguration(env)
  if (typeof readReady !== 'function' || typeof executeFreeze !== 'function') throw reviewDenied()
  const current = () => {
    if (
      d.env !== env || d.runTransaction !== runner || d.readReady !== readReady
      || d.executeFreeze !== executeFreeze || d.freezeDescriptor !== descriptorIdentity
      || !reviewSame(TransferRecoverySourceFreezeDescriptorSchema.parse(d.freezeDescriptor), descriptor)
      || !reviewSame(recoverySourceConfiguration(env), config)
    ) throw reviewDenied()
  }
  const read = async (db: PageStudioQueryClient, expected?: unknown) => {
    current()
    const proof = await recoverySourceFreezeContext(db, value, env, descriptor)
    current()
    if (!proof.freeze || proof.freeze.association.invocationId !== value.body.invocationId
      || !reviewSame(proof.config, config)) throw reviewDenied()
    const snapshot = { enabled: proof.enabled, saved: proof.saved, freeze: proof.freeze }
    if (expected !== undefined && !reviewSame(expected, snapshot)) throw reviewDenied()
    // The final database clock follows retained-row comparisons as well.
    await finishRecoveryAdmissionAuthority(db, proof.proof)
    current()
    return snapshot
  }
  const before = await run(read)
  current()
  const readyWire = TransferRecoverySourceReadyRequestSchema.parse({
    ...before.enabled, purpose: 'recovery-source-freeze-ready',
    request: before.saved, requestDigest: await collectionDigest(before.saved),
    descriptor: config.descriptor, descriptorDigest: await collectionDigest(config.descriptor),
    freezeDescriptor: descriptor
  })
  current()
  const rawReady = structuredClone(await readReady(structuredClone(readyWire)))
  current()
  const ready = await verifyRecoverySourceReady(readyWire, rawReady)
  current()
  const wire = await verifyRecoverySourceFreezeLinkage({
    ...before.enabled, purpose: 'recovery-source-freeze',
    ...before.freeze,
    requestDigest: before.freeze.association.requestDigest,
    descriptorDigest: before.freeze.association.descriptorDigest,
    source: ready.selection.execution.recovery,
    sourceReceiptDigest: ready.install.receipt.digest,
    sourceSelectionIdentity: ready.selection.execution.identity,
    command: { phase: 'source-freeze', action: 'freeze', verb: 'claim',
      invocationId: value.body.invocationId,
      resourceDigest: await recoverySourceFreezeResourceDigest(before.freeze.request) }
  })
  const recheck = async () => {
    current()
    await run(db => read(db, before))
    current()
  }
  // Readiness can await provider/tenant inspection. Recheck the immutable PG
  // association and live authority after that wait, before native acquisition.
  await recheck()
  const rawResult = structuredClone(await executeFreeze(structuredClone(wire)))
  current()
  const result = await verifyRecoverySourceFreezeResult(wire, rawResult)
  current()
  await recheck()
  return result
}
