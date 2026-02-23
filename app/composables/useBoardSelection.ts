/**
 * Board selection state composable
 * Shared across all board views for consistent multi-select.
 */

export function useBoardSelection() {
  const selectedItems = ref<Set<string>>(new Set())
  const showBulkActionsTip = ref(true)

  const selectedCount = computed(() => selectedItems.value.size)
  const hasSelection = computed(() => selectedItems.value.size > 0)

  function isSelected(itemId: string): boolean {
    return selectedItems.value.has(itemId)
  }

  function toggle(itemId: string) {
    if (selectedItems.value.has(itemId)) {
      selectedItems.value.delete(itemId)
    } else {
      selectedItems.value.add(itemId)
    }
  }

  function select(itemId: string) {
    selectedItems.value.add(itemId)
  }

  function deselect(itemId: string) {
    selectedItems.value.delete(itemId)
  }

  function selectAll(itemIds: string[]) {
    for (const id of itemIds) {
      selectedItems.value.add(id)
    }
  }

  function deselectAll(itemIds: string[]) {
    for (const id of itemIds) {
      selectedItems.value.delete(id)
    }
  }

  function clear() {
    selectedItems.value.clear()
  }

  function selectGroup(items: { id: string }[], selected: boolean) {
    if (selected) {
      items.forEach(item => selectedItems.value.add(item.id))
    } else {
      items.forEach(item => selectedItems.value.delete(item.id))
    }
  }

  function isGroupSelected(items: { id: string }[]): boolean {
    return items.length > 0 && items.every(item => selectedItems.value.has(item.id))
  }

  function dismissTip() {
    showBulkActionsTip.value = false
  }

  return {
    selectedItems,
    selectedCount,
    hasSelection,
    showBulkActionsTip,
    isSelected,
    toggle,
    select,
    deselect,
    selectAll,
    deselectAll,
    clear,
    selectGroup,
    isGroupSelected,
    dismissTip,
  }
}
