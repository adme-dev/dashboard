import { z } from 'zod'
import {
  validateDesignAction,
  validateHandoffDesignReturnAction,
  EmailDesignActionError,
  type ProposeReturnAction,
  type ApplyReturnAction,
  type SaveProposalAsNewDraftAction,
  type CancelReturnAction
} from './designActions'
import type { EmailDesignDocument } from './designContract'

// Immutable package path. Promotion must publish this exact package before the
// feature is activated; never point sessions at a moving editor alias.
export const FIGFLOW_EDM_EDITOR_URL = 'https://creative.xeroflow.io/figflow/0.11.2-edm1/'
export const FIGFLOW_EDM_ORIGIN = 'https://creative.xeroflow.io'
export const FIGFLOW_EDM_PROTOCOL = 'xeroflow-edm-v1'

const Id = z.string().uuid()
export const DesignOwner = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('template'), id: Id }).strict(),
  z.object({ kind: z.literal('campaign'), id: Id }).strict()
])
export type DesignOwner = z.infer<typeof DesignOwner>
const Target = { templateId: Id.optional(), owner: DesignOwner.optional() }
const exactTarget = (value: { templateId?: string, owner?: DesignOwner }) => !!value.templateId !== !!value.owner
export function designTargetOwner(value: { templateId?: string, owner?: DesignOwner }): DesignOwner {
  if (!exactTarget(value)) throw new EmailDesignActionError('INVALID_ACTION')
  return value.owner ?? { kind: 'template', id: value.templateId! }
}
const Request = z.discriminatedUnion('command', [
  z.object({ command: z.literal('start'), operationId: Id, ...Target, clientId: Id.nullable() }).strict().refine(exactTarget),
  z.object({ command: z.literal('open'), operationId: Id, draftId: Id, expectedRevisionId: Id }).strict(),
  z.object({ command: z.literal('resume'), handoffId: Id }).strict(),
  z.object({ command: z.literal('lookup'), ...Target }).strict().refine(exactTarget),
  z.object({ command: z.literal('propose'), handoffId: Id, action: z.unknown() }).strict(),
  z.object({ command: z.literal('apply'), handoffId: Id, action: z.unknown() }).strict(),
  z.object({ command: z.literal('cancel'), handoffId: Id, action: z.unknown() }).strict(),
  z.object({ command: z.literal('save-proposal-as-new-draft'), handoffId: Id, action: z.unknown() }).strict()
])
export type RoundtripRequest = Extract<z.infer<typeof Request>, { command: 'start' | 'open' | 'resume' | 'lookup' }>
  | { command: 'propose', handoffId: string, action: ProposeReturnAction }
  | { command: 'apply', handoffId: string, action: ApplyReturnAction }
  | { command: 'cancel', handoffId: string, action: CancelReturnAction }
  | { command: 'save-proposal-as-new-draft', handoffId: string, action: SaveProposalAsNewDraftAction }

export function parseRoundtripRequest(input: unknown): RoundtripRequest {
  const request = Request.parse(input)
  if (request.command === 'propose' || request.command === 'apply' || request.command === 'cancel' || request.command === 'save-proposal-as-new-draft') {
    const action = request.command === 'propose'
      ? validateHandoffDesignReturnAction(request.action)
      : validateDesignAction(request.action)
    const expected = { 'propose': 'propose-return', 'apply': 'apply-return', 'cancel': 'cancel-return', 'save-proposal-as-new-draft': 'save-proposal-as-new-draft' }[request.command]
    if (action.action !== expected) throw new EmailDesignActionError('INVALID_ACTION')
    return { ...request, action } as RoundtripRequest
  }
  return request
}

export type DesignHandoff = {
  id: string
  draftId: string
  baseRevisionId: string
  state: 'open' | 'proposed' | 'applied' | 'cancelled' | 'expired'
  expiresAt: string
  source: EmailDesignDocument
  proposal: EmailDesignDocument | null
  proposalRevisionId: string | null
  appliedRevisionId: string | null
  editorUrl: string
} & ({ owner: { kind: 'campaign', id: string }, templateId?: never }
  | { owner?: { kind: 'template', id: string }, templateId: string })

export function designReadOwner(value: { owner?: DesignOwner, templateId?: string }): DesignOwner {
  if (value.owner) return value.owner
  if (value.templateId) return { kind: 'template', id: value.templateId }
  throw new Error('Missing persisted design owner')
}
