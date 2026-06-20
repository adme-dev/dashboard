import type { ToolContext } from '../toolContext'
import type { ActionExecutor, ExecutorResult } from './types'

/**
 * Executor for propose_proof_status — sets a proof's status via the existing PUT /proofs/:id/status
 * endpoint on a confirmed proposal, forwarding the caller's headers. PUT injected for unit-testing.
 */
export type Putter = (url: string, body: any, ctx: ToolContext) => Promise<any>
const defaultPut: Putter = (url, body, ctx) => $fetch(url, { method: 'PUT', body, headers: ctx.event.headers as any })

export function makeProofStatusExecutor(put: Putter = defaultPut): ActionExecutor {
  return {
    toolName: 'propose_proof_status',
    label: 'proof status',
    riskTier: 'confirm',
    requiredPermission: 'CREATIVE',
    async execute(p: any, ctx: ToolContext): Promise<ExecutorResult> {
      const r = await put(`/api/agency/proofs/${p.proofId}/status`, { status: p.status }, ctx)
      const id = r?.proof?.id ?? p.proofId
      return { resultRef: String(id), summary: `✅ Set “${p.proofName}” to ${String(p.status).replace(/_/g, ' ')}.` }
    },
  }
}

export const proofStatusExecutor: ActionExecutor = makeProofStatusExecutor()
