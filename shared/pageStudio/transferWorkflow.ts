import { z } from 'zod'
import { TransferControlsOperatorSchema } from './transferControls'

const Id = z.string().uuid()
const Hash = z.string().regex(/^[a-f0-9]{64}$/)
export const TransferRevisionSchema = z.number().int().positive().max(2147483647)
export const TransferWorkflowPhases = ['resources', 'source-execution', 'source-drafts', 'destination-catalogue',
  'destination-execution', 'copy-admission', 'copy-execution', 'forms-history', 'completion'] as const
export const TransferWorkflowPhaseSchema = z.enum(TransferWorkflowPhases)
export const TransferWorkflowActionSchema = z.enum(['start', 'resume', 'verify', 'prepare', 'complete'])
const revision = { expectedRevision: TransferRevisionSchema }
/** Browser contract: no authority, provider payload or private intent reference. */
export const TransferWorkflowBodySchema = z.discriminatedUnion('phase', [
  z.object({ ...revision, phase: z.enum(['resources', 'source-execution', 'destination-catalogue', 'destination-execution', 'copy-execution', 'forms-history']), action: z.enum(['start', 'resume', 'verify']) }).strict(),
  z.object({ ...revision, phase: z.literal('source-drafts'), action: z.enum(['start', 'resume']) }).strict(),
  z.object({ ...revision, phase: z.literal('copy-admission'), action: z.literal('prepare') }).strict(),
  z.object({ ...revision, phase: z.literal('completion'), action: z.literal('complete') }).strict()
])
const identity = { siteId: Id, requestId: Id, operator: TransferControlsOperatorSchema, expectedEnvironment: z.literal('production') }
export const TransferWorkflowRequestSchema = z.union([
  z.object({ ...identity, ...revision, action: z.literal('status') }).strict(),
  ...TransferWorkflowBodySchema.options.map(schema => schema.extend(identity).strict())
])
export const TransferPhaseViewSchema = z.object({ phase: TransferWorkflowPhaseSchema,
  state: z.enum(['unavailable', 'not-started', 'preparing', 'resume-required', 'disabled', 'prepared', 'resources-bound',
    'pending', 'ready', 'not-frozen', 'frozen', 'upload-uncertain', 'catalogue-verified', 'execution-verified', 'copy-admitted', 'verified', 'completed']),
  allowedActions: z.array(TransferWorkflowActionSchema).max(3)
}).strict()
export const TransferWorkflowViewSchema = z.object({ siteId: Id, requestId: Id, revision: TransferRevisionSchema,
  phases: z.array(TransferPhaseViewSchema).min(1).max(9)
}).strict()
export const TransferWorkflowResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), requestDigest: Hash, value: TransferWorkflowViewSchema }).strict(),
  z.object({ ok: z.literal(false), requestDigest: Hash, error: z.object({ statusCode: z.number().int().min(400).max(599), message: z.string().max(160) }).strict() }).strict()
])
export const TransferOwnerBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('request'), requestId: Id }).strict(),
  z.object({ action: z.enum(['approve', 'revoke']), requestId: Id, ...revision }).strict()
])
export const TransferOperatorBodySchema = z.object({ action: z.enum(['review', 'reserve']), ...revision }).strict()
export type TransferWorkflowRequest = z.infer<typeof TransferWorkflowRequestSchema>
export type TransferPhaseView = z.infer<typeof TransferPhaseViewSchema>
