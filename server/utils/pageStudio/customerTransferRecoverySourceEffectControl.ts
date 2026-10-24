import { captureRecoveryRpc } from './recoveryPrivateRpc'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import {
  TransferRecoverySourceEffectControlInputSchema,
  TransferRecoverySourceEffectClaimRequestSchema,
  recoverySourceEffectResourceDigest,
  verifyRecoverySourceEffectResult
} from '~~/shared/pageStudio/transferRecoverySourceEffectControl'
import { TransferRecoverySourceInputSchema } from '~~/shared/pageStudio/transferRecoveryPhase'
import {
  recoverySourceConfiguration,
  recoverySourcePhaseAuthority
} from './customerTransferRecoveryPhaseAuthority'
import { finishRecoveryAdmissionAuthority } from './customerTransferRecoveryAdmissionAuthority'
import { reviewDenied, reviewSame } from './customerTransferRecoveryCurrentAuthority'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

/** Private orchestration only. The fixed native adapter owns actual local claim
 * CAS, provider/tenant checks and positive readback. This function never supplies
 * a claim or retries an uncertain effect, and makes no remote call under PG locks. */
export async function executeCustomerTransferRecoverySourceEffect(
  input: unknown,
  d: { env: Record<string, unknown>; runTransaction?: RunPageStudioTransaction }
) {
  const value = TransferRecoverySourceEffectControlInputSchema.parse(input),
    env = d.env,
    selectedRunner = d.runTransaction,
    run = selectedRunner ?? transactionWithoutRetry,
    config = recoverySourceConfiguration(env),
    service = env.PAGE_STUDIO_PROVISIONER as Record<string, unknown> | undefined,
    capability = captureRecoveryRpc(service, 'executeManagedTransferRecoverySourceEffect')
  if (!capability) throw reviewDenied()
  const current = () => {
    capability.assertCurrent()
    if (
      d.env !== env ||
      d.runTransaction !== selectedRunner ||
      env.PAGE_STUDIO_PROVISIONER !== service ||
      !reviewSame(recoverySourceConfiguration(env), config)
    )
      throw reviewDenied()
  }
  const source = TransferRecoverySourceInputSchema.parse({
    ...value,
    body: { admissionId: value.body.admissionId, invocationId: value.body.invocationId }
  })
  const read = async (db: PageStudioQueryClient) => {
    current()
    const proof = await recoverySourcePhaseAuthority(db, source, env)
    current()
    if (!proof.saved || !reviewSame(proof.config, config)) throw reviewDenied()
    const wire = TransferRecoverySourceEffectClaimRequestSchema.parse({
      ...proof.enabled,
      purpose: 'recovery-source-effect',
      request: proof.saved,
      requestDigest: await collectionDigest(proof.saved),
      descriptor: config.descriptor,
      descriptorDigest: await collectionDigest(config.descriptor),
      command: {
        phase: 'source-execution',
        verb: 'claim',
        action: value.body.action,
        invocationId: value.body.invocationId,
        resourceDigest: await recoverySourceEffectResourceDigest(proof.saved, value.body.action)
      }
    })
    await finishRecoveryAdmissionAuthority(db, proof.proof)
    current()
    return wire
  }
  const before = await run(read)
  current()
  // One explicit invocation. Native permits only a fresh acquired claim to write;
  // retained uncertainty is inspected read-only for this exact original invocation.
  const raw = structuredClone(await capability.call(structuredClone(before)))
  current()
  const receipt = await verifyRecoverySourceEffectResult(before, raw)
  current()
  await run(async (db) => {
    const after = await read(db)
    if (!reviewSame(before, after)) throw reviewDenied()
    current()
  })
  current()
  return receipt
}
