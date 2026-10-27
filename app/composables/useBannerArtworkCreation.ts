import {
  generationRequestSchema,
  type ArtworkProposal
} from '~~/shared/bannerArtwork'
import type { BannerAsset, BannerProject } from '~/types/banner-studio'
import {
  BOLD_RETAIL_LIFESTYLE,
  artworkStyleSchema,
  retainedArtworkConcepts,
  artworkConceptSchema,
  artworkGenerationProposalSchema,
  artworkDocumentKey,
  fitArtwork,
  reusableArtworkStyles,
  type ArtworkStyleRecipe
} from '~/utils/banner-artwork-creation'

type Concept = ArtworkProposal & {
  asset: NonNullable<ArtworkProposal['asset']>
}
async function decodeArtwork(
  url: string
): Promise<{ width: number, height: number }> {
  const image = new Image()
  const loaded = new Promise<{ width: number, height: number }>(
    (resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new Error('Concept image could not be loaded. Try again.')),
        15000
      )
      image.onload = () => {
        clearTimeout(timer)
        resolve({ width: image.naturalWidth, height: image.naturalHeight })
      }
      image.onerror = () => {
        clearTimeout(timer)
        reject(
          new Error('Concept image could not be decoded. Generate again.')
        )
      }
    }
  )
  image.src = url
  return loaded
}
export function useBannerArtworkCreation(
  decode: typeof decodeArtwork = decodeArtwork
) {
  const {
    state,
    activeFormat,
    addLayer,
    saveProject,
    getCanvasData,
    withCanvasUndo
  } = useBannerStudio()
  const open = ref(false),
    busy = ref(false),
    error = ref(''),
    brief = ref(''),
    copy = ref(''),
    reviewed = ref(false),
    saveStyle = ref(true)
  const referenceIds = ref<string[]>([]),
    assets = ref<BannerAsset[]>([]),
    styles = ref<ArtworkStyleRecipe[]>([]),
    preview = ref<Concept | null>(null)
  const styleName = ref<string>(BOLD_RETAIL_LIFESTYLE.name),
    styleGuidance = ref<string>(BOLD_RETAIL_LIFESTYLE.guidance),
    selectedStyle = ref('starter')
  let selectedRecipe: ArtworkStyleRecipe | null = null
  let sequence = 0,
    controller: AbortController | null = null,
    baseline = '',
    baselineVersion = 0,
    documentVersion = 0,
    submitted: {
      prompt: string
      approvedCopy: string[]
      referenceAssetIds: string[]
    } | null = null
  const scope = () =>
    artworkDocumentKey([
      state.project?.id,
      state.project?.clientId,
      state.activeKey,
      getCanvasData()
    ])
  watch(
    scope,
    () => {
      documentVersion++
    },
    { flush: 'sync' }
  )
  const canApply = computed(
    () =>
      baselineVersion === documentVersion
      && !!preview.value
      && reviewed.value
      && baseline === scope()
      && !busy.value
  )
  function discard() {
    sequence++
    controller?.abort()
    controller = null
    busy.value = false
    preview.value = null
    reviewed.value = false
    submitted = null
  }
  async function show() {
    discard()
    error.value = ''
    brief.value = ''
    copy.value = ''
    referenceIds.value = []
    assets.value = []
    styles.value = []
    chooseStyle('starter')
    open.value = true
    const ticket = sequence,
      projectId = state.project?.id,
      clientId = state.project?.clientId
    try {
      const ownerId = useAuth().user.value?.id
      const [assetResult, projects] = await Promise.all([
        $fetch<{ assets: (BannerAsset & { clientId?: string | null })[] }>(
          '/api/agency/banner-studio/assets',
          { query: clientId ? { clientId } : undefined }
        ),
        $fetch<BannerProject[]>('/api/agency/banner-studio/projects', {
          query: { limit: 100, ...(clientId ? { clientId } : {}) }
        })
      ])
      if (
        ticket !== sequence
        || state.project?.id !== projectId
        || state.project?.clientId !== clientId
      )
        return
      assets.value = assetResult.assets.filter(
        asset =>
          ['image/png', 'image/jpeg'].includes(asset.mimeType)
          && (asset.clientId ?? null) === (clientId ?? null)
          && (clientId != null || asset.uploadedBy === ownerId)
      )
      styles.value = reusableArtworkStyles(projects, {
        projectId: projectId!,
        clientId: clientId ?? null
      })
    } catch {
      if (ticket === sequence)
        error.value
          = 'Could not load owned references and saved styles. Reopen to try again.'
    }
  }
  function chooseStyle(key: string) {
    selectedStyle.value = key
    selectedRecipe
      = styles.value.find(style => `${style.id}:${style.version}` === key)
        ?? null
    styleName.value = selectedRecipe?.name ?? BOLD_RETAIL_LIFESTYLE.name
    styleGuidance.value
      = selectedRecipe?.guidance ?? BOLD_RETAIL_LIFESTYLE.guidance
    // New campaign inputs always remain independent; choosing a style never copies source copy/assets.
  }
  function addStyleExample() {
    if (
      selectedRecipe?.exampleAssetId
      && !referenceIds.value.includes(selectedRecipe.exampleAssetId)
    )
      referenceIds.value = [
        ...referenceIds.value,
        selectedRecipe.exampleAssetId
      ].slice(0, 8)
  }
  const hasStyleExample = computed(
    () => !!selectedRecipe?.exampleAssetId && selectedStyle.value !== 'starter'
  )
  async function generate() {
    if (busy.value) return
    discard()
    error.value = ''
    if (!state.project?.id) {
      error.value = 'Save this project before creating a concept.'
      return
    }
    if (
      !brief.value.trim()
      || !copy.value.trim()
      || !referenceIds.value.length
    ) {
      error.value
        = 'Add a brief, exact approved copy and at least one owned reference.'
      return
    }
    if (
      !styleName.value.trim()
      || !styleGuidance.value.trim()
      || styleGuidance.value.length > 2000
    ) {
      error.value
        = 'Add a style name and up to 2,000 characters of reusable design guidance.'
      return
    }
    const ticket = sequence,
      projectId = state.project.id,
      clientId = state.project.clientId,
      formatKey = state.activeKey
    const request = {
      prompt: `${styleGuidance.value.trim()}\n\nCampaign brief:\n${brief.value.trim()}`,
      approvedCopy: copy.value.split('\n').filter(line => line.trim()),
      referenceAssetIds: [...referenceIds.value]
    }
    busy.value = true
    controller = new AbortController()
    const initialScope = scope(),
      initialVersion = documentVersion
    try {
      await saveProject()
      if (
        ticket !== sequence
        || initialScope !== scope()
        || initialVersion !== documentVersion
        || state.isDirty
      )
        throw new Error(
          'The project changed while saving. Review it and generate again.'
        )
      const saved = await $fetch<BannerProject>(
        `/api/agency/banner-studio/projects/${projectId}`,
        { signal: controller.signal }
      )
      if (
        ticket !== sequence
        || initialScope !== scope()
        || initialVersion !== documentVersion
        || saved.clientId !== clientId
        || artworkDocumentKey(saved.canvasData)
        !== artworkDocumentKey(getCanvasData())
      )
        throw new Error('The saved project changed. Save and generate again.')
      baseline = scope()
      baselineVersion = documentVersion
      const rawResult = await $fetch<Concept>(
        '/api/agency/banner-studio/ai/generate',
        {
          method: 'POST',
          signal: controller.signal,
          body: generationRequestSchema.parse({
            ...request,
            projectId,
            sourceRevision: saved.updatedAt,
            formatKey
          })
        }
      )
      if (ticket !== sequence) return
      const result = artworkGenerationProposalSchema.parse(rawResult)
      if (
        baselineVersion !== documentVersion
        || baseline !== scope()
        || result.projectId !== projectId
        || result.formatKey !== formatKey
        || result.sourceRevision !== saved.updatedAt
      )
        throw new Error(
          'This concept belongs to an earlier project revision. Generate again.'
        )
      if (!result.asset?.id || !result.asset.url)
        throw new Error('Generation returned no owned concept asset.')
      fitArtwork(result.asset, activeFormat.value!)
      submitted = request
      preview.value = result
    } catch (caught: unknown) {
      const err = caught as {
        data?: { statusMessage?: string }
        message?: string
      }
      if (ticket === sequence)
        error.value
          = err.data?.statusMessage
            || err.message
            || 'Concept generation failed. Your artwork is unchanged.'
    } finally {
      if (ticket === sequence) busy.value = false
    }
  }
  async function apply() {
    if (!canApply.value || !preview.value || !submitted || !activeFormat.value)
      return
    const concept = preview.value,
      request = submitted,
      ticket = sequence
    busy.value = true
    try {
      const dimensions = await decode(concept.asset.url)
      if (
        ticket !== sequence
        || baselineVersion !== documentVersion
        || baseline !== scope()
      )
        return
      if (
        dimensions.width !== concept.asset.width
        || dimensions.height !== concept.asset.height
      )
        throw new Error(
          'Concept image dimensions do not match the returned asset. Generate again.'
        )
      fitArtwork(dimensions, activeFormat.value!)
    } catch (caught: unknown) {
      if (ticket === sequence)
        error.value
          = caught instanceof Error
            ? caught.message
            : 'Concept image could not be decoded.'
      return
    } finally {
      if (ticket === sequence) busy.value = false
    }
    try {
      artworkGenerationProposalSchema.parse(concept)
      const board = state.sets[state.activeKey]
      const old = board.artworkCreation
      const metadata = {
        version: 1 as const,
        concepts: retainedArtworkConcepts(old?.concepts),
        styles: reusableArtworkStyles(
          [{ ...state.project, canvasData: { current: board } }],
          { projectId: state.project!.id, clientId: state.project!.clientId }
        )
      }
      const styleId = selectedRecipe?.id ?? crypto.randomUUID()
      const version = selectedRecipe
        ? Math.max(
          selectedRecipe.version,
          ...styles.value
            .filter(style => style.id === styleId)
            .map(style => style.version),
          ...metadata.styles
            .filter(style => style.id === styleId)
            .map(style => style.version)
        ) + 1
        : 1
      const recipe = artworkStyleSchema.parse({
        id: styleId,
        version,
        name: styleName.value,
        guidance: styleGuidance.value,
        variables: [...BOLD_RETAIL_LIFESTYLE.variables],
        reviewedProposalId: concept.proposalId,
        reviewedAt: new Date().toISOString(),
        sourceProjectId: state.project!.id,
        clientId: state.project!.clientId,
        exampleAssetId: concept.asset.id
      })
      metadata.concepts.push(
        artworkConceptSchema.parse({
          ...request,
          proposalId: concept.proposalId,
          asset: concept.asset,
          evidence: concept.evidence,
          referenceHashes: concept.referenceHashes,
          warnings: concept.warnings,
          verification: 'human-reviewed',
          sourceRevision: concept.sourceRevision,
          importedAt: new Date().toISOString(),
          styleId,
          styleVersion: version
        })
      )
      if (saveStyle.value)
        metadata.styles = [
          ...metadata.styles.filter(
            style => !(style.id === styleId && style.version === version)
          ),
          recipe
        ].slice(-30)
      const placement = fitArtwork(concept.asset, activeFormat.value!)
      withCanvasUndo(() => {
        addLayer({
          type: 'image',
          name: 'Campaign concept (flattened)',
          src: concept.asset.url,
          srcType: 'image',
          fit: 'contain',
          animIn: 'none',
          animOut: 'none',
          ...placement
        })
        board.artworkCreation = metadata
      })
    } catch {
      error.value
        = 'Concept metadata is incomplete or invalid. Generate again; artwork is unchanged.'
      return
    }
    discard()
    try {
      await saveProject()
      open.value = false
    } catch {
      error.value
        = 'Concept is on the canvas but could not be saved. Use Save to retry.'
    }
  }
  watch(
    () => [state.project?.id, state.project?.clientId, state.activeKey],
    () => {
      discard()
      open.value = false
    }
  )
  watch(
    [brief, copy, referenceIds, styleName, styleGuidance],
    () => {
      if (busy.value || preview.value) discard()
    },
    { deep: true, flush: 'sync' }
  )
  onScopeDispose(discard)
  return {
    styleName,
    styleGuidance,
    selectedStyle,
    chooseStyle,
    addStyleExample,
    hasStyleExample,
    open,
    busy,
    error,
    brief,
    copy,
    reviewed,
    saveStyle,
    referenceIds,
    assets,
    styles,
    preview,
    canApply,
    show,
    discard,
    generate,
    apply
  }
}
