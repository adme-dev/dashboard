import { z } from 'zod'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { McpToolManifest } from '~~/server/utils/ai/mcp/project'
import { roleHasPermission } from '~~/server/utils/permissions'
import type { PlanGoogleAdsActionInput } from '~~/server/utils/googleAds/actionPlanner'
import {
  planSearchGoogleAdsControlAction,
  type GoogleAdsControlFlags
} from '~~/server/utils/googleAds/searchRuntime'

export const GOOGLE_ADS_PLAN_PAUSE_TOOL = 'google_ads_plan_pause'
export const GOOGLE_ADS_PLAN_ARCHIVE_TOOL = 'google_ads_plan_archive'
export const GOOGLE_ADS_PLAN_ENABLE_TOOL = 'google_ads_plan_enable'
export const GOOGLE_ADS_PLAN_NEGATIVE_KEYWORDS_TOOL = 'google_ads_plan_add_negative_keywords'

const CommonSchema = {
  clientId: z.string().uuid(),
  connectionId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1).max(255)
}
const EntityTypeSchema = z.enum(['campaign', 'ad_group', 'ad', 'keyword'])
const PausableEntitySchema = z.strictObject({
  ...CommonSchema,
  entityType: EntityTypeSchema,
  resourceName: z.string().trim().min(1).max(1_000),
  requestedMode: z.enum(['proposal', 'automatic']).default('proposal')
})
const ArchivableEntitySchema = z.strictObject({
  ...CommonSchema,
  entityType: z.enum(['campaign', 'ad_group', 'ad']),
  resourceName: z.string().trim().min(1).max(1_000)
})
const EnableEntitySchema = z.strictObject({
  ...CommonSchema,
  entityType: EntityTypeSchema,
  resourceName: z.string().trim().min(1).max(1_000)
})
const NegativeKeywordsSchema = z.strictObject({
  ...CommonSchema,
  scope: z.enum(['campaign', 'ad_group']),
  parentResourceName: z.string().trim().min(1).max(1_000),
  keywords: z.array(z.strictObject({
    text: z.string().trim().min(1).max(80),
    matchType: z.enum(['EXACT', 'PHRASE', 'BROAD'])
  })).min(1).max(100),
  requestedMode: z.enum(['proposal', 'automatic']).default('proposal')
})

function manifest(name: string, description: string, schema: z.ZodType): McpToolManifest {
  return {
    name,
    description,
    inputSchema: z.toJSONSchema(schema) as Record<string, unknown>
  }
}

export const googleAdsSearchPlanningTools: McpToolManifest[] = [
  manifest(
    GOOGLE_ADS_PLAN_PAUSE_TOOL,
    'Plan a governed pause for one campaign, ad group, ad, or keyword. Automatic mode works only under an active matching account policy.',
    PausableEntitySchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_ARCHIVE_TOOL,
    'Plan a reversible archive for a campaign, ad group, or ad. Archive uses PAUSED and never permanently removes the Google Ads resource.',
    ArchivableEntitySchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_ENABLE_TOOL,
    'Plan enabling one campaign, ad group, ad, or keyword. Activation is a higher-risk approval action.',
    EnableEntitySchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_NEGATIVE_KEYWORDS_TOOL,
    'Plan typed campaign or ad-group negative keywords. Terms are normalized and deduplicated; automatic mode requires a bounded account policy.',
    NegativeKeywordsSchema
  )
]

const TOOL_NAMES = new Set(googleAdsSearchPlanningTools.map(tool => tool.name))

export function isGoogleAdsSearchPlanningTool(name: string): boolean {
  return TOOL_NAMES.has(name)
}

const ENTITY_RESOURCE_TYPES = {
  campaign: 'campaign',
  ad_group: 'ad_group',
  ad: 'ad',
  keyword: 'keyword'
} as const

const PAUSE_OPERATIONS = {
  campaign: 'pause_campaign',
  ad_group: 'pause_ad_group',
  ad: 'pause_ad',
  keyword: 'pause_keyword'
} as const

const ARCHIVE_OPERATIONS = {
  campaign: 'archive_campaign',
  ad_group: 'archive_ad_group',
  ad: 'archive_ad'
} as const

const ENABLE_OPERATIONS = {
  campaign: 'enable_campaign',
  ad_group: 'enable_ad_group',
  ad: 'enable_ad',
  keyword: 'enable_keyword'
} as const

export interface GoogleAdsSearchPlanningToolDependencies {
  plan: typeof planSearchGoogleAdsControlAction
}

const defaultDependencies: GoogleAdsSearchPlanningToolDependencies = {
  plan: planSearchGoogleAdsControlAction
}

export type GoogleAdsSearchPlanningOutcome
  = | { ok: true, data: Record<string, unknown> }
    | { ok: false, error: string, code: 'not_found' | 'disabled' | 'forbidden' | 'bad_args' | 'blocked' | 'handler_error' }

export async function executeGoogleAdsSearchPlanningTool(
  name: string,
  rawArgs: unknown,
  context: ToolContext,
  flags: GoogleAdsControlFlags,
  hasWriteScope: boolean,
  overrides: Partial<GoogleAdsSearchPlanningToolDependencies> = {}
): Promise<GoogleAdsSearchPlanningOutcome> {
  if (!isGoogleAdsSearchPlanningTool(name)) {
    return { ok: false, error: `Unknown Google Ads Search tool: ${name}`, code: 'not_found' }
  }
  if (!flags.write) {
    return { ok: false, error: 'Google Ads write tools are not enabled over MCP.', code: 'disabled' }
  }
  if (!hasWriteScope || !roleHasPermission(context.userRole, 'MEDIA_BUYING')) {
    return { ok: false, error: 'Not permitted.', code: 'forbidden' }
  }
  const dependencies = { ...defaultDependencies, ...overrides }

  try {
    let plannerInput: PlanGoogleAdsActionInput
    if (name === GOOGLE_ADS_PLAN_PAUSE_TOOL) {
      const args = PausableEntitySchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        requestedMode: args.requestedMode,
        actorId: context.userId,
        source: 'mcp' as const,
        operation: PAUSE_OPERATIONS[args.entityType],
        resourceType: ENTITY_RESOURCE_TYPES[args.entityType],
        arguments: { resourceName: args.resourceName }
      }
    } else if (name === GOOGLE_ADS_PLAN_ARCHIVE_TOOL) {
      const args = ArchivableEntitySchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp' as const,
        requestedMode: 'proposal' as const,
        operation: ARCHIVE_OPERATIONS[args.entityType],
        resourceType: ENTITY_RESOURCE_TYPES[args.entityType],
        arguments: { resourceName: args.resourceName }
      }
    } else if (name === GOOGLE_ADS_PLAN_ENABLE_TOOL) {
      const args = EnableEntitySchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp' as const,
        requestedMode: 'proposal' as const,
        operation: ENABLE_OPERATIONS[args.entityType],
        resourceType: ENTITY_RESOURCE_TYPES[args.entityType],
        arguments: { resourceName: args.resourceName }
      }
    } else {
      const args = NegativeKeywordsSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        requestedMode: args.requestedMode,
        actorId: context.userId,
        source: 'mcp' as const,
        operation: 'add_negative_keywords' as const,
        resourceType: 'negative_keyword' as const,
        arguments: {
          scope: args.scope,
          parentResourceName: args.parentResourceName,
          keywords: args.keywords
        }
      }
    }
    const plan = await dependencies.plan(plannerInput, {
      actorRole: context.userRole,
      hasWriteScope
    }, flags)
    if (!plan.policyDecision.allowed || plan.status === 'cancelled') {
      return {
        ok: false,
        error: 'This Google Ads action was blocked by policy.',
        code: 'blocked'
      }
    }
    return {
      ok: true,
      data: {
        actionPlanId: plan.id,
        operation: plan.operation,
        resourceType: plan.resourceType,
        resourceName: plan.resourceName,
        riskTier: plan.riskTier,
        executionMode: plan.executionMode,
        status: plan.status,
        diff: plan.diff,
        expiresAt: plan.expiresAt
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: 'Invalid Google Ads Search action arguments.', code: 'bad_args' }
    }
    return { ok: false, error: 'Google Ads Search action planning failed.', code: 'handler_error' }
  }
}
