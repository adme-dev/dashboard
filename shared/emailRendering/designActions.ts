import { z } from 'zod'
import { RenderBoundaryError, snapshotRenderInput } from './bounds'
import {
  DESIGN_LIMITS,
  validateEmailDesign,
  type EmailDesignDocument
} from './designContract'

export const DESIGN_ACTION_NAMES = [
  'save-draft',
  'create-template',
  'update-template',
  'create-module',
  'update-module',
  'propose-return',
  'apply-return',
  'cancel-return',
  'save-proposal-as-new-draft'
] as const
export type DesignActionName = (typeof DESIGN_ACTION_NAMES)[number]

export const DESIGN_PROPOSAL_STATES = [
  'proposed',
  'applied',
  'cancelled',
  'expired'
] as const
export type DesignProposalState = (typeof DESIGN_PROPOSAL_STATES)[number]
export const DESIGN_PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000
export const DESIGN_PROPOSAL_RECOVERY_MS = 30 * 24 * 60 * 60 * 1000
export const DESIGN_ACTION_LIMITS = {
  envelopeBytes: DESIGN_LIMITS.documentBytes + 64 * 1024,
  name: 200,
  category: 80,
  overridePaths: 3000
} as const

export const DESIGN_ACTION_ERROR_CODES = [
  'INVALID_ACTION',
  'ACTION_LIMIT_EXCEEDED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'SCOPE_MISMATCH',
  'KIND_MISMATCH',
  'REVISION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'OPERATION_IN_PROGRESS',
  'PROPOSAL_STATE_CONFLICT',
  'PROPOSAL_EXPIRED',
  'PROPOSAL_RETENTION_EXPIRED',
  'CAMPAIGN_FROZEN',
  'PREFLIGHT_FAILED',
  'ASSET_NOT_READY'
] as const
export type DesignActionErrorCode = (typeof DESIGN_ACTION_ERROR_CODES)[number]

export class EmailDesignActionError extends Error {
  constructor(public readonly code: DesignActionErrorCode) {
    super(code)
  }
}

const Uuid = z.string().uuid()
const Scope = z.object({ clientId: z.string().uuid().nullable() }).strict()
const Timestamp = z.iso.datetime().max(64)
const Name = z
  .string()
  .min(1)
  .max(DESIGN_ACTION_LIMITS.name)
  .refine(value => value.trim().length > 0)
const Category = z
  .string()
  .min(1)
  .max(DESIGN_ACTION_LIMITS.category)
  .refine(value => value.trim().length > 0)
const FieldPath = z.string().min(1).max(512)
const ActionName = z.enum(DESIGN_ACTION_NAMES)
const ProposalState = z.enum(DESIGN_PROPOSAL_STATES)
const SourceDraft = z.object({ draftId: Uuid, revisionId: Uuid }).strict()
const OverridePaths = z
  .array(FieldPath)
  .max(DESIGN_ACTION_LIMITS.overridePaths)
const CanonicalDesign = z.custom<EmailDesignDocument>((value) => {
  try {
    validateEmailDesign(value)
    return true
  } catch {
    return false
  }
})
const actionIdentity = {
  version: z.literal(1),
  operationId: Uuid,
  scope: Scope
}
const resultIdentity = {
  version: z.literal(1),
  ok: z.literal(true),
  operationId: Uuid
}
const librarySource = {
  design: CanonicalDesign,
  sourceDraft: SourceDraft.optional(),
  includedOverridePaths: OverridePaths
}

const SaveDraftActionSchema = z
  .object({
    ...actionIdentity,
    action: z.literal('save-draft'),
    draftId: Uuid,
    expectedRevisionId: Uuid.nullable(),
    design: CanonicalDesign
  })
  .strict()
const CreateTemplateActionSchema = z
  .object({
    ...actionIdentity,
    action: z.literal('create-template'),
    name: Name,
    ...librarySource
  })
  .strict()
const UpdateTemplateActionSchema = z
  .object({
    ...actionIdentity,
    action: z.literal('update-template'),
    templateId: Uuid,
    expectedRevisionId: Uuid,
    ...librarySource
  })
  .strict()
const CreateModuleActionSchema = z
  .object({
    ...actionIdentity,
    action: z.literal('create-module'),
    name: Name,
    category: Category,
    ...librarySource
  })
  .strict()
const UpdateModuleActionSchema = z
  .object({
    ...actionIdentity,
    action: z.literal('update-module'),
    moduleId: Uuid,
    expectedRevisionId: Uuid,
    name: Name.optional(),
    category: Category.optional(),
    ...librarySource
  })
  .strict()
const ProposeReturnActionSchema = z
  .object({
    ...actionIdentity,
    action: z.literal('propose-return'),
    draftId: Uuid,
    baseRevisionId: Uuid,
    design: CanonicalDesign,
    sourceDraft: SourceDraft.optional()
  })
  .strict()
const ApplyReturnActionSchema = z
  .object({
    ...actionIdentity,
    action: z.literal('apply-return'),
    proposalId: Uuid,
    expectedProposalRevisionId: Uuid,
    expectedDraftRevisionId: Uuid
  })
  .strict()
const CancelReturnActionSchema = z
  .object({
    ...actionIdentity,
    action: z.literal('cancel-return'),
    proposalId: Uuid,
    expectedProposalRevisionId: Uuid
  })
  .strict()
const SaveProposalAsNewDraftActionSchema = z
  .object({
    ...actionIdentity,
    action: z.literal('save-proposal-as-new-draft'),
    proposalId: Uuid,
    expectedProposalRevisionId: Uuid,
    name: Name
  })
  .strict()

const ActionSchema = z.discriminatedUnion('action', [
  SaveDraftActionSchema,
  CreateTemplateActionSchema,
  UpdateTemplateActionSchema,
  CreateModuleActionSchema,
  UpdateModuleActionSchema,
  ProposeReturnActionSchema,
  ApplyReturnActionSchema,
  CancelReturnActionSchema,
  SaveProposalAsNewDraftActionSchema
])

export type SaveDraftAction = z.infer<typeof SaveDraftActionSchema>
export type CreateTemplateAction = z.infer<typeof CreateTemplateActionSchema>
export type UpdateTemplateAction = z.infer<typeof UpdateTemplateActionSchema>
export type CreateModuleAction = z.infer<typeof CreateModuleActionSchema>
export type UpdateModuleAction = z.infer<typeof UpdateModuleActionSchema>
export type ProposeReturnAction = z.infer<typeof ProposeReturnActionSchema>
export type ApplyReturnAction = z.infer<typeof ApplyReturnActionSchema>
export type CancelReturnAction = z.infer<typeof CancelReturnActionSchema>
export type SaveProposalAsNewDraftAction = z.infer<
  typeof SaveProposalAsNewDraftActionSchema
>
export type DesignAction = z.infer<typeof ActionSchema>

const proposalFields = {
  version: z.literal(1),
  proposalId: Uuid,
  revisionId: Uuid,
  scope: Scope,
  draftId: Uuid,
  baseRevisionId: Uuid,
  sourceDraft: SourceDraft.optional(),
  design: CanonicalDesign,
  state: ProposalState,
  createdAt: Timestamp,
  expiresAt: Timestamp,
  retainedUntil: Timestamp,
  stateChangedAt: Timestamp
}
const ProposalSchema = z.object(proposalFields).strict()
const StoredProposalSchema = z
  .object({ ...proposalFields, actorId: Uuid })
  .strict()
export type DesignProposal = z.infer<typeof ProposalSchema>
export type StoredDesignProposal = z.infer<typeof StoredProposalSchema>

const SaveDraftResultSchema = z
  .object({
    ...resultIdentity,
    action: z.literal('save-draft'),
    draftId: Uuid,
    revisionId: Uuid,
    savedAt: Timestamp,
    published: z.literal(false)
  })
  .strict()
const CreateTemplateResultSchema = z
  .object({
    ...resultIdentity,
    action: z.literal('create-template'),
    templateId: Uuid,
    revisionId: Uuid,
    publishedAt: Timestamp
  })
  .strict()
const UpdateTemplateResultSchema = z
  .object({
    ...resultIdentity,
    action: z.literal('update-template'),
    templateId: Uuid,
    revisionId: Uuid,
    publishedAt: Timestamp
  })
  .strict()
const CreateModuleResultSchema = z
  .object({
    ...resultIdentity,
    action: z.literal('create-module'),
    moduleId: Uuid,
    revisionId: Uuid,
    publishedAt: Timestamp
  })
  .strict()
const UpdateModuleResultSchema = z
  .object({
    ...resultIdentity,
    action: z.literal('update-module'),
    moduleId: Uuid,
    revisionId: Uuid,
    publishedAt: Timestamp
  })
  .strict()
const ProposeReturnResultSchema = z
  .object({
    ...resultIdentity,
    action: z.literal('propose-return'),
    proposal: ProposalSchema
  })
  .strict()
const ApplyReturnResultSchema = z
  .object({
    ...resultIdentity,
    action: z.literal('apply-return'),
    proposalId: Uuid,
    proposalRevisionId: Uuid,
    draftId: Uuid,
    baseRevisionId: Uuid,
    revisionId: Uuid,
    appliedAt: Timestamp
  })
  .strict()
const CancelReturnResultSchema = z
  .object({
    ...resultIdentity,
    action: z.literal('cancel-return'),
    proposalId: Uuid,
    proposalRevisionId: Uuid,
    state: z.literal('cancelled'),
    cancelledAt: Timestamp
  })
  .strict()
const SaveProposalAsNewDraftResultSchema = z
  .object({
    ...resultIdentity,
    action: z.literal('save-proposal-as-new-draft'),
    proposalId: Uuid,
    proposalRevisionId: Uuid,
    draftId: Uuid,
    revisionId: Uuid,
    createdAt: Timestamp
  })
  .strict()

const ActionResultSchema = z.discriminatedUnion('action', [
  SaveDraftResultSchema,
  CreateTemplateResultSchema,
  UpdateTemplateResultSchema,
  CreateModuleResultSchema,
  UpdateModuleResultSchema,
  ProposeReturnResultSchema,
  ApplyReturnResultSchema,
  CancelReturnResultSchema,
  SaveProposalAsNewDraftResultSchema
])
export type SaveDraftResult = z.infer<typeof SaveDraftResultSchema>
export type CreateTemplateResult = z.infer<typeof CreateTemplateResultSchema>
export type UpdateTemplateResult = z.infer<typeof UpdateTemplateResultSchema>
export type CreateModuleResult = z.infer<typeof CreateModuleResultSchema>
export type UpdateModuleResult = z.infer<typeof UpdateModuleResultSchema>
export type ProposeReturnResult = z.infer<typeof ProposeReturnResultSchema>
export type ApplyReturnResult = z.infer<typeof ApplyReturnResultSchema>
export type CancelReturnResult = z.infer<typeof CancelReturnResultSchema>
export type SaveProposalAsNewDraftResult = z.infer<
  typeof SaveProposalAsNewDraftResultSchema
>
export type DesignActionResult = z.infer<typeof ActionResultSchema>

const ActionFailureSchema = z
  .object({
    version: z.literal(1),
    ok: z.literal(false),
    operationId: Uuid.nullable(),
    action: ActionName.nullable(),
    error: z
      .object({
        code: z.enum(DESIGN_ACTION_ERROR_CODES),
        retryable: z.boolean(),
        currentRevisionId: Uuid.optional(),
        currentProposalRevisionId: Uuid.optional(),
        proposalState: ProposalState.optional()
      })
      .strict()
  })
  .strict()
export type DesignActionFailure = z.infer<typeof ActionFailureSchema>

function invalid(): never {
  throw new EmailDesignActionError('INVALID_ACTION')
}
function boundedSnapshot(input: unknown): unknown {
  try {
    return snapshotRenderInput(input, DESIGN_ACTION_LIMITS.envelopeBytes)
  } catch (error) {
    if (error instanceof RenderBoundaryError && error.code === 'LIMIT_EXCEEDED')
      throw new EmailDesignActionError('ACTION_LIMIT_EXCEEDED')
    throw new EmailDesignActionError('INVALID_ACTION')
  }
}
function parseBounded<T>(input: unknown, parse: (snapshot: unknown) => T): T {
  const snapshot = boundedSnapshot(input)
  try {
    return parse(snapshot)
  } catch (error) {
    if (error instanceof EmailDesignActionError) throw error
    invalid()
  }
}
function validateDesignScope(
  scope: { clientId: string | null },
  design: EmailDesignDocument
): void {
  if (scope.clientId !== design.scope.clientId) invalid()
}
function validateProposalSemantics(proposal: DesignProposal): void {
  if (proposal.design.kind !== 'campaign-draft') invalid()
  validateDesignScope(proposal.scope, proposal.design)
  const created = Date.parse(proposal.createdAt)
  const expires = Date.parse(proposal.expiresAt)
  const retained = Date.parse(proposal.retainedUntil)
  if (
    expires - created !== DESIGN_PROPOSAL_TTL_MS
    || retained - expires !== DESIGN_PROPOSAL_RECOVERY_MS
  )
    invalid()
}

/** Browser input contains target scope only. Actor identity and capabilities are
 * resolved by the server and must never be added to this envelope. */
export function validateDesignAction(input: unknown): DesignAction {
  return parseBounded(input, (snapshot) => {
    const action = ActionSchema.parse(snapshot)
    if ('design' in action) {
      validateDesignScope(action.scope, action.design)
      if (
        action.action === 'create-template'
        || action.action === 'update-template'
      ) {
        if (action.design.kind !== 'template') invalid()
      }
      if (
        action.action === 'create-module'
        || action.action === 'update-module'
      ) {
        if (action.design.kind !== 'module') invalid()
      }
      if (
        action.action === 'propose-return'
        && action.design.kind !== 'campaign-draft'
      )
        invalid()
    }
    if (
      'includedOverridePaths' in action
      && new Set(action.includedOverridePaths).size
      !== action.includedOverridePaths.length
    )
      invalid()
    return action
  })
}

/** Template handoffs use the same proposal envelope with a template baseline.
 * Keep campaign proposal admission unchanged at the existing public boundary. */
export function validateTemplateDesignReturnAction(input: unknown): ProposeReturnAction {
  return parseBounded(input, (snapshot) => {
    const action = ProposeReturnActionSchema.parse(snapshot)
    validateDesignScope(action.scope, action.design)
    if (action.design.kind !== 'template' || action.sourceDraft) invalid()
    return action
  })
}

/** Parse a server success receipt. An idempotent replay returns the original
 * receipt, including its original IDs and timestamps. */
export function validateDesignActionResult(input: unknown): DesignActionResult {
  return parseBounded(input, (snapshot) => {
    const result = ActionResultSchema.parse(snapshot)
    if (result.action === 'propose-return')
      validateProposalSemantics(result.proposal)
    return result
  })
}

export function validateDesignActionFailure(
  input: unknown
): DesignActionFailure {
  return parseBounded(input, snapshot => ActionFailureSchema.parse(snapshot))
}

/** Browser-safe proposal view; actor binding exists only in the stored record. */
export function validateDesignProposal(input: unknown): DesignProposal {
  return parseBounded(input, (snapshot) => {
    const proposal = ProposalSchema.parse(snapshot)
    validateProposalSemantics(proposal)
    return proposal
  })
}

/** Server-owned durable record. Never accept this as browser action input. */
export function validateStoredDesignProposal(
  input: unknown
): StoredDesignProposal {
  return parseBounded(input, (snapshot) => {
    const proposal = StoredProposalSchema.parse(snapshot)
    validateProposalSemantics(proposal)
    return proposal
  })
}

export function createDesignProposalTimes(
  now: Date
): Pick<
  DesignProposal,
  'createdAt' | 'expiresAt' | 'retainedUntil' | 'stateChangedAt'
> {
  const created = now.getTime()
  if (!Number.isFinite(created)) invalid()
  return {
    createdAt: now.toISOString(),
    expiresAt: new Date(created + DESIGN_PROPOSAL_TTL_MS).toISOString(),
    retainedUntil: new Date(
      created + DESIGN_PROPOSAL_TTL_MS + DESIGN_PROPOSAL_RECOVERY_MS
    ).toISOString(),
    stateChangedAt: now.toISOString()
  }
}

/** A read-time view only. The service must persist expiry with proposal CAS. */
export function designProposalStateAt(
  proposal: Pick<DesignProposal, 'state' | 'expiresAt'>,
  now: Date
): DesignProposalState {
  const time = now.getTime()
  if (!Number.isFinite(time)) invalid()
  if (proposal.state === 'proposed' && time >= Date.parse(proposal.expiresAt))
    return 'expired'
  return proposal.state
}

export function assertDesignProposalAction(
  proposal: Pick<DesignProposal, 'state' | 'expiresAt' | 'retainedUntil'>,
  action: 'apply-return' | 'cancel-return' | 'save-proposal-as-new-draft',
  now: Date
): void {
  const time = now.getTime()
  if (!Number.isFinite(time)) invalid()
  const state = designProposalStateAt(proposal, now)
  if (action === 'save-proposal-as-new-draft') {
    if (state === 'applied' || state === 'cancelled')
      throw new EmailDesignActionError('PROPOSAL_STATE_CONFLICT')
    if (time > Date.parse(proposal.retainedUntil))
      throw new EmailDesignActionError('PROPOSAL_RETENTION_EXPIRED')
    return
  }
  if (state === 'expired') throw new EmailDesignActionError('PROPOSAL_EXPIRED')
  if (state !== 'proposed')
    throw new EmailDesignActionError('PROPOSAL_STATE_CONFLICT')
}
