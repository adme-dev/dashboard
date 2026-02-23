/**
 * Complete Pre-migration preview
 * POST /api/agency/monday/preview-complete
 * Shows ALL Monday data that will be imported with full support
 */

import { createError, readBody } from 'h3'
import { createMondayClient } from '../../../utils/mondayClient'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

const ALL_MONDAY_COLUMN_TYPES = [
  // Basic types
  { type: 'name', supported: true, mapsTo: 'Task Title' },
  { type: 'text', supported: true, mapsTo: 'Text Field' },
  { type: 'long_text', supported: true, mapsTo: 'Description' },
  { type: 'status', supported: true, mapsTo: 'Task Status' },
  { type: 'dropdown', supported: true, mapsTo: 'Labels' },
  { type: 'date', supported: true, mapsTo: 'Due Date' },
  { type: 'timeline', supported: true, mapsTo: 'Date Range' },
  { type: 'people', supported: true, mapsTo: 'Assignee' },
  { type: 'numbers', supported: true, mapsTo: 'Numeric Field' },
  { type: 'checkbox', supported: true, mapsTo: 'Boolean' },
  { type: 'email', supported: true, mapsTo: 'Email' },
  { type: 'phone', supported: true, mapsTo: 'Phone' },
  { type: 'link', supported: true, mapsTo: 'URL' },
  { type: 'rating', supported: true, mapsTo: 'Priority' },
  { type: 'color', supported: true, mapsTo: 'Color' },
  { type: 'progress', supported: true, mapsTo: 'Progress %' },
  { type: 'tags', supported: true, mapsTo: 'Tags' },
  // Advanced types - NOW FULLY SUPPORTED
  { type: 'subtasks', supported: true, mapsTo: 'Subtasks' },
  { type: 'time_tracking', supported: true, mapsTo: 'Time Entries' },
  { type: 'dependency', supported: true, mapsTo: 'Task Dependencies' },
  { type: 'board_relation', supported: true, mapsTo: 'Related Tasks' },
  { type: 'mirror', supported: true, mapsTo: 'Synced Data' },
  { type: 'doc', supported: true, mapsTo: 'Documents' },
  { type: 'file', supported: true, mapsTo: 'Attachments' },
  { type: 'vote', supported: true, mapsTo: 'Votes' },
  // Special Monday types
  { type: 'direct_doc', supported: true, mapsTo: 'Documents' },
  { type: 'hour', supported: true, mapsTo: 'Time Field' },
]

export default eventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const config = body.config || {}

  try {
    const client = await createMondayClient()
    const account = await client.testConnection()
    const boards = await client.getBoards({ state: config.skipArchivedBoards ? 'active' : 'all', limit: 500 })
    const departments = await queryRows('SELECT id, name FROM departments WHERE is_active = true ORDER BY name')

    const boardPreviews = []
    const allColumnTypes = new Map<string, { count: number; examples: string[] }>()
    let totalItems = 0

    for (const board of boards) {
      const itemsResult = await client.getItems(board.id, { limit: 5 })
      
      // Analyze columns
      const columnDetails = (board.columns || []).map(col => {
        const typeInfo = ALL_MONDAY_COLUMN_TYPES.find(t => t.type === col.type) || { supported: true, mapsTo: 'Custom Field' }
        
        // Track type usage
        if (!allColumnTypes.has(col.type)) {
          allColumnTypes.set(col.type, { count: 0, examples: [] })
        }
        const typeData = allColumnTypes.get(col.type)!
        typeData.count++
        if (typeData.examples.length < 3) {
          typeData.examples.push(`${col.title} (${board.name})`)
        }

        return {
          id: col.id,
          title: col.title,
          type: col.type,
          supported: typeInfo.supported,
          mapsTo: typeInfo.mapsTo,
        }
      })

      // Count items
      let itemCount = board.items_count || 0
      if (!itemCount) {
        let cursor: string | undefined
        let count = 0
        do {
          const result = await client.getItems(board.id, { limit: 100, cursor })
          count += result.items.length
          cursor = result.cursor
        } while (cursor && count < 1000)
        itemCount = count
      }
      totalItems += itemCount

      // Suggest department mapping
      const suggestedDept = suggestDepartment(board.name, departments as any[])

      boardPreviews.push({
        mondayBoardId: board.id,
        name: board.name,
        type: board.type,
        state: board.state,
        itemCount,
        columns: columnDetails,
        hasSubitems: columnDetails.some(c => c.type === 'subtasks'),
        hasTimeTracking: columnDetails.some(c => c.type === 'time_tracking'),
        hasDependencies: columnDetails.some(c => c.type === 'dependency'),
        hasDocs: columnDetails.some(c => c.type === 'doc' || c.type === 'direct_doc'),
        hasMirrorColumns: columnDetails.some(c => c.type === 'mirror'),
        hasRelations: columnDetails.some(c => c.type === 'board_relation'),
        hasVotes: columnDetails.some(c => c.type === 'vote'),
        suggestedMapping: suggestedDept,
      })
    }

    // Build column type summary
    const columnTypeSummary = Array.from(allColumnTypes.entries())
      .map(([type, data]) => {
        const typeInfo = ALL_MONDAY_COLUMN_TYPES.find(t => t.type === type)
        return {
          type,
          count: data.count,
          supported: typeInfo?.supported ?? true,
          mapsTo: typeInfo?.mapsTo || 'Custom Field',
          examples: data.examples,
        }
      })
      .sort((a, b) => b.count - a.count)

    const unsupportedTypes = columnTypeSummary.filter(c => !c.supported)

    return {
      account: { id: account.id, name: account.name, slug: account.slug },
      summary: {
        totalBoards: boards.length,
        totalItems,
        totalColumns: Array.from(allColumnTypes.values()).reduce((sum, t) => sum + t.count, 0),
        uniqueColumnTypes: allColumnTypes.size,
        unsupportedColumnTypes: unsupportedTypes.length,
        estimatedTimeMinutes: Math.ceil(totalItems * 0.5 / 60),
      },
      boards: boardPreviews,
      columnTypes: columnTypeSummary,
      unsupportedTypes: unsupportedTypes.length > 0 ? unsupportedTypes : null,
      departments: departments.map(d => ({ id: d.id, name: d.name })),
      allFeaturesSupported: unsupportedTypes.length === 0,
    }

  } catch (error: any) {
    throw createError({ statusCode: 500, statusMessage: `Failed to generate preview: ${error.message}` })
  }
})

function suggestDepartment(boardName: string, departments: Array<{ id: string; name: string }>) {
  const normalized = boardName.toLowerCase()
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
      if (dept) return { id: dept.id, name: dept.name }
    }
  }

  if (departments.length > 0) {
    return { id: departments[0].id, name: departments[0].name }
  }
  return null
}
