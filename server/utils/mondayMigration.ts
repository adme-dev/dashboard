/**
 * Monday.com Migration Service
 * Handles the transformation and migration of Monday.com data to the local schema
 */

import { MondayClient, type MondayBoard, type MondayItem, type MondayColumnValue, type MondayUpdate, type MondayAsset } from './mondayClient'
import { getDb, queryOne, query as queryRows, execute, transaction } from './db'

// ============================================
// Types
// ============================================

export interface MigrationConfig {
  skipArchivedBoards: boolean
  skipCompletedItems: boolean
  importUpdates: boolean
  importFiles: boolean
  importSubitems: boolean
  defaultDepartmentId?: string
  defaultProjectId?: string
  defaultAssigneeId?: string
  boardMappings?: BoardMappingConfig[]
}

export interface BoardMappingConfig {
  mondayBoardId: string
  departmentId?: string
  projectId?: string
  statusMapping?: Record<string, string>
  columnMappings?: Record<string, string>
  userMappings?: Record<string, string>
}

export interface MigrationProgress {
  sessionId: string
  status: 'running' | 'completed' | 'failed' | 'paused'
  boardsTotal: number
  boardsCompleted: number
  itemsTotal: number
  itemsCompleted: number
  itemsFailed: number
  currentBoard?: string
  currentBoardProgress?: number
  errors: string[]
}

// ============================================
// Column Type Mappers
// ============================================

interface ColumnMapper {
  mondayType: string
  mapValue: (value: MondayColumnValue, settings?: any) => any
}

const columnMappers: Record<string, ColumnMapper> = {
  name: {
    mondayType: 'name',
    mapValue: (value) => value.text || null,
  },
  status: {
    mondayType: 'status',
    mapValue: (value) => {
      try {
        const parsed = JSON.parse(value.value || '{}')
        return parsed?.label?.text || value.text || null
      } catch {
        return value.text || null
      }
    },
  },
  subtasks: {
    mondayType: 'subtasks',
    mapValue: () => null, // Handled separately during migration
  },
  time_tracking: {
    mondayType: 'time_tracking',
    mapValue: (value) => {
      try {
        const parsed = JSON.parse(value.value || '{}')
        return {
          duration: parsed?.duration,
          startedAt: parsed?.started_at,
          endedAt: parsed?.ended_at,
        }
      } catch {
        return null
      }
    },
  },
  dependency: {
    mondayType: 'dependency',
    mapValue: (value) => {
      try {
        const parsed = JSON.parse(value.value || '{}')
        return parsed?.linkedPulseIds?.map((p: any) => p.linkedPulseId) || []
      } catch {
        return []
      }
    },
  },
  date: {
    mondayType: 'date',
    mapValue: (value) => {
      try {
        const parsed = JSON.parse(value.value || '{}')
        return parsed?.date || null
      } catch {
        return value.text || null
      }
    },
  },
  timeline: {
    mondayType: 'timeline',
    mapValue: (value) => {
      try {
        const parsed = JSON.parse(value.value || '{}')
        return {
          startDate: parsed?.from,
          endDate: parsed?.to,
        }
      } catch {
        return null
      }
    },
  },
  people: {
    mondayType: 'people',
    mapValue: (value) => {
      try {
        const parsed = JSON.parse(value.value || '{}')
        return parsed?.personsAndTeams?.map((p: any) => p.id) || []
      } catch {
        return []
      }
    },
  },
  numbers: {
    mondayType: 'numbers',
    mapValue: (value) => {
      const num = parseFloat(value.text || '')
      return isNaN(num) ? null : num
    },
  },
  text: {
    mondayType: 'text',
    mapValue: (value) => value.text || null,
  },
  long_text: {
    mondayType: 'long_text',
    mapValue: (value) => value.text || null,
  },
  dropdown: {
    mondayType: 'dropdown',
    mapValue: (value) => {
      try {
        const parsed = JSON.parse(value.value || '{}')
        return parsed?.labels?.map((l: any) => l.name) || []
      } catch {
        return value.text ? [value.text] : []
      }
    },
  },
  checkbox: {
    mondayType: 'checkbox',
    mapValue: (value) => {
      try {
        const parsed = JSON.parse(value.value || '{}')
        return parsed?.checked === true
      } catch {
        return false
      }
    },
  },
  email: {
    mondayType: 'email',
    mapValue: (value) => {
      try {
        const parsed = JSON.parse(value.value || '{}')
        return parsed?.email || value.text || null
      } catch {
        return value.text || null
      }
    },
  },
  phone: {
    mondayType: 'phone',
    mapValue: (value) => {
      try {
        const parsed = JSON.parse(value.value || '{}')
        return parsed?.phone || value.text || null
      } catch {
        return value.text || null
      }
    },
  },
  link: {
    mondayType: 'link',
    mapValue: (value) => {
      try {
        const parsed = JSON.parse(value.value || '{}')
        return parsed?.url || value.text || null
      } catch {
        return value.text || null
      }
    },
  },
  rating: {
    mondayType: 'rating',
    mapValue: (value) => {
      try {
        const parsed = JSON.parse(value.value || '{}')
        return parsed?.rating || parseInt(value.text || '0') || null
      } catch {
        return parseInt(value.text || '0') || null
      }
    },
  },
}

// ============================================
// Migration Service
// ============================================

export class MondayMigrationService {
  private client: MondayClient
  private sessionId: string
  private config: MigrationConfig
  private errors: string[] = []

  constructor(client: MondayClient, sessionId: string, config: MigrationConfig) {
    this.client = client
    this.sessionId = sessionId
    this.config = config
  }

  /**
   * Start the migration process
   */
  async migrate(): Promise<void> {
    try {
      // Get all boards from Monday
      const boards = await this.client.getBoards({
        state: this.config.skipArchivedBoards ? 'active' : 'all',
        limit: 500,
      })

      // Update session with board count
      await execute(
        'UPDATE monday_migration_sessions SET boards_total = $1, updated_at = NOW() WHERE id = $2',
        [boards.length, this.sessionId]
      )

      // Process each board
      for (const board of boards) {
        await this.migrateBoard(board)
      }

      // Mark session as completed
      await execute(
        `UPDATE monday_migration_sessions 
         SET status = 'completed', completed_at = NOW(), updated_at = NOW() 
         WHERE id = $1`,
        [this.sessionId]
      )
    } catch (error: any) {
      // Mark session as failed
      await execute(
        `UPDATE monday_migration_sessions 
         SET status = 'failed', error_message = $1, error_details = $2, updated_at = NOW() 
         WHERE id = $1`,
        [error.message, JSON.stringify({ stack: error.stack }), this.sessionId]
      )
      throw error
    }
  }

  /**
   * Migrate a single board to a department
   */
  private async migrateBoard(board: MondayBoard): Promise<void> {
    // Get or create board mapping
    const boardMapping = await this.getOrCreateBoardMapping(board)

    // Skip if not mapped to a department
    if (!boardMapping.department_id) {
      await execute(
        `UPDATE monday_board_mappings 
         SET status = 'skipped', updated_at = NOW() 
         WHERE id = $1`,
        [boardMapping.id]
      )
      return
    }

    // Update status to migrating
    await execute(
      `UPDATE monday_board_mappings 
       SET status = 'migrating', started_at = NOW(), updated_at = NOW() 
       WHERE id = $1`,
      [boardMapping.id]
    )

    try {
      // Get all items from the board
      let allItems: MondayItem[] = []
      let cursor: string | undefined

      do {
        const result = await this.client.getItems(board.id, {
          limit: 100,
          cursor,
        })
        allItems = allItems.concat(result.items)
        cursor = result.cursor
      } while (cursor)

      // Update item count
      await execute(
        `UPDATE monday_board_mappings 
         SET items_total = $1, updated_at = NOW() 
         WHERE id = $2`,
        [allItems.length, boardMapping.id]
      )

      // Process items
      let migratedCount = 0
      let failedCount = 0

      for (const item of allItems) {
        try {
          // Skip completed items if configured
          if (this.config.skipCompletedItems && this.isItemCompleted(item)) {
            continue
          }

          await this.migrateItem(item, boardMapping.id, boardMapping.department_id!, boardMapping.project_id)
          migratedCount++
        } catch (error: any) {
          failedCount++
          this.errors.push(`Failed to migrate item ${item.id}: ${error.message}`)
        }
      }

      // Update board mapping status
      await execute(
        `UPDATE monday_board_mappings 
         SET status = 'completed', items_migrated = $1, items_failed = $2, completed_at = NOW(), updated_at = NOW() 
         WHERE id = $3`,
        [migratedCount, failedCount, boardMapping.id]
      )

      // Update session stats
      await execute(
        `UPDATE monday_migration_sessions 
         SET boards_migrated = boards_migrated + 1, items_migrated = items_migrated + $1, items_failed = items_failed + $2, updated_at = NOW() 
         WHERE id = $3`,
        [migratedCount, failedCount, this.sessionId]
      )
    } catch (error: any) {
      await execute(
        `UPDATE monday_board_mappings 
         SET status = 'failed', error_message = $1, updated_at = NOW() 
         WHERE id = $2`,
        [error.message, boardMapping.id]
      )
      throw error
    }
  }

  /**
   * Get or create a board mapping record
   */
  private async getOrCreateBoardMapping(board: MondayBoard): Promise<any> {
    // Check if mapping exists
    let mapping = await queryOne(
      'SELECT * FROM monday_board_mappings WHERE migration_session_id = $1 AND monday_board_id = $2',
      [this.sessionId, board.id]
    )

    if (!mapping) {
      // Find board mapping config
      const boardConfig = this.config.boardMappings?.find(bm => bm.mondayBoardId === board.id)

      // Create mapping
      mapping = await queryOne(
        `INSERT INTO monday_board_mappings 
         (migration_session_id, monday_board_id, monday_board_name, monday_board_type, department_id, project_id, status_mapping, column_mappings, user_mappings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          this.sessionId,
          board.id,
          board.name,
          board.type,
          boardConfig?.departmentId || this.config.defaultDepartmentId,
          boardConfig?.projectId || this.config.defaultProjectId,
          JSON.stringify(boardConfig?.statusMapping || {}),
          JSON.stringify(boardConfig?.columnMappings || {}),
          JSON.stringify(boardConfig?.userMappings || {}),
        ]
      )
    }

    return mapping
  }

  /**
   * Check if an item is completed based on status
   */
  private isItemCompleted(item: MondayItem): boolean {
    const statusColumn = item.column_values?.find(cv => cv.type === 'status')
    if (!statusColumn) return false

    try {
      const value = JSON.parse(statusColumn.value || '{}')
      const label = value?.label?.text?.toLowerCase() || ''
      return ['done', 'complete', 'completed', 'finished'].includes(label)
    } catch {
      return false
    }
  }

  /**
   * Migrate a single item to a task
   */
  private async migrateItem(
    item: MondayItem,
    boardMappingId: string,
    departmentId: string,
    projectId?: string | null
  ): Promise<void> {
    await transaction(async (client) => {
      // Get the default status for this department
      const defaultStatus = await queryOne(
        'SELECT id FROM task_statuses WHERE department_id = $1 AND is_default = true LIMIT 1',
        [departmentId]
      )

      const statusId = defaultStatus?.id || (await this.getFallbackStatus(departmentId))

      // Map assignee
      const assigneeId = await this.mapAssignee(item, departmentId)

      // Extract dates
      const dates = this.extractDates(item)

      // Map priority
      const priority = this.mapPriority(item)

      // Create the task
      const task = await queryOne(
        `INSERT INTO tasks 
         (project_id, department_id, status_id, title, description, priority, assignee_id, due_date, start_date, estimated_hours, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          projectId || this.config.defaultProjectId,
          departmentId,
          statusId,
          item.name,
          this.extractDescription(item),
          priority,
          assigneeId,
          dates.dueDate,
          dates.startDate,
          this.extractEstimatedHours(item),
          item.created_at,
          item.updated_at,
        ]
      )

      // Create item mapping record
      const itemMapping = await queryOne(
        `INSERT INTO monday_item_mappings 
         (migration_session_id, board_mapping_id, monday_item_id, monday_item_name, task_id, source_data, column_values, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')
         RETURNING *`,
        [
          this.sessionId,
          boardMappingId,
          item.id,
          item.name,
          task.id,
          JSON.stringify(item),
          JSON.stringify(this.extractColumnValues(item)),
        ]
      )

      // Import subitems if configured
      if (this.config.importSubitems) {
        await this.migrateSubitems(item, task.id, departmentId, boardMappingId)
      }

      // Import updates if configured
      if (this.config.importUpdates) {
        await this.migrateUpdates(item.id, task.id, itemMapping.id)
      }

      // Import files if configured
      if (this.config.importFiles) {
        await this.migrateFiles(item.id, task.id, itemMapping.id)
      }

      // Create activity record
      await execute(
        `INSERT INTO task_activities (task_id, user_id, activity_type, new_value, created_at)
         VALUES ($1, $2, 'created', $3, NOW())`,
        [task.id, assigneeId, JSON.stringify({ source: 'monday_migration', monday_item_id: item.id })]
      )
    })
  }

  /**
   * Get a fallback status if no default is found
   */
  private async getFallbackStatus(departmentId: string): Promise<string> {
    const status = await queryOne(
      'SELECT id FROM task_statuses WHERE department_id = $1 ORDER BY sort_order LIMIT 1',
      [departmentId]
    )
    return status?.id
  }

  /**
   * Map Monday user to local team member
   */
  private async mapAssignee(item: MondayItem, departmentId: string): Promise<string | null> {
    const peopleColumn = item.column_values?.find(cv => cv.type === 'people')
    if (!peopleColumn) return this.config.defaultAssigneeId || null

    try {
      const value = JSON.parse(peopleColumn.value || '{}')
      const mondayUserIds = value?.personsAndTeams?.map((p: any) => p.id) || []

      if (mondayUserIds.length === 0) return this.config.defaultAssigneeId || null

      // Try to find mapping
      const boardMapping = await queryOne(
        'SELECT user_mappings FROM monday_board_mappings WHERE monday_board_id = $1 AND migration_session_id = $2',
        [item.board_id, this.sessionId]
      )

      const userMappings = boardMapping?.user_mappings || {}
      const localUserId = userMappings[mondayUserIds[0]]

      if (localUserId) {
        return localUserId
      }

      return this.config.defaultAssigneeId || null
    } catch {
      return this.config.defaultAssigneeId || null
    }
  }

  /**
   * Extract dates from item columns
   */
  private extractDates(item: MondayItem): { startDate?: string; dueDate?: string } {
    const result: { startDate?: string; dueDate?: string } = {}

    // Look for date column
    const dateColumn = item.column_values?.find(cv => cv.type === 'date')
    if (dateColumn) {
      try {
        const value = JSON.parse(dateColumn.value || '{}')
        result.dueDate = value?.date
      } catch {
        // ignore
      }
    }

    // Look for timeline column
    const timelineColumn = item.column_values?.find(cv => cv.type === 'timeline')
    if (timelineColumn) {
      try {
        const value = JSON.parse(timelineColumn.value || '{}')
        result.startDate = value?.from
        result.dueDate = value?.to
      } catch {
        // ignore
      }
    }

    return result
  }

  /**
   * Map priority from item
   */
  private mapPriority(item: MondayItem): string {
    // Look for priority in status or dropdown columns
    const statusColumn = item.column_values?.find(cv => cv.type === 'status')
    if (statusColumn) {
      try {
        const value = JSON.parse(statusColumn.value || '{}')
        const label = value?.label?.text?.toLowerCase() || ''

        if (label.includes('urgent') || label.includes('critical')) return 'urgent'
        if (label.includes('high')) return 'high'
        if (label.includes('low')) return 'low'
      } catch {
        // ignore
      }
    }

    return 'medium'
  }

  /**
   * Extract description from item
   */
  private extractDescription(item: MondayItem): string | null {
    // Look for long_text column
    const longTextColumn = item.column_values?.find(cv => cv.type === 'long_text')
    if (longTextColumn?.text) {
      return longTextColumn.text
    }

    return null
  }

  /**
   * Extract estimated hours from item
   */
  private extractEstimatedHours(item: MondayItem): number | null {
    // Look for numbers column that might be hours
    const numbersColumn = item.column_values?.find(cv => cv.type === 'numbers')
    if (numbersColumn?.text) {
      const hours = parseFloat(numbersColumn.text)
      if (!isNaN(hours) && hours > 0 && hours < 1000) {
        return hours
      }
    }

    return null
  }

  /**
   * Extract all column values
   */
  private extractColumnValues(item: MondayItem): Record<string, any> {
    const values: Record<string, any> = {}

    for (const column of item.column_values || []) {
      const mapper = columnMappers[column.type]
      if (mapper) {
        values[column.title] = mapper.mapValue(column)
      } else {
        values[column.title] = column.text
      }
    }

    return values
  }

  /**
   * Migrate subitems
   */
  private async migrateSubitems(
    parentItem: MondayItem,
    parentTaskId: string,
    departmentId: string,
    boardMappingId: string
  ): Promise<void> {
    try {
      const subitems = await this.client.getSubitems(parentItem.id)

      for (const subitem of subitems) {
        try {
          await this.migrateItem({ ...subitem, board_id: parentItem.board_id }, boardMappingId, departmentId, null)
        } catch (error: any) {
          this.errors.push(`Failed to migrate subitem ${subitem.id}: ${error.message}`)
        }
      }
    } catch (error: any) {
      this.errors.push(`Failed to fetch subitems for ${parentItem.id}: ${error.message}`)
    }
  }

  /**
   * Migrate updates/comments
   */
  private async migrateUpdates(itemId: string, taskId: string, itemMappingId: string): Promise<void> {
    try {
      const updates = await this.client.getUpdates([itemId])

      for (const update of updates) {
        try {
          // Find or create a system user for the update creator
          const userId = await this.findOrCreateSystemUser(update.creator_id, update.creator_name)

          // Create activity record
          const activity = await queryOne(
            `INSERT INTO task_activities (task_id, user_id, activity_type, content, created_at)
             VALUES ($1, $2, 'comment', $3, $4)
             RETURNING *`,
            [taskId, userId, update.text_body, update.created_at]
          )

          // Create update mapping
          await execute(
            `INSERT INTO monday_update_mappings 
             (migration_session_id, item_mapping_id, monday_update_id, monday_creator_id, monday_creator_name, activity_id, source_data, body_text, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              this.sessionId,
              itemMappingId,
              update.id,
              update.creator_id,
              update.creator_name,
              activity.id,
              JSON.stringify(update),
              update.text_body,
              update.created_at,
            ]
          )
        } catch (error: any) {
          this.errors.push(`Failed to migrate update ${update.id}: ${error.message}`)
        }
      }
    } catch (error: any) {
      this.errors.push(`Failed to fetch updates for item ${itemId}: ${error.message}`)
    }
  }

  /**
   * Migrate file attachments
   */
  private async migrateFiles(itemId: string, taskId: string, itemMappingId: string): Promise<void> {
    try {
      const assets = await this.client.getAssets([itemId])

      for (const asset of assets) {
        try {
          // Download file
          const { buffer, filename, contentType } = await this.client.downloadFile(asset.id)

          // Upload to storage (assuming you have a storage utility)
          const fileUrl = await this.uploadFile(buffer, filename, contentType)

          // Create attachment record
          const attachment = await queryOne(
            `INSERT INTO task_attachments (task_id, file_name, file_url, file_type, file_size, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [taskId, filename, fileUrl, contentType, asset.file_size, asset.uploaded_at]
          )

          // Create file mapping
          await execute(
            `INSERT INTO monday_file_mappings 
             (migration_session_id, item_mapping_id, monday_asset_id, monday_file_name, monday_file_url, monday_file_size, attachment_id, local_file_url, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed')`,
            [
              this.sessionId,
              itemMappingId,
              asset.id,
              asset.name,
              asset.url,
              asset.file_size,
              attachment.id,
              fileUrl,
            ]
          )
        } catch (error: any) {
          this.errors.push(`Failed to migrate file ${asset.id}: ${error.message}`)
        }
      }
    } catch (error: any) {
      this.errors.push(`Failed to fetch files for item ${itemId}: ${error.message}`)
    }
  }

  /**
   * Find or create a system user for migrated content
   */
  private async findOrCreateSystemUser(mondayUserId: string, mondayUserName?: string): Promise<string | null> {
    // Try to find an existing mapping
    const existing = await queryOne(
      'SELECT id FROM team_members WHERE email = $1',
      [`monday-${mondayUserId}@placeholder.local`]
    )

    if (existing) {
      return existing.id
    }

    // Create a placeholder user
    const user = await queryOne(
      `INSERT INTO team_members (name, email, is_active)
       VALUES ($1, $2, false)
       RETURNING id`,
      [mondayUserName || `Monday User ${mondayUserId}`, `monday-${mondayUserId}@placeholder.local`]
    )

    return user?.id || null
  }

  /**
   * Upload file to storage
   */
  private async uploadFile(buffer: Buffer, filename: string, contentType: string): Promise<string> {
    // This is a placeholder - implement based on your storage solution
    // Could be S3, local filesystem, etc.
    const key = `monday-migrations/${this.sessionId}/${Date.now()}-${filename}`
    // await uploadToS3(key, buffer, contentType)
    return `/api/storage/${key}`
  }
}

// ============================================
// Helper Functions
// ============================================

export async function createMigrationSession(
  startedBy: string,
  mondayAccountId: string,
  mondayAccountName: string,
  config: MigrationConfig
): Promise<string> {
  const session = await queryOne(
    `INSERT INTO monday_migration_sessions (started_by, monday_account_id, monday_account_name, config)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [startedBy, mondayAccountId, mondayAccountName, JSON.stringify(config)]
  )

  return session!.id
}

export async function getMigrationProgress(sessionId: string): Promise<MigrationProgress | null> {
  const session = await queryOne(
    `SELECT 
       ms.*,
       COUNT(bm.id) FILTER (WHERE bm.status = 'completed') as boards_completed
     FROM monday_migration_sessions ms
     LEFT JOIN monday_board_mappings bm ON ms.id = bm.migration_session_id
     WHERE ms.id = $1
     GROUP BY ms.id`,
    [sessionId]
  )

  if (!session) return null

  return {
    sessionId: session.id,
    status: session.status,
    boardsTotal: session.boards_total,
    boardsCompleted: session.boards_completed || 0,
    itemsTotal: session.items_total,
    itemsCompleted: session.items_migrated,
    itemsFailed: session.items_failed,
    errors: [],
  }
}
