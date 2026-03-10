import type { EditLayerResult } from '~/types/banner-studio'

// Module-scope singleton state — shared across all callers
const _isEditing = ref(false)
const _editingLayerId = ref<number | null>(null)
const _showEditSlideover = ref(false)
const _editPrompt = ref('')
const _editPreviewUrl = ref<string | null>(null)
const _editError = ref<string | null>(null)
const _editGuidance = ref(4.0)
const _editSteps = ref(40)

export function useAiLayerEdit() {
  const { activeLayers, updateLayer } = useBannerStudio()
  const toast = useToast()

  function openEdit(layer: { id: number }) {
    _editingLayerId.value = layer.id
    _editPrompt.value = ''
    _editPreviewUrl.value = null
    _editError.value = null
    _editGuidance.value = 4.0
    _editSteps.value = 40
    _showEditSlideover.value = true
  }

  async function submitEdit() {
    const layerId = _editingLayerId.value
    if (!layerId || !_editPrompt.value.trim()) return

    const layer = activeLayers.value.find(l => l.id === layerId)
    if (!layer?.src) {
      _editError.value = 'Layer has no image source'
      return
    }

    _isEditing.value = true
    _editError.value = null
    _editPreviewUrl.value = null

    try {
      const result = await $fetch<EditLayerResult>('/api/agency/banner-studio/ai/edit-layer', {
        method: 'POST',
        body: {
          imageUrl: layer.src,
          prompt: _editPrompt.value.trim(),
          width: layer.w,
          height: layer.h,
          guidanceScale: _editGuidance.value,
          steps: _editSteps.value,
        },
      })

      if (!result?.url) {
        _editError.value = 'No image returned from AI'
        return
      }

      _editPreviewUrl.value = result.url
    } catch (err: any) {
      _editError.value = err?.data?.statusMessage || err?.message || 'AI edit failed'
    } finally {
      _isEditing.value = false
    }
  }

  function applyEdit() {
    const layerId = _editingLayerId.value
    const previewUrl = _editPreviewUrl.value
    if (!layerId || !previewUrl) return

    // Check layer still exists
    const layer = activeLayers.value.find(l => l.id === layerId)
    if (!layer) {
      toast.add({ title: 'Layer removed', description: 'The layer was deleted while editing', color: 'warning' })
      cancelEdit()
      return
    }

    updateLayer(layerId, { src: previewUrl })
    toast.add({ title: 'Edit applied', description: 'Layer image updated with AI edit', color: 'success' })
    _showEditSlideover.value = false
    _editingLayerId.value = null
    _editPreviewUrl.value = null
    _editPrompt.value = ''
  }

  function cancelEdit() {
    _showEditSlideover.value = false
    _editingLayerId.value = null
    _editPreviewUrl.value = null
    _editPrompt.value = ''
    _editError.value = null
  }

  return {
    isEditing: _isEditing,
    editingLayerId: _editingLayerId,
    showEditSlideover: _showEditSlideover,
    editPrompt: _editPrompt,
    editPreviewUrl: _editPreviewUrl,
    editError: _editError,
    editGuidance: _editGuidance,
    editSteps: _editSteps,
    openEdit,
    submitEdit,
    applyEdit,
    cancelEdit,
  }
}
