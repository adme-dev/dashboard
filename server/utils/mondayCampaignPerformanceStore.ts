import { createMondayClient, type MondayClient, type MondayItem } from '~~/server/utils/mondayClient'
import { resolveMondayConnection } from '~~/server/utils/mondayConnection'
import {
  assertMondayCampaignBoardColumns,
  buildMondayCampaignSnapshot,
  MONDAY_CAMPAIGN_COLUMNS,
  MONDAY_MARKETING_BOARD_ID,
  selectActiveMondayCampaignJobs,
  type MondayCampaignSnapshot
} from '~~/server/utils/mondayCampaignJobs'
import type {
  CampaignLinkJob,
  CampaignLinkResult,
  CampaignSpendCandidate
} from '~~/server/utils/mondayCampaignPerformance'
import type {
  CampaignPerformanceReconcileDependencies,
  CampaignPerformanceState
} from '~~/server/utils/mondayCampaignPerformanceReconciler'
import { queryRowsFresh, transactionWithoutRetry } from '~~/server/utils/db'

export interface CampaignTaskAuthorityRow {
  mondayItemId: string
  taskId: string
  clientId: string
  clientName: string
  campaignId: string | null
}

async function fetchAllItems(client: MondayClient): Promise<MondayItem[]> {
  const items: MondayItem[] = []
  let cursor: string | undefined
  do {
    const page = await client.getItems(MONDAY_MARKETING_BOARD_ID, { limit: 100, cursor })
    items.push(...page.items)
    cursor = page.cursor
  } while (cursor)
  return items
}

function periodFor(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export function buildCampaignPerformanceState(
  snapshots: MondayCampaignSnapshot[],
  taskRows: CampaignTaskAuthorityRow[],
  candidates: CampaignSpendCandidate[]
): CampaignPerformanceState {
  const tasksByMondayId = new Map(taskRows.map(row => [row.mondayItemId, row]))
  const jobs: CampaignLinkJob[] = []
  const unmappedMondayItemIds: string[] = []

  for (const snapshot of snapshots) {
    const task = tasksByMondayId.get(snapshot.mondayItemId)
    if (!task) {
      unmappedMondayItemIds.push(snapshot.mondayItemId)
      continue
    }
    jobs.push({
      mondayItemId: snapshot.mondayItemId,
      taskId: task.taskId,
      clientId: task.clientId,
      clientName: task.clientName,
      title: snapshot.name,
      platform: snapshot.platform,
      campaignType: snapshot.campaignType,
      campaignId: task.campaignId || snapshot.campaignId,
      budget: snapshot.budget,
      linkedInXeroFlow: Boolean(task.campaignId)
    })
  }

  return { jobs, candidates, unmappedMondayItemIds }
}

export function shouldInitializeCampaignBudget(job: CampaignLinkJob): boolean {
  return !job.linkedInXeroFlow
    && job.budget !== null
    && Number.isFinite(job.budget)
    && job.budget > 0
}

export async function loadMondayCampaignPerformanceState(
  monday: MondayClient,
  now = new Date()
): Promise<CampaignPerformanceState> {
  const board = await monday.getBoard(MONDAY_MARKETING_BOARD_ID)
  if (!board || board.name !== 'Marketing') {
    throw new Error('Expected Monday Marketing board was not found')
  }
  assertMondayCampaignBoardColumns(board.columns || [])

  const snapshots = selectActiveMondayCampaignJobs(await fetchAllItems(monday))
    .map(item => buildMondayCampaignSnapshot(item, board.columns || []))
    .sort((left, right) => left.mondayItemId.localeCompare(right.mondayItemId))
  const mondayItemIds = snapshots.map(snapshot => snapshot.mondayItemId)
  if (mondayItemIds.length === 0) {
    return { jobs: [], candidates: [], unmappedMondayItemIds: [] }
  }

  const tasks = await queryRowsFresh<CampaignTaskAuthorityRow>(
    `SELECT t.monday_item_id AS "mondayItemId",
            t.id::text AS "taskId",
            project.client_id::text AS "clientId",
            client.name AS "clientName",
            campaign_link.text_value AS "campaignId"
       FROM tasks t
       JOIN projects project ON project.id = t.project_id
       JOIN agency_clients client ON client.id = project.client_id
       LEFT JOIN task_monday_column_values campaign_link
         ON campaign_link.task_id = t.id
        AND campaign_link.monday_column_id = $3
      WHERE t.monday_board_id = $1
        AND t.monday_item_id = ANY($2::text[])
        AND client.is_active = true`,
    [MONDAY_MARKETING_BOARD_ID, mondayItemIds, MONDAY_CAMPAIGN_COLUMNS.campaignId]
  )
  const clientIds = [...new Set(tasks.map(task => task.clientId))]
  const candidates = clientIds.length === 0
    ? []
    : await queryRowsFresh<CampaignSpendCandidate>(
        `SELECT id::text AS "mediaSpendId",
                client_id::text AS "clientId",
                platform,
                campaign_id AS "campaignId",
                campaign_name AS "campaignName"
           FROM media_spend
          WHERE client_id = ANY($1::uuid[])
            AND period = $2
            AND platform IN ('google_ads', 'meta')
            AND campaign_id IS NOT NULL
            AND campaign_name IS NOT NULL
          ORDER BY client_id, platform, campaign_id`,
        [clientIds, periodFor(now)]
      )

  return buildCampaignPerformanceState(snapshots, tasks, candidates)
}

export async function persistCampaignPerformanceMatch(
  job: CampaignLinkJob,
  match: Extract<CampaignLinkResult, { status: 'matched' }>
): Promise<void> {
  await transactionWithoutRetry(async (db) => {
    const expectedPlatform = job.platform === 'Google' ? 'google_ads' : 'meta'
    const authority = await db.query<{ id: string }>(
      `SELECT id::text AS id
         FROM media_spend
        WHERE id = $1::uuid
          AND client_id = $2::uuid
          AND platform = $3
          AND campaign_id = $4
        FOR UPDATE`,
      [match.mediaSpendId, job.clientId, expectedPlatform, match.campaignId]
    )
    if (authority.rows.length !== 1) {
      throw new Error(`Campaign authority changed for Monday item ${job.mondayItemId}`)
    }

    if (shouldInitializeCampaignBudget(job)) {
      await db.query(
        `UPDATE media_spend
            SET budget_allocated = $1, updated_at = NOW()
          WHERE id = $2::uuid`,
        [job.budget, match.mediaSpendId]
      )
    }

    await db.query(
      `INSERT INTO task_monday_column_values
         (task_id, monday_column_id, column_title, column_type, value_json,
          text_value, settings_str, migrated_at)
       VALUES ($1::uuid, $2, 'Campaign ID', 'text', $3::jsonb, $4, NULL, NOW())
       ON CONFLICT (task_id, monday_column_id) DO UPDATE SET
         column_title = EXCLUDED.column_title,
         column_type = EXCLUDED.column_type,
         value_json = EXCLUDED.value_json,
         text_value = EXCLUDED.text_value,
         migrated_at = NOW()`,
      [job.taskId, MONDAY_CAMPAIGN_COLUMNS.campaignId, JSON.stringify(match.campaignId), match.campaignId]
    )

    await db.query(
      `UPDATE monday_item_mappings
          SET column_values = COALESCE(column_values, '{}'::jsonb)
                || jsonb_build_object(
                  'Campaign ID', $1::text,
                  'Campaign Link Evidence', $2::text,
                  'Campaign Link Media Spend ID', $3::text
                ),
              reconciliation_status = 'current',
              last_seen_at = NOW(),
              updated_at = NOW()
        WHERE id = (
          SELECT id FROM monday_item_mappings
           WHERE monday_item_id = $4 AND task_id = $5::uuid
           ORDER BY updated_at DESC, created_at DESC
           LIMIT 1
        )`,
      [match.campaignId, match.evidence, match.mediaSpendId, job.mondayItemId, job.taskId]
    )
  })
}

export async function createMondayCampaignPerformanceDependencies(
  now = new Date()
): Promise<CampaignPerformanceReconcileDependencies> {
  const connection = await resolveMondayConnection()
  if (!connection) throw new Error('XeroFlow Monday connection is not configured')
  const monday = await createMondayClient(connection.accessToken)
  const account = await monday.testConnection()
  if (connection.accountId && account.id !== connection.accountId) {
    throw new Error('Stored Monday account does not match the connected account')
  }

  return {
    loadState: async () => await loadMondayCampaignPerformanceState(monday, now),
    writeMondayCampaignId: async (job, campaignId) => {
      await monday.changeMultipleColumnValues(MONDAY_MARKETING_BOARD_ID, job.mondayItemId, {
        [MONDAY_CAMPAIGN_COLUMNS.campaignId]: campaignId
      })
    },
    persistMatch: persistCampaignPerformanceMatch
  }
}
