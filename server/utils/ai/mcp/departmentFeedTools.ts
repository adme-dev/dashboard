import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { fail, type ToolContext, type ToolResult } from '../toolContext'
import {
  departmentFeedChangeSchema,
  departmentFeedClientSchema,
  departmentFeedExecuteSchema,
  departmentFeedProposalSchema,
  departmentFeedRegenerationSchema,
  departmentFeedReviewSchema,
  departmentFeedSetupSchema
} from '../marketing/departmentFeedSchemas'

const definitions = [
  [
    'marketing_get_inventory_feed_health',
    departmentFeedClientSchema,
    false,
    'Read scoped inventory feeds and bounded readiness counts. No refresh or catalogue delivery claim.'
  ],
  [
    'marketing_preview_inventory_feed',
    departmentFeedClientSchema.extend({
      feedId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
      limit: z.number().int().min(1).max(100).default(20)
    }),
    false,
    'Preview an existing client feed with bounded counts and credential-free vehicle fields. No changes.'
  ],
  [
    'marketing_get_inventory_feed_change',
    departmentFeedProposalSchema,
    false,
    'Read an exact department feed proposal, independent review and durable outcome as its proposer or an eligible peer reviewer. Unknown outcomes require reconciliation, never replay.'
  ],
  [
    'marketing_propose_inventory_feed_setup',
    departmentFeedSetupSchema,
    true,
    'Prepare a new Google or Facebook inventory feed using the existing client dealer link. Returns an exact revision and readiness preview; no provider write until independent approval and explicit acknowledgement. Supplier connections, credentials, catalogue attachment and arbitrary source URLs are not supported here.'
  ],
  [
    'marketing_propose_inventory_feed_change',
    departmentFeedChangeSchema,
    true,
    'Prepare name, active-state or inventory filter changes to one scoped feed. Exact prior configuration is bound to the proposal; source and seller changes are not supported. Independent approval is required before execution.'
  ],
  [
    'marketing_propose_inventory_feed_regeneration',
    departmentFeedRegenerationSchema,
    true,
    'Prepare regeneration of one exact scoped native feed as XML or CSV. Returns a revision-bound readiness preview; the native provider is called only after independent approval and explicit execution.'
  ],
  [
    'marketing_review_inventory_feed_change',
    departmentFeedReviewSchema,
    true,
    'Independently approve or reject an exact feed setup, change or regeneration revision. Self review is forbidden; proposer authority and active-client scope are revalidated. Approval does not call the provider.'
  ],
  [
    'marketing_execute_inventory_feed_change',
    departmentFeedExecuteSchema,
    true,
    'Execute this proposer’s exact independently approved feed setup, change or regeneration after acknowledgement. Revalidates proposer, reviewer, client, mapping and configuration; unknown outcomes stay held for reconciliation.'
  ]
] as const

export const departmentFeedTools: AiTool<unknown>[] = definitions.map(
  ([name, parameters, mutates, description]) => ({
    name,
    parameters,
    mutates,
    description,
    requiredPermission: 'MARKETING_MANAGEMENT',
    returnsUntrusted: true,
    handler: async (args, ctx) =>
      mutates
        ? fail(
            'Use the department feed execution boundary.',
            'coordinator_required'
          )
        : executeDepartmentFeedTool(name, args, ctx)
  })
)

export async function executeDepartmentFeedTool(
  name: string,
  args: unknown,
  ctx: ToolContext,
  idempotencyKey?: string,
  sessionDigest?: string
): Promise<ToolResult> {
  const tool = departmentFeedTools.find(t => t.name === name)
  if (!tool) return fail('Unknown department feed operation.', 'not_found')
  const parsed = tool.parameters.safeParse(args)
  if (!parsed.success)
    return fail('Invalid department feed arguments.', 'bad_args')
  if (
    tool.mutates
    && (!/^mcp:[0-9a-f]{64}$/.test(idempotencyKey ?? '')
      || !/^[0-9a-f]{64}$/.test(sessionDigest ?? ''))
  ) {
    return fail(
      'Verified logical request identity required.',
      'coordinator_required'
    )
  }
  const { runDepartmentFeedOperation }
    = await import('../marketing/departmentFeedOperations')
  return runDepartmentFeedOperation(
    name,
    parsed.data,
    ctx,
    idempotencyKey,
    sessionDigest
  )
}
