import { computed, ref, watch } from 'vue'
import { useBannerStudio } from './useBannerStudio'
import { isBannerCopyLayerProtected, isSafeBannerRewrite } from '../../shared/bannerCopyProtection'

export interface BannerCopySuggestion { text: string, tone: string, charCount: number }
type CopyResponse = { sourceRevision: string, suggestions: BannerCopySuggestion[], evidence?: { provider: string, model: string, fallback?: boolean } }
type CopyFetch = (url: string, options: { method: 'POST', body: unknown }) => Promise<CopyResponse>

/** One transient proposal, bound to the current project, artboard and selection revision. */
export function useBannerCopyProposal(fetcher: CopyFetch = $fetch) {
  const studio = useBannerStudio()
  const instruction = ref('Make this heading warmer and concise. Preserve its meaning.')
  const suggestions = ref<BannerCopySuggestion[]>([])
  const loading = ref(false), error = ref('')
  const candidate = ref<BannerCopySuggestion | null>(null)
  const evidence = ref<CopyResponse['evidence']>()
  let revision = 0, request = 0
  let target: { revision: number, sourceRevision: string, id: number, text: string, layer: typeof studio.selectedLayer.value } | null = null
  const dispose = watch([
    () => studio.state.project,
    () => studio.state.activeKey,
    () => studio.state.selectedLayerId,
    () => studio.state.sets,
    () => studio.state.isDirty
  ], () => {
    revision++
    if (target) error.value = 'The selection or document changed. Generate new suggestions.'
    target = null
    suggestions.value = []
    candidate.value = null
    evidence.value = undefined
  }, { deep: true, flush: 'sync' })
  const protectedCopy = computed(() => isBannerCopyLayerProtected(studio.selectedLayer.value || {}))
  const previewLayer = computed(() => candidate.value && target?.revision === revision && target.layer
    ? { ...target.layer, text: candidate.value.text, textRuns: undefined }
    : null)

  async function generate() {
    const layer = studio.selectedLayer.value
    if (!layer?.text || layer.type !== 'text' || protectedCopy.value) {
      error.value = 'Approved copy, detected facts, merge fields and feed-bound text are protected.'
      return
    }
    if (!studio.state.project?.id || !studio.state.project.updatedAt || studio.state.isDirty) {
      error.value = 'Save the current artwork before requesting new suggestions.'
      return
    }
    const currentRequest = ++request
    target = { revision, sourceRevision: studio.state.project.updatedAt, id: layer.id, text: layer.text, layer: JSON.parse(JSON.stringify(layer)) }
    const captured = target
    loading.value = true
    error.value = ''
    suggestions.value = []
    candidate.value = null
    evidence.value = undefined
    try {
      const response = await fetcher('/api/agency/banner-studio/ai/copy-suggest', {
        method: 'POST', body: {
          text: captured.text, instruction: instruction.value,
          projectId: studio.state.project.id, sourceRevision: captured.sourceRevision,
          selection: { layerId: captured.id, formatKey: studio.state.activeKey }
        }
      })
      if (request !== currentRequest || target !== captured || revision !== captured.revision) return
      if (response.sourceRevision !== captured.sourceRevision) {
        target = null
        error.value = 'The saved artwork changed. Save/reload, then request new suggestions.'
        return
      }
      suggestions.value = response.suggestions.filter(s => isSafeBannerRewrite(captured.text, s.text))
      evidence.value = response.evidence
      if (!suggestions.value.length) error.value = 'No safe alternatives returned. Try another instruction.'
    } catch (failure) {
      if (request === currentRequest && target === captured) {
        const status = (failure as { statusCode?: number, status?: number })?.statusCode || (failure as { status?: number })?.status
        error.value = status === 409 ? 'Save the current artwork, then request new suggestions.' : 'AI copy is unavailable. Your artwork is unchanged.'
      }
    } finally { if (request === currentRequest) loading.value = false }
  }
  function preview(suggestion: BannerCopySuggestion) {
    if (target?.revision === revision && suggestions.value.includes(suggestion)) candidate.value = suggestion
  }
  function apply(): boolean {
    if (!target || target.revision !== revision || !candidate.value || studio.state.selectedLayerId !== target.id) return false
    const layer = studio.selectedLayer.value
    if (!layer || layer.text !== target.text || !isSafeBannerRewrite(target.text, candidate.value.text, layer.copyLocked)) return false
    const { id } = target, text = candidate.value.text
    // One existing history entry, preserving all other layer attributes and layers.
    target = null
    studio.updateLayer(id, { text, textRuns: undefined })
    return true
  }
  return { instruction, suggestions, loading, error, protectedCopy, previewLayer, evidence, generate, preview, apply, dispose }
}
