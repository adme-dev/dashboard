import { z } from 'zod'
import { BuilderArtifactPinSchema, CmsNativeCommitSchema, contentScopeKey } from './cmsManaged'
import { parseBuilderActionRuntimeResultJson as parseBuilderJson } from './generated/builderGraphVerifier.mjs'
import { PageStudioContentScopeSchema as ContentScopeSchema } from './businessContent'
import { collectionCanonical as canonicalJson, collectionDigest } from './collectionApi'

export const BUILDER_ACTION_RESULT_MAX_BYTES = 150_000
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const encoder = new TextEncoder()
export const BuilderActionExecutionIdentitySchema = z.object({
  formatVersion: z.literal(1),
  scope: ContentScopeSchema,
  intentId: z.uuid(),
  invocationId: z.uuid(),
  claimId: z.uuid(),
  brokerId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/),
  identityDigest: digest,
  action: BuilderArtifactPinSchema.extend({ kind: z.literal('action') }).strict(),
  runtimeDigest: digest,
  inputDigest: digest,
  dataDigest: digest,
  contextDigest: digest
}).strict()
export const BuilderActionRuntimeResultSchema = z.object({
  status: z.enum(['ok', 'busy', 'cancelled', 'source_limit', 'input_limit', 'input_invalid', 'guest_error', 'output_limit', 'output_invalid', 'fuel_exhausted', 'engine_error']),
  json: z.string().max(65_536).optional(),
  fuelUsed: z.number().int().min(0).max(100_000_000).optional()
}).strict().superRefine((result, ctx) => {
  if ((result.status === 'ok') !== (result.json !== undefined)) {
    ctx.addIssue({ code: 'custom', message: 'Action result status mismatch' })
  }
  if (result.json !== undefined) {
    try {
      if (encoder.encode(result.json).byteLength > 65_536) {
        throw new Error('bytes')
      }
      parseBuilderJson(result.json)
    } catch { ctx.addIssue({ code: 'custom', message: 'Invalid bounded action result' }) }
  }
})
export const BuilderActionResultEnvelopeSchema = z.object({
  formatVersion: z.literal(1),
  execution: BuilderActionExecutionIdentitySchema,
  result: BuilderActionRuntimeResultSchema
}).strict().refine(value => encoder.encode(canonicalJson(value)).byteLength <= BUILDER_ACTION_RESULT_MAX_BYTES, 'Action result envelope byte limit')
export const BuilderActionResultPinSchema = z.object({
  key: z.string().regex(/^builder-action-results\/v1\/[a-f0-9]{64}\/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}\/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}\.json$/),
  sha256: digest,
  bytes: z.number().int().min(1).max(BUILDER_ACTION_RESULT_MAX_BYTES)
}).strict()
export type BuilderActionExecutionIdentity = z.infer<typeof BuilderActionExecutionIdentitySchema>
export type BuilderActionResultEnvelope = z.infer<typeof BuilderActionResultEnvelopeSchema>
export type BuilderActionResultPin = z.infer<typeof BuilderActionResultPinSchema>
/** Deterministic private result address; neither this identity nor its key is a grant. */
export async function builderActionResultKey(input: unknown) {
  const identity = BuilderActionExecutionIdentitySchema.parse(input)
  return `builder-action-results/v1/${await collectionDigest(JSON.parse(contentScopeKey(identity.scope)))}/${identity.invocationId}/${identity.claimId}.json`
}

const hash = digest
const { operationId: _op, preparedRequestDigest: _req, preparedDigest: _digest, ...contextShape } = CmsNativeCommitSchema.shape
export const ActionInvocationContextSchema = z.object({
  ...contextShape,
  action: BuilderArtifactPinSchema.extend({ kind: z.literal('action') }).strict(),
  runtimeDigest: hash,
  inputDigest: hash,
  dataDigest: hash
}).strict().superRefine((value, ctx) => {
  const { action: _action, runtimeDigest: _runtime, inputDigest: _input, dataDigest: _data, ...base } = value
  const check = CmsNativeCommitSchema.safeParse({ ...base, operationId: 'validation', preparedRequestDigest: 'a'.repeat(64), preparedDigest: 'a'.repeat(64) })
  if (!check.success) ctx.addIssue({ code: 'custom', message: 'Invalid invocation bases' })
})
export type ActionInvocationContext = z.infer<typeof ActionInvocationContextSchema>
export const ActionInvocationRequestSchema = z.object({
  intentId: z.uuid(), context: ActionInvocationContextSchema
}).strict()
