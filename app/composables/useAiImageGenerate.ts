import type { GenerateImageResult } from '~/types/banner-studio'

// Module-scope singleton state
const _isGenerating = ref(false)
const _showGenerateSlideover = ref(false)
const _generatePrompt = ref('')
const _generatePreviewUrl = ref<string | null>(null)
const _generateError = ref<string | null>(null)
const _generateAspectRatio = ref('1:1')
const _generateGuidance = ref(3.5)
const _generateSteps = ref(28)
const _generatePromptEnhance = ref(true)
const _generateUseSeed = ref(false)
const _generateSeedInput = ref(0)
const _lastGenerateSeed = ref<number | null>(null)

export function useAiImageGenerate() {
  const { addLayer, nextId } = useBannerStudio()
  const toast = useToast()
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string, body?: unknown }
  ) => Promise<T>

  function openGenerate() {
    _generatePrompt.value = ''
    _generatePreviewUrl.value = null
    _generateError.value = null
    _generateAspectRatio.value = '1:1'
    _generateGuidance.value = 3.5
    _generateSteps.value = 28
    _generatePromptEnhance.value = true
    _generateUseSeed.value = false
    _generateSeedInput.value = 0
    _lastGenerateSeed.value = null
    _showGenerateSlideover.value = true
  }

  async function submitGenerate() {
    if (!_generatePrompt.value.trim()) return

    _isGenerating.value = true
    _generateError.value = null
    _generatePreviewUrl.value = null

    try {
      const result = await apiFetch<GenerateImageResult>('/api/agency/banner-studio/ai/generate-image', {
        method: 'POST',
        body: {
          prompt: _generatePrompt.value.trim(),
          aspectRatio: _generateAspectRatio.value,
          guidanceScale: _generateGuidance.value,
          steps: _generateSteps.value,
          promptEnhance: _generatePromptEnhance.value,
          seed: _generateUseSeed.value ? _generateSeedInput.value : undefined,
          randomizeSeed: !_generateUseSeed.value,
        },
      })

      if (!result?.url) {
        _generateError.value = 'No image returned from AI'
        return
      }

      _generatePreviewUrl.value = result.url
      _lastGenerateSeed.value = result.seed ?? null
    } catch (err: any) {
      _generateError.value = err?.data?.statusMessage || err?.message || 'AI generation failed'
    } finally {
      _isGenerating.value = false
    }
  }

  function applyGenerate() {
    const previewUrl = _generatePreviewUrl.value
    if (!previewUrl) return

    // Calculate dimensions from aspect ratio
    const [aw, ah] = _generateAspectRatio.value.split(':').map(Number)
    const baseSize = 300
    const w = aw >= ah ? baseSize : Math.round(baseSize * (aw / ah))
    const h = ah >= aw ? baseSize : Math.round(baseSize * (ah / aw))

    addLayer({
      id: nextId(),
      type: 'image',
      src: previewUrl,
      name: `AI: ${_generatePrompt.value.trim().slice(0, 30)}`,
      x: 10,
      y: 10,
      w,
      h,
      fit: 'contain',
      animIn: 'fadeIn',
    })

    toast.add({ title: 'Image added', description: 'AI generated image added to canvas', color: 'success' })
    _showGenerateSlideover.value = false
    _generatePreviewUrl.value = null
    _generatePrompt.value = ''
  }

  function cancelGenerate() {
    _showGenerateSlideover.value = false
    _generatePreviewUrl.value = null
    _generatePrompt.value = ''
    _generateError.value = null
  }

  return {
    isGenerating: _isGenerating,
    showGenerateSlideover: _showGenerateSlideover,
    generatePrompt: _generatePrompt,
    generatePreviewUrl: _generatePreviewUrl,
    generateError: _generateError,
    generateAspectRatio: _generateAspectRatio,
    generateGuidance: _generateGuidance,
    generateSteps: _generateSteps,
    generatePromptEnhance: _generatePromptEnhance,
    generateUseSeed: _generateUseSeed,
    generateSeedInput: _generateSeedInput,
    lastGenerateSeed: _lastGenerateSeed,
    openGenerate,
    submitGenerate,
    applyGenerate,
    cancelGenerate,
  }
}
