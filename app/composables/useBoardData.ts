/**
 * Central board data composable
 * Single source of truth for board state: groups, items, columns, cell values.
 * Connects board cell edits to actual platform APIs (statuses, labels, assignees).
 */

import type { CustomColumn, TaskColumnValue } from '~/types'
import { isBoardViewType, type BoardViewType } from '~/utils/boardViews'

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown; query?: Record<string, unknown> },
) => Promise<T>

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
  startDate?: string
  taskType?: string
  progressPercentage?: number
  priority: string
  status: string
  statusColor: string
  groupId?: string
  assignees?: { id: string; name: string; avatar?: string }[]
  clients?: string[]
  updatedAt?: string
  columnValues?: Record<string, any>
  columnValuesArray?: any[]
  dependencies?: { dependsOnTaskId: string; type: string }[]
  subtaskCount?: number
  completedSubtaskCount?: number
  linkedItemCount?: number
  estimatedCost?: number | null
  actualCost?: number | null
  billingRate?: number | null
  estimatedHours?: number | null
  actualHours?: number | null
  currency?: string
  isBillable?: boolean
  quoteLineItemId?: string | null
  briefId?: string | null
  budgetSource?: string | null
}

export interface BoardGroup {
  id: string
  name: string
  color: string
  items: BoardItem[]
  isExpanded: boolean
  totalCount?: number
  hasMore?: boolean
  isCollapsed?: boolean
}

export interface Board {
  id: string
  name: string
  groups: BoardGroup[]
  totalItems: number
  lastUpdated?: string
  hasBoardGroups?: boolean
}

export interface FilterRule {
  id: string
  columnId: string
  operator: string
  value: any
}

export interface SortRule {
  columnId: string
  direction: 'asc' | 'desc'
}

// --- Filter helpers ---

function getCellRawValue(item: BoardItem, columnId: string, columns: BoardColumn[], getCellValue: (item: BoardItem, col: BoardColumn) => TaskColumnValue | null) {
  const col = columns.find(c => c.id === columnId)
  if (!col) return null
  return getCellValue(item, col)
}

function matchesFilter(
  item: BoardItem,
  rule: FilterRule,
  columns: BoardColumn[],
  getCellValue: (item: BoardItem, col: BoardColumn) => TaskColumnValue | null,
): boolean {
  const col = columns.find(c => c.id === rule.columnId)
  if (!col) return true
  const type = col.columnType || col.type
  const cv = getCellValue(item, col)

  // Resolve a comparable text value
  const textVal = cv?.textValue || cv?.jsonValue?.label || cv?.jsonValue?.text || ''
  const numVal = cv?.numberValue
  const dateVal = cv?.dateValue
  const jsonVal = cv?.jsonValue
  const isEmpty = !cv || (!cv.textValue && cv.numberValue == null && !cv.dateValue && !cv.jsonValue)

  switch (rule.operator) {
    case 'is_empty':
      return isEmpty
    case 'is_not_empty':
      return !isEmpty
  }

  // Type-specific matching
  if (type === 'number' || type === 'currency' || type === 'budget') {
    const num = numVal != null ? Number(numVal) : null
    const ruleNum = Number(rule.value)
    if (num == null) return false
    switch (rule.operator) {
      case 'is': return num === ruleNum
      case 'is_not': return num !== ruleNum
      case 'gt': return num > ruleNum
      case 'lt': return num < ruleNum
      case 'gte': return num >= ruleNum
      case 'lte': return num <= ruleNum
      default: return true
    }
  }

  if (type === 'date' || type === 'timeline') {
    const d = dateVal ? new Date(dateVal).getTime() : null
    const rd = rule.value ? new Date(rule.value).getTime() : null
    if (d == null) return false
    switch (rule.operator) {
      case 'is': return d === rd
      case 'is_before': return rd != null && d < rd
      case 'is_after': return rd != null && d > rd
      default: return true
    }
  }

  if (type === 'status' || type === 'dropdown') {
    const optionId = jsonVal?.optionId || ''
    const label = jsonVal?.label || textVal
    const ruleVal = String(rule.value || '').toLowerCase()
    switch (rule.operator) {
      case 'is': return optionId === rule.value || label.toLowerCase() === ruleVal
      case 'is_not': return optionId !== rule.value && label.toLowerCase() !== ruleVal
      default: return true
    }
  }

  if (type === 'checkbox') {
    const checked = jsonVal?.checked === true || textVal === 'true'
    switch (rule.operator) {
      case 'is': return checked
      case 'is_not': return !checked
      default: return true
    }
  }

  if (type === 'people') {
    const userIds: string[] = jsonVal?.userIds || []
    const names: string[] = jsonVal?.names || []
    const ruleVal = String(rule.value || '').toLowerCase()
    switch (rule.operator) {
      case 'contains': return userIds.includes(rule.value) || names.some(n => n.toLowerCase().includes(ruleVal))
      default: return true
    }
  }

  // Default: text-like matching
  const t = String(textVal || '').toLowerCase()
  const rv = String(rule.value || '').toLowerCase()
  switch (rule.operator) {
    case 'contains': return t.includes(rv)
    case 'not_contains': return !t.includes(rv)
    case 'is': return t === rv
    case 'is_not': return t !== rv
    default: return true
  }
}

function compareItems(
  a: BoardItem,
  b: BoardItem,
  rules: SortRule[],
  columns: BoardColumn[],
  getCellValue: (item: BoardItem, col: BoardColumn) => TaskColumnValue | null,
): number {
  for (const rule of rules) {
    const col = columns.find(c => c.id === rule.columnId)
    if (!col) continue
    const type = col.columnType || col.type
    const cvA = getCellValue(a, col)
    const cvB = getCellValue(b, col)
    const dir = rule.direction === 'desc' ? -1 : 1
    let cmp = 0

    if (type === 'number' || type === 'currency' || type === 'budget') {
      const na = cvA?.numberValue != null ? Number(cvA.numberValue) : -Infinity
      const nb = cvB?.numberValue != null ? Number(cvB.numberValue) : -Infinity
      cmp = na - nb
    } else if (type === 'date' || type === 'timeline') {
      const da = cvA?.dateValue ? new Date(cvA.dateValue).getTime() : 0
      const db = cvB?.dateValue ? new Date(cvB.dateValue).getTime() : 0
      cmp = da - db
    } else if (type === 'status' || type === 'dropdown') {
      const la = cvA?.jsonValue?.label || cvA?.textValue || ''
      const lb = cvB?.jsonValue?.label || cvB?.textValue || ''
      cmp = la.localeCompare(lb)
    } else {
      const ta = cvA?.textValue || cvA?.jsonValue?.label || ''
      const tb = cvB?.textValue || cvB?.jsonValue?.label || ''
      cmp = ta.localeCompare(tb)
    }

    if (cmp !== 0) return cmp * dir
  }
  return 0
}

function groupItemsByColumn(
  items: BoardItem[],
  columnId: string,
  columns: BoardColumn[],
  getCellValue: (item: BoardItem, col: BoardColumn) => TaskColumnValue | null,
): BoardGroup[] {
  const col = columns.find(c => c.id === columnId)
  if (!col) return []
  const type = col.columnType || col.type
  const groupMap = new Map<string, { name: string; color: string; items: BoardItem[] }>()

  // For status/dropdown, pre-create groups from options to preserve order
  if ((type === 'status' || type === 'dropdown') && col.settings?.options?.length) {
    for (const opt of col.settings.options) {
      const key = opt.value || opt.id || opt.label
      groupMap.set(key, {
        name: opt.label || opt.name || key,
        color: opt.color || '#C4C4C4',
        items: [],
      })
    }
  }

  // Distribute items
  for (const item of items) {
    const cv = getCellValue(item, col)
    let key = ''
    let name = ''
    let color = '#C4C4C4'

    if (type === 'status' || type === 'dropdown') {
      const optionId = cv?.jsonValue?.optionId || ''
      const label = cv?.jsonValue?.label || cv?.textValue || ''
      key = optionId || label || '__no_value__'
      // Try to find the option for color
      const opt = col.settings?.options?.find((o: any) => (o.value || o.id) === optionId || o.label === label)
      name = opt?.label || label || 'No value'
      color = opt?.color || '#C4C4C4'
    } else {
      const val = cv?.textValue || cv?.jsonValue?.label || ''
      key = val || '__no_value__'
      name = val || 'No value'
    }

    if (!groupMap.has(key)) {
      groupMap.set(key, { name, color, items: [] })
    }
    groupMap.get(key)!.items.push(item)
  }

  // Build groups array, filtering out empty option groups
  const result: BoardGroup[] = []
  for (const [key, val] of groupMap) {
    if (val.items.length === 0 && key !== '__no_value__') continue
    result.push({
      id: `grouped_${columnId}_${key}`,
      name: val.name,
      color: val.color,
      items: val.items,
      isExpanded: true,
    })
  }
  return result
}

export function useBoardData(boardId: Ref<string>) {
  const { getValue, setValues, updateCellValue } = useBoardCellEdit()

  // --- Core Data ---
  const board = ref<Board | null>(null)
  const pending = ref(false)
  const error = ref<unknown>(null)
  const columnsData = ref<{ columns: BoardColumn[] }>({ columns: [] })

  async function refresh() {
    pending.value = true
    error.value = null
    try {
      board.value = await apiFetch<Board>(`/api/agency/boards/${boardId.value}`)
    } catch (err) {
      error.value = err
      board.value = null
    } finally {
      pending.value = false
    }
  }

  async function refreshColumns() {
    try {
      columnsData.value = await apiFetch<{ columns: BoardColumn[] }>(
        `/api/agency/boards/${boardId.value}/columns`,
        { query: { includeHidden: true } },
      )
    } catch {
      columnsData.value = { columns: [] }
    }
  }

  watch(boardId, () => {
    refresh()
    refreshColumns()
  }, { immediate: true })

  // --- Platform Data (statuses & labels for this department) ---
  const resolvedBoardId = computed(() => board.value?.id || '')

  const statuses = ref<any[]>([])

  watch(resolvedBoardId, async (id) => {
    if (!id) return
    try {
      const data = await apiFetch<any[]>('/api/agency/statuses', { query: { departmentId: id } })
      statuses.value = data || []
    } catch (err) {
      console.error('Failed to fetch statuses:', err)
    }
  }, { immediate: true })

  // --- Columns with injected platform data ---
  const rawColumns = computed<BoardColumn[]>(() => (columnsData.value as any)?.columns || [])

  function enrichColumn(col: BoardColumn): BoardColumn {
    const type = col.columnType || col.type

    // Always merge platform statuses into status columns
    if (type === 'status' && statuses.value.length > 0) {
      const existingOptions = col.settings?.options || []
      const platformOptions = statuses.value.map((s: any) => ({
        value: s.id,
        label: s.name,
        color: s.color || '#C4C4C4',
      }))

      // Merge: platform statuses + custom options (dedupe by value AND label)
      const seenValues = new Set<string>()
      const seenLabels = new Set<string>()
      const merged: any[] = []
      for (const opt of platformOptions) {
        const label = (opt.label || '').toLowerCase()
        if (!seenValues.has(opt.value) && !seenLabels.has(label)) {
          seenValues.add(opt.value)
          seenLabels.add(label)
          merged.push(opt)
        }
      }
      for (const opt of existingOptions) {
        const key = opt.value || opt.id
        const label = (opt.label || opt.name || '').toLowerCase()
        if (key && !seenValues.has(key) && !seenLabels.has(label)) {
          seenValues.add(key)
          seenLabels.add(label)
          merged.push(opt)
        }
      }

      return {
        ...col,
        settings: {
          ...(col.settings || {}),
          options: merged,
        },
      }
    }

    return col
  }

  // All columns (including hidden) — enriched with platform data
  const allColumns = computed<BoardColumn[]>(() => rawColumns.value.map(enrichColumn))

  // Visible columns only
  const columns = computed<BoardColumn[]>(() => allColumns.value.filter(c => c.isVisible !== false))

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
  const route = useRoute()
  const router = useRouter()
  const initialView = isBoardViewType(route.query.view)
    ? route.query.view
    : 'table'
  const activeView = ref<BoardViewType>(initialView)

  watch(activeView, (view) => {
    if (route.query.view === view) return
    router.replace({ query: { ...route.query, view } })
  })

  // --- Search / Filter / Sort / Group ---
  const searchQuery = ref('')
  const filters = ref<FilterRule[]>([])
  const sortRules = ref<SortRule[]>([])
  const groupByColumnId = ref<string | null>(null)
  const collapsedGroupIds = ref<Set<string>>(new Set())
  // User overrides for expand/collapse — survives server data refreshes
  const userExpandOverrides = ref<Map<string, boolean>>(new Map())
  // Cache for lazily-loaded group items (for groups that were server-collapsed)
  const groupItemsCache = ref<Map<string, { items: any[]; totalCount: number; hasMore: boolean }>>(new Map())

  // Reset collapsed state when groupBy column changes
  watch(groupByColumnId, () => {
    collapsedGroupIds.value = new Set()
    userExpandOverrides.value = new Map()
  })

  function updateGroupItemsCache(groupId: string, items: any[], totalCount: number, hasMore: boolean, append = false) {
    const next = new Map(groupItemsCache.value)
    const existing = next.get(groupId)
    if (append && existing) {
      next.set(groupId, { items: [...existing.items, ...items], totalCount, hasMore })
    } else {
      next.set(groupId, { items, totalCount, hasMore })
    }
    groupItemsCache.value = next
  }

  function toggleGroupExpanded(groupId: string, expanded?: boolean) {
    // For dynamic groups (group-by column), use collapsedGroupIds
    if (groupByColumnId.value) {
      const next = new Set(collapsedGroupIds.value)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      collapsedGroupIds.value = next
    } else {
      // For regular groups, use user override map
      const next = new Map(userExpandOverrides.value)
      const currentGroup = groups.value.find(g => g.id === groupId)
      const currentState = next.has(groupId) ? next.get(groupId)! : (currentGroup?.isExpanded ?? true)
      next.set(groupId, expanded !== undefined ? expanded : !currentState)
      userExpandOverrides.value = next
    }
  }

  const filteredGroups = computed<BoardGroup[]>(() => {
    // 1. Start with all items
    let items = allItems.value

    // 2. Apply column filters
    if (filters.value.length > 0) {
      items = items.filter(item =>
        filters.value.every(rule => matchesFilter(item, rule, allColumns.value, getCellValue))
      )
    }

    // 3. Apply sort
    if (sortRules.value.length > 0) {
      items = [...items].sort((a, b) => compareItems(a, b, sortRules.value, allColumns.value, getCellValue))
    }

    // 4. Apply search
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase()
      items = items.filter(item => item.title.toLowerCase().includes(q))
    }

    // 5. Group by column
    if (groupByColumnId.value) {
      const dynamicGroups = groupItemsByColumn(items, groupByColumnId.value, allColumns.value, getCellValue)
      // Apply local collapsed state
      return dynamicGroups.map(g => ({
        ...g,
        isExpanded: !collapsedGroupIds.value.has(g.id),
      }))
    }

    // Default: distribute items back into original groups
    if (filters.value.length > 0 || sortRules.value.length > 0 || searchQuery.value.trim()) {
      return groups.value
        .map(g => ({
          ...g,
          items: items.filter(i => g.items.some(gi => gi.id === i.id)),
          isExpanded: userExpandOverrides.value.has(g.id)
            ? userExpandOverrides.value.get(g.id)!
            : g.isExpanded,
        }))
        .filter(g => g.items.length > 0 || (!searchQuery.value.trim() && filters.value.length === 0))
    }

    // Apply user overrides (expand/collapse + cached items) to server data
    const hasOverrides = userExpandOverrides.value.size > 0 || groupItemsCache.value.size > 0
    if (hasOverrides) {
      return groups.value.map(g => {
        const cached = groupItemsCache.value.get(g.id)
        return {
          ...g,
          isExpanded: userExpandOverrides.value.has(g.id)
            ? userExpandOverrides.value.get(g.id)!
            : g.isExpanded,
          // Use cached items if server sent empty (collapsed) but user has expanded
          items: (g.items.length === 0 && cached) ? cached.items : g.items,
          totalCount: cached?.totalCount ?? g.totalCount,
          hasMore: cached?.hasMore ?? g.hasMore,
        }
      })
    }

    return groups.value
  })

  // --- Column Visibility ---
  async function toggleColumnVisibility(columnId: string, visible: boolean) {
    await apiFetch(`/api/agency/boards/${boardId.value}/columns/${columnId}`, {
      method: 'PATCH',
      body: { isVisible: visible },
    })
    await refreshColumns()
  }

  // --- Column Resize ---
  async function resizeColumn(columnId: string, width: number) {
    await apiFetch(`/api/agency/boards/${boardId.value}/columns/${columnId}`, {
      method: 'PATCH',
      body: { width },
    })
    await refreshColumns()
  }

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
    if (cv) {
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

    // Fallback: synthesize values from native task fields for default columns
    const slug = col.slug
    const type = col.columnType || col.type

    if (slug === 'due_date' && type === 'date' && item.dueDate) {
      return { id: '', taskId: item.id, columnId: col.id, dateValue: item.dueDate, createdAt: '', updatedAt: '' }
    }
    if (slug === 'status' && type === 'status' && item.status) {
      const matchedStatus = statuses.value.find((s: any) => s.name === item.status)
      if (matchedStatus) {
        return { id: '', taskId: item.id, columnId: col.id, textValue: item.status, jsonValue: { optionId: matchedStatus.id, label: item.status }, createdAt: '', updatedAt: '' }
      }
    }
    if (slug === 'assignee' && type === 'people' && item.assignees?.length) {
      return { id: '', taskId: item.id, columnId: col.id, jsonValue: { userIds: item.assignees.map(a => a.id), names: item.assignees.map(a => a.name) }, createdAt: '', updatedAt: '' }
    }
    if (slug === 'client' && (type === 'client' || type === 'text') && item.clients?.length) {
      return { id: '', taskId: item.id, columnId: col.id, textValue: item.clients[0], jsonValue: { clientName: item.clients[0] }, createdAt: '', updatedAt: '' }
    }
    if (slug === 'priority' && type === 'dropdown' && item.priority) {
      const pVal = item.priority.toLowerCase()
      return { id: '', taskId: item.id, columnId: col.id, textValue: item.priority, jsonValue: { optionId: pVal, label: item.priority.charAt(0).toUpperCase() + item.priority.slice(1) }, createdAt: '', updatedAt: '' }
    }

    // Budget column: combines estimated + actual cost into a progress-style cell
    if (slug === 'budget' && type === 'budget' && item.estimatedCost != null) {
      return {
        id: '', taskId: item.id, columnId: col.id,
        numberValue: item.estimatedCost,
        jsonValue: {
          actualCost: item.actualCost || 0,
          currency: item.currency || 'AUD',
          budgetSource: item.budgetSource || 'manual',
        },
        createdAt: '', updatedAt: '',
      }
    }
    if (slug === 'billing_rate' && type === 'currency' && item.billingRate != null) {
      return { id: '', taskId: item.id, columnId: col.id, numberValue: item.billingRate, createdAt: '', updatedAt: '' }
    }
    if (slug === 'is_billable' && type === 'checkbox') {
      return { id: '', taskId: item.id, columnId: col.id, numberValue: item.isBillable !== false ? 1 : 0, createdAt: '', updatedAt: '' }
    }

    return null
  }

  /**
   * Enhanced cell update that syncs with platform APIs.
   * Status -> updates tasks.status_id
   * People -> updates tasks.assignee_id
   * Label -> updates task_label_assignments
   */
  async function handleCellUpdate(taskId: string, columnId: string, payload: any) {
    const col = columns.value.find(c => c.id === columnId)
    const colType = col?.columnType || col?.type

    // Sync status changes with the task status API
    if (colType === 'status' && payload.jsonValue?.optionId) {
      const statusId = payload.jsonValue.optionId
      const matchingStatus = statuses.value.find((s: any) => s.id === statusId)
      if (matchingStatus) {
        apiFetch(`/api/agency/tasks/${taskId}/status`, {
          method: 'PATCH',
          body: { statusId },
        }).catch((err: any) => console.error('Failed to sync task status:', err))
      }
    }

    // Sync people changes with the task assignee
    if (colType === 'people' && payload.jsonValue?.userIds) {
      const userIds = payload.jsonValue.userIds as string[]
      apiFetch(`/api/agency/tasks/${taskId}`, {
        method: 'PUT',
        body: { assigneeId: userIds[0] || null },
      }).catch((err: any) => console.error('Failed to sync task assignee:', err))
    }

    // Sync label changes with the task labels
    if (colType === 'label' && payload.jsonValue?.labelIds) {
      apiFetch(`/api/agency/tasks/${taskId}`, {
        method: 'PUT',
        body: { labels: payload.jsonValue.labelIds },
      }).catch((err: any) => console.error('Failed to sync task labels:', err))
    }

    // Route pricing column updates directly to the task API (stored on tasks table, not column values)
    const pricingSlugs = ['budget', 'billing_rate', 'is_billable']
    if (col && pricingSlugs.includes(col.slug)) {
      const taskBody: Record<string, any> = {}
      if (col.slug === 'budget') taskBody.estimatedCost = payload.numberValue
      if (col.slug === 'billing_rate') taskBody.billingRate = payload.numberValue
      if (col.slug === 'is_billable') taskBody.isBillable = payload.numberValue === 1
      await apiFetch(`/api/agency/tasks/${taskId}`, { method: 'PUT', body: taskBody })
      return
    }

    // Always update the cell value (custom column storage)
    await updateCellValue(taskId, columnId, payload)
  }

  return {
    // Data
    board,
    groups,
    filteredGroups,
    columns,
    allColumns,
    allItems,
    totalItems,
    pending,
    error,
    statuses,

    // Actions
    refresh,
    refreshColumns,
    toggleColumnVisibility,
    resizeColumn,

    // View
    activeView,
    searchQuery,

    // Filter / Sort / Group
    filters,
    sortRules,
    groupByColumnId,
    toggleGroupExpanded,
    updateGroupItemsCache,

    // Cell values
    normalizeColumn,
    getCellValue,
    handleCellUpdate,
  }
}
