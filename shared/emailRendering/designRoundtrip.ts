import { z } from 'zod'
import {
  validateDesignAction,
  validateTemplateDesignReturnAction,
  EmailDesignActionError,
  type ProposeReturnAction,
  type ApplyReturnAction,
  type CancelReturnAction
} from './designActions'
import type { EmailDesignDocument } from './designContract'

// Immutable package path. Promotion must publish this exact package before the
// feature is activated; never point sessions at a moving editor alias.
export const FIGFLOW_EDM_EDITOR_URL = 'https://creative.xeroflow.io/figflow/0.11.2-edm1/'
export const FIGFLOW_EDM_ORIGIN = 'https://creative.xeroflow.io'
export const FIGFLOW_EDM_PROTOCOL = 'xeroflow-edm-v1'

const Id = z.string().uuid()
const Request = z.discriminatedUnion('command', [
  z.object({ command: z.literal('start'), operationId: Id, templateId: Id, clientId: Id.nullable() }).strict(),
  z.object({ command: z.literal('open'), operationId: Id, draftId: Id, expectedRevisionId: Id }).strict(),
  z.object({ command: z.literal('resume'), handoffId: Id }).strict(),
  z.object({ command: z.literal('lookup'), templateId: Id }).strict(),
  z.object({ command: z.literal('propose'), handoffId: Id, action: z.unknown() }).strict(),
  z.object({ command: z.literal('apply'), handoffId: Id, action: z.unknown() }).strict(),
  z.object({ command: z.literal('cancel'), handoffId: Id, action: z.unknown() }).strict()
])
export type RoundtripRequest = Extract<z.infer<typeof Request>, { command: 'start' | 'open' | 'resume' | 'lookup' }>
  | { command: 'propose', handoffId: string, action: ProposeReturnAction }
  | { command: 'apply', handoffId: string, action: ApplyReturnAction }
  | { command: 'cancel', handoffId: string, action: CancelReturnAction }

export function parseRoundtripRequest(input: unknown): RoundtripRequest {
  const request = Request.parse(input)
  if (request.command === 'propose' || request.command === 'apply' || request.command === 'cancel') {
    const action = request.command === 'propose'
      ? validateTemplateDesignReturnAction(request.action)
      : validateDesignAction(request.action)
    const expected = { propose: 'propose-return', apply: 'apply-return', cancel: 'cancel-return' }[request.command]
    if (action.action !== expected) throw new EmailDesignActionError('INVALID_ACTION')
    return { ...request, action } as RoundtripRequest
  }
  return request
}

export interface DesignHandoff {
  id: string
  draftId: string
  templateId: string
  baseRevisionId: string
  state: 'open' | 'proposed' | 'applied' | 'cancelled' | 'expired'
  expiresAt: string
  source: EmailDesignDocument
  proposal: EmailDesignDocument | null
  proposalRevisionId: string | null
  appliedRevisionId: string | null
  editorUrl: string
}
