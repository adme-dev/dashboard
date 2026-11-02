import { ref } from 'vue'

/** The embedded library must not silently replace an unsaved composer. */
export function useEdmWorkspaceLeave(options: { hasChanges: () => boolean, isBusy: () => boolean, save: () => Promise<boolean> }) {
  const open = ref(false)
  const saving = ref(false)
  let resolve: ((leave: boolean) => void) | null = null
  function finish(leave: boolean) {
    const reply = resolve
    resolve = null
    open.value = false
    reply?.(leave)
  }
  function request() {
    if (!options.hasChanges() && !options.isBusy()) return true
    if (resolve) return false
    open.value = true
    return new Promise<boolean>((reply) => {
      resolve = reply
    })
  }
  async function saveAndLeave() {
    if (options.isBusy() || saving.value) return
    saving.value = true
    try {
      if (await options.save() && !options.hasChanges() && !options.isBusy()) finish(true)
    } finally { saving.value = false }
  }
  return { open, saving, request, stay: () => finish(false), discard: () => {
    if (!options.isBusy()) finish(true)
  }, saveAndLeave }
}
