import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { createMondayClient } from '~~/server/utils/mondayClient'
import {
  buildMondayCutoverPlan,
  type MondayCutoverSourceRecord
} from '~~/server/utils/mondayCutoverPlan'

const MAX_SOURCE_ITEMS = 500
const MAX_SOURCE_PAGES = 10
const MAX_SUBITEM_PARENTS = 100
const MAX_SOURCE_SUBITEMS = 5000
const MAX_TARGET_TASKS = 5500

const RequestSchema = z.strictObject({
  boardId: z.string().trim().regex(/^\d+$/).max(30),
  targetBoardId: z.string().uuid()
})

const EntityStateSchema = z.enum(['active', 'archived', 'deleted'])
const TimestampSchema = z.string().datetime({ offset: true })

const ExternalBoardSchema = z.object({
  id: z.string().trim().regex(/^\d+$/).max(30),
  name: z.string().trim().min(1).max(500),
  state: EntityStateSchema,
  groups: z.array(z.object({
    id: z.string().trim().min(1).max(255),
    title: z.string().trim().min(1).max(500)
  })).max(100).optional(),
  columns: z.array(z.object({
    id: z.string().trim().min(1).max(255),
    title: z.string().trim().min(1).max(500),
    type: z.string().trim().min(1).max(100)
  })).max(200).optional()
})

const ExternalColumnValueSchema = z.object({
  id: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(100),
  text: z.string().max(5000).nullable().optional()
})

const ExternalItemSchema = z.object({
  id: z.string().trim().regex(/^\d+$/).max(30),
  name: z.string().trim().min(1).max(1000),
  state: EntityStateSchema,
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  group_id: z.string().trim().max(255).optional(),
  group_title: z.string().trim().max(500).optional(),
  column_values: z.array(ExternalColumnValueSchema).max(200).optional(),
  subitems: z.array(z.object({
    id: z.string().trim().regex(/^\d+$/).max(30)
  })).max(1000).optional()
})

const ExternalItemsPageSchema = z.object({
  items: z.array(ExternalItemSchema).max(MAX_SOURCE_ITEMS),
  cursor: z.string().min(1).max(2000).refine(
    value => !/["\\\r\n]/.test(value),
    'Unsafe Monday cursor'
  ).optional()
})

function toSourceRecord(
  item: z.infer<typeof ExternalItemSchema>,
  clientColumnId: string | null,
  parentSourceId: string | null
): MondayCutoverSourceRecord {
  const clientHint = parentSourceId
    ? null
    : (item.column_values ?? []).find(value => value.id === clientColumnId)?.text?.trim().slice(0, 500) || null

  return {
    id: item.id,
    title: item.name.slice(0, 500),
    state: item.state,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    parentSourceId,
    groupId: parentSourceId ? null : item.group_id ?? null,
    groupTitle: parentSourceId ? null : item.group_title ?? null,
    subitemCount: item.subitems?.length ?? 0,
    clientHint
  }
}

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])

  const parsed = RequestSchema.safeParse({
    boardId: getRouterParam(event, 'boardId'),
    targetBoardId: getQuery(event).targetBoardId
  })
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Monday cutover plan request'
    })
  }

  try {
    const targetBoard = await queryOne(
      'SELECT id, name FROM departments WHERE id = $1::uuid',
      [parsed.data.targetBoardId]
    )
    if (!targetBoard) {
      throw createError({ statusCode: 404, statusMessage: 'Zero target board not found' })
    }

    const client = await createMondayClient()
    const rawSourceBoard = await client.getBoard(parsed.data.boardId)
    if (!rawSourceBoard) {
      throw createError({ statusCode: 404, statusMessage: 'Monday source board not found' })
    }
    const sourceBoard = ExternalBoardSchema.parse(rawSourceBoard)
    if (sourceBoard.id !== parsed.data.boardId) {
      throw new Error('Monday source board identity mismatch')
    }

    const sourceItems: Array<z.infer<typeof ExternalItemSchema>> = []
    let cursor: string | undefined
    let isSourceTruncated = false
    let sourcePages = 0

    do {
      sourcePages += 1
      const page = ExternalItemsPageSchema.parse(await client.getItems(parsed.data.boardId, {
        limit: 100,
        cursor
      }))
      const remaining = MAX_SOURCE_ITEMS - sourceItems.length
      sourceItems.push(...page.items.slice(0, remaining))
      cursor = page.cursor
      if (page.items.length > remaining) isSourceTruncated = true
    } while (cursor && sourceItems.length < MAX_SOURCE_ITEMS && sourcePages < MAX_SOURCE_PAGES)

    if (cursor) isSourceTruncated = true

    const clientColumn = (sourceBoard.columns ?? []).find(column => (
      column.type === 'dropdown' && /(dealer\s+group|client)/i.test(column.title)
    ))
    const sourceRecords: MondayCutoverSourceRecord[] = sourceItems.map(item => (
      toSourceRecord(item, clientColumn?.id ?? null, null)
    ))

    const parentsWithSubitems = sourceItems.filter(item => (item.subitems?.length ?? 0) > 0)
    if (parentsWithSubitems.length > MAX_SUBITEM_PARENTS) isSourceTruncated = true

    for (const parent of parentsWithSubitems.slice(0, MAX_SUBITEM_PARENTS)) {
      const subitems = z.array(ExternalItemSchema).max(1000).parse(await client.getSubitems(parent.id))
      const remaining = MAX_SOURCE_SUBITEMS - (sourceRecords.length - sourceItems.length)
      sourceRecords.push(...subitems.slice(0, remaining).map(subitem => (
        toSourceRecord(subitem, null, parent.id)
      )))
      if (subitems.length > remaining) {
        isSourceTruncated = true
        break
      }
    }

    const [targetTasks, clients] = await Promise.all([
      queryRows(
        `SELECT t.id,
                t.title,
                t.parent_task_id AS "parentTaskId",
                COALESCE(ts.name, 'Unknown') AS "statusName",
                mapping.monday_item_id AS "mondayItemId",
                mapping.monday_board_id AS "mondayBoardId",
                mapping.reconciliation_status AS "reconciliationStatus"
           FROM tasks t
           LEFT JOIN task_statuses ts ON ts.id = t.status_id
           LEFT JOIN LATERAL (
             SELECT mim.monday_item_id,
                    mim.monday_board_id,
                    mim.reconciliation_status
               FROM monday_item_mappings mim
              WHERE mim.task_id = t.id
                AND mim.status = 'completed'
              ORDER BY mim.updated_at DESC
              LIMIT 1
           ) mapping ON TRUE
          WHERE t.department_id = $1::uuid
          ORDER BY t.parent_task_id NULLS FIRST, t.sort_order, t.created_at
          LIMIT 5501`,
        [parsed.data.targetBoardId]
      ),
      queryRows(
        `SELECT ac.id,
                ac.name,
                profile.id AS "measurementProfileId"
           FROM agency_clients ac
           LEFT JOIN client_measurement_profiles profile ON profile.client_id = ac.id
          WHERE ac.is_active = TRUE
          ORDER BY ac.name
          LIMIT 2000`
      )
    ])

    return buildMondayCutoverPlan({
      sourceBoard: {
        id: sourceBoard.id,
        name: sourceBoard.name,
        state: sourceBoard.state,
        groups: sourceBoard.groups ?? [],
        columns: sourceBoard.columns ?? []
      },
      sourceRecords,
      targetBoard: {
        id: String(targetBoard.id),
        name: String(targetBoard.name)
      },
      targetTasks: targetTasks.slice(0, MAX_TARGET_TASKS),
      clients,
      isSourceTruncated,
      isTargetTruncated: targetTasks.length > MAX_TARGET_TASKS
    })
  } catch (error: unknown) {
    if ((error as { statusCode?: number })?.statusCode === 404) throw error
    console.error('[monday-cutover-plan] read failed', {
      errorClass: error instanceof Error ? error.name : 'UnknownError'
    })
    throw createError({
      statusCode: 502,
      statusMessage: 'Monday cutover plan unavailable'
    })
  }
})
