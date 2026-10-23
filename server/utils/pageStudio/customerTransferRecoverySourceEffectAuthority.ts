import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { contentScopeKey } from '~~/shared/pageStudio/cmsManaged'
import { TransferRecoverySourceInputSchema } from '~~/shared/pageStudio/transferRecoveryPhase'
import {
  TransferRecoverySourceEffectRequestSchema,
  TransferRecoverySourceEffectAcknowledgmentSchema
} from '~~/shared/pageStudio/transferRecoverySourceEffect'
import {
  retainedRecoveryAdmission,
  finishRecoveryAdmissionAuthority
} from './customerTransferRecoveryAdmissionAuthority'
import {
  recoverySourceConfiguration,
  recoverySourcePhaseAuthority
} from './customerTransferRecoveryPhaseAuthority'
import { reviewDenied, reviewSame } from './customerTransferRecoveryCurrentAuthority'
import type { RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

/** Fresh PG authority only. This callback neither reads nor acquires a D1 claim,
 * submits a provider request, nor certifies a supplied result as physical fact.
 * Native must independently prove actual current enabled/event/claim state and
 * dispatch only in the invocation which positively acquired its local claim. */
export async function authorizeCustomerTransferRecoverySourceEffect(
  input: unknown,
  d: { env: Record<string, unknown>; runTransaction?: RunPageStudioTransaction }
) {
  const env = d.env,
    selectedRunner = d.runTransaction,
    run = selectedRunner ?? transactionWithoutRetry,
    config = recoverySourceConfiguration(env),
    wire = TransferRecoverySourceEffectRequestSchema.parse(input)
  const current = () => {
    if (
      d.env !== env ||
      d.runTransaction !== selectedRunner ||
      !reviewSame(recoverySourceConfiguration(env), config)
    )
      throw reviewDenied()
  }
  current()
  const digest = await collectionDigest(wire)
  current()
  const result = await run(async (db) => {
    current()
    const retained = await retainedRecoveryAdmission(db, wire.applied.body.admissionId)
    current()
    const value = TransferRecoverySourceInputSchema.parse({
      siteId: retained.request.siteId,
      requestId: wire.inspection.pg.requestId,
      expectedRevision: wire.inspection.pg.requestRevision,
      operator: { actorId: wire.inspection.operatorId, loginSessionHash: wire.inspection.loginSessionHash },
      body: { admissionId: wire.applied.body.admissionId, invocationId: wire.command.invocationId }
    })
    const check = async () => {
      const proof = await recoverySourcePhaseAuthority(db, value, env)
      current()
      if (
        !proof.saved ||
        !reviewSame(
          {
            purpose: 'recovery-enabled',
            pending: wire.pending,
            applied: wire.applied,
            recovery: wire.recovery,
            inspection: wire.inspection
          },
          proof.enabled
        ) ||
        !reviewSame(proof.saved, wire.request) ||
        !reviewSame(config, proof.config) ||
        !reviewSame(wire.descriptor, proof.config.descriptor)
      )
        throw reviewDenied()
      const request = proof.saved,
        requestDigest = await collectionDigest(request),
        descriptorDigest = await collectionDigest(config.descriptor),
        resource =
          wire.command.action === 'upload'
            ? {
                kind: 'dispatch-worker',
                accountId: request.successor.accountId,
                namespace: request.successor.namespace,
                scriptName: request.successor.scriptName
              }
            : {
                kind: 'source-transfer-schema',
                accountId: request.sourceTarget.accountId,
                databaseId: request.sourceTarget.databaseId,
                scopeKey: contentScopeKey(request.sourceScope),
                operationId: `transfer_${request.operationId}`
              },
        resourceDigest = await collectionDigest(resource)
      current()
      if (
        wire.requestDigest !== requestDigest ||
        wire.descriptorDigest !== descriptorDigest ||
        wire.command.resourceDigest !== resourceDigest
      )
        throw reviewDenied()
      if (wire.command.verb !== 'claim') {
        const identity = {
            phase: 'source-execution',
            action: wire.command.action,
            invocationId: wire.command.invocationId,
            requestDigest,
            resourceDigest
          },
          effectKey = await collectionDigest({
            operationId: request.operationId,
            phase: identity.phase,
            action: identity.action,
            resourceDigest
          }),
          proofDigest = await collectionDigest({ purpose: 'claim', head: proof.enabled.recovery, identity })
        current()
        if (
          !reviewSame(wire.command.claim, {
            effectKey,
            head: proof.enabled.recovery,
            identity,
            proofDigest,
            resultDigest: null,
            settlementDigest: null,
            state: 'dispatching'
          })
        )
          throw reviewDenied()
      }
      return proof
    }
    await check()
    const proof = await check()
    const acknowledgment = TransferRecoverySourceEffectAcknowledgmentSchema.parse({
      purpose: wire.purpose,
      envelopeDigest: digest
    })
    await finishRecoveryAdmissionAuthority(db, proof.proof)
    current()
    return acknowledgment
  })
  current()
  return result
}
