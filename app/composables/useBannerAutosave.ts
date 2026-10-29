import { onScopeDispose, ref, watch } from 'vue'

/** One editor owns the debounce; the project composable serializes network saves. */
export function useBannerAutosave(
  state: { isDirty: boolean, isSaving: boolean, project: { id?: string, name?: string } | null, sets: unknown },
  save: () => Promise<void>,
) {
  const error = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  let pending: Promise<void> | undefined
  let disposed = false

  function clearTimers() {
    clearTimeout(timer)
    clearTimeout(deadline)
    timer = deadline = undefined
  }
  async function flush() {
    clearTimers()
    if (pending) await pending
    if (disposed || !state.isDirty) return
    if (state.isSaving) {
      schedule()
      return
    }
    pending = save()
    try {
      await pending
      error.value = false
    } catch (cause) {
      if (!disposed) error.value = true
      throw cause
    } finally {
      pending = undefined
      if (!disposed && state.isDirty) {
        // Retry transient failures without flooding the API or discarding edits.
        timer = setTimeout(() => void flush().catch(() => {}), error.value ? 15000 : 2000)
      }
    }
  }
  function schedule() {
    if (disposed || !state.isDirty) return
    clearTimeout(timer)
    timer = setTimeout(() => void flush().catch(() => {}), 2000)
    deadline ??= setTimeout(() => void flush().catch(() => {}), 10000)
  }
  watch(() => [state.sets, state.project?.name, state.isDirty], () => {
    if (state.isDirty) schedule()
    else { clearTimers(); error.value = false }
  }, { deep: true, flush: 'post' })
  onScopeDispose(() => { disposed = true; clearTimers() })
  return { error, flush }
}
