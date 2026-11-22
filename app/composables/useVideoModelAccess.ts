import { computed, ref, watch, type Ref } from 'vue'
import type { VideoModelOption } from '~~/app/utils/video/modelPresentation'
import type { GenerationBudgetStatus } from '~~/app/utils/video/generationBudget'

interface ModelResponse {
  models: VideoModelOption[]
  policy?: { enabled: boolean, payer?: 'agency' | 'tenant' }
  budget?: GenerationBudgetStatus | null
}

export function useVideoModelAccess(projectId: Ref<string>, active: Ref<boolean>) {
  const data = ref<ModelResponse>({ models: [] })
  const pending = ref(false)
  const errorDetail = ref('')
  const failed = ref(false)
  const revision = ref(0)

  watch([projectId, active, revision], async ([id, enabled], _, onCleanup) => {
    let current = true
    onCleanup(() => { current = false })
    data.value = { models: [] }
    failed.value = false
    errorDetail.value = ''
    pending.value = Boolean(id && enabled)
    if (!pending.value) return
    try {
      const result = await $fetch<ModelResponse>('/api/agency/video/generation/models', { query: { projectId: id } })
      if (current) data.value = result
    } catch (error) {
      if (!current) return
      const response = error as { statusCode?: number, data?: { data?: { code?: string } } }
      if (response?.data?.data?.code === 'VIDEO_GENERATION_DISABLED') {
        errorDetail.value = 'AI clip generation is disabled for this workspace.'
      } else if (response?.statusCode === 403) {
        errorDetail.value = 'Your account does not have generation access to this project.'
      } else {
        failed.value = true
        errorDetail.value = 'Could not load video models for this project. Try again.'
      }
    } finally {
      if (current) pending.value = false
    }
  }, { immediate: true })

  const models = computed(() => data.value.policy?.enabled === false ? [] : data.value.models)
  const detail = computed(() => {
    if (!active.value) return 'AI clip generation is disabled for this workspace.'
    if (pending.value) return 'Checking AI clip generation access…'
    if (errorDetail.value) return errorDetail.value
    if (data.value.policy?.enabled === false) return 'AI clip generation is disabled for this project.'
    if (!models.value.length) return 'There are no selectable video models for this project.'
    return 'Generate a clip from a prompt or a source image.'
  })
  return { data, models, pending, failed, detail, retry: () => { revision.value++ } }
}
