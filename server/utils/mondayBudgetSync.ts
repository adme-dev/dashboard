import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { createMondayClient } from '~~/server/utils/mondayClient'
import { expectedToDate } from '~~/server/utils/anomalyDetection/adPacingMath'

/**
 * monday Client Budget → XeroFlow budget sync, keyed on Campaign ID.
 *
 * The Marketing board (13392458) is the operational budget board: nearly every live
 * campaign item carries a numeric `Client Budget` ($/mth) and a platform `Campaign ID`.
 * XeroFlow's pacing engine reads budgets from media_spend.budget_allocated — which is
 * unset for most of the portfolio. This sync closes that gap in both directions:
 *
 *   monday → XeroFlow: Client Budget lands on media_spend.budget_allocated for the
 *     current period, keyed on campaign_id, with a budget_audit_log row per change.
 *   XeroFlow → monday: the machine-written columns (Spend MTD, Pace %, Pacing Status,
 *     Last Synced, Budget Source) are written back so the board itself shows pacing —
 *     including "No Spend" (live campaign, $0 in 24h) and "No Budget Set".
 *
 * Gated by MONDAY_BUDGET_SYNC_ENABLED. Never writes to ad platforms.
 */

const MONDAY_MARKETING_BOARD_ID = '13392458'

/** Column ids on the Marketing board. Machine-written columns created 2026-08-20. */
export const MARKETING_BOARD_COLUMNS = {
  campaignId: 'text_mm67hxk4',
  clientBudget: 'numeric',
  platform: 'dropdown_mm1m5vxy',
  duration: 'color_mm1mz7k2',
  campaignEndDate: 'date_mm67aq9h',
  spendMtd: 'numeric_mm6dn2tz',
  pacePct: 'numeric_mm6d813f',
  pacingStatus: 'color_mm6d9z92',
  lastSynced: 'date_mm6dnf77',
  budgetSource: 'color_mm6d4nhy'
} as const

export type PacingStatusLabel = 'Overpacing' | 'On Pace' | 'Underpacing' | 'No Spend' | 'No Budget Set'

export interface MondayBudgetRow {
  itemId: string
  itemName: string
  /** First campaign id in the cell; multi-id cells are reported, not guessed at. */
  campaignId: string | null
  extraCampaignIds: string[]
  clientBudget: number | null
}

export interface CampaignSpendSnapshot {
  mediaSpendIds: string[]
  budgetAllocated: number | null
  spendMtd: number
  spendLast24h: number
  lastSpendDate: string | null
}

export interface MondayBudgetSyncReport {
  itemsSeen: number
  itemsWithCampaignId: number
  budgetsWritten: number
  boardRowsWritten: number
  multiIdItems: string[]
  unmatchedCampaignIds: string[]
  errors: string[]
}

/** Parse the board rows we care about out of raw monday items. Exported for tests. */
export function parseMondayBudgetRows(items: Array<{
  id: string
  name: string
  column_values?: Array<{ id: string, text?: string | null }>
}>): MondayBudgetRow[] {
  return items.map((item) => {
    const byId = new Map((item.column_values ?? []).map(cv => [cv.id, cv.text ?? null]))
    const rawIds = String(byId.get(MARKETING_BOARD_COLUMNS.campaignId) ?? '')
      .split(/[,\s]+/)
      .map(part => part.trim())
      .filter(Boolean)
    const rawBudget = byId.get(MARKETING_BOARD_COLUMNS.clientBudget)
    const budget = rawBudget == null || rawBudget === '' ? NaN : Number(String(rawBudget).replace(/[^0-9.]/g, ''))
    return {
      itemId: item.id,
      itemName: item.name,
      campaignId: rawIds[0] ?? null,
      extraCampaignIds: rawIds.slice(1),
      clientBudget: Number.isFinite(budget) && budget > 0 ? budget : null
    }
  })
}

/** Classify the board-facing pacing status. Exported for tests. */
export function classifyPacingStatus(input: {
  budget: number | null
  spendMtd: number
  spendLast24h: number
  now?: Date
  spendAsOf?: string | null
}): { status: PacingStatusLabel, pacePct: number | null } {
  const requestNow = input.now ?? new Date()
  const coverageDate = input.spendAsOf ? new Date(`${input.spendAsOf}T23:59:59Z`) : requestNow
  const now = Number.isNaN(coverageDate.getTime()) ? requestNow : coverageDate
  if (!input.budget || input.budget <= 0) return { status: 'No Budget Set', pacePct: null }
  const expected = expectedToDate(input.budget, now)
  const pacePct = expected > 0 ? Math.round((input.spendMtd / expected) * 1000) / 10 : null
  // Zero spend in the last 24h on a budgeted campaign is the silent failure mode
  // (payment failure / disapproval / paused ad set) — it outranks the pace bands.
  if (input.spendLast24h <= 0 && now.getDate() > 1) return { status: 'No Spend', pacePct }
  if (pacePct === null) return { status: 'On Pace', pacePct }
  if (pacePct > 110) return { status: 'Overpacing', pacePct }
  if (pacePct < 85) return { status: 'Underpacing', pacePct }
  return { status: 'On Pace', pacePct }
}

async function loadCampaignSnapshots(campaignIds: string[]): Promise<Map<string, CampaignSpendSnapshot>> {
  if (campaignIds.length === 0) return new Map()
  const rows = await queryRows<{
    campaign_id: string
    ids: string[]
    budget_allocated: string | null
    spend_mtd: string | null
    spend_24h: string | null
    last_spend: string | null
  }>(
    `SELECT ms.campaign_id,
            ARRAY_AGG(ms.id::text) AS ids,
            MAX(ms.budget_allocated) AS budget_allocated,
            SUM(ds.spend) FILTER (WHERE ds.spend_date >= date_trunc('month', now())::date) AS spend_mtd,
            SUM(ds.spend) FILTER (WHERE ds.spend_date >= (now() - interval '1 day')::date) AS spend_24h,
            MAX(ds.spend_date)::text AS last_spend
       FROM media_spend ms
  LEFT JOIN daily_spend ds ON ds.media_spend_id = ms.id
      WHERE ms.campaign_id = ANY($1)
        AND ms.period = to_char(now(), 'YYYY-MM')
      GROUP BY ms.campaign_id`,
    [campaignIds]
  )
  return new Map(rows.map(row => [row.campaign_id, {
    mediaSpendIds: row.ids,
    budgetAllocated: row.budget_allocated == null ? null : Number(row.budget_allocated),
    spendMtd: Number(row.spend_mtd ?? 0),
    spendLast24h: Number(row.spend_24h ?? 0),
    lastSpendDate: row.last_spend
  }]))
}

async function resolveSystemActorId(): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM team_members WHERE is_active = TRUE AND user_role = 'owner' ORDER BY created_at LIMIT 1`,
    []
  )
  return row?.id ?? null
}

export async function runMondayBudgetSync(options: { writeBackToMonday?: boolean } = {}): Promise<MondayBudgetSyncReport> {
  if (process.env.MONDAY_BUDGET_SYNC_ENABLED !== 'true') {
    throw new Error('Monday budget sync is disabled (MONDAY_BUDGET_SYNC_ENABLED)')
  }
  const report: MondayBudgetSyncReport = {
    itemsSeen: 0,
    itemsWithCampaignId: 0,
    budgetsWritten: 0,
    boardRowsWritten: 0,
    multiIdItems: [],
    unmatchedCampaignIds: [],
    errors: []
  }

  const client = await createMondayClient()
  const items: Array<{ id: string, name: string, column_values?: Array<{ id: string, text?: string | null }> }> = []
  let cursor: string | undefined
  do {
    const page = await client.getItems(MONDAY_MARKETING_BOARD_ID, { limit: 100, cursor })
    items.push(...(page.items as typeof items))
    cursor = page.cursor
  } while (cursor)

  const rows = parseMondayBudgetRows(items)
  report.itemsSeen = rows.length
  const budgetRows = rows.filter(row => row.campaignId)
  report.itemsWithCampaignId = budgetRows.length
  report.multiIdItems = rows.filter(row => row.extraCampaignIds.length > 0).map(row => row.itemName)

  const snapshots = await loadCampaignSnapshots(budgetRows.map(row => row.campaignId as string))
  const actorId = await resolveSystemActorId()
  const today = new Date().toISOString().slice(0, 10)

  for (const row of budgetRows) {
    const snapshot = snapshots.get(row.campaignId as string)
    if (!snapshot) {
      report.unmatchedCampaignIds.push(`${row.itemName} (${row.campaignId})`)
      continue
    }

    // monday → XeroFlow: land the Client Budget on this period's media_spend rows.
    if (row.clientBudget != null && actorId && snapshot.budgetAllocated !== row.clientBudget) {
      try {
        for (const mediaSpendId of snapshot.mediaSpendIds) {
          await execute(
            `UPDATE media_spend SET budget_allocated = $1, updated_at = NOW() WHERE id = $2::uuid`,
            [row.clientBudget, mediaSpendId]
          )
          await execute(
            `INSERT INTO budget_audit_log (media_spend_id, previous_budget, new_budget, changed_by, note)
             VALUES ($1::uuid, $2, $3, $4::uuid, $5)`,
            [mediaSpendId, snapshot.budgetAllocated ?? 0, row.clientBudget, actorId,
              `monday budget sync: Marketing board item ${row.itemId} (${row.itemName})`]
          )
        }
        report.budgetsWritten++
      } catch (error: unknown) {
        report.errors.push(`budget write failed for ${row.itemName}: ${error instanceof Error ? error.message : 'unknown'}`)
        continue
      }
    }

    // XeroFlow → monday: the machine-written pacing columns.
    if (options.writeBackToMonday !== false) {
      const budget = row.clientBudget ?? snapshot.budgetAllocated
      const { status, pacePct } = classifyPacingStatus({
        budget,
        spendMtd: snapshot.spendMtd,
        spendLast24h: snapshot.spendLast24h,
        spendAsOf: snapshot.lastSpendDate
      })
      try {
        await client.changeMultipleColumnValues(MONDAY_MARKETING_BOARD_ID, row.itemId, {
          [MARKETING_BOARD_COLUMNS.spendMtd]: String(Math.round(snapshot.spendMtd * 100) / 100),
          [MARKETING_BOARD_COLUMNS.pacePct]: pacePct == null ? '' : String(pacePct),
          [MARKETING_BOARD_COLUMNS.pacingStatus]: { label: status },
          [MARKETING_BOARD_COLUMNS.lastSynced]: { date: today },
          [MARKETING_BOARD_COLUMNS.budgetSource]: { label: row.clientBudget != null ? 'Client Budget' : 'Platform Budget' }
        })
        report.boardRowsWritten++
      } catch (error: unknown) {
        report.errors.push(`monday write-back failed for ${row.itemName}: ${error instanceof Error ? error.message : 'unknown'}`)
      }
    }
  }

  return report
}
