import { STAFF_REVIEWED_PUBLISH_PLATFORMS } from '~~/shared/socialCapabilityReadiness'
// server/utils/ai/mcp/socialTools.ts
// Staff social draft/review suite (Facebook, Instagram, LinkedIn organic posts).
//
// Staff can discover their assigned clients' publishing accounts and client-owned media, create and edit
// delegated drafts, submit an exact revision for review and read status. There is deliberately NO staff
// publish / schedule / confirm tool and no provider-capable execution descriptor: a separate owner/admin
// approves the exact revision in the XeroFlow browser, and the existing dispatcher publishes it.
//
// Every invocation (and every replay) re-checks the fresh `social_draft` grant, client coverage and, for
// mutations, the signed `mcp:write` scope and writable role. Mutations are local, transactional and
// durably idempotent on the MCP logical request key (god_mode_execution_ledger, channel 'mcp'), so a
// retried host request returns the recorded result instead of creating a second draft or revision.
import { randomUUID, createHash } from 'node:crypto'
import { z } from 'zod'
import { transaction as dbTransaction } from '~~/server/utils/db'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import { fail, ok, type ToolContext, type ToolResult } from '~~/server/utils/ai/toolContext'
import type { McpExecutionDescriptor, McpProjectionContext, McpToolManifest } from './project'
import { toMcpInputSchema } from './project'
import { hasWriteScope } from './scope'
import { isSocialMcpWriteToolName, SOCIAL_MCP_TOOL_NAMES } from './socialToolNames'

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Expected a UUID')
const Platform = z.enum(STAFF_REVIEWED_PUBLISH_PLATFORMS)

const InstagramOptions = z.object({
  type: z.enum(['post', 'reel', 'story']).optional(),
  collaborators: z.array(z.string().min(1).max(100)).max(20).optional()
}).strict()

const TikTokOptions = z.object({
  privacy_level: z.enum(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']).optional(),
  consent: z.boolean().optional(), title: z.string().max(90).optional(),
  disable_comment: z.boolean().optional(), disable_duet: z.boolean().optional(), disable_stitch: z.boolean().optional(),
  commercial_disclosure: z.boolean().optional(), brand_content_toggle: z.boolean().optional(), brand_organic_toggle: z.boolean().optional(),
  is_aigc: z.boolean().optional(), auto_add_music: z.boolean().optional(),
  photo_cover_index: z.number().int().min(0).max(34).optional(), video_cover_timestamp_ms: z.number().int().min(0).optional()
}).strict()
const ProviderOptions = z.union([InstagramOptions, TikTokOptions])

const Target = z.object({
  platform: Platform,
  accountId: UUID.describe('Publishing account id from list_social_publishing_accounts'),
  options: ProviderOptions.optional().describe('Explicit reviewed provider options; TikTok remains externally gated')
}).strict()

const MediaAsset = z.object({
  kind: z.enum(['banner_asset', 'video_asset']),
  id: UUID.describe('Asset id from list_social_media_assets')
}).strict()

const Override = z.object({
  content: z.string().max(10_000).optional(),
  options: ProviderOptions.optional()
}).strict()

const DraftFields = z.object({
  targets: z.array(Target).min(1).max(20)
    .describe('Exact client-owned publishing accounts. Instagram requires media.'),
  content: z.string().max(10_000).optional(),
  platformOverrides: z.partialRecord(Platform, Override).optional()
    .describe('Per-network copy/options; media cannot be overridden'),
  linkUrl: z.string().max(2_000).nullable().optional(),
  hashtags: z.array(z.string().min(1).max(100)).max(30).optional(),
  firstComment: z.string().max(2_200).nullable().optional(),
  mediaAssets: z.array(MediaAsset).max(35).optional()
    .describe('Client-owned media asset references (never URLs)'),
  scheduledAt: z.string().max(64).nullable().optional()
    .describe('Requested publish time (ISO 8601). Intent only: nothing is scheduled until a reviewer approves.'),
  timezone: z.string().max(64).optional(),
  campaignId: UUID.nullable().optional(),
  packageAssignmentId: UUID.nullable().optional()
}).strict()

const listAccountsParams = z.object({ clientId: UUID }).strict()
const listMediaParams = z.object({
  clientId: UUID,
  kind: z.enum(['banner_asset', 'video_asset']).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  cursor: z.string().max(400).optional()
}).strict()
const createParams = DraftFields.extend({ clientId: UUID }).strict()
const updateParams = z.object({ postId: UUID, patch: DraftFields.partial().strict() }).strict()
const postParams = z.object({ postId: UUID }).strict()

type SocialServices = typeof import('~~/server/utils/socialPublishing/drafts')
type RevisionServices = typeof import('~~/server/utils/socialPublishing/revisions')
type TxDb = { query: (sql: string, params?: unknown[]) => Promise<any> }

const loadServices = async (): Promise<[SocialServices, RevisionServices]> => await Promise.all([
  import('~~/server/utils/socialPublishing/drafts'),
  import('~~/server/utils/socialPublishing/revisions')
])

/** Fresh-context re-check inside the handler (call.post admits first; this is defense in depth). */
function admit(name: string, ctx: ToolContext): ToolResult | null {
  if (ctx.mcpStaffAuthority !== 'fresh') return fail('Fresh staff authority is required.', 'forbidden')
  if (!(ctx.marketingCapabilities ?? []).includes('social_draft')) {
    return fail('Your account has not been granted social drafting.', 'capability_required')
  }
  if (isSocialMcpWriteToolName(name)) {
    if (ctx.assistantReadOnly === true) return fail('Your role is read-only.', 'read_only')
    const scopes = ctx.mcpScopes instanceof Set ? ctx.mcpScopes : new Set(ctx.mcpScopes ?? [])
    if (!hasWriteScope(scopes)) {
      return fail('This action requires write access. Reconnect your AI assistant and grant write (mcp:write).', 'insufficient_scope')
    }
  }
  return null
}

function serviceFailure(error: unknown): ToolResult {
  const status = (error as { statusCode?: number })?.statusCode
  const message = (error as { statusMessage?: string })?.statusMessage
  if (status === 400) return fail(message || 'Invalid request.', 'bad_args')
  if (status === 403) return fail(message || 'Not permitted.', 'forbidden')
  if (status === 404) return fail(message || 'Not found.', 'not_found')
  if (status === 409) return fail(message || 'The post changed state.', 'conflict')
  if (status === 503) return fail('A required service is unavailable. Try again shortly.', 'unavailable')
  return fail('The social draft service failed.', 'handler_error')
}

/** The six-tool suite. Handlers perform the local work only; callers own idempotency. */
async function runSocialTool(name: string, args: unknown, ctx: ToolContext, tx?: TxDb): Promise<ToolResult> {
  const denied = admit(name, ctx)
  if (denied) return denied
  const [drafts, revisions] = await loadServices()
  try {
    const actor = drafts.socialDraftActorFromToolContext(ctx)
    switch (name) {
      case 'list_social_publishing_accounts': {
        const input = listAccountsParams.parse(args)
        return ok({ clientId: input.clientId, accounts: await drafts.listSocialPublishingAccounts(actor, input) })
      }
      case 'list_social_media_assets': {
        const input = listMediaParams.parse(args)
        return ok(await drafts.listSocialMediaAssets(actor, input))
      }
      case 'get_social_post_status': {
        const input = postParams.parse(args)
        return ok(await drafts.getSocialPostStatus(actor, input.postId))
      }
      case 'create_social_post_draft': {
        if (!tx) return fail('Mutation requires a transaction.', 'handler_error')
        const input = createParams.parse(args)
        return ok(await drafts.createSocialPostDraft(actor, input, tx))
      }
      case 'update_social_post_draft': {
        if (!tx) return fail('Mutation requires a transaction.', 'handler_error')
        const input = updateParams.parse(args)
        return ok(await drafts.updateSocialPostDraft(actor, input.postId, input.patch, tx))
      }
      case 'submit_social_post_for_review': {
        if (!tx) return fail('Mutation requires a transaction.', 'handler_error')
        const input = postParams.parse(args)
        const current = await drafts.getSocialPostStatus(actor, input.postId, tx)
        await revisions.submitSocialPostForReview(tx, {
          event: ctx.event,
          postId: input.postId,
          requesterId: actor.actorId,
          creatorId: actor.actorId,
          clientIds: [current.clientId],
          delegatedOnly: true
        })
        return ok(await drafts.getSocialPostStatus(actor, input.postId, tx))
      }
      default:
        return fail(`Unknown tool: ${name}`, 'not_found')
    }
  } catch (error) {
    if (error instanceof z.ZodError) return fail('Invalid arguments.', 'bad_args')
    return serviceFailure(error)
  }
}

const descriptions: Record<(typeof SOCIAL_MCP_TOOL_NAMES)[number], string> = {
  list_social_publishing_accounts:
    'List the Facebook, Instagram and LinkedIn publishing accounts connected for one of your assigned clients, with readiness. '
    + 'Accounts are connected in the XeroFlow dashboard, not through this assistant.',
  list_social_media_assets:
    'List a client\'s publishable media (banner and video assets) to attach to a draft by id. Paginated with cursor.',
  get_social_post_status:
    'Read a post\'s workflow status (draft, awaiting_client, awaiting_review, rejected, approved, scheduled, publishing, '
    + 'accepted, published, partially_published, failed, unknown), current revision, review decision and per-account results.',
  create_social_post_draft:
    'Create a DRAFT social post for an assigned client with exact publishing accounts, copy and client-owned media. '
    + 'This never schedules or publishes: scheduledAt is only the requested time. Submit it for review afterwards.',
  update_social_post_draft:
    'Edit one of your drafts. Any edit returns it to draft and invalidates a pending or approved review — resubmit it.',
  submit_social_post_for_review:
    'Freeze the draft\'s exact content, accounts, media and schedule as an immutable revision for review. '
    + 'A different owner/admin approves or rejects it in XeroFlow; you cannot approve, schedule or publish it yourself.'
}

const parametersByName: Record<string, z.ZodType> = {
  list_social_publishing_accounts: listAccountsParams,
  list_social_media_assets: listMediaParams,
  get_social_post_status: postParams,
  create_social_post_draft: createParams,
  update_social_post_draft: updateParams,
  submit_social_post_for_review: postParams
}

export const socialMcpTools: AiTool<unknown>[] = SOCIAL_MCP_TOOL_NAMES.map(name => ({
  name,
  description: descriptions[name],
  parameters: parametersByName[name] as z.ZodType<unknown>,
  mutates: isSocialMcpWriteToolName(name),
  ...(isSocialMcpWriteToolName(name)
    ? {
        directMutation: {
          executionClass: 'local-transactional' as const,
          execute: async (args: unknown, ctx: ToolContext, db: TxDb) => await runSocialTool(name, args, ctx, db)
        }
      }
    : {}),
  handler: async (args: unknown, ctx: ToolContext) => isSocialMcpWriteToolName(name)
    ? fail('Social draft mutations run through the MCP execution coordinator.', 'handler_error')
    : await runSocialTool(name, args, ctx)
})) as AiTool<unknown>[]

/** Manifests for the staff projection (admission is applied by marketingPolicy). */
export function projectSocialMcpSuite(_context: McpProjectionContext): McpToolManifest[] {
  return socialMcpTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: toMcpInputSchema(tool.parameters)
  }))
}

/** Local-only descriptors: no provider-capable or internal-HTTP executor exists for this suite. */
export function resolveSocialMcpExecutions(_context: McpProjectionContext): McpExecutionDescriptor[] {
  return socialMcpTools.map(tool => ({
    name: tool.name,
    canonicalName: tool.name,
    kind: 'supplemental' as const,
    tool,
    ...(tool.directMutation
      ? { executionClass: 'local-transactional' as const, executeMutation: tool.directMutation.execute }
      : {})
  }))
}

// ---------------------------------------------------------------------------------------------------
// Ordinary MCP execution (tools/call)

export interface SocialMcpCallRequest {
  toolName: string
  args: unknown
  ctx: ToolContext
  userId: string
  idempotencyKey: string
  sessionDigest: string
}

interface LedgerRow {
  state: 'in_progress' | 'succeeded' | 'failed' | 'ambiguous'
  route_or_tool: string
  result_reference: string | null
}

export interface SocialMcpCallDependencies {
  transaction: <T>(callback: (db: TxDb) => Promise<T>) => Promise<T>
  run: typeof runSocialTool
  /** Re-authorized view of a recorded result (fresh scope applies to replays too). */
  replayView: (ctx: ToolContext, postId: string) => Promise<ToolResult>
}

const defaultDependencies: SocialMcpCallDependencies = {
  transaction: async callback => await dbTransaction(callback as any),
  run: runSocialTool,
  replayView: async (ctx, postId) => await runSocialTool('get_social_post_status', { postId }, ctx)
}

function resultReference(result: ToolResult): string | null {
  const data = result.ok ? result.data as { postId?: unknown } | undefined : undefined
  return typeof data?.postId === 'string' ? data.postId : null
}

/**
 * Execute one social suite call for ordinary staff. Reads run directly. Mutations claim the
 * (user, 'mcp', idempotencyKey) ledger row, run the local mutation and record the result in ONE
 * transaction; a repeated key replays the recorded post through a freshly authorized status read.
 */
export async function executeSocialMcpTool(
  request: SocialMcpCallRequest,
  deps: SocialMcpCallDependencies = defaultDependencies
): Promise<ToolResult> {
  const denied = admit(request.toolName, request.ctx)
  if (denied) return denied
  if (!isSocialMcpWriteToolName(request.toolName)) return await deps.run(request.toolName, request.args, request.ctx)
  if (!/^mcp:[0-9a-f]{64}$/.test(request.idempotencyKey) || !/^[0-9a-f]{64}$/.test(request.sessionDigest)) {
    return fail('Invalid MCP execution identity.', 'bad_args')
  }

  let replayPostId: string | null = null
  let outcome: ToolResult
  try {
    outcome = await deps.transaction(async (db) => {
      const inserted = (await db.query(
        `INSERT INTO god_mode_execution_ledger (
           actor_user_id, channel, idempotency_key, state, correlation_id, route_or_tool,
           executor_class, session_digest, execution_phase
         ) VALUES ($1, 'mcp', $2, 'in_progress', $3, $4, 'local-transactional', $5, 'claimed')
         ON CONFLICT (actor_user_id, channel, idempotency_key) DO NOTHING
         RETURNING state`,
        [request.userId, request.idempotencyKey, randomUUID(), request.toolName, request.sessionDigest]
      )).rows[0]
      if (!inserted) {
        const existing = (await db.query(
          `SELECT state, route_or_tool, result_reference FROM god_mode_execution_ledger
            WHERE actor_user_id = $1 AND channel = 'mcp' AND idempotency_key = $2 FOR UPDATE`,
          [request.userId, request.idempotencyKey]
        )).rows[0] as LedgerRow | undefined
        if (!existing || existing.route_or_tool !== request.toolName) return fail('Execution identity already used.', 'conflict')
        if (existing.state === 'succeeded' && existing.result_reference) {
          replayPostId = existing.result_reference
          return ok(null)
        }
        if (existing.state === 'failed') return fail('Action previously failed.', 'handler_error')
        return fail('Action outcome is pending reconciliation.', 'pending')
      }

      const result = await deps.run(request.toolName, request.args, request.ctx, db)
      // Roll the whole unit (ledger claim included) back on any refusal so a corrected retry can run.
      if (!result.ok) throw Object.assign(new Error('social mutation refused'), { socialResult: result })
      const reference = resultReference(result)
      const digest = createHash('sha256').update(JSON.stringify(result)).digest('hex')
      const updated = await db.query(
        `UPDATE god_mode_execution_ledger
            SET state = 'succeeded', execution_phase = 'result_captured',
                result_reference = $3, result_digest = $4,
                client_id = $5::uuid, updated_at = NOW()
          WHERE actor_user_id = $1 AND channel = 'mcp' AND idempotency_key = $2 AND state = 'in_progress'`,
        [request.userId, request.idempotencyKey, reference ?? `mcp-result:${digest.slice(0, 64)}`, digest,
          (result.data as { clientId?: string } | undefined)?.clientId ?? null]
      )
      if ((updated.rowCount ?? 0) !== 1) throw new Error('Social mutation completion rejected')
      return result
    })
  } catch (error) {
    const refused = (error as { socialResult?: ToolResult })?.socialResult
    if (refused) return refused
    return fail('The social draft could not be saved just now. Try again shortly.', 'unavailable')
  }
  if (replayPostId) {
    // Replays are re-authorized: a revoked grant, assignment or client returns no data.
    const view = await deps.replayView(request.ctx, replayPostId)
    return view.ok && view.data && typeof view.data === 'object'
      ? ok({ ...(view.data as Record<string, unknown>), replayed: true })
      : view
  }
  return outcome
}
