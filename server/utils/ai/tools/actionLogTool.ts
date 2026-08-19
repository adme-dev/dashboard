import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import type { ActionLogArgs } from './actionLog'

const params = z.object({
  clientId: z.string().uuid().optional(),
  clientName: z.string().trim().min(2).max(120).optional(),
  actorId: z.string().uuid().optional(),
  actorEmail: z.string().email().optional(),
  toolName: z.string().trim().min(1).max(160).optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  outcome: z.enum(['succeeded', 'failed', 'ambiguous']).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
}).superRefine((value, issue) => {
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    issue.addIssue({ code: 'custom', message: 'startDate must be on or before endDate.' })
  }
})

export const actionLogTool: AiTool<ActionLogArgs> = {
  name: 'get_action_log',
  description: 'Query the immutable MCP God Mode action ledger as a standalone tool. Returns who invoked a non-read action, the exact tool, resolved client, redacted arguments, affected entity, outcome, and timestamp. Owners can filter across actors, clients, tools, outcomes, and time; other authorised users are restricted to their own actions.',
  parameters: params,
  requiredPermission: 'MANAGEMENT',
  returnsUntrusted: true,
  handler: async (args, ctx) => (await import('./actionLog')).getActionLog(args, ctx),
}
