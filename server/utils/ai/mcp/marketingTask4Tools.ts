import { z } from 'zod'
import { toMcpInputSchema } from './project'
import type { ToolContext, ToolResult } from '~~/server/utils/ai/toolContext'
import type {
  McpProjectionContext,
  McpToolManifest,
  McpExecutionDescriptor
} from './project'
import { getGoogleAdsToolSchema, googleAdsReadTools } from './googleAdsTools'
import { googleAdsSearchPlanningTools } from './googleAdsSearchTools'
import {
  ADS_STAFF_READ_NAMES,
  ADS_STAFF_PLAN_NAMES,
  GTM_STAFF_NAMES,
  isTask4WriteTool,
  isTask4StaffTool
} from './marketingTask4Names'
import { GtmProposalInput } from '~~/server/utils/tracking/gtmProposalSchemas'
import { GtmOwnershipSchema } from '~~/server/utils/tracking/gtmOwnership'
const site = z.strictObject({ siteId: z.string().uuid() })
const gtmSchemas: Record<string, z.ZodType> = {
  list_client_gtm_connections: z.strictObject({}),
  list_gtm_site_inventory: site.extend({
    workspacePath: z
      .string()
      .regex(/^accounts\/\d+\/containers\/\d+\/workspaces\/\d+$/)
      .optional()
  }),
  get_gtm_tracking_ownership: site,
  record_gtm_tracking_ownership: site.extend({ evidence: GtmOwnershipSchema }),
  get_gtm_change_status: z.strictObject({ proposalId: z.string().uuid() })
}
const actionByName: Record<string, string> = {
  propose_gtm_container_binding: 'binding',
  propose_gtm_workspace_change: 'workspace',
  propose_gtm_xeroflow_installation: 'installation',
  propose_gtm_publish: 'publish',
  propose_gtm_rollback: 'rollback'
}
for (const [name, action] of Object.entries(actionByName))
  gtmSchemas[name] = (
    GtmProposalInput.options.find(
      (schema) => schema.shape.action.value === action
    )! as z.ZodObject<any>
  ).omit({ action: true })
/** One typed input contract for staff manifests, descriptors and dispatch. */
function task4StaffSchema(name: string): z.ZodType {
  if (gtmSchemas[name]) return gtmSchemas[name]!
  if (name === 'google_ads_list_connections') return z.strictObject({ clientId: z.string().uuid() })
  const schema = getGoogleAdsToolSchema(name)!
  return schema instanceof z.ZodObject && 'requestedMode' in schema.shape
    ? schema.extend({ requestedMode: z.enum(['proposal']).default('proposal') }) : schema
}

export function projectTask4StaffSuite(
  context: McpProjectionContext
): McpToolManifest[] {
  const source = [...googleAdsReadTools, ...googleAdsSearchPlanningTools]
  const ads = [...ADS_STAFF_READ_NAMES, ...ADS_STAFF_PLAN_NAMES]
    .filter((name) =>
      isTask4WriteTool(name) || name === 'google_ads_reverify_resource'
        ? context.suiteFlags.googleAdsWrite
        : context.suiteFlags.googleAdsRead
    )
    .map((name) => {
      const inputSchema = toMcpInputSchema(task4StaffSchema(name)) as any
      return {
        name,
        description:
          name === 'google_ads_list_connections'
            ? 'List exact active client/account connections.'
            : (source.find((t) => t.name === name)?.description ?? name),
        inputSchema
      }
    })
  return [
    ...ads,
    ...GTM_STAFF_NAMES.map((name) => ({
      name,
      description: actionByName[name]
        ? 'Prepare a local tracking proposal. A separate owner/admin reviews before any provider changes; publish requires its own review.'
        : name === 'record_gtm_tracking_ownership'
          ? 'Record exact host, accepted-enquiry ownership, consent, current-source and documentary evidence; do not include credentials or customer payloads.'
          : 'Read client-scoped tracking inventory or proposal evidence; installation does not prove conversion delivery.',
      inputSchema: toMcpInputSchema(gtmSchemas[name]!) as any
    }))
  ]
}
/** Staff descriptors have no provider mutation executor. Calls use the scoped service below. */
export function resolveTask4StaffExecutions(
  context: McpProjectionContext
): McpExecutionDescriptor[] {
  return projectTask4StaffSuite(context).map((m) => ({
    name: m.name,
    canonicalName: m.name,
    kind: 'supplemental',
    tool: {
      name: m.name,
      description: m.description,
      parameters: task4StaffSchema(m.name) as any,
      mutates: isTask4WriteTool(m.name),
      handler: async () => ({
        ok: false,
        error: 'Use the scoped staff call boundary.'
      })
    }
  }))
}
export async function executeTask4StaffTool(
  name: string,
  args: unknown,
  ctx: ToolContext,
  key: string
): Promise<ToolResult> {
  const { evaluateStaffToolAdmission } = await import('./marketingPolicy')
  const admission = evaluateStaffToolAdmission(name, ctx)
  if (!admission.allowed)
    return { ok: false, error: admission.error, code: admission.code }
  if (!isTask4StaffTool(name))
    return { ok: false, error: 'Unknown tool', code: 'not_found' }
  try {
    if (name.startsWith('google_ads_')) {
      const { resolveMcpRuntimeConfig } = await import('./runtimeConfig')
      const flags = resolveMcpRuntimeConfig(ctx.event).suiteFlags
      const write =
        isTask4WriteTool(name) || name === 'google_ads_reverify_resource'
      if (write ? !flags.googleAdsWrite : !flags.googleAdsRead)
        return {
          ok: false,
          error: 'Google Ads capability is disabled.',
          code: 'disabled'
        }
    }
    if (name === 'google_ads_list_connections') {
      const { listGoogleAdsConnections } =
        await import('~~/server/utils/ai/marketing/googleAdsAccess')
      return {
        ok: true,
        data: await listGoogleAdsConnections(
          ctx,
          z.strictObject({ clientId: z.string().uuid() }).parse(args).clientId
        )
      }
    }
    if (name.startsWith('google_ads_')) {
      const { resolveMcpRuntimeConfig } = await import('./runtimeConfig')
      const f = resolveMcpRuntimeConfig(ctx.event).suiteFlags,
        flags = {
          read: f.googleAdsRead,
          write: f.googleAdsWrite,
          automation: false,
          destructive: false
        }
      if (ADS_STAFF_PLAN_NAMES.includes(name as any)) {
        const { executeGoogleAdsSearchPlanningTool } =
          await import('./googleAdsSearchTools')
        // Server logical request identity, never assistant-selected idempotency, owns durable plan replay.
        const parsed = task4StaffSchema(name).parse(args) as Record<
          string,
          unknown
        >
        return executeGoogleAdsSearchPlanningTool(
          name,
          { ...parsed, idempotencyKey: key },
          ctx,
          flags,
          true
        )
      }
      const { executeGoogleAdsTool } = await import('./googleAdsTools'),
        { buildGoogleAdsMcpToolDependencies } =
          await import('./googleAdsServer')
      return executeGoogleAdsTool(
        name,
        args,
        ctx,
        flags,
        buildGoogleAdsMcpToolDependencies(flags)
      )
    }
    const input = gtmSchemas[name]!.parse(args) as any
    if (name === 'list_client_gtm_connections') {
      const { listGtmConnectionsInScope } =
        await import('~~/server/utils/ai/marketing/gtmAccess')
      return { ok: true, data: await listGtmConnectionsInScope(ctx) }
    }
    const service = await import('~~/server/utils/tracking/gtmProposals')
    if (name === 'list_gtm_site_inventory')
      return {
        ok: true,
        data: await service.listGtmSiteInventory(
          ctx,
          input.siteId,
          input.workspacePath
        )
      }
    if (name === 'get_gtm_change_status')
      return {
        ok: true,
        data: await service.getGtmChangeProposal(ctx, input.proposalId)
      }
    if (actionByName[name])
      return {
        ok: true,
        data: await service.createGtmChangeProposal(
          ctx,
          { ...input, action: actionByName[name] },
          key
        )
      }
    const ownership = await import('~~/server/utils/tracking/gtmOwnership')
    return {
      ok: true,
      data:
        name === 'record_gtm_tracking_ownership'
          ? await ownership.recordGtmOwnership(ctx, input, key)
          : await ownership.getGtmOwnership(ctx, input.siteId)
    }
  } catch (error) {
    if (error instanceof z.ZodError)
      return {
        ok: false,
        error: 'Invalid or unsupported typed input',
        code: 'bad_args'
      }
    const e = error as any
    return {
      ok: false,
      error: e.statusMessage ?? 'Marketing service unavailable',
      code:
        e.statusCode === 403
          ? 'forbidden'
          : e.statusCode === 409
            ? 'conflict'
            : 'handler_error'
    }
  }
}
