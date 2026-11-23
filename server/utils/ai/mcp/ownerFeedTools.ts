import type { AiTool } from '../toolRegistry'
import { fail, type ToolContext } from '../toolContext'
import type { TrustedSupplementalExecutionServices } from '../godModeExecution'
import { toMcpToolManifest, type McpExecutionDescriptor, type McpProjectionContext } from './project'
import { departmentFeedOperationSchemas, ownerFeedChangeSchema } from '../marketing/departmentFeedSchemas'

const descriptions = {
  marketing_get_inventory_feed_health: 'List scoped inventory feeds and readiness for one active client.',
  marketing_preview_inventory_feed: 'Preview one existing client feed and its bounded inventory sample.',
  marketing_get_inventory_feed_change: 'Read your own owner feed proposal, exact revision, status and saved result.',
  marketing_propose_inventory_feed_change: 'Preview a change to an existing Google or Meta feed: activation, pause, inventory filters, mappings, store code or address. Returns a proposal ID and exact revision for owner confirmation.',
  marketing_propose_inventory_feed_regeneration: 'Preview regenerating the selected existing inventory feed as XML or CSV.',
  marketing_execute_inventory_feed_change: 'Apply your own unexpired inventory-feed preview using the exact client, proposal ID, revision and ack:true. Checks provider readback and records the owner action.'
} as const

const operations = Object.entries(descriptions).map(([operation, description]) => {
  const parameters = operation === 'marketing_propose_inventory_feed_change' ? ownerFeedChangeSchema : departmentFeedOperationSchemas[operation as keyof typeof descriptions]
  const name = operation.replace('marketing_', 'owner_')
  const mutates = operation.startsWith('marketing_propose') || operation.startsWith('marketing_execute')
  const run = async (args: unknown, ctx: ToolContext, services?: TrustedSupplementalExecutionServices) => {
    const { runOwnerFeedOperation } = await import('../marketing/departmentFeedOperations')
    return runOwnerFeedOperation(operation, args, ctx, services)
  }
  const tool: AiTool<unknown> = {
    name, description, parameters, mutates, returnsUntrusted: true,
    handler: mutates ? async () => fail('Owner execution coordinator required.', 'coordinator_required') : run
  }
  const execution: McpExecutionDescriptor = {
    name, canonicalName: name, kind: 'supplemental', tool,
    ...(mutates
      ? {
          executionClass: operation.startsWith('marketing_execute') ? 'external-provider' as const : 'internal-http' as const,
          godModeBypassedControls: ['permission'] as const, executeSupplemental: run
        }
      : {})
  }
  return { tool, execution }
})

export function projectOwnerFeedMcpSuite(context: McpProjectionContext) {
  return context.governanceBypass ? operations.map(({ tool }) => toMcpToolManifest(tool)) : []
}

export function resolveOwnerFeedMcpExecutions(context: McpProjectionContext) {
  return context.governanceBypass ? operations.map(({ execution }) => execution) : []
}
