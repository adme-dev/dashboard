import { reactive } from 'vue'

export function useCollapsedSidebarPopovers() {
  const openCollapsedPopovers = reactive(new Set<string>())

  // A flyout can remain mounted and open when one of its links changes the route.
  function handleCollapsedPopoverOpenChange(key: string, open: boolean) {
    if (open) openCollapsedPopovers.add(key)
    else openCollapsedPopovers.delete(key)
  }

  return { openCollapsedPopovers, handleCollapsedPopoverOpenChange }
}
