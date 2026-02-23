/**
 * Pre-migration preview
 * POST /api/agency/monday/preview
 * Returns what would be imported without actually importing
 */

import { createError, readBody } from 'h3'
import { createMondayClient, type MondayBoard, type MondayItem, type MondayColumn, type MondayUser } from '../../../utils/mondayClient'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export interface PreviewConfig {
  skipArchivedBoards: boolean
  skipCompletedItems: boolean
  importUpdates: boolean
  importFiles: boolean
  importSubitems: boolean
}

export interface BoardPreview {
  mondayBoardId: string
  name: string
  type: string
  state: string
  workspaceId?: string
  itemCount: number
  columns: ColumnPreview[]
  sampleItems: ItemPreview[]
  estimatedStats: {
    totalItems: number
    completedItems: number
    hasSubitems: boolean
    fileCount: number
  }
  suggestedMapping: {
    departmentId?: string
    departmentName?: string
    projectId?: string
  }
}

export interface ColumnPreview {
  id: string
  title: string
  type: string
  mappedTo: string | null
  sampleValues: string[]
}

export interface ItemPreview {
  mondayItemId: string
  name: string
  state: string
  columnValues: Record<string, any>
  subitemCount: number
  updateCount: number
}

export interface UserPreview {
  mondayUserId: string
  name: string
  email: string
  mappedTo?: {
    id: string
    name: string
  }
}

export interface MigrationPreview {
  account: {
    id: string
    name: string
  }
  summary: {
    totalBoards: number
    totalItems: number
    totalFiles: number
    totalComments: number
    estimatedTimeMinutes: number
  }
  boards: BoardPreview[]
  users: UserPreview[]
  unmappedColumns: string[]
  warnings: string[]
}

export default eventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const config: PreviewConfig = body.config || {
    skipArchivedBoards: true,
    skipCompletedItems: false,
    importUpdates: true,
    importFiles: true,
    importSubitems: true,
  }

  try {
    const client = await createMondayClient()
    
    // Get account info
    const account = await client.testConnection()
    
    // Get all boards
    const boards = await client.getBoards({
      state: config.skipArchivedBoards ? 'active' : 'all',
      limit: 500,
    })

    // Get local departments for suggested mappings
    const departments = await queryRows(
      'SELECT id, name FROM departments WHERE is_active = true ORDER BY name'
    )

    // Get local team members for user mapping suggestions
    const teamMembers = await queryRows(
      'SELECT id, name, email FROM team_members WHERE is_active = true'
    )

    // Get all users from Monday
    const mondayUsers = await client.getUsers({ limit: 500 })

    // Build preview for each board
    const boardPreviews: BoardPreview[] = []
    let totalItems = 0
    let totalFiles = 0
    let totalComments = 0
    const warnings: string[] = []
    const unmappedColumnsSet = new Set<string>()

    for (const board of boards) {
      try {
        // Get sample items (first 5)
        const itemsResult = await client.getItems(board.id, { limit: 5 })
        const sampleItems = itemsResult.items

        // Get full count
        let boardItemCount = board.items_count || 0
        if (!boardItemCount) {
          // If count not provided, estimate from pagination
          let cursor: string | undefined
          let count = 0
          do {
            const result = await client.getItems(board.id, { limit: 100, cursor })
            count += result.items.length
            cursor = result.cursor
          } while (cursor && count < 1000) // Cap at 1000 for preview
          boardItemCount = count
        }

        totalItems += boardItemCount

        // Analyze columns
        const columnPreviews: ColumnPreview[] = (board.columns || []).map(col => {
          const mapping = mapColumnType(col.type)
          if (!mapping.mapped) {
            unmappedColumnsSet.add(col.type)
          }

          // Get sample values from items
          const sampleValues = sampleItems
            .map(item => {
              const colValue = item.column_values?.find(cv => cv.id === col.id)
              return colValue?.text || ''
            })
            .filter(v => v)
            .slice(0, 3)

          return {
            id: col.id,
            title: col.title,
            type: col.type,
            mappedTo: mapping.target,
            sampleValues,
          }
        })

        // Build item previews
        const itemPreviews: ItemPreview[] = sampleItems.map(item => {
          const columnValues: Record<string, any> = {}
          
          for (const col of board.columns || []) {
            const colValue = item.column_values?.find(cv => cv.id === col.id)
            if (colValue) {
              columnValues[col.title] = extractValue(colValue, col.type)
            }
          }

          return {
            mondayItemId: item.id,
            name: item.name,
            state: item.state,
            columnValues,
            subitemCount: 0, // Would need to fetch subitems
            updateCount: 0, // Would need to fetch updates
          }
        })

        // Check for subitems in sample
        const hasSubitems = sampleItems.some(item => item.subitems && item.subitems.length > 0)

        // Suggest department mapping based on board name
        const suggestedMapping = suggestDepartmentMapping(board.name, departments as any[])

        // Count completed items in sample
        const completedItems = sampleItems.filter(item => {
          const statusCol = item.column_values?.find(cv => cv.type === 'status')
          if (statusCol?.value) {
            try {
              const parsed = JSON.parse(statusCol.value)
              const label = parsed?.label?.text?.toLowerCase() || ''
              return ['done', 'complete', 'completed'].includes(label)
            } catch {
              return false
            }
          }
          return false
        }).length

        boardPreviews.push({
          mondayBoardId: board.id,
          name: board.name,
          type: board.type,
          state: board.state,
          workspaceId: board.workspace_id,
          itemCount: boardItemCount,
          columns: columnPreviews,
          sampleItems: itemPreviews,
          estimatedStats: {
            totalItems: boardItemCount,
            completedItems,
            hasSubitems,
            fileCount: 0, // Would need to query files
          },
          suggestedMapping,
        })

        // Estimate files and comments
        if (config.importFiles) {
          totalFiles += Math.floor(boardItemCount * 0.5) // Rough estimate
        }
        if (config.importUpdates) {
          totalComments += Math.floor(boardItemCount * 2) // Rough estimate
        }

      } catch (error: any) {
        warnings.push(`Failed to analyze board "${board.name}": ${error.message}`)
      }
    }

    // Build user mapping suggestions
    const userPreviews: UserPreview[] = mondayUsers.map(user => {
      const match = findBestUserMatch(user, teamMembers as any[])
      return {
        mondayUserId: user.id,
        name: user.name,
        email: user.email,
        mappedTo: match ? {
          id: match.id,
          name: match.name,
        } : undefined,
      }
    })

    // Calculate estimated time (rough estimate: 1 second per item + overhead)
    const estimatedTimeMinutes = Math.ceil(
      (totalItems * 0.5 + totalFiles * 2 + totalComments * 0.1) / 60
    )

    const preview: MigrationPreview = {
      account: {
        id: account.id,
        name: account.name,
      },
      summary: {
        totalBoards: boards.length,
        totalItems,
        totalFiles,
        totalComments,
        estimatedTimeMinutes,
      },
      boards: boardPreviews,
      users: userPreviews,
      unmappedColumns: Array.from(unmappedColumnsSet),
      warnings,
    }

    return preview

  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to generate preview: ${error.message}`,
    })
  }
})

// Helper functions

function mapColumnType(mondayType: string): { mapped: boolean; target: string | null } {
  const mapping: Record<string, string> = {
    'status': 'task_status',
    'date': 'due_date',
    'timeline': 'date_range',
    'people': 'assignee',
    'numbers': 'estimated_hours',
    'text': 'custom_text',
    'long_text': 'description',
    'dropdown': 'labels',
    'checkbox': 'boolean',
    'email': 'email',
    'phone': 'phone',
    'link': 'url',
    'rating': 'priority',
    'color': 'color',
    'progress': 'progress',
    'tags': 'tags',
  }

  const target = mapping[mondayType]
  return {
    mapped: !!target,
    target: target || `custom_${mondayType}`,
  }
}

function extractValue(columnValue: any, type: string): any {
  try {
    switch (type) {
      case 'status':
        const statusParsed = JSON.parse(columnValue.value || '{}')
        return statusParsed?.label?.text || columnValue.text
      
      case 'date':
        const dateParsed = JSON.parse(columnValue.value || '{}')
        return dateParsed?.date
      
      case 'timeline':
        const timelineParsed = JSON.parse(columnValue.value || '{}')
        return {
          start: timelineParsed?.from,
          end: timelineParsed?.to,
        }
      
      case 'people':
        const peopleParsed = JSON.parse(columnValue.value || '{}')
        return peopleParsed?.personsAndTeams?.map((p: any) => p.id) || []
      
      case 'dropdown':
        const dropdownParsed = JSON.parse(columnValue.value || '{}')
        return dropdownParsed?.labels?.map((l: any) => l.name) || []
      
      case 'checkbox':
        const checkboxParsed = JSON.parse(columnValue.value || '{}')
        return checkboxParsed?.checked === true
      
      default:
        return columnValue.text
    }
  } catch {
    return columnValue.text
  }
}

function suggestDepartmentMapping(boardName: string, departments: Array<{ id: string; name: string }>): {
  departmentId?: string
  departmentName?: string
} {
  const normalized = boardName.toLowerCase()
  
  // Keyword matching
  const keywords: Record<string, string[]> = {
    'creative': ['creative', 'design', 'art', 'visual', 'brand'],
    'marketing': ['marketing', 'social', 'content', 'seo', 'ads'],
    'production': ['production', 'video', 'photo', 'media'],
    'account': ['account', 'client', 'sales', 'crm'],
    'operations': ['operations', 'ops', 'admin', 'finance', 'hr'],
  }

  for (const [deptName, words] of Object.entries(keywords)) {
    if (words.some(word => normalized.includes(word))) {
      const dept = departments.find(d => d.name.toLowerCase().includes(deptName))
      if (dept) {
        return {
          departmentId: dept.id,
          departmentName: dept.name,
        }
      }
    }
  }

  // Default to first department if no match
  if (departments.length > 0) {
    return {
      departmentId: departments[0].id,
      departmentName: departments[0].name,
    }
  }

  return {}
}

function findBestUserMatch(mondayUser: MondayUser, teamMembers: Array<{ id: string; name: string; email: string }>): { id: string; name: string } | null {
  // Try email match first
  const emailMatch = teamMembers.find(tm => 
    tm.email.toLowerCase() === mondayUser.email.toLowerCase()
  )
  if (emailMatch) return emailMatch

  // Try name similarity
  const mondayNameLower = mondayUser.name.toLowerCase()
  const nameMatch = teamMembers.find(tm => 
    tm.name.toLowerCase() === mondayNameLower ||
    mondayNameLower.includes(tm.name.toLowerCase()) ||
    tm.name.toLowerCase().includes(mondayNameLower)
  )
  if (nameMatch) return nameMatch

  return null
}
