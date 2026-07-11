/**
 * Board Columns composable
 * Column CRUD, reorder, visibility management.
 */

interface BoardColumn {
  id: string
  name: string
  slug: string
  type: string
  columnType: string
  description?: string
  settings: any
  isVisible: boolean
  isRequired?: boolean
  allowedRoles?: string[]
  editableRoles?: string[]
  width: number
  sortOrder: number
}

interface ColumnOption {
  id: string
  columnId: string
  value: string
  label: string
  color: string
  sortOrder: number
  isDefault: boolean
}

interface UpdateColumnPayload {
  name?: string
  description?: string
  settings?: any
  width?: number
  isVisible?: boolean
  isRequired?: boolean
  allowedRoles?: string[]
  editableRoles?: string[]
}

export function useBoardColumns(boardId: Ref<string> | string) {
  const toast = useToast()
  const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string, body?: unknown }) => Promise<T>
  const resolvedId = computed(() => typeof boardId === 'string' ? boardId : boardId.value)

  const data = ref<{ columns: BoardColumn[] }>({ columns: [] })
  const pending = ref(false)

  async function refresh() {
    pending.value = true
    try {
      data.value = await apiFetch<{ columns: BoardColumn[] }>(`/api/agency/boards/${resolvedId.value}/columns`)
    } catch {
      data.value = { columns: [] }
    } finally {
      pending.value = false
    }
  }

  watch(resolvedId, () => {
    void refresh()
  }, { immediate: true })

  const columns = computed<BoardColumn[]>(() => (data.value as any)?.columns || [])

  async function updateColumn(columnId: string, payload: UpdateColumnPayload): Promise<boolean> {
    try {
      await apiFetch(
        `/api/agency/boards/${resolvedId.value}/columns/${columnId}`,
        { method: 'PATCH', body: payload }
      )
      await refresh()
      return true
    } catch (err: any) {
      toast.add({
        title: 'Failed to update column',
        description: err?.data?.statusMessage || 'Something went wrong',
        color: 'error',
      })
      return false
    }
  }

  async function deleteColumn(columnId: string): Promise<boolean> {
    try {
      await apiFetch(
        `/api/agency/boards/${resolvedId.value}/columns/${columnId}`,
        { method: 'DELETE' }
      )
      await refresh()
      toast.add({ title: 'Column deleted', color: 'success' })
      return true
    } catch (err: any) {
      toast.add({
        title: 'Failed to delete column',
        description: err?.data?.statusMessage || 'Something went wrong',
        color: 'error',
      })
      return false
    }
  }

  async function reorderColumns(columnIds: string[]): Promise<boolean> {
    try {
      await apiFetch(
        `/api/agency/boards/${resolvedId.value}/columns/reorder`,
        { method: 'PATCH', body: { columnIds } }
      )
      await refresh()
      return true
    } catch (err: any) {
      toast.add({
        title: 'Failed to reorder columns',
        description: err?.data?.statusMessage || 'Something went wrong',
        color: 'error',
      })
      return false
    }
  }

  async function toggleVisibility(columnId: string, isVisible: boolean): Promise<boolean> {
    return updateColumn(columnId, { isVisible })
  }

  async function resizeColumn(columnId: string, width: number): Promise<boolean> {
    return updateColumn(columnId, { width })
  }

  // --- Dropdown Option Management ---

  async function addOption(columnId: string, payload: { label: string; color?: string; isDefault?: boolean }): Promise<ColumnOption | null> {
    try {
      const result = await apiFetch<{ option: ColumnOption }>(
        `/api/agency/columns/${columnId}/options`,
        { method: 'POST', body: payload }
      )
      await refresh()
      return result.option
    } catch (err: any) {
      toast.add({
        title: 'Failed to add option',
        description: err?.data?.statusMessage || 'Something went wrong',
        color: 'error',
      })
      return null
    }
  }

  async function updateOption(columnId: string, optionId: string, payload: { label?: string; color?: string; sortOrder?: number; isDefault?: boolean }): Promise<boolean> {
    try {
      await apiFetch(
        `/api/agency/columns/${columnId}/options/${optionId}`,
        { method: 'PATCH', body: payload }
      )
      await refresh()
      return true
    } catch (err: any) {
      toast.add({
        title: 'Failed to update option',
        description: err?.data?.statusMessage || 'Something went wrong',
        color: 'error',
      })
      return false
    }
  }

  return {
    columns,
    pending,
    refresh,
    updateColumn,
    deleteColumn,
    reorderColumns,
    toggleVisibility,
    resizeColumn,
    addOption,
    updateOption,
  }
}
