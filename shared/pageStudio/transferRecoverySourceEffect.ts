import { z } from 'zod'
import {
  ManagedTransferExecutionPolicySchema,
  ManagedTransferExecutionRequestSchema
} from './managed-transfer-execution'
import { TransferRecoveryEnabledHeadSchema } from './transferRecoveryAdmission'
import { TransferRecoveryEnabledRequestSchema } from './transferRecoveryPhase'

const Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Action = z.enum(['upload', 'install'])
/** Explicit trusted configuration provenance. Compatibility additionally requires
 * the native compiled layout and immutable artifact checks before an effect. */
export const TransferRecoverySourceDescriptorSchema = z
  .object({
    formatVersion: z.literal(1),
    kind: z.literal('managed-transfer-recovery-source-v1'),
    layoutDigest: Digest,
    execution: ManagedTransferExecutionPolicySchema.omit({ formReceiptDigest: true })
      .extend({
        accountId: z.string().regex(/^[a-f0-9]{32}$/),
        namespace: z.literal('xeroflow-page-studio-dispatch-staging')
      })
      .strict()
  })
  .strict()
const Identity = z
  .object({
    phase: z.literal('source-execution'),
    action: Action,
    invocationId: z.uuid(),
    requestDigest: Digest,
    resourceDigest: Digest
  })
  .strict()
/** A supplied claim is a value to bind, never proof that the actual local CAS
 * acquired it. Retained dispatching state never permits another dispatch. */
export const TransferRecoverySourceDispatchingClaimSchema = z
  .object({
    effectKey: Digest,
    head: TransferRecoveryEnabledHeadSchema,
    identity: Identity,
    proofDigest: Digest,
    resultDigest: z.null(),
    settlementDigest: z.null(),
    state: z.literal('dispatching')
  })
  .strict()
const Command = Identity.omit({ requestDigest: true })
export const TransferRecoverySourceEffectRequestSchema = TransferRecoveryEnabledRequestSchema.omit({
  purpose: true
})
  .extend({
    purpose: z.literal('recovery-source-effect'),
    request: ManagedTransferExecutionRequestSchema,
    requestDigest: Digest,
    descriptor: TransferRecoverySourceDescriptorSchema,
    descriptorDigest: Digest,
    command: z.discriminatedUnion('verb', [
      Command.extend({ verb: z.literal('claim') }).strict(),
      Command.extend({
        verb: z.literal('dispatch'),
        claim: TransferRecoverySourceDispatchingClaimSchema
      }).strict(),
      Command.extend({
        verb: z.literal('settle'),
        claim: TransferRecoverySourceDispatchingClaimSchema,
        resultDigest: Digest,
        state: z.enum(['completed', 'not-dispatched'])
      }).strict()
    ])
  })
  .strict()
/** Only fresh PG authority. Neither acquisition nor physical completion. */
export const TransferRecoverySourceEffectAcknowledgmentSchema = z
  .object({
    purpose: z.literal('recovery-source-effect'),
    envelopeDigest: Digest
  })
  .strict()
export type TransferRecoverySourceEffectRequest = z.infer<typeof TransferRecoverySourceEffectRequestSchema>
