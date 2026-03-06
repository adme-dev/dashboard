/**
 * Board subitems composable
 * Manages expand/collapse state and lazy-loading of inline subtasks on the board table view.
 */

import type { BoardItem, BoardGroup } from '~/composables/useBoardData'

interface SubitemCount {
  total: number
  completed: number
}

const expandedItems = ref<Set<string>>(new Set())
const subitemsByParent = ref<Map<string, BoardItem[]>>(new Map())
const subitemCounts = ref<Map<string, SubitemCount>>(new Map())
const loadingParents = ref<Set<string>>(new Set())

export function useBoardSubitems() {
  /** Populate counts from board API response on load */
  function initCounts(groups: BoardGroup[]) {
    const counts = new Map<string, SubitemCount>()
    for (const group of groups) {
      for (const item of group.items) {
        const total = (item as any).subtaskCount ?? 0
        const completed = (item as any).completedSubtaskCount ?? 0
        if (total > 0) {
          counts.set(item.id, { total, completed })
        }
      }
    }
    subitemCounts.value = counts
  }

  /** Toggle expand/collapse and lazy-fetch subitems on first expand */
  async function toggleExpand(parentTaskId: string, boardId: string) {
    const next = new Set(expandedItems.value)
    if (next.has(parentTaskId)) {
      next.delete(parentTaskId)
      expandedItems.value = next
      return
    }

    next.add(parentTaskId)
    expandedItems.value = next

    // Lazy-fetch on first expand
    if (!subitemsByParent.value.has(parentTaskId)) {
      await fetchSubitems([parentTaskId], boardId)
    }
  }

  /** Fetch subitems for given parent task IDs */
  async function fetchSubitems(parentIds: string[], boardId: string) {
    const loading = new Set(loadingParents.value)
    for (const id of parentIds) loading.add(id)
    loadingParents.value = loading

    try {
      const data = await $fetch<{ subitems: Record<string, BoardItem[]> }>(
        `/api/agency/boards/${boardId}/subitems`,
        { params: { taskIds: parentIds.join(',') } },
      )
      const next = new Map(subitemsByParent.value)
      // Set entries for all requested parents (empty array if none returned)
      for (const id of parentIds) {
        next.set(id, data.subitems[id] || [])
      }
      subitemsByParent.value = next
    } catch (err) {
      console.error('Failed to fetch subitems:', err)
    } finally {
      const done = new Set(loadingParents.value)
      for (const id of parentIds) done.delete(id)
      loadingParents.value = done
    }
  }

  /** Add a new subitem via API and update local cache optimistically */
  async function addSubitem(parentTaskId: string, title: string, boardId: string) {
    try {
      const data = await $fetch<{ subtask: any }>(
        `/api/agency/tasks/${parentTaskId}/subtasks`,
        { method: 'POST', body: { title } },
      )
      const newItem: BoardItem = {
        id: data.subtask.id,
        title: data.subtask.title,
        priority: data.subtask.priority || 'medium',
        status: data.subtask.statusName || 'Unknown',
        statusColor: data.subtask.statusColor || '#C4C4C4',
        assignees: data.subtask.assigneeId
          ? [{ id: data.subtask.assigneeId, name: data.subtask.assigneeName || '' }]
          : [],
        columnValues: {},
        columnValuesArray: [],
      }

      // Update cache
      const next = new Map(subitemsByParent.value)
      const existing = next.get(parentTaskId) || []
      next.set(parentTaskId, [...existing, newItem])
      subitemsByParent.value = next

      // Update count
      const counts = new Map(subitemCounts.value)
      const current = counts.get(parentTaskId) || { total: 0, completed: 0 }
      counts.set(parentTaskId, { total: current.total + 1, completed: current.completed })
      subitemCounts.value = counts

      // Auto-expand if not already
      if (!expandedItems.value.has(parentTaskId)) {
        const expanded = new Set(expandedItems.value)
        expanded.add(parentTaskId)
        expandedItems.value = expanded
      }

      return newItem
    } catch (err: any) {
      console.error('Failed to add subitem:', err)
      throw err
    }
  }

  /** Remove subitem from local cache */
  function removeSubitem(parentTaskId: string, subitemId: string) {
    const next = new Map(subitemsByParent.value)
    const items = next.get(parentTaskId)
    if (items) {
      next.set(parentTaskId, items.filter(i => i.id !== subitemId))
      subitemsByParent.value = next
    }

    const counts = new Map(subitemCounts.value)
    const current = counts.get(parentTaskId)
    if (current && current.total > 0) {
      counts.set(parentTaskId, { total: current.total - 1, completed: current.completed })
      subitemCounts.value = counts
    }
  }

  /** Re-fetch subitems for currently expanded parents (e.g. after board refresh) */
  async function refreshExpanded(boardId: string) {
    const parentIds = Array.from(expandedItems.value)
    if (parentIds.length > 0) {
      await fetchSubitems(parentIds, boardId)
    }
  }

  /** Reset all state (on board change) */
  function reset() {
    expandedItems.value = new Set()
    subitemsByParent.value = new Map()
    subitemCounts.value = new Map()
    loadingParents.value = new Set()
  }

  // Accessors
  function isExpanded(id: string) { return expandedItems.value.has(id) }
  function getSubitems(id: string) { return subitemsByParent.value.get(id) || [] }
  function getCount(id: string) { return subitemCounts.value.get(id) || null }
  function isLoading(id: string) { return loadingParents.value.has(id) }

  return {
    initCounts,
    toggleExpand,
    addSubitem,
    removeSubitem,
    refreshExpanded,
    reset,
    isExpanded,
    getSubitems,
    getCount,
    isLoading,
  }
}
