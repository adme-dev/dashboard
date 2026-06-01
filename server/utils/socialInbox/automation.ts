// server/utils/socialInbox/automation.ts
// The reply automation engine. DB-injected (EngineDb) + deps-injected (draft + dispatch)
// so the whole decision tree is unit-testable with fakes. The cron handler wires the real
// DB, real Groq draft, and real provider dispatch — and ONLY runs when the master gate is on.
import type {
  AutomationRule, AutomationContext, ReplyDraft, EffectiveMode,
} from './automationTypes'
import { detectReplyRisk, isWithinBusinessHours, evaluateRuleConditions } from './guardrails'

export interface EngineDb {
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>
  queryRows<T = any>(sql: string, params?: any[]): Promise<T[]>
  execute(sql: string, params?: any[]): Promise<number>
}

export interface EngineDeps {
  generateDraft(ctx: AutomationContext, brandPrompt: string): Promise<ReplyDraft>
  dispatch(args: { conversationId: string; clientId: string; content: string; aiGenerated: boolean; queueId: string }):
    Promise<{ ok: boolean; platformMessageId?: string; error?: string }>
}

/** First enabled rule (lowest priority number) whose platform/channel/conditions match. */
export function selectRule(rules: AutomationRule[], ctx: AutomationContext): AutomationRule | null {
  const matches = rules
    .filter(r => r.enabled && r.mode !== 'off')
    .filter(r => r.platform == null || r.platform === ctx.platform)
    .filter(r => r.channel_type == null || r.channel_type === ctx.channelType)
    .filter(r => evaluateRuleConditions(ctx, r.conditions))
    .sort((a, b) => a.priority - b.priority)
  return matches[0] ?? null
}

export type ModeDecision = { mode: EffectiveMode | 'skip'; notes: string }

/**
 * Apply guardrails to a matched rule + draft and decide the effective action.
 * 'suggest'/'off' rules never reach here (selectRule excludes off; suggest handled upstream).
 * Direction of safety: any doubt downgrades autopilot → approval (or skip).
 */
export function resolveEffectiveMode(
  rule: AutomationRule, ctx: AutomationContext, draft: ReplyDraft, usage: { recentCount: number },
): ModeDecision {
  // approval-mode rules are never escalated to autopilot.
  if (rule.mode === 'approval') {
    return { mode: 'approval', notes: 'rule mode: approval' }
  }
  // --- autopilot path: every guardrail can only downgrade ---
  // Rate limit (0 = unlimited).
  if (rule.rate_limit > 0 && usage.recentCount >= rule.rate_limit) {
    return { mode: 'skip', notes: `rate limit reached (${usage.recentCount}/${rule.rate_limit})` }
  }
  // HARD rule: a low review rating IS a complaint by definition — force a human regardless of wording.
  if (ctx.rating != null && ctx.rating <= 2) {
    return { mode: 'approval', notes: `forced to human — low rating ${ctx.rating}` }
  }
  // HARD negative-sentiment / PR-risk guard (deterministic, primary).
  const risk = detectReplyRisk(ctx.inboundContent)
  if (risk.risky) {
    return { mode: 'approval', notes: `forced to human — risk terms: ${risk.reasons.join(', ')}` }
  }
  // Model self-flagged risk (secondary).
  if (draft.risk) {
    return { mode: 'approval', notes: 'forced to human — model flagged risk' }
  }
  // Confidence floor.
  if (draft.confidence < rule.confidence_floor) {
    return { mode: 'approval', notes: `confidence ${draft.confidence} < floor ${rule.confidence_floor}` }
  }
  // Business hours (only when the rule opts in).
  if (rule.conditions.businessHoursOnly && !isWithinBusinessHours(ctx.now, rule.business_hours)) {
    return { mode: 'approval', notes: 'outside business hours' }
  }
  return { mode: 'autopilot', notes: 'all guardrails passed' }
}

/**
 * Count autopilot actions for this rule in the trailing hour (rate-limit input).
 * Includes in-flight 'approved' rows (not yet flipped to 'sent') so overlapping ticks
 * can't each read a stale 'sent'-only count and collectively exceed the cap.
 */
async function recentAutopilotCount(db: EngineDb, ruleId: string): Promise<number> {
  const row = await db.queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM social_response_queue
       WHERE rule_id = $1 AND status IN ('approved','sent') AND created_at > NOW() - INTERVAL '1 hour'`,
    [ruleId],
  )
  return row?.n ?? 0
}

/**
 * Run the engine for one conversation flagged automation_state='pending'.
 * Loads the conversation + its latest inbound message, selects a rule, drafts, applies
 * guardrails, writes the audit queue row, and (for autopilot) dispatches. Always clears
 * automation_state at the end so the conversation is not re-processed.
 */
export async function runAutomationForConversation(db: EngineDb, deps: EngineDeps, conversationId: string): Promise<void> {
  const clearState = () => db.execute(
    `UPDATE social_conversations SET automation_state = NULL, updated_at = NOW() WHERE id = $1`, [conversationId])

  const conv = await db.queryOne<any>(
    `SELECT id, client_id, platform, channel_type, rating FROM social_conversations WHERE id = $1`, [conversationId])
  if (!conv) return

  const inbound = await db.queryOne<any>(
    `SELECT id, content, author_name FROM social_messages
       WHERE conversation_id = $1 AND direction = 'in'
       ORDER BY platform_timestamp DESC NULLS LAST, created_at DESC LIMIT 1`, [conversationId])
  if (!inbound) { await clearState(); return }

  // Idempotency: never act twice on the same inbound message.
  const existing = await db.queryOne<{ id: string }>(
    `SELECT id FROM social_response_queue WHERE message_id = $1`, [inbound.id])
  if (existing) { await clearState(); return }

  const rules = await db.queryRows<AutomationRule>(
    `SELECT * FROM social_automation_rules WHERE client_id = $1 AND enabled = TRUE ORDER BY priority ASC`, [conv.client_id])

  const ctx: AutomationContext = {
    conversationId, clientId: conv.client_id, platform: conv.platform, channelType: conv.channel_type,
    rating: conv.rating ?? null, inboundMessageId: inbound.id, inboundContent: inbound.content ?? '',
    participantName: inbound.author_name ?? null, now: new Date(),
  }

  const rule = selectRule(rules, ctx)
  // No rule, or the matched rule is suggest-only → engine does nothing automatic.
  if (!rule || rule.mode === 'suggest' || rule.mode === 'off') { await clearState(); return }

  const draft = await deps.generateDraft(ctx, rule.action.aiPrompt ?? '')
  if (!draft.reply) {
    // Drafting failed → leave a skipped audit row, no send.
    await db.queryOne(
      `INSERT INTO social_response_queue
         (client_id, conversation_id, message_id, rule_id, draft_content, confidence, status, effective_mode, approver_type, guardrail_notes)
       VALUES ($1,$2,$3,$4,$5,$6,'skipped','approval',$7,'draft generation failed') RETURNING id`,
      [conv.client_id, conversationId, inbound.id, rule.id, '(no draft)', draft.confidence, rule.approval_by])
    await clearState(); return
  }

  const usage = { recentCount: await recentAutopilotCount(db, rule.id) }
  const decision = resolveEffectiveMode(rule, ctx, draft, usage)

  if (decision.mode === 'skip') {
    await db.queryOne(
      `INSERT INTO social_response_queue
         (client_id, conversation_id, message_id, rule_id, draft_content, confidence, status, effective_mode, approver_type, guardrail_notes)
       VALUES ($1,$2,$3,$4,$5,$6,'skipped','approval',$7,$8) RETURNING id`,
      [conv.client_id, conversationId, inbound.id, rule.id, draft.reply, draft.confidence, rule.approval_by, decision.notes])
    await clearState(); return
  }

  // Insert the queue row first (audit before any send). autopilot starts 'approved' (machine-approved),
  // approval starts 'pending' (awaits human). ON CONFLICT DO NOTHING makes the SEND idempotent: if a
  // racing tick already inserted a row for this inbound message, RETURNING yields no row → queueId is
  // undefined → we clear state and return without drafting a second reply or dispatching.
  const startStatus = decision.mode === 'autopilot' ? 'approved' : 'pending'
  const queueRow = await db.queryOne<{ id: string }>(
    `INSERT INTO social_response_queue
       (client_id, conversation_id, message_id, rule_id, draft_content, confidence, status, effective_mode, approver_type, guardrail_notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (message_id) WHERE message_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [conv.client_id, conversationId, inbound.id, rule.id, draft.reply, draft.confidence,
     startStatus, decision.mode, decision.mode === 'autopilot' ? 'none' : rule.approval_by, decision.notes])
  const queueId = queueRow?.id
  if (!queueId) { await clearState(); return } // another tick already owns this message

  // Mark conversation's automation snapshot for the UI badge.
  await db.execute(
    `UPDATE social_conversations SET automation_state = $2, updated_at = NOW() WHERE id = $1`,
    [conversationId, decision.mode === 'autopilot' ? 'auto_replied' : 'awaiting_approval'])

  if (decision.mode === 'autopilot') {
    const res = await deps.dispatch({
      conversationId, clientId: conv.client_id, content: draft.reply, aiGenerated: true, queueId,
    })
    await db.execute(
      `UPDATE social_response_queue SET status = $2, error = $3, updated_at = NOW() WHERE id = $1`,
      [queueId, res.ok ? 'sent' : 'failed', res.ok ? null : (res.error ?? 'dispatch failed')])
  }
  // approval path: nothing more — the queue row waits for a human.
}

/** Cron entry: process up to `limit` pending conversations. Caller MUST gate on the master switch. */
export async function processPendingAutomation(db: EngineDb, deps: EngineDeps, limit = 50): Promise<{ processed: number }> {
  const pending = await db.queryRows<{ id: string }>(
    `SELECT id FROM social_conversations WHERE automation_state = 'pending' ORDER BY updated_at ASC LIMIT $1`, [limit])
  let processed = 0
  for (const row of pending) {
    // Atomically claim the conversation so two overlapping cron ticks can't both process it.
    const claimed = await db.queryOne<{ id: string }>(
      `UPDATE social_conversations SET automation_state = 'processing', updated_at = NOW()
         WHERE id = $1 AND automation_state = 'pending' RETURNING id`, [row.id])
    if (!claimed) continue // another tick took it
    try { await runAutomationForConversation(db, deps, row.id); processed++ }
    catch (e: any) {
      await db.execute(`UPDATE social_conversations SET automation_state = NULL, updated_at = NOW() WHERE id = $1`, [row.id])
      console.error('automation.run.error', { conversationId: row.id, error: String(e?.message ?? e) })
    }
  }
  return { processed }
}
