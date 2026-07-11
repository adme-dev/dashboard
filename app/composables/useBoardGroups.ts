/**
 * Board Groups composable
 * CRUD operations for board groups with optimistic updates.
 */

interface BoardGroup {
  id: string
  name: string
  color: string
  sortOrder: number
  isCollapsed: boolean
  taskCount: number
  createdAt: string
  updatedAt: string
}

interface CreateGroupPayload {
  name: string
  color?: string
}

interface UpdateGroupPayload {
  name?: string
  color?: string
  isCollapsed?: boolean
  sortOrder?: number
}

export function useBoardGroups(boardId: Ref<string> | string) {
  const toast = useToast()
  const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string, body?: unknown }) => Promise<T>
  const id = typeof boardId === 'string' ? boardId : boardId

  const resolvedId = computed(() => typeof id === 'string' ? id : id.value)

  const data = ref<{ groups: BoardGroup[] }>({ groups: [] })
  const pending = ref(false)

  async function refresh() {
    pending.value = true
    try {
      data.value = await apiFetch<{ groups: BoardGroup[] }>(`/api/agency/boards/${resolvedId.value}/groups`)
    } catch {
      data.value = { groups: [] }
    } finally {
      pending.value = false
    }
  }

  watch(resolvedId, () => {
    void refresh()
  }, { immediate: true })

  const groups = computed<BoardGroup[]>(() => (data.value as any)?.groups || [])

  async function createGroup(payload: CreateGroupPayload): Promise<BoardGroup | null> {
    try {
      const result = await apiFetch<{ group: BoardGroup }>(
        `/api/agency/boards/${resolvedId.value}/groups`,
        { method: 'POST', body: payload }
      )
      await refresh()
      toast.add({ title: 'Group created', color: 'success' })
      return result.group
    } catch (err: any) {
      toast.add({
        title: 'Failed to create group',
        description: err?.data?.statusMessage || 'Something went wrong',
        color: 'error',
      })
      return null
    }
  }

  async function updateGroup(groupId: string, payload: UpdateGroupPayload): Promise<boolean> {
    try {
      await apiFetch(
        `/api/agency/boards/${resolvedId.value}/groups/${groupId}`,
        { method: 'PATCH', body: payload }
      )
      await refresh()
      return true
    } catch (err: any) {
      toast.add({
        title: 'Failed to update group',
        description: err?.data?.statusMessage || 'Something went wrong',
        color: 'error',
      })
      return false
    }
  }

  async function deleteGroup(groupId: string): Promise<boolean> {
    try {
      await apiFetch(
        `/api/agency/boards/${resolvedId.value}/groups/${groupId}`,
        { method: 'DELETE' }
      )
      await refresh()
      toast.add({ title: 'Group deleted', color: 'success' })
      return true
    } catch (err: any) {
      toast.add({
        title: 'Failed to delete group',
        description: err?.data?.statusMessage || 'Something went wrong',
        color: 'error',
      })
      return false
    }
  }

  async function reorderGroups(groupIds: string[]): Promise<boolean> {
    try {
      await apiFetch(
        `/api/agency/boards/${resolvedId.value}/groups/reorder`,
        { method: 'PATCH', body: { groupIds } }
      )
      await refresh()
      return true
    } catch (err: any) {
      toast.add({
        title: 'Failed to reorder groups',
        description: err?.data?.statusMessage || 'Something went wrong',
        color: 'error',
      })
      return false
    }
  }

  async function toggleCollapse(groupId: string, isCollapsed: boolean): Promise<void> {
    await updateGroup(groupId, { isCollapsed })
  }

  return {
    groups,
    pending,
    refresh,
    createGroup,
    updateGroup,
    deleteGroup,
    reorderGroups,
    toggleCollapse,
  }
}
