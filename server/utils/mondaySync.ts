/**
 * Monday.com Live Sync Utilities
 * Handles syncing data from Monday.com to local database
 */

import { MondayClient, type MondayAsset, type MondayUpdate } from './mondayClient'
import { query, transaction } from './db'
import { deleteFile, generateStorageKey, getMaxFileSize, uploadFile, validateFileType } from './storage'

export interface SyncOptions {
  syncComments?: boolean
  syncFiles?: boolean
  syncSubitems?: boolean
  skipArchived?: boolean
}

export interface MondaySyncResult {
  itemsSynced: number
  itemsFailed: number
  errors: string[]
}

export interface NormalizedMondayComment {
  sourceId: string
  parentSourceId: string | null
  creatorId: string | null
  content: string
  createdAt: string | null
  sourceData: Record<string, unknown>
}

const MAX_COMMENT_LENGTH = 50_000

export function validateMondayAsset(
  asset: MondayAsset,
  contentType: string
): { ok: true, filename: string } | { ok: false, reason: string } {
  if (!asset?.id || !asset.name || !Number.isFinite(asset.file_size) || asset.file_size < 0) {
    return { ok: false, reason: 'Malformed Monday asset metadata' }
  }
  if (asset.file_size > getMaxFileSize('attachments')) {
    return { ok: false, reason: 'Monday asset exceeds the 50 MB attachment limit' }
  }
  if (!validateFileType(contentType, 'attachments')) {
    return { ok: false, reason: `Unsupported Monday attachment type: ${contentType}` }
  }
  const basename = asset.name.replace(/\\/g, '/').split('/').pop() || ''
  const filename = basename.replace(/[^a-zA-Z0-9._ -]/g, '-').slice(0, 255)
  if (!filename || filename === '.' || filename === '..') {
    return { ok: false, reason: 'Invalid Monday attachment filename' }
  }
  return { ok: true, filename }
}

function validTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null
  return new Date(value).toISOString()
}

/** Convert third-party update data into bounded, display-safe activity records. */
export function normalizeMondayComments(updates: MondayUpdate[]): NormalizedMondayComment[] {
  const comments: NormalizedMondayComment[] = []

  for (const update of updates) {
    const content = String(update.text_body || '').trim().slice(0, MAX_COMMENT_LENGTH)
    if (update.id && content) {
      comments.push({
        sourceId: String(update.id),
        parentSourceId: null,
        creatorId: update.creator_id ? String(update.creator_id) : null,
        content,
        createdAt: validTimestamp(update.created_at),
        sourceData: update as unknown as Record<string, unknown>
      })
    }

    for (const reply of update.replies || []) {
      const replyContent = String(reply.text_body || '').trim().slice(0, MAX_COMMENT_LENGTH)
      if (!reply.id || !replyContent) continue
      comments.push({
        sourceId: String(reply.id),
        parentSourceId: String(update.id),
        creatorId: reply.creator_id ? String(reply.creator_id) : null,
        content: replyContent,
        createdAt: validTimestamp(reply.created_at),
        sourceData: reply as unknown as Record<string, unknown>
      })
    }
  }

  return comments
}

/**
 * Sync a Monday.com board to a department
 */
export async function syncMondayBoardToDepartment(
  client: MondayClient,
  boardId: string,
  departmentId: string,
  options: SyncOptions = {}
): Promise<MondaySyncResult> {
  const result: MondaySyncResult = {
    itemsSynced: 0,
    itemsFailed: 0,
    errors: []
  }

  try {
    // Get board details
    const board = await client.getBoard(boardId)
    if (!board) {
      throw new Error(`Board ${boardId} not found`)
    }

    // Get all items from the board
    let allItems: any[] = []
    let cursor: string | undefined
    
    do {
      const page = await client.getItems(boardId, { limit: 100, cursor })
      allItems = allItems.concat(page.items)
      cursor = page.cursor
    } while (cursor)

    // Map Monday columns to our task structure
    const columnMapping = createColumnMapping(board.columns || [])

    // Process each item
    for (const item of allItems) {
      try {
        await syncItemToTask(client, item, departmentId, columnMapping, options)
        result.itemsSynced++
      } catch (error: any) {
        result.itemsFailed++
        result.errors.push(`Item ${item.id}: ${error.message}`)
      }
    }

    return result
  } catch (error: any) {
    throw new Error(`Failed to sync board ${boardId}: ${error.message}`)
  }
}

/**
 * Sync a single Monday item to a task
 */
async function syncItemToTask(
  client: MondayClient,
  item: any,
  departmentId: string,
  columnMapping: ColumnMapping,
  options: SyncOptions
): Promise<void> {
  const comments = options.syncComments
    ? normalizeMondayComments(await client.getUpdates([String(item.id)]))
    : []

  let syncedTaskId = ''
  await transaction(async (trx) => {
    // Check if task already exists
    const existing = await trx.query(
      'SELECT id FROM tasks WHERE monday_item_id = $1',
      [item.id]
    )

    // Extract values from column_values
    const columnValues = item.column_values || []
    
    // Map Monday status to our status
    const statusValue = getColumnValue(columnValues, columnMapping.status)
    const statusId = await resolveStatusId(trx, departmentId, statusValue)

    // Get other mapped values
    const priority = mapPriority(getColumnValue(columnValues, columnMapping.priority))
    const dueDate = parseDate(getColumnValue(columnValues, columnMapping.dueDate))
    const assigneeId = await resolveAssigneeId(trx, getColumnValue(columnValues, columnMapping.assignee))

    const taskData = {
      title: item.name,
      department_id: departmentId,
      status_id: statusId,
      priority,
      due_date: dueDate,
      assignee_id: assigneeId,
      monday_item_id: item.id,
      monday_board_id: item.board_id,
      updated_at: new Date().toISOString()
    }
    let taskId: string
    if (existing.rows.length > 0) {
      // Update existing task
      taskId = existing.rows[0].id
      await trx.query(`
        UPDATE tasks SET
          title = $1,
          status_id = $2,
          priority = $3,
          due_date = $4,
          assignee_id = $5,
          updated_at = $6
        WHERE id = $7
      `, [
        taskData.title,
        taskData.status_id,
        taskData.priority,
        taskData.due_date,
        taskData.assignee_id,
        taskData.updated_at,
        taskId
      ])
    } else {
      // Create new task
      const inserted = await trx.query(`
        INSERT INTO tasks (
          title, department_id, status_id, priority, due_date,
          assignee_id, monday_item_id, monday_board_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING id
      `, [
        taskData.title,
        taskData.department_id,
        taskData.status_id,
        taskData.priority,
        taskData.due_date,
        taskData.assignee_id,
        taskData.monday_item_id,
        taskData.monday_board_id
      ])
      taskId = inserted.rows[0].id
    }
    syncedTaskId = taskId

    for (const comment of comments) {
      const imported = await trx.query(
        `INSERT INTO monday_sync_comment_mappings
           (monday_comment_id, monday_item_id, task_id, parent_monday_comment_id,
            monday_creator_id, body_text, source_data, source_created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
         ON CONFLICT (monday_comment_id) DO NOTHING
         RETURNING id`,
        [comment.sourceId, String(item.id), taskId, comment.parentSourceId,
          comment.creatorId, comment.content, JSON.stringify(comment.sourceData), comment.createdAt]
      )
      if (!imported.rows.length) continue

      const activity = await trx.query(
        `INSERT INTO task_activities
           (task_id, activity_type, content, new_value, is_internal, created_at)
         VALUES ($1, 'comment', $2, $3::jsonb, false, COALESCE($4::timestamptz, NOW()))
         RETURNING id`,
        [taskId, comment.content, JSON.stringify({
          source: 'monday',
          mondayCommentId: comment.sourceId,
          parentMondayCommentId: comment.parentSourceId
        }), comment.createdAt]
      )
      await trx.query(
        'UPDATE monday_sync_comment_mappings SET activity_id = $1 WHERE id = $2',
        [activity.rows[0].id, imported.rows[0].id]
      )
    }

    // Sync subitems if enabled
    if (options.syncSubitems) {
      const subitems = await client.getSubitems(item.id)
      for (const subitem of subitems) {
        // Create subtasks
        await syncSubitemToSubtask(trx, subitem, taskId, departmentId)
      }
    }
  })

  if (options.syncFiles && syncedTaskId) {
    await syncMondayFiles(client, String(item.id), syncedTaskId)
  }
}

async function syncMondayFiles(client: MondayClient, itemId: string, taskId: string): Promise<void> {
  const assets = await client.getAssets([itemId])
  for (const asset of assets) {
    const existing = await query(
      'SELECT id FROM monday_sync_file_mappings WHERE monday_asset_id = $1 LIMIT 1',
      [String(asset.id)]
    )
    if (existing.length) continue

    // Metadata is checked before download to avoid needless large transfers.
    const declaredType = contentTypeForExtension(asset.file_extension)
    const metadataCheck = validateMondayAsset(asset, declaredType)
    if ('reason' in metadataCheck) throw new Error(metadataCheck.reason)

    const downloaded = await client.downloadFile(String(asset.id))
    const check = validateMondayAsset({ ...asset, name: downloaded.filename, file_size: downloaded.buffer.length }, downloaded.contentType)
    if ('reason' in check) throw new Error(check.reason)

    const storageKey = generateStorageKey('attachments', check.filename, taskId)
    const stored = await uploadFile(downloaded.buffer, storageKey, downloaded.contentType, {
      source: 'monday',
      mondayAssetId: String(asset.id),
      mondayItemId: itemId
    })

    try {
      const attached = await transaction(async (trx) => {
        const mapping = await trx.query(
          `INSERT INTO monday_sync_file_mappings
             (monday_asset_id, monday_item_id, task_id, source_file_name,
              source_file_size, source_url, storage_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (monday_asset_id) DO NOTHING
           RETURNING id`,
          [String(asset.id), itemId, taskId, check.filename, stored.size, asset.url || null, stored.key]
        )
        if (!mapping.rows.length) return false

        const attachment = await trx.query(
          `INSERT INTO task_attachments
             (task_id, file_name, file_url, storage_key, file_type, file_size, created_at)
           VALUES ($1, $2, $3, $3, $4, $5, COALESCE($6::timestamptz, NOW()))
           RETURNING id`,
          [taskId, check.filename, stored.key, downloaded.contentType, stored.size,
            validTimestamp(asset.created_at || asset.uploaded_at)]
        )
        await trx.query(
          'UPDATE monday_sync_file_mappings SET attachment_id = $1 WHERE id = $2',
          [attachment.rows[0].id, mapping.rows[0].id]
        )
        return true
      })
      if (!attached) await deleteFile(storageKey).catch(() => undefined)
    } catch (error) {
      await deleteFile(storageKey).catch(() => undefined)
      throw error
    }
  }
}

function contentTypeForExtension(extension: string | undefined): string {
  const types: Record<string, string> = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', txt: 'text/plain',
    csv: 'text/csv', json: 'application/json', zip: 'application/zip',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  }
  return types[String(extension || '').toLowerCase()] || 'application/octet-stream'
}

/**
 * Sync a Monday subitem to a subtask
 */
async function syncSubitemToSubtask(
  trx: any,
  subitem: any,
  parentTaskId: string | undefined,
  departmentId: string
): Promise<void> {
  if (!parentTaskId) return

  const existing = await trx.query(
    'SELECT id FROM tasks WHERE monday_item_id = $1',
    [subitem.id]
  )

  if (existing.rows.length > 0) {
    await trx.query(`
      UPDATE tasks SET
        title = $1,
        parent_task_id = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [subitem.name, parentTaskId, existing.rows[0].id])
  } else {
    await trx.query(`
      INSERT INTO tasks (
        title, parent_task_id, department_id, status_id,
        monday_item_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    `, [
      subitem.name,
      parentTaskId,
      departmentId,
      null, // Will need to map status
      subitem.id
    ])
  }
}

// Helper types and functions
interface ColumnMapping {
  status?: string
  priority?: string
  dueDate?: string
  assignee?: string
}

function createColumnMapping(columns: any[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  
  for (const col of columns) {
    const title = col.title?.toLowerCase() || ''
    
    if (col.type === 'status' || title.includes('status') || title.includes('state')) {
      mapping.status = col.id
    } else if (title.includes('priority') || title.includes('urgent')) {
      mapping.priority = col.id
    } else if (col.type === 'date' && (title.includes('due') || title.includes('deadline'))) {
      mapping.dueDate = col.id
    } else if (col.type === 'people' || col.type === 'person' || title.includes('assignee') || title.includes('owner')) {
      mapping.assignee = col.id
    }
  }
  
  return mapping
}

function getColumnValue(columnValues: any[], columnId?: string): any {
  if (!columnId) return null
  const col = columnValues.find(c => c.id === columnId)
  return col?.text || col?.value || null
}

function mapPriority(mondayPriority: string | null): string {
  if (!mondayPriority) return 'medium'
  const p = mondayPriority.toLowerCase()
  if (p.includes('urgent') || p.includes('critical')) return 'urgent'
  if (p.includes('high')) return 'high'
  if (p.includes('low')) return 'low'
  return 'medium'
}

function parseDate(dateValue: string | null): string | null {
  if (!dateValue) return null
  try {
    const date = new Date(dateValue)
    return date.toISOString().split('T')[0]
  } catch {
    return null
  }
}

async function resolveStatusId(trx: any, departmentId: string, statusValue: string | null): Promise<string | null> {
  if (!statusValue) {
    // Return default status for department
    const result = await trx.query(`
      SELECT id FROM task_statuses 
      WHERE department_id = $1 AND is_default = true
      LIMIT 1
    `, [departmentId])
    return result.rows[0]?.id || null
  }

  // Try to find matching status by name
  const result = await trx.query(`
    SELECT id FROM task_statuses 
    WHERE department_id = $1 AND LOWER(name) = LOWER($2)
    LIMIT 1
  `, [departmentId, statusValue])

  if (result.rows[0]) {
    return result.rows[0].id
  }

  // Return default if no match
  const defaultResult = await trx.query(`
    SELECT id FROM task_statuses 
    WHERE department_id = $1 AND is_default = true
    LIMIT 1
  `, [departmentId])
  return defaultResult.rows[0]?.id || null
}

async function resolveAssigneeId(trx: any, assigneeValue: string | null): Promise<string | null> {
  if (!assigneeValue) return null
  
  // Try to match by name or email
  const result = await trx.query(`
    SELECT id FROM team_members 
    WHERE LOWER(name) = LOWER($1) OR LOWER(email) = LOWER($1)
    LIMIT 1
  `, [assigneeValue])
  
  return result.rows[0]?.id || null
}
