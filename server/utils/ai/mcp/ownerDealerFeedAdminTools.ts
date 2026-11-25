import type { AiTool } from '../toolRegistry'
import { fail, type ToolContext } from '../toolContext'
import type { TrustedSupplementalExecutionServices } from '../godModeExecution'
import { toMcpToolManifest, type McpExecutionDescriptor, type McpProjectionContext } from './project'
import {
  ownerDealerFeedAdminSchemas,
  type OwnerDealerFeedAdminToolName
} from '../marketing/ownerDealerFeedAdmin'

interface ToolSpec {
  name: OwnerDealerFeedAdminToolName
  description: string
  mutates: boolean
  executionClass?: 'internal-http' | 'external-provider'
}

const specs: readonly ToolSpec[] = [
  {
    name: 'owner_list_dealer_feed_links',
    description: 'List active or inactive dealer feed links (client_feed_links) with externalOrgId, sellerRefs and defaultFeedIds. Owner God-mode read.',
    mutates: false
  },
  {
    name: 'owner_upsert_dealer_feed_link',
    description: 'Create or update a client dealer feed link (externalOrgId, sellerRefs, defaultFeedIds, status). Resolves externalOrgId via Social Dashboard if omitted on a new link; preserves existing externalOrgId and defaultFeedIds when omitted on updates. Requires ack:true.',
    mutates: true,
    executionClass: 'external-provider'
  },
  {
    name: 'owner_deactivate_dealer_feed_link',
    description: 'Deactivate an active client dealer feed link (sets status to inactive without deleting provider feeds). Requires ack:true.',
    mutates: true,
    executionClass: 'internal-http'
  },
  {
    name: 'owner_inspect_org_feeds',
    description: 'Inspect raw Social Dashboard feeds in a client or explicit organization, including paused, unbound or unscoped feeds, with ownershipDiagnostics, redacted source/settings summaries and optional before/after preview counts.',
    mutates: false
  },
  {
    name: 'owner_discover_inventory_sellers',
    description: 'Search Social Dashboard native inventory by makes, sellerIds or keyword to discover verified seller_id values alongside dealership street addresses, makes and models.',
    mutates: false
  },
  {
    name: 'owner_repair_feed_seller_scope',
    description: 'Stamp exact filters.sellerIds (validated against the client dealer link sellerRefs) onto an existing unscoped Social Dashboard feed after verifying identical preview counts, optionally binding the feed in defaultFeedIds and verifying read-back. Requires ack:true.',
    mutates: true,
    executionClass: 'external-provider'
  },
  {
    name: 'owner_create_inventory_feed',
    description: 'Create a new Google or Meta inventory feed for a linked client (native inventory or cloned from an existing client-bound sourceFeedId without exposing credentials), auto-binding defaultFeedIds. Supports dryRun:true preview; live creation requires ack:true.',
    mutates: true,
    executionClass: 'external-provider'
  }
] as const

const operations = specs.map((spec) => {
  const parameters = ownerDealerFeedAdminSchemas[spec.name]
  const run = async (args: unknown, ctx: ToolContext, services?: TrustedSupplementalExecutionServices) => {
    const { runOwnerDealerFeedAdminOperation } = await import('../marketing/ownerDealerFeedAdmin')
    return runOwnerDealerFeedAdminOperation(spec.name, args, ctx, services)
  }
  const tool: AiTool<unknown> = {
    name: spec.name,
    description: spec.description,
    parameters,
    mutates: spec.mutates,
    returnsUntrusted: true,
    handler: spec.mutates
      ? async () => fail('Owner execution coordinator required.', 'coordinator_required')
      : run
  }
  const execution: McpExecutionDescriptor = {
    name: spec.name,
    canonicalName: spec.name,
    kind: 'supplemental',
    tool,
    ...(spec.mutates
      ? {
          executionClass: spec.executionClass ?? 'external-provider',
          godModeBypassedControls: ['permission'] as const,
          executeSupplemental: run
        }
      : {})
  }
  return { tool, execution }
})

export function projectOwnerDealerFeedAdminMcpSuite(context: McpProjectionContext) {
  return context.governanceBypass ? operations.map(({ tool }) => toMcpToolManifest(tool)) : []
}

export function resolveOwnerDealerFeedAdminMcpExecutions(context: McpProjectionContext) {
  return context.governanceBypass ? operations.map(({ execution }) => execution) : []
}
