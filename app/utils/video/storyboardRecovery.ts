import { watch, type Ref } from 'vue'

/** Restore the edit lock before the project becomes interactive, then wait for
 * both independent loads. A busy storyboard GET must never drop recovery. */
export function installStoryboardRecovery(input: {
  pending: Ref<string | null>
  status: Ref<string>
  loading: Ref<boolean>
  hold(): void
  recover(): Promise<unknown>
}) {
  if (input.pending.value) input.hold()
  let started = false
  return watch([input.status, input.loading], ([status, loading]) => {
    if (status === 'ready' && !loading && input.pending.value && !started) {
      started = true
      void input.recover()
    }
  }, { immediate: true })
}
