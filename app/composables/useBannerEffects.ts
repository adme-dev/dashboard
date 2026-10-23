import { computed, ref, reactive, watch, onBeforeUnmount } from 'vue'
import { apiErrorDescription } from '~/utils/apiError'
import { measureArtwork, fitArtworkToText, type ArtworkMeasure } from '~/utils/banner-artwork'
import { bannerEffectRecipeSchema, effectStyleFromLayer, type BannerEffectRecipe, type BannerEffectStyle } from '~~/shared/bannerEffects'

type Reference = { id: string, name: string, description: string, kind: 'image' | 'guide', url?: string }
type Preset = { id: string, name: string, clientId: string | null, recipe: BannerEffectRecipe }
type Review = { status: 'passed' | 'rejected' | 'unavailable', message: string }
type ArtworkResponse = { url?: string, assetId?: string, status: string, review?: Review }
const blankRecipe = (): BannerEffectRecipe => ({ style: {}, prompt: '', modelId: 'aigateway/recraft-offer-card', referenceIds: [], referenceProjectId: null, artworkMode: 'keep-font' })

export function useBannerEffects() {
  const { state, selectedLayer, activeFormat, updateLayer, addLayer, withCanvasUndo } = useBannerStudio()
  const toast = useToast()
  const recipe = ref<BannerEffectRecipe>(blankRecipe())
  const presets = ref<Preset[]>([])
  const references = ref<Reference[]>([])
  const loading = ref(false)
  const uploading = ref(false)
  const generating = ref(false)
  const saving = ref(false)
  const reviewing = ref(false)
  const fitting = ref(false)
  const error = ref('')
  const preview = ref<{ url: string, assetId?: string, ready: boolean, review?: Review, measure?: ArtworkMeasure } | null>(null)
  const originalStyles = reactive(new Map<string, BannerEffectStyle>())
  let epoch = 0
  let previewEpoch = -1
  let controller: AbortController | undefined
  const sourceText = computed(() => selectedLayer.value?.type === 'text' ? selectedLayer.value : state.sets?.[state.activeKey]?.layers.find(l => l.type === 'text' && l.id === selectedLayer.value?.effectOrigin?.sourceLayerId))
  const isArtwork = computed(() => selectedLayer.value?.type === 'image' && !!selectedLayer.value.effectOrigin)
  const selectionKey = computed(() => `${state.project?.id}:${state.project?.clientId}:${state.activeKey}:${selectedLayer.value?.id}:${selectedLayer.value?.type}:${sourceText.value?.text ?? ''}`)
  const contextKey = computed(() => `${state.project?.id}:${state.project?.clientId}`)
  const current = (version: number) => version === epoch
  const canGenerate = computed(() => state.project?.id !== 'new' && !state.isDirty && !selectedLayer.value?.locked && !sourceText.value?.locked && !!sourceText.value?.text?.trim() && sourceText.value.text.length <= 250 && !!recipe.value.prompt.trim() && !!state.project?.id && !generating.value && !reviewing.value && !uploading.value && !fitting.value)

  function selectedRecipe() {
    const saved = bannerEffectRecipeSchema.safeParse(selectedLayer.value?.effectOrigin?.recipe)
    const style = selectedLayer.value ? effectStyleFromLayer(selectedLayer.value as unknown as Record<string, unknown>) : {}
    return saved.success ? { ...JSON.parse(JSON.stringify(saved.data)), ...(selectedLayer.value?.type === 'text' ? { style } : {}), artworkMode: saved.data.artworkMode ?? 'keep-font' } as BannerEffectRecipe : { ...blankRecipe(), style }
  }

  watch(selectionKey, () => {
    epoch++
    generating.value = false
    reviewing.value = false
    fitting.value = false
    preview.value = null
    error.value = ''
    recipe.value = selectedRecipe()
  }, { immediate: true, flush: 'sync' })

  watch(contextKey, async () => {
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    recipe.value = selectedRecipe()
    saving.value = false
    references.value = []
    presets.value = []
    loading.value = true
    uploading.value = false
    const key = contextKey.value
    try {
      if (!state.project?.id || state.project.id === 'new') return
      const result = await $fetch<{ presets: Preset[] }>('/api/agency/banner-studio/effects/presets', { query: { projectId: state.project.id }, signal })
      if (key === contextKey.value && !signal.aborted) presets.value = result.presets
    } catch (e: unknown) {
      if (!signal.aborted && key === contextKey.value) error.value = apiErrorDescription(e, 'Could not load saved effects. Try reopening Effects.')
    } finally {
      if (!signal.aborted && key === contextKey.value) loading.value = false
    }
  }, { immediate: true, flush: 'sync' })

  function applyStyle() {
    const layer = selectedLayer.value
    if (!layer || layer.locked || !['text', 'image'].includes(layer.type)) return
    const key = `${state.project?.id}:${state.activeKey}:${layer.id}`
    if (!originalStyles.has(key)) originalStyles.set(key, Object.fromEntries(['color', 'textShadow', 'textStroke', 'gradientColors', 'visualFilter', 'textDepth'].map(field => [field, (layer as unknown as Record<string, unknown>)[field]])) as BannerEffectStyle)
    updateLayer(layer.id, { color: layer.color, textShadow: undefined, textStroke: undefined, gradientColors: undefined, visualFilter: undefined, textDepth: undefined, ...recipe.value.style, ...(layer.type !== 'text' ? { color: layer.color, textShadow: layer.textShadow, textStroke: layer.textStroke, gradientColors: layer.gradientColors, textDepth: layer.textDepth } : {}) })
    toast.add({ title: 'Effect applied', color: 'success' })
  }
  function restoreOriginal() {
    const layer = selectedLayer.value
    if (!layer || layer.locked) return
    const key = `${state.project?.id}:${state.activeKey}:${layer.id}`
    const original = originalStyles.get(key)
    if (!original) return
    updateLayer(layer.id, { color: undefined, textShadow: undefined, textStroke: undefined, gradientColors: undefined, visualFilter: undefined, textDepth: undefined, ...original })
    recipe.value.style = effectStyleFromLayer(original as Record<string, unknown>)
    originalStyles.delete(key)
  }
  const canRestore = computed(() => !!selectedLayer.value && originalStyles.has(`${state.project?.id}:${state.activeKey}:${selectedLayer.value.id}`))
  function loadPreset(preset: Preset) {
    const result = bannerEffectRecipeSchema.safeParse(preset.recipe)
    if (!result.success) {
      error.value = 'This saved recipe is invalid. Choose another recipe.'
      return
    }
    recipe.value = { ...result.data, artworkMode: result.data.artworkMode ?? 'keep-font' }
    references.value = []
    preview.value = null
  }
  async function uploadReferences(files: File[]) {
    if (!files.length || !state.project?.id || state.project.id === 'new' || uploading.value) return
    if (files.some(file => file.size > 5 * 1024 * 1024 || !/\.(png|jpe?g|webp|txt|md|markdown)$/i.test(file.name))) {
      error.value = 'Use PNG, JPEG or WebP images under 5 MB, or text/Markdown guides.'
      return
    }
    const key = contextKey.value
    const projectId = state.project.id
    if (files.filter(file => /\.(png|jpe?g|webp)$/i.test(file.name)).length + references.value.filter(r => r.kind === 'image').length > 3) {
      error.value = 'Attach at most three reference images.'
      return
    }
    const signal = controller?.signal
    uploading.value = true
    error.value = ''
    try {
      // New files replace inherited references only after a successful upload.
      for (const file of files) {
        if ((recipe.value.referenceProjectId === projectId ? recipe.value.referenceIds.length : 0) >= 6) throw new Error('Attach at most six references, including up to three images.')
        const body = new FormData()
        body.append('projectId', projectId)
        body.append('file', file)
        const result = await $fetch<{ reference: Reference }>('/api/agency/banner-studio/ai/references', { method: 'POST', body, signal })
        if (key !== contextKey.value || signal?.aborted) return
        if (recipe.value.referenceProjectId !== projectId) {
          recipe.value.referenceIds = []
          references.value = []
        }
        recipe.value.referenceProjectId = projectId
        references.value.push(result.reference)
        recipe.value.referenceIds.push(result.reference.id)
        preview.value = null
      }
    } catch (e: unknown) {
      if (key === contextKey.value && !signal?.aborted) error.value = apiErrorDescription(e, 'Reference upload failed')
    } finally {
      if (key === contextKey.value && !signal?.aborted) uploading.value = false
    }
  }
  function removeReference(id: string) {
    recipe.value.referenceIds = recipe.value.referenceIds.filter(r => r !== id)
    references.value = references.value.filter(r => r.id !== id)
    preview.value = null
  }
  watch(recipe, () => {
    epoch++
    generating.value = false
    reviewing.value = false
    fitting.value = false
    preview.value = null
  }, { deep: true, flush: 'sync' })
  async function generate() {
    if (!canGenerate.value) return
    const version = ++epoch
    const layer = sourceText.value!
    generating.value = true
    error.value = ''
    preview.value = null
    try {
      const generationRecipe = bannerEffectRecipeSchema.parse(recipe.value)
      const result = await $fetch<ArtworkResponse>('/api/agency/banner-studio/ai/generate-image', {
        method: 'POST', body: { projectId: state.project!.id, prompt: generationRecipe.prompt, modelId: generationRecipe.modelId, effect: { layerId: layer.id, formatKey: state.activeKey, text: layer.text, referenceIds: generationRecipe.referenceIds, referenceProjectId: generationRecipe.referenceProjectId, mode: generationRecipe.artworkMode } }
      })
      if (!current(version)) return
      if (!result.url) throw new Error('No preview was returned')
      preview.value = { url: result.url, assetId: result.assetId, ready: result.status === 'ready', review: result.review }
      let measure: ArtworkMeasure | undefined
      try {
        if (generationRecipe.artworkMode !== 'keep-font') measure = await measureArtwork(result.url)
      } catch {
        // Applying can retry loading without another generation.
      }
      if (!current(version)) return
      preview.value = { ...preview.value!, measure }
      previewEpoch = version
      if (!preview.value.ready && !result.review) error.value = 'Artwork needs a successful quality review before it can be added.'
    } catch (e: unknown) {
      if (current(version)) error.value = apiErrorDescription(e, 'Artwork generation failed')
    } finally {
      if (current(version)) generating.value = false
    }
  }
  const canRetryReview = computed(() => !!sourceText.value && !sourceText.value.locked && !!preview.value?.assetId && preview.value.review?.status === 'unavailable' && !state.isDirty && !selectedLayer.value?.locked && !reviewing.value && !generating.value && !fitting.value)
  async function retryReview() {
    if (!canRetryReview.value) return
    const version = epoch
    const held = preview.value!
    const layer = sourceText.value!
    reviewing.value = true
    error.value = ''
    try {
      const result = await $fetch<ArtworkResponse>('/api/agency/banner-studio/ai/generate-image', { method: 'POST', body: { projectId: state.project!.id, reviewAssetId: held.assetId, effect: { layerId: layer.id, formatKey: state.activeKey, text: layer.text, referenceIds: [], referenceProjectId: null, mode: recipe.value.artworkMode } } })
      if (!current(version) || preview.value !== held || result.assetId !== held.assetId) return
      preview.value = { ...held, ready: result.status === 'ready', review: result.review }
    } catch (e: unknown) {
      if (current(version)) error.value = apiErrorDescription(e, 'Could not retry review. Your preview is retained.')
    } finally {
      if (current(version)) reviewing.value = false
    }
  }
  async function applyArtwork() {
    const layer = selectedLayer.value
    if (!layer || !sourceText.value || layer.locked || fitting.value || !preview.value?.ready || previewEpoch !== epoch) return
    if (sourceText.value.locked) return
    const version = epoch, result = preview.value
    const origin = { sourceLayerId: sourceText.value.id, text: sourceText.value.text || '', recipe: bannerEffectRecipeSchema.parse(recipe.value) }
    fitting.value = true
    try {
      if (origin.recipe.artworkMode === 'keep-font') {
        const source = sourceText.value
        withCanvasUndo(() => {
          if (layer.type === 'image') updateLayer(layer.id, { hidden: true })
          updateLayer(source.id, { ...origin.recipe.style, textTexture: result.url, hidden: false, effectOrigin: origin })
        })
        state.selectedLayerId = source.id
        preview.value = null
        toast.add({ title: 'Text effect applied', description: 'Your original font, text and motion remain editable.', color: 'success' })
        return
      }
      const measure = result.measure || await measureArtwork(result.url)
      if (!current(version) || selectedLayer.value?.id !== layer.id || layer.locked) return
      const placement = fitArtworkToText(layer, measure, activeFormat?.value || undefined)
      const changes = { src: result.url, ...placement, imageCrop: measure.crop, fit: 'fill' as const, effectOrigin: origin }
      if (layer.type === 'image') updateLayer(layer.id, changes)
      else {
        // Keep the native text editable, without showing two competing headlines.
        withCanvasUndo(() => {
          updateLayer(layer.id, { hidden: true })
          const copy = { ...JSON.parse(JSON.stringify(layer)), ...changes, type: 'image', hidden: false, name: `${layer.name} · AI effect`, text: undefined, textRuns: undefined }
          delete copy.id
          addLayer(copy)
        })
      }
      preview.value = null
      toast.add({ title: layer.type === 'image' ? 'Artwork updated' : 'Artwork layer added', description: 'Select this artwork in Effects to refine it. Original text is retained in Layers.', color: 'success' })
    } catch (e: unknown) {
      if (current(version)) error.value = apiErrorDescription(e, 'Could not fit artwork. Your preview is retained.')
    } finally {
      if (current(version)) fitting.value = false
    }
  }
  async function refitArtwork() {
    const layer = selectedLayer.value, source = sourceText.value, version = epoch
    if (!isArtwork.value || !layer?.src || !source || layer.locked || fitting.value) return
    fitting.value = true
    error.value = ''
    try {
      const measure = await measureArtwork(layer.src)
      if (!current(version) || layer.locked) return
      withCanvasUndo(() => {
        updateLayer(layer.id, { ...fitArtworkToText(source, measure, activeFormat?.value || undefined), imageCrop: measure.crop, fit: 'fill' })
        if (!source.locked) updateLayer(source.id, { hidden: true })
      })
      toast.add({ title: 'Artwork fitted', description: 'Lettering keeps its proportions. Adjust position in Properties.', color: 'success' })
    } catch (e: unknown) {
      if (current(version)) error.value = apiErrorDescription(e, 'Could not fit artwork')
    } finally { if (current(version)) fitting.value = false }
  }
  function restoreText() {
    const layer = selectedLayer.value, source = sourceText.value
    if (!isArtwork.value || !layer || !source || layer.locked || source.locked) return
    withCanvasUndo(() => {
      updateLayer(layer.id, { hidden: true })
      updateLayer(source.id, { hidden: false })
    })
    state.selectedLayerId = source.id
  }
  function removeTexture() {
    const layer = selectedLayer.value
    if (layer?.type === 'text' && !layer.locked) updateLayer(layer.id, { textTexture: undefined, effectOrigin: undefined })
  }
  async function savePreset(name: string, scope: 'client' | 'agency') {
    if (!name.trim() || !state.project?.id || state.project.id === 'new' || saving.value) return
    const key = contextKey.value
    saving.value = true
    error.value = ''
    try {
      const result = await $fetch<{ preset: Preset }>('/api/agency/banner-studio/effects/presets', { method: 'POST', body: { projectId: state.project.id, name, scope, recipe: bannerEffectRecipeSchema.parse(recipe.value) } })
      if (key !== contextKey.value) return
      presets.value.unshift(result.preset)
      toast.add({ title: 'Preset saved', color: 'success' })
    } catch (e: unknown) {
      if (key === contextKey.value) error.value = apiErrorDescription(e, 'Could not save preset')
    } finally {
      if (key === contextKey.value) saving.value = false
    }
  }
  onBeforeUnmount(() => {
    epoch++
    controller?.abort()
  })
  return { recipe, presets, references, loading, uploading, generating, saving, reviewing, fitting, sourceText, isArtwork, error, preview, canGenerate, canRestore, canRetryReview, applyStyle, restoreOriginal, loadPreset, uploadReferences, removeReference, generate, retryReview, applyArtwork, refitArtwork, restoreText, removeTexture, savePreset }
}
