import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { createMondayClient, type MondayColumnValue, type MondayItem } from '~~/server/utils/mondayClient'
import { resolveMondayConnection } from '~~/server/utils/mondayConnection'
import { buildPacingReview, PACING_REVIEW_SELECT_COLUMNS, type PacingReviewRow } from '~~/server/utils/socialSpendPacingReview'
import { buildCampaignBudgetIdentity } from '~~/server/utils/campaignBudgetIdentity'
import { recordCampaignAction } from '~~/server/utils/campaignActionLog'

export const CAMPAIGN_EXCEPTIONS_BOARD_ID = '18427394520'
export const CAMPAIGN_EXCEPTION_COLUMNS = Object.freeze({
  exceptionType: 'color_mm6d6ghw',
  severity: 'color_mm6dpcve',
  status: 'color_mm6dg7f',
  platform: 'color_mm6d894v',
  client: 'text_mm6d3k5e',
  campaign: 'text_mm6dgxwk',
  campaignId: 'text_mm6dqp1k',
  evidence: 'long_text_mm6dsbh3',
  recommendedAction: 'long_text_mm6d6y83',
  firstDetected: 'date_mm6d7fhn',
  lastSeen: 'date_mm6djqzv',
  whyThisFired: 'long_text_mm6djwbv',
  confidence: 'color_mm6dmcv9',
  automation: 'color_mm6drvtr',
  duration: 'color_mm6dpfgy',
})

type AutomationOperation = 'apply' | 'rollback'

export interface CampaignExceptionClaim {
  id: string
  mondayItemId: string
}

interface BudgetTargetRow extends PacingReviewRow {
  first_served_date: string | null
  connection_id: string | null
  account_id: string | null
}

function column(item: MondayItem, id: string): MondayColumnValue | undefined {
  return item.column_values?.find(value => value.id === id)
}

export function campaignExceptionColumnText(item: MondayItem, id: string): string {
  return String(column(item, id)?.text || '').trim()
}

export function parseRecommendedDailyBudget(text: string): number | null {
  const match = text.match(/(?:daily(?:\s+budget)?\s+(?:to|at)|to\s+about)\s+A?\$\s*([\d,]+(?:\.\d{1,2})?)/i)
  if (!match) return null
  const value = Number(match[1]!.replace(/,/g, ''))
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null
}

const OFFER_CONTEXT_PATTERN = /\b(offer|ends?|until|expires?|expiry|deadline|valid|sale|drive[ -]?away|cashback|bonus)\b/i
const MONTH_INDEX: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
}

function validUtcDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day ? date : null
}

/**
 * Policy source: Garrix Lopena, "Rolling Campaigns & Offer Expiry Control System"
 * (Monday item 12719936996). Any live rolling asset carrying a passed deadline is
 * an exception; the policy requires pausing the campaign immediately.
 */
export function findExpiredOfferDate(text: string, now = new Date()): string | null {
  if (!OFFER_CONTEXT_PATTERN.test(text)) return null
  const candidates: Date[] = []
  const hasOfferContext = (index: number, length: number) => {
    const previousBoundary = Math.max(text.lastIndexOf('\n', index - 1), text.lastIndexOf('.', index - 1), text.lastIndexOf(';', index - 1))
    const followingBoundaries = [text.indexOf('\n', index + length), text.indexOf('.', index + length), text.indexOf(';', index + length)]
      .filter(boundary => boundary >= 0)
    const nextBoundary = followingBoundaries.length ? Math.min(...followingBoundaries) : text.length
    const clause = text.slice(Math.max(previousBoundary + 1, index - 100), Math.min(nextBoundary, index + length + 100))
    return OFFER_CONTEXT_PATTERN.test(clause)
  }
  const push = (year: number, month: number, day: number, index: number, length: number) => {
    if (!hasOfferContext(index, length)) return
    const value = validUtcDate(year, month, day)
    if (value) candidates.push(value)
  }
  for (const match of text.matchAll(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/g)) {
    push(Number(match[1]), Number(match[2]) - 1, Number(match[3]), match.index ?? 0, match[0].length)
  }
  for (const match of text.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/g)) {
    push(Number(match[3]), Number(match[2]) - 1, Number(match[1]), match.index ?? 0, match[0].length)
  }
  for (const match of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/gi)) {
    push(Number(match[3] || now.getUTCFullYear()), MONTH_INDEX[match[2]!.toLowerCase()]!, Number(match[1]), match.index ?? 0, match[0].length)
  }
  for (const match of text.matchAll(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/gi)) {
    push(Number(match[3] || now.getUTCFullYear()), MONTH_INDEX[match[1]!.toLowerCase()]!, Number(match[2]), match.index ?? 0, match[0].length)
  }
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const expired = candidates.filter(date => date.getTime() < today).sort((left, right) => right.getTime() - left.getTime())[0]
  return expired ? expired.toISOString().slice(0, 10) : null
}

export function hasOpenCampaignDataHalt(items: MondayItem[]): boolean {
  return items.some(item =>
    campaignExceptionColumnText(item, CAMPAIGN_EXCEPTION_COLUMNS.exceptionType) === 'Sync Stale / Coverage Drop'
    && ['Open', 'Awaiting AM'].includes(campaignExceptionColumnText(item, CAMPAIGN_EXCEPTION_COLUMNS.status))
  )
}

export function validateSafeBudgetRebase(input: {
  exceptionType: string
  confidence: string
  campaignId: string
  firstServedDate: string | null
  period: string
  pacingRatio: number
  proposedDailyBudget: number
  boardRecommendedDailyBudget: number | null
  monthlyBudget: number
  daysInMonth: number
  dailyBudgetActionSupported: boolean
  globalHalt: boolean
}): { ok: true } | { ok: false, reason: string } {
  if (input.globalHalt) return { ok: false, reason: 'Global halt: Sync Stale / Coverage Drop is open on the board.' }
  if (input.confidence !== 'Safe to auto-apply') return { ok: false, reason: `Confidence is ${input.confidence || 'unset'}, not Safe to auto-apply.` }
  if (!['Underpacing', 'Daily Rate Not Re-based'].includes(input.exceptionType)) {
    return { ok: false, reason: `Exception type ${input.exceptionType || 'unset'} has no unattended daily-budget write path.` }
  }
  if (!/^\d+$/.test(input.campaignId)) return { ok: false, reason: 'A single numeric Campaign ID is required.' }
  if (!input.dailyBudgetActionSupported) return { ok: false, reason: 'Campaign-total budgets cannot use the daily-budget write path.' }
  const monthStart = `${input.period}-01`
  if (!input.firstServedDate || input.firstServedDate > monthStart) {
    return { ok: false, reason: 'Campaign has not served for the full month; review first.' }
  }
  if (input.pacingRatio < 0.55 || input.pacingRatio > 0.80) {
    return { ok: false, reason: `Pacing ratio ${input.pacingRatio} is outside the safe 0.55–0.80 band.` }
  }
  if (input.boardRecommendedDailyBudget == null) {
    return { ok: false, reason: 'Recommended Action does not contain one unambiguous daily budget.' }
  }
  if (Math.abs(input.boardRecommendedDailyBudget - input.proposedDailyBudget) > 0.05) {
    return { ok: false, reason: `Recommended Action (${input.boardRecommendedDailyBudget}) disagrees with current pacing (${input.proposedDailyBudget}).` }
  }
  const nominalDaily = input.daysInMonth > 0 ? input.monthlyBudget / input.daysInMonth : 0
  if (!(nominalDaily > 0) || input.proposedDailyBudget > nominalDaily * 2 + 0.005) {
    return { ok: false, reason: 'Proposed daily budget exceeds 2× the campaign nominal daily budget.' }
  }
  return { ok: true }
}

async function fetchAllItems(monday: Awaited<ReturnType<typeof createMondayClient>>): Promise<MondayItem[]> {
  const items: MondayItem[] = []
  let cursor: string | undefined
  do {
    const page = await monday.getItems(CAMPAIGN_EXCEPTIONS_BOARD_ID, { limit: 100, cursor })
    items.push(...page.items)
    cursor = page.cursor
  } while (cursor)
  return items
}

async function claimItem(item: MondayItem, operation: AutomationOperation): Promise<CampaignExceptionClaim | null> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO monday_campaign_exception_actions
       (monday_item_id, monday_item_updated_at, operation, status)
     VALUES ($1, $2::timestamptz, $3, 'claimed')
     ON CONFLICT (monday_item_id, monday_item_updated_at, operation) DO NOTHING
     RETURNING id::text`,
    [item.id, item.updated_at, operation]
  )
  return row ? { id: row.id, mondayItemId: item.id } : null
}

async function finishClaim(claimId: string, input: {
  status: 'applied' | 'failed' | 'rolled_back'
  actionId?: string | null
  mediaSpendId?: string | null
  previousDailyBudget?: number | null
  appliedDailyBudget?: number | null
  failureReason?: string | null
}): Promise<void> {
  await execute(
    `UPDATE monday_campaign_exception_actions
        SET status = $2,
            campaign_action_id = $3::uuid,
            media_spend_id = $4::uuid,
            previous_daily_budget = $5,
            applied_daily_budget = $6,
            failure_reason = $7,
            completed_at = NOW(),
            updated_at = NOW()
      WHERE id = $1::uuid`,
    [claimId, input.status, input.actionId ?? null, input.mediaSpendId ?? null,
      input.previousDailyBudget ?? null, input.appliedDailyBudget ?? null, input.failureReason?.slice(0, 1000) ?? null]
  )
}

function statusValue(label: 'Applying' | 'Applied' | 'Failed'): Record<string, string> {
  return { label }
}

async function setAutomationStatus(
  monday: Awaited<ReturnType<typeof createMondayClient>>,
  itemId: string,
  status: 'Applying' | 'Applied' | 'Failed'
): Promise<void> {
  await monday.changeMultipleColumnValues(CAMPAIGN_EXCEPTIONS_BOARD_ID, itemId, {
    [CAMPAIGN_EXCEPTION_COLUMNS.automation]: statusValue(status)
  })
}

async function failItem(
  monday: Awaited<ReturnType<typeof createMondayClient>>,
  item: MondayItem,
  claimId: string,
  reason: string
): Promise<void> {
  const bounded = reason.replace(/\s+/g, ' ').trim().slice(0, 900) || 'Automation failed closed.'
  await finishClaim(claimId, { status: 'failed', failureReason: bounded })
  await setAutomationStatus(monday, item.id, 'Failed')
  await monday.createUpdate(item.id, `XeroFlow automation refused this write: ${bounded}`)
}

async function loadBudgetTarget(item: MondayItem, period: string): Promise<BudgetTargetRow | null> {
  const campaignId = campaignExceptionColumnText(item, CAMPAIGN_EXCEPTION_COLUMNS.campaignId)
  const platformText = campaignExceptionColumnText(item, CAMPAIGN_EXCEPTION_COLUMNS.platform)
  const platform = platformText === 'Google' ? 'google_ads' : platformText === 'Meta' ? 'meta' : ''
  if (!campaignId || !platform) return null
  return await queryOne<BudgetTargetRow>(
    `SELECT ${PACING_REVIEW_SELECT_COLUMNS},
            ms.first_served_date::text,
            ms.connection_id::text,
            sc.account_id
       FROM media_spend ms
       LEFT JOIN agency_clients ac ON ac.id = ms.client_id
       LEFT JOIN social_connections sc ON sc.id = ms.connection_id
      WHERE ms.period = $1
        AND ms.platform = $2
        AND ms.campaign_id = $3
      ORDER BY ms.synced_at DESC
      LIMIT 1`,
    [period, platform, campaignId]
  )
}

async function refreshCampaignExceptionConfidence(
  monday: Awaited<ReturnType<typeof createMondayClient>>,
  items: MondayItem[],
  now: Date
): Promise<number> {
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  let changed = 0
  for (const item of items) {
    const status = campaignExceptionColumnText(item, CAMPAIGN_EXCEPTION_COLUMNS.status)
    if (!['Open', 'Awaiting AM'].includes(status)) continue
    const exceptionType = campaignExceptionColumnText(item, CAMPAIGN_EXCEPTION_COLUMNS.exceptionType)
    let next: 'Safe to auto-apply' | 'Review first' | 'Human only' | 'Blocked — no write path'
    let reason: string
    if (!['Underpacing', 'Daily Rate Not Re-based'].includes(exceptionType)) {
      next = exceptionType === 'Product Set Below Minimum'
        ? 'Blocked — no write path'
        : 'Human only'
      reason = next === 'Human only'
        ? `${exceptionType || 'This exception'} is not a deterministic daily-budget rebase.`
        : 'The board automation has no confirmed product-set write path.'
    } else {
      const campaignId = campaignExceptionColumnText(item, CAMPAIGN_EXCEPTION_COLUMNS.campaignId)
      const row = await loadBudgetTarget(item, period)
      if (!campaignId || !row) {
        next = 'Blocked — no write path'
        reason = 'A single current-period Campaign ID and platform match is required.'
      } else {
        const pacing = buildPacingReview([row], { now, period }).campaigns[0]
        if (!pacing) {
          next = 'Blocked — no write path'
          reason = 'Canonical pacing evidence is unavailable.'
        } else {
          const validation = validateSafeBudgetRebase({
            exceptionType,
            confidence: 'Safe to auto-apply',
            campaignId,
            firstServedDate: row.first_served_date,
            period,
            pacingRatio: pacing.pacingRatio,
            proposedDailyBudget: pacing.recommendedDailyBudget,
            boardRecommendedDailyBudget: parseRecommendedDailyBudget(campaignExceptionColumnText(item, CAMPAIGN_EXCEPTION_COLUMNS.recommendedAction)),
            monthlyBudget: pacing.budget,
            daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
            dailyBudgetActionSupported: pacing.dailyBudgetActionSupported,
            globalHalt: false,
          })
          if (!('reason' in validation)) {
            next = 'Safe to auto-apply'
            reason = 'Full-month daily rebase; pacing is 0.55–0.80; recommendation agrees with canonical pacing and stays within 2× nominal daily.'
          } else {
            next = 'Review first'
            reason = validation.reason
          }
        }
      }
    }
    const current = campaignExceptionColumnText(item, CAMPAIGN_EXCEPTION_COLUMNS.confidence)
    if (current === next) continue
    await monday.changeMultipleColumnValues(CAMPAIGN_EXCEPTIONS_BOARD_ID, item.id, {
      [CAMPAIGN_EXCEPTION_COLUMNS.confidence]: { label: next }
    })
    await monday.createUpdate(item.id, `XeroFlow confidence rule: ${next}. ${reason}`)
    changed++
  }
  return changed
}

async function applyRequestedItem(input: {
  monday: Awaited<ReturnType<typeof createMondayClient>>
  item: MondayItem
  claim: CampaignExceptionClaim
  globalHalt: boolean
  cronSecret: string
  tenantId: string
  now: Date
}): Promise<'applied' | 'failed'> {
  const { monday, item, claim, now } = input
  await setAutomationStatus(monday, item.id, 'Applying')
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const row = await loadBudgetTarget(item, period)
  if (!row) {
    await failItem(monday, item, claim.id, 'No unique current-period campaign matches the board Campaign ID and platform.')
    return 'failed'
  }
  const pacing = buildPacingReview([row], { now, period }).campaigns[0]
  if (!pacing) {
    await failItem(monday, item, claim.id, 'Current campaign pacing could not be computed.')
    return 'failed'
  }
  const validation = validateSafeBudgetRebase({
    exceptionType: campaignExceptionColumnText(item, CAMPAIGN_EXCEPTION_COLUMNS.exceptionType),
    confidence: campaignExceptionColumnText(item, CAMPAIGN_EXCEPTION_COLUMNS.confidence),
    campaignId: campaignExceptionColumnText(item, CAMPAIGN_EXCEPTION_COLUMNS.campaignId),
    firstServedDate: row.first_served_date,
    period,
    pacingRatio: pacing.pacingRatio,
    proposedDailyBudget: pacing.recommendedDailyBudget,
    boardRecommendedDailyBudget: parseRecommendedDailyBudget(campaignExceptionColumnText(item, CAMPAIGN_EXCEPTION_COLUMNS.recommendedAction)),
    monthlyBudget: pacing.budget,
    daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    dailyBudgetActionSupported: pacing.dailyBudgetActionSupported,
    globalHalt: input.globalHalt,
  })
  if ('reason' in validation) {
    await failItem(monday, item, claim.id, validation.reason)
    return 'failed'
  }

  const budgetIdentity = buildCampaignBudgetIdentity({
    tenantId: input.tenantId,
    clientId: row.client_id ?? null,
    platform: row.platform,
    accountId: row.account_id,
    connectionId: row.connection_id,
    campaignExternalId: row.campaign_id,
    campaignName: row.campaign_name,
    mediaSpendId: row.media_spend_id,
    period: row.period,
  })
  if (!budgetIdentity.key) {
    await failItem(monday, item, claim.id, `Campaign write identity is incomplete: ${budgetIdentity.issues.join(', ')}.`)
    return 'failed'
  }

  const action = await recordCampaignAction({
    mediaSpendId: row.media_spend_id,
    platform: pacing.platform,
    budgetKey: budgetIdentity.key,
    actionType: 'budget_update',
    actionStatus: 'approved',
    approvedAt: now.toISOString(),
    previousValue: { dailyBudget: pacing.currentDailyBudget },
    newValue: { dailyBudget: pacing.recommendedDailyBudget },
    reason: campaignExceptionColumnText(item, CAMPAIGN_EXCEPTION_COLUMNS.recommendedAction),
    externalRequestId: `monday:${item.id}:${item.updated_at}`,
    metadata: {
      source: 'monday_campaign_exception',
      mondayItemId: item.id,
      mondayItemUpdatedAt: item.updated_at,
      confidence: 'Safe to auto-apply',
      pacingRatio: pacing.pacingRatio,
      spendAsOf: pacing.spendAsOf,
    }
  })
  await execute(
    `UPDATE monday_campaign_exception_actions
        SET campaign_action_id = $2::uuid,
            media_spend_id = $3::uuid,
            previous_daily_budget = $4,
            applied_daily_budget = $5,
            updated_at = NOW()
      WHERE id = $1::uuid`,
    [claim.id, action.id, row.media_spend_id, pacing.currentDailyBudget, pacing.recommendedDailyBudget]
  )

  try {
    const result = await (globalThis as any).$fetch(
      `/api/agency/social/spend/${row.media_spend_id}/actions/${action.id}/execute`,
      {
        method: 'POST',
        body: {},
        headers: {
          'x-cron-secret': input.cronSecret,
          'x-xeroflow-monday-item': item.id,
        }
      }
    ) as { status?: string, appliedDailyBudget?: number, reason?: string, message?: string }
    if (result.status !== 'applied') {
      const reason = result.reason || result.message || `Platform action ended as ${result.status || 'unknown'}`
      await failItem(monday, item, claim.id, reason)
      return 'failed'
    }
    const applied = Number(result.appliedDailyBudget ?? pacing.recommendedDailyBudget)
    await finishClaim(claim.id, {
      status: 'applied', actionId: action.id, mediaSpendId: row.media_spend_id,
      previousDailyBudget: pacing.currentDailyBudget, appliedDailyBudget: applied,
    })
    await setAutomationStatus(monday, item.id, 'Applied')
    await monday.createUpdate(
      item.id,
      `XeroFlow applied the approved daily-budget rebase: A$${pacing.currentDailyBudget.toFixed(2)} → A$${applied.toFixed(2)} per day. `
      + `Read-back passed. Previous value A$${pacing.currentDailyBudget.toFixed(2)} is available for rollback for four hours. `
      + `Campaign action ${action.id}; spend as of ${pacing.spendAsOf || 'unknown'}.`
    )
    return 'applied'
  } catch (error) {
    await failItem(monday, item, claim.id, error instanceof Error ? error.message : 'Platform execution failed.')
    return 'failed'
  }
}

async function rollbackRequestedItem(input: {
  monday: Awaited<ReturnType<typeof createMondayClient>>
  item: MondayItem
  claim: CampaignExceptionClaim
  cronSecret: string
  now: Date
}): Promise<'rolled_back' | 'failed'> {
  const prior = await queryOne<{
    automation_id: string
    media_spend_id: string
    campaign_action_id: string
    previous_daily_budget: string | null
    applied_daily_budget: string | null
    budget_key: string | null
    platform: 'meta' | 'google_ads'
    completed_at: string
  }>(
    `SELECT automation.id::text AS automation_id,
            automation.media_spend_id::text,
            automation.campaign_action_id::text,
            automation.previous_daily_budget::text,
            automation.applied_daily_budget::text,
            action.budget_key,
            action.platform,
            automation.completed_at::text
       FROM monday_campaign_exception_actions automation
       JOIN campaign_action_log action ON action.id = automation.campaign_action_id
      WHERE automation.monday_item_id = $1
        AND automation.operation = 'apply'
        AND automation.status = 'applied'
        AND automation.completed_at >= $2::timestamptz - interval '4 hours'
      ORDER BY automation.completed_at DESC
      LIMIT 1`,
    [input.item.id, input.now.toISOString()]
  )
  if (!prior) {
    await failItem(input.monday, input.item, input.claim.id, 'Rollback window expired or no applied XeroFlow action exists for this item.')
    return 'failed'
  }
  const previousDaily = Number(prior.previous_daily_budget)
  const appliedDaily = Number(prior.applied_daily_budget)
  if (!(previousDaily > 0) || !(appliedDaily > 0)) {
    await failItem(input.monday, input.item, input.claim.id, 'The stored previous daily budget cannot be restored safely.')
    return 'failed'
  }
  const action = await recordCampaignAction({
    mediaSpendId: prior.media_spend_id,
    platform: prior.platform,
    budgetKey: prior.budget_key,
    actionType: 'budget_update',
    actionStatus: 'approved',
    approvedAt: input.now.toISOString(),
    previousValue: { dailyBudget: appliedDaily },
    newValue: { dailyBudget: previousDaily },
    reason: `Four-hour rollback requested on Monday item ${input.item.id}`,
    externalRequestId: `monday-rollback:${input.item.id}:${input.item.updated_at}`,
    metadata: {
      source: 'monday_campaign_exception',
      operation: 'rollback',
      mondayItemId: input.item.id,
      mondayItemUpdatedAt: input.item.updated_at,
      reversesCampaignActionId: prior.campaign_action_id,
    }
  })
  try {
    const result = await (globalThis as any).$fetch(
      `/api/agency/social/spend/${prior.media_spend_id}/actions/${action.id}/execute`,
      {
        method: 'POST', body: {},
        headers: { 'x-cron-secret': input.cronSecret, 'x-xeroflow-monday-item': input.item.id }
      }
    ) as { status?: string, appliedDailyBudget?: number, reason?: string, message?: string }
    if (result.status !== 'applied') {
      await failItem(input.monday, input.item, input.claim.id, result.reason || result.message || 'Rollback platform read-back failed.')
      return 'failed'
    }
    await execute(
      `UPDATE monday_campaign_exception_actions
          SET status = 'rolled_back', updated_at = NOW()
        WHERE id = $1::uuid`,
      [prior.automation_id]
    )
    await finishClaim(input.claim.id, {
      status: 'rolled_back', actionId: action.id, mediaSpendId: prior.media_spend_id,
      previousDailyBudget: appliedDaily, appliedDailyBudget: previousDaily,
    })
    await input.monday.createUpdate(
      input.item.id,
      `XeroFlow rolled back the daily budget within the four-hour guard window: A$${appliedDaily.toFixed(2)} → A$${previousDaily.toFixed(2)} per day. `
      + `Read-back passed. Campaign action ${action.id}.`
    )
    return 'rolled_back'
  } catch (error) {
    await failItem(input.monday, input.item, input.claim.id, error instanceof Error ? error.message : 'Rollback execution failed.')
    return 'failed'
  }
}

interface RollingCreativeRow {
  platform: 'meta' | 'google_ads'
  campaign_id: string
  campaign_name: string | null
  client_name: string | null
  creative_id: string
  ad_id: string | null
  ad_name: string | null
  title: string | null
  body: string | null
  last_served_date: string | null
}

async function createOfferExpiredExceptions(
  monday: Awaited<ReturnType<typeof createMondayClient>>,
  now: Date
): Promise<number> {
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const rows = await queryRows<RollingCreativeRow>(
    `SELECT ms.platform,
            ms.campaign_id,
            ms.campaign_name,
            client.name AS client_name,
            cc.creative_id,
            cc.ad_id,
            cc.ad_name,
            cc.title,
            cc.body,
            performance.last_served_date::text
       FROM campaign_creatives cc
       JOIN media_spend ms ON ms.id = cc.media_spend_id
       LEFT JOIN agency_clients client ON client.id = ms.client_id
       JOIN LATERAL (
         SELECT snapshot.last_served_date
           FROM ad_performance_snapshots snapshot
          WHERE snapshot.media_spend_id = ms.id
            AND (
              snapshot.ad_id = COALESCE(cc.ad_id, cc.creative_id)
              OR snapshot.creative_id = cc.creative_id
            )
          ORDER BY snapshot.synced_at DESC
          LIMIT 1
       ) performance ON TRUE
      WHERE ms.period = $1
        AND ms.platform IN ('meta', 'google_ads')
        AND ms.budget_rolling = TRUE
        AND ms.campaign_id IS NOT NULL
        AND COALESCE(ms.campaign_status, '') !~* '(paused|removed|disabled|archived)'
        AND performance.last_served_date >= $2::date - interval '7 days'
      ORDER BY performance.last_served_date DESC, ms.actual_spend DESC
      LIMIT 500`,
    [period, now.toISOString().slice(0, 10)]
  )
  let created = 0
  for (const row of rows) {
    const copy = [row.title, row.body].filter(Boolean).join('\n')
    const expiresOn = findExpiredOfferDate(copy, now)
    if (!expiresOn) continue
    const detection = await queryOne<{ id: string }>(
      `INSERT INTO monday_offer_expiry_detections
         (platform, campaign_id, creative_id, expires_on, status)
       VALUES ($1, $2, $3, $4::date, 'detected')
       ON CONFLICT (platform, campaign_id, creative_id, expires_on) DO NOTHING
       RETURNING id::text`,
      [row.platform, row.campaign_id, row.creative_id, expiresOn]
    )
    if (!detection) continue
    try {
      const platform = row.platform === 'google_ads' ? 'Google' : 'Meta'
      const today = now.toISOString().slice(0, 10)
      const item = await monday.createItem(
        CAMPAIGN_EXCEPTIONS_BOARD_ID,
        `${row.client_name || 'Client'} — Offer Expired (${row.campaign_name || row.campaign_id})`,
        {
          [CAMPAIGN_EXCEPTION_COLUMNS.exceptionType]: { label: 'Offer Expired' },
          [CAMPAIGN_EXCEPTION_COLUMNS.severity]: { label: 'Critical' },
          [CAMPAIGN_EXCEPTION_COLUMNS.status]: { label: 'Open' },
          [CAMPAIGN_EXCEPTION_COLUMNS.platform]: { label: platform },
          [CAMPAIGN_EXCEPTION_COLUMNS.client]: row.client_name || '',
          [CAMPAIGN_EXCEPTION_COLUMNS.campaign]: row.campaign_name || '',
          [CAMPAIGN_EXCEPTION_COLUMNS.campaignId]: row.campaign_id,
          [CAMPAIGN_EXCEPTION_COLUMNS.evidence]: {
            text: `Rolling campaign ad ${row.ad_name || row.ad_id || row.creative_id} was served on ${row.last_served_date || 'an unknown date'} while its copy carried the passed offer deadline ${expiresOn}. Copy: ${copy.slice(0, 1200)}`
          },
          [CAMPAIGN_EXCEPTION_COLUMNS.recommendedAction]: {
            text: 'Pause the campaign immediately, inform Traffic and the Account Manager, replace the expired assets, then verify every live ad before re-enabling.'
          },
          [CAMPAIGN_EXCEPTION_COLUMNS.firstDetected]: { date: today },
          [CAMPAIGN_EXCEPTION_COLUMNS.lastSeen]: { date: row.last_served_date || today },
          [CAMPAIGN_EXCEPTION_COLUMNS.whyThisFired]: {
            text: 'POLICY — Rolling Campaigns & Offer Expiry Control System (Garrix Lopena, monday item 12719936996). A campaign schedule cannot change without every live asset being cleared. Any passed date, deadline, countdown, or urgency claim inside a live rolling asset is treated as part of the campaign schedule. The policy response is to pause immediately and replace the asset.'
          },
          [CAMPAIGN_EXCEPTION_COLUMNS.confidence]: { label: 'Human only' },
          [CAMPAIGN_EXCEPTION_COLUMNS.automation]: { label: 'Not Requested' },
          [CAMPAIGN_EXCEPTION_COLUMNS.duration]: { label: 'Rolling' },
        },
        { createLabelsIfMissing: true }
      )
      await execute(
        `UPDATE monday_offer_expiry_detections
            SET status = 'created', monday_item_id = $2, updated_at = NOW()
          WHERE id = $1::uuid`,
        [detection.id, item.id]
      )
      created++
    } catch (error) {
      await execute(
        `UPDATE monday_offer_expiry_detections
            SET status = 'failed', failure_reason = $2, updated_at = NOW()
          WHERE id = $1::uuid`,
        [detection.id, (error instanceof Error ? error.message : 'Monday item creation failed').slice(0, 1000)]
      )
    }
  }
  return created
}

export async function runMondayCampaignExceptionAutomation(input: {
  cronSecret: string
  now?: Date
}): Promise<{ checked: number, requested: number, rollbacks: number, confidenceUpdated: number, offerExpiredCreated: number, applied: number, rolledBack: number, failed: number, globalHalt: boolean }> {
  const connection = await resolveMondayConnection()
  if (!connection) throw new Error('Monday connection is not configured')
  const monday = await createMondayClient(connection.accessToken)
  const now = input.now ?? new Date()
  const offerExpiredCreated = await createOfferExpiredExceptions(monday, now)
  let items = await fetchAllItems(monday)
  const confidenceUpdated = await refreshCampaignExceptionConfidence(monday, items, now)
  if (confidenceUpdated > 0) items = await fetchAllItems(monday)
  const globalHalt = hasOpenCampaignDataHalt(items)
  const requested = items.filter(item =>
    campaignExceptionColumnText(item, CAMPAIGN_EXCEPTION_COLUMNS.automation) === 'Apply Requested'
  )
  const rollbacks = items.filter(item =>
    campaignExceptionColumnText(item, CAMPAIGN_EXCEPTION_COLUMNS.automation) === 'Rolled Back'
  )
  const tenant = await queryOne<{ tenant_id: string }>(
    `SELECT tenant_id FROM xero_org_connection ORDER BY connected_at DESC LIMIT 1`
  )
  const tenantId = tenant?.tenant_id || '__default__'
  let applied = 0
  let rolledBack = 0
  let failed = 0
  for (const item of requested) {
    const claim = await claimItem(item, 'apply')
    if (!claim) continue
    try {
      const result = await applyRequestedItem({
        monday, item, claim, globalHalt, cronSecret: input.cronSecret, tenantId, now
      })
      if (result === 'applied') applied++
      else failed++
    } catch (error) {
      failed++
      await failItem(monday, item, claim.id, error instanceof Error ? error.message : 'Unhandled automation failure.').catch(() => {})
    }
  }
  for (const item of rollbacks) {
    const claim = await claimItem(item, 'rollback')
    if (!claim) continue
    try {
      const result = await rollbackRequestedItem({
        monday, item, claim, cronSecret: input.cronSecret, now
      })
      if (result === 'rolled_back') rolledBack++
      else failed++
    } catch (error) {
      failed++
      await failItem(monday, item, claim.id, error instanceof Error ? error.message : 'Unhandled rollback failure.').catch(() => {})
    }
  }
  return { checked: items.length, requested: requested.length, rollbacks: rollbacks.length, confidenceUpdated, offerExpiredCreated, applied, rolledBack, failed, globalHalt }
}
