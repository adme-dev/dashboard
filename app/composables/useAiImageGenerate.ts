import type { GenerateImageResult } from '~/types/banner-studio'
import { BANNER_IMAGE_MODEL } from '~~/shared/bannerImageGeneration'

const isGenerating = ref(false)
const showGenerateSlideover = ref(false)
const generatePrompt = ref('')
const generatePreviewUrl = ref<string | null>(null)
const generateError = ref<string | null>(null)
const generateAspectRatio = ref('1:1')
const generationReady = ref(false)
let requestVersion = 0
let sourceProjectId: string | null = null
let sourceClientId: string | null = null

export function useAiImageGenerate() {
  const { addLayer, state, activeFormat } = useBannerStudio()
  const toast = useToast()

  function openGenerate() {
    cancelGenerate()
    sourceProjectId = state.project?.id ?? null
    sourceClientId = state.project?.clientId ?? null
    generateAspectRatio.value = '1:1'
    showGenerateSlideover.value = true
  }

  async function submitGenerate() {
    if (!generatePrompt.value.trim() || isGenerating.value) return
    const version = ++requestVersion
    const projectId = state.project?.id ?? null
    const clientId = state.project?.clientId ?? null
    sourceProjectId = projectId
    sourceClientId = clientId
    isGenerating.value = true
    generateError.value = null
    generatePreviewUrl.value = null
    generationReady.value = false
    try {
      const result = await $fetch<GenerateImageResult>('/api/agency/banner-studio/ai/generate-image', {
        method: 'POST',
        body: {
          prompt: generatePrompt.value.trim(),
          projectId,
          clientId: clientId || undefined,
          aspectRatio: generateAspectRatio.value,
          modelId: BANNER_IMAGE_MODEL.id,
          subjectType: 'non_vehicle'
        }
      })
      if (version !== requestVersion || (state.project?.id ?? null) !== projectId || (state.project?.clientId ?? null) !== clientId) return
      if (!result?.url) throw new Error('No image returned from AI')
      generatePreviewUrl.value = result.url
      generationReady.value = result.status === 'ready'
      if (!generationReady.value) generateError.value = 'The image needs a successful quality review before it can be added. Your canvas is unchanged.'
    } catch (error: unknown) {
      if (version === requestVersion && (state.project?.id ?? null) === projectId && (state.project?.clientId ?? null) === clientId) {
        const err = error as { data?: { statusMessage?: string }, message?: string }
        generateError.value = err.data?.statusMessage || err.message || 'AI generation failed'
      }
    } finally {
      if (version === requestVersion) isGenerating.value = false
    }
  }

  function applyGenerate(asBackground = false) {
    const src = generatePreviewUrl.value
    if (!src || !generationReady.value || (state.project?.id ?? null) !== sourceProjectId || (state.project?.clientId ?? null) !== sourceClientId) return
    const [aw, ah] = generateAspectRatio.value.split(':').map(Number)
    const format = activeFormat.value
    const w = asBackground ? format?.w || 300 : Math.min(format?.w || 300, 600)
    const h = asBackground ? format?.h || 250 : Math.round(w * ah / aw)
    addLayer({
      type: asBackground ? 'bg' : 'image', src, srcType: 'image',
      name: `AI: ${generatePrompt.value.trim().slice(0, 30)}`,
      x: asBackground ? 0 : 10, y: asBackground ? 0 : 10,
      w, h, ...(asBackground ? { zIndex: 0 } : {}),
      fit: asBackground ? 'cover' : 'contain', animIn: 'fadeIn'
    })
    toast.add({ title: asBackground ? 'Background added' : 'Image added', color: 'success' })
    cancelGenerate()
  }

  function cancelGenerate() {
    requestVersion++
    isGenerating.value = false
    showGenerateSlideover.value = false
    generatePreviewUrl.value = null
    generatePrompt.value = ''
    generateError.value = null
    generationReady.value = false
  }

  return {
    isGenerating, showGenerateSlideover, generatePrompt, generatePreviewUrl,
    generateError, generateAspectRatio, generationReady,
    openGenerate, submitGenerate, applyGenerate, cancelGenerate
  }
}
