/**
 * Central board data composable
 * Single source of truth for board state: groups, items, columns, cell values.
 */

import type { CustomColumn, TaskColumnValue } from '~/types'

export interface BoardColumn {
  id: string
  name: string
  slug: string
  type: string
  columnType?: string
  settings?: any
  width?: number
  sortOrder?: number
  isVisible?: boolean
  isRequired?: boolean
}

export interface BoardItem {
  id: string
  title: string
  description?: string
  dueDate?: string
  priority: string
  status: string
  statusColor: string
  groupId?: string
  assignees?: { id: string; name: string; avatar?: string }[]
  clients?: string[]
  updatedAt?: string
  columnValues?: Record<string, any>
  columnValuesArray?: any[]
}

export interface BoardGroup {
  id: string
  name: string
  color: string
  items: BoardItem[]
  isExpanded: boolean
}

export interface Board {
  id: string
  name: string
  groups: BoardGroup[]
  totalItems: number
  lastUpdated?: string
  hasBoardGroups?: boolean
}

export type BoardViewType = 'table' | 'kanban' | 'timeline' | 'calendar' | 'list' | 'gallery'

export function useBoardData(boardId: Ref<string>) {
  const { getValue, setValues, updateCellValue } = useBoardCellEdit()

  // --- Core Data ---
  const { data: board, pending, error, refresh } = useFetch<Board>(
    () => `/api/agency/boards/${boardId.value}`,
  )

  const { data: columnsData, refresh: refreshColumns } = useFetch<{ columns: BoardColumn[] }>(
    () => `/api/agency/boards/${boardId.value}/columns`,
    { default: () => ({ columns: [] }) }
  )

  const columns = computed<BoardColumn[]>(() => (columnsData.value as any)?.columns || [])
  const groups = computed<BoardGroup[]>(() => board.value?.groups || [])
  const totalItems = computed(() => board.value?.totalItems || 0)

  // Flat list of all items across all groups
  const allItems = computed<BoardItem[]>(() => {
    const items: BoardItem[] = []
    for (const group of groups.value) {
      for (const item of group.items) {
        items.push(item)
      }
    }
    return items
  })

  // --- Active View ---
  const activeView = ref<BoardViewType>('table')

  // --- Search / Filter ---
  const searchQuery = ref('')

  const filteredGroups = computed<BoardGroup[]>(() => {
    if (!searchQuery.value.trim()) return groups.value
    const query = searchQuery.value.toLowerCase()
    return groups.value
      .map(group => ({
        ...group,
        items: group.items.filter(item =>
          item.title.toLowerCase().includes(query)
        ),
      }))
      .filter(group => group.items.length > 0)
  })

  // --- Cell Values ---

  // Initialize cell values from board data when loaded
  watch(board, (b) => {
    if (!b?.groups) return
    const values: TaskColumnValue[] = []
    for (const group of b.groups) {
      for (const item of group.items) {
        if (item.columnValuesArray) {
          for (const cv of item.columnValuesArray) {
            values.push({
              id: cv.id || '',
              taskId: item.id,
              columnId: cv.columnId || '',
              textValue: cv.textValue,
              numberValue: cv.numberValue != null ? Number(cv.numberValue) : undefined,
              dateValue: cv.dateValue,
              dateEndValue: cv.dateEndValue,
              jsonValue: cv.jsonValue,
              createdAt: cv.createdAt || '',
              updatedAt: cv.updatedAt || '',
            })
          }
        }
      }
    }
    setValues(values)
  }, { immediate: true })

  function normalizeColumn(col: BoardColumn): CustomColumn {
    return {
      id: col.id,
      name: col.name,
      slug: col.slug,
      columnType: (col.columnType || col.type) as any,
      settings: col.settings || {},
      isVisible: col.isVisible ?? true,
      isRequired: false,
      width: col.width || 150,
      sortOrder: col.sortOrder || 0,
      createdAt: '',
      updatedAt: '',
    }
  }

  function getCellValue(item: BoardItem, col: BoardColumn): TaskColumnValue | null {
    const composableVal = getValue(item.id, col.id)
    if (composableVal) return composableVal

    const cv = item.columnValues?.[col.slug]
    if (!cv) return null

    return {
      id: cv.id || '',
      taskId: item.id,
      columnId: col.id,
      textValue: cv.textValue || cv.text_value,
      numberValue: cv.numberValue ?? cv.number_value,
      dateValue: cv.dateValue || cv.date_value,
      dateEndValue: cv.dateEndValue || cv.date_end_value,
      jsonValue: cv.jsonValue || cv.value_json,
      createdAt: cv.createdAt || '',
      updatedAt: cv.updatedAt || '',
    }
  }

  async function handleCellUpdate(taskId: string, columnId: string, payload: any) {
    await updateCellValue(taskId, columnId, payload)
  }

  return {
    // Data
    board,
    groups,
    filteredGroups,
    columns,
    allItems,
    totalItems,
    pending,
    error,

    // Actions
    refresh,
    refreshColumns,

    // View
    activeView,
    searchQuery,

    // Cell values
    normalizeColumn,
    getCellValue,
    handleCellUpdate,
  }
}
