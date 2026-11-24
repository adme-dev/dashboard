import type { BannerLayerImportStatus } from '~~/shared/bannerLayerImport'
import { resolveBannerFormat } from '~/utils/banner-constants'
import { buildImportedLayers, layerImportView, type MeasureLine } from '~/utils/banner-layer-import'

export interface LayerImportSource {
  /** A media-library picture. */
  assetId?: string
  /** Or the address an image layer points at; the server finds its library picture. */
  src?: string
  name: string
  url: string
}

export interface LayerImportOutcome {
  formatKey: string
  layerIds: number[]
  textCount: number
  logoLayerIds: number[]
}

const POLL_MS = 3000
// The Worker stops a job itself well before this; it only bounds how long the editor keeps asking.
const GIVE_UP_MS = 12 * 60 * 1000

// One import at a time, shared by every entry point (media library, layer menu).
const open = ref(false)
const source = ref<LayerImportSource | null>(null)
const starting = ref(false)
const status = ref<BannerLayerImportStatus | null>(null)
const startError = ref<string | null>(null)
const startedAt = ref<number | null>(null)
const now = ref(Date.now())
const outcome = ref<LayerImportOutcome | null>(null)
const applyError = ref<string | null>(null)
// The project and canvas the import was started for; layers are only added there.
let target: { projectId: string | null, formatKey: string } | null = null
let pollTimer: ReturnType<typeof setTimeout> | null = null
let tickTimer: ReturnType<typeof setInterval> | null = null
let run = 0

function errorMessage(error: unknown, fallback: string): string {
  const candidate = error as { data?: { statusMessage?: string, message?: string }, statusMessage?: string } | null
  return candidate?.data?.statusMessage || candidate?.data?.message || candidate?.statusMessage || fallback
}

/** Measures a line in the font it will be set in, once that font has loaded. */
function canvasMeasure(): MeasureLine | undefined {
  if (typeof document === 'undefined') return undefined
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return undefined
  return (line, font) => {
    const spec = `${font.italic ? 'italic ' : ''}${font.fontWeight} ${font.fontSize}px "${font.fontFamily}"`
    // An unloaded font would be measured in the fallback face, which is worse than no measurement.
    if (document.fonts?.check && !document.fonts.check(spec)) return null
    context.font = spec
    return context.measureText(line).width
  }
}

export function useBannerLayerImport() {
  const studio = useBannerStudio()
  const { state } = studio
  const toast = useToast()
  const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string, body?: unknown }) => Promise<T>

  const busy = computed(() => starting.value || status.value?.status === 'queued' || status.value?.status === 'running')
  const elapsedMs = computed(() => startedAt.value ? now.value - startedAt.value : 0)
  const view = computed(() => layerImportView(status.value, elapsedMs.value))
  /** True when the layers are back but could not be placed, e.g. a different project is open. */
  const waitingToPlace = computed(() => status.value?.status === 'succeeded' && !!status.value.result && !outcome.value)

  function stopTimers() {
    if (pollTimer) clearTimeout(pollTimer)
    if (tickTimer) clearInterval(tickTimer)
    pollTimer = null
    tickTimer = null
  }

  function openFor(next: LayerImportSource) {
    // A running import keeps its place; reopening shows its progress instead of starting over.
    if (!busy.value) {
      run += 1
      stopTimers()
      source.value = next
      status.value = null
      startError.value = null
      startedAt.value = null
      outcome.value = null
      applyError.value = null
    }
    open.value = true
  }

  async function placeLayers(): Promise<boolean> {
    const result = status.value?.result
    if (!result || outcome.value) return false
    applyError.value = null
    const formatKey = target && state.setKeys.includes(target.formatKey) ? target.formatKey : state.activeKey
    const format = resolveBannerFormat(formatKey)
    if (!format) {
      applyError.value = 'Open a banner canvas, then add the layers.'
      return false
    }
    try {
      const fonts = useBannerFonts(() => state.project?.clientId ?? null)
      const { kit } = useBannerProjectBrand()
      const options = {
        jobId: status.value!.jobId,
        groupId: crypto.randomUUID(),
        groupName: `Imported: ${source.value?.name || 'picture'}`.slice(0, 60),
        brandFonts: kit.value?.fonts ?? [],
        catalogue: fonts.allFonts.value.map(font => ({ family: font.family, category: font.category, weights: [...font.weights] }))
      }
      // Choose the fonts first and load them, so the lettering can be measured in the real face.
      const draft = buildImportedLayers(result, format, options)
      try {
        await Promise.race([
          Promise.resolve(fonts.loadUsedFonts(draft.layers.filter(layer => layer.type === 'text') as never)).then(() => document.fonts?.ready),
          new Promise(resolve => setTimeout(resolve, 4000))
        ])
      } catch { /* measured by height alone */ }
      const built = buildImportedLayers(result, format, { ...options, measure: canvasMeasure() })
      const added = studio.addLayerSet(built.layers, formatKey)
      outcome.value = {
        formatKey,
        layerIds: added.map(layer => layer.id),
        textCount: built.textCount,
        logoLayerIds: added.filter(layer => layer.importedFrom?.logoPlaceholder).map(layer => layer.id)
      }
      return true
    } catch (error) {
      applyError.value = error instanceof Error ? error.message : 'The layers could not be added to the canvas.'
      return false
    }
  }

  async function settle() {
    stopTimers()
    const current = status.value
    if (!current) return
    if (current.status === 'failed') {
      if (!open.value) toast.add({ title: 'Import as layers failed', description: current.error || undefined, color: 'error' })
      return
    }
    if (!current.result) return
    // Only place layers on the project the import was started from.
    if (target?.projectId !== (state.project?.id ?? null)) {
      if (!open.value) toast.add({ title: 'Layers are ready', description: 'Open Import as layers to add them to this canvas.', color: 'info' })
      return
    }
    const placed = await placeLayers()
    if (placed && !open.value) {
      toast.add({
        title: 'Imported as layers',
        description: `${outcome.value!.layerIds.length} layers added. One undo removes them all.`,
        color: 'success',
        actions: [{ label: 'Details', onClick: () => { open.value = true } }]
      })
    }
  }

  async function poll(jobId: string, token: number) {
    if (token !== run) return
    try {
      const next = await apiFetch<BannerLayerImportStatus>(`/api/agency/banner-studio/layer-imports/${jobId}`)
      if (token !== run) return
      status.value = next
      if (next.status === 'succeeded' || next.status === 'failed') return await settle()
    } catch (error) {
      if (token !== run) return
      const code = (error as { statusCode?: number, status?: number } | null)?.statusCode ?? (error as { status?: number } | null)?.status
      // A refusal is final; a dropped connection is not.
      if (code === 403 || code === 404) {
        status.value = { jobId, status: 'failed', error: errorMessage(error, 'The import could not be found.'), createdAt: null, startedAt: null, result: null }
        return await settle()
      }
    }
    if (Date.now() - (startedAt.value ?? Date.now()) > GIVE_UP_MS) {
      status.value = { jobId, status: 'failed', error: 'The import did not finish in time. Nothing was added to the canvas. Try again.', createdAt: null, startedAt: null, result: null }
      return await settle()
    }
    pollTimer = setTimeout(() => poll(jobId, token), POLL_MS)
  }

  async function start() {
    if (busy.value || !source.value) return
    run += 1
    const token = run
    starting.value = true
    startError.value = null
    status.value = null
    outcome.value = null
    applyError.value = null
    target = { projectId: state.project?.id ?? null, formatKey: state.activeKey }
    try {
      const queued = await apiFetch<{ jobId: string }>('/api/agency/banner-studio/layer-imports', {
        method: 'POST',
        body: { assetId: source.value.assetId ?? null, src: source.value.assetId ? null : source.value.src ?? null, projectId: state.project?.id ?? null }
      })
      if (token !== run) return
      startedAt.value = Date.now()
      now.value = Date.now()
      status.value = { jobId: queued.jobId, status: 'queued', error: null, createdAt: null, startedAt: null, result: null }
      tickTimer = setInterval(() => { now.value = Date.now() }, 1000)
      pollTimer = setTimeout(() => poll(queued.jobId, token), POLL_MS)
    } catch (error) {
      if (token === run) startError.value = errorMessage(error, 'The import could not be started.')
    } finally {
      starting.value = false
    }
  }

  function reset() {
    if (busy.value) return
    run += 1
    stopTimers()
    status.value = null
    startError.value = null
    startedAt.value = null
    outcome.value = null
    applyError.value = null
  }

  /** Swap a redrawn logo for the real file and clear its "needs replacing" mark. */
  function replaceLogo(layerId: number, logoUrl: string) {
    if (outcome.value && state.activeKey !== outcome.value.formatKey) studio.setActiveArtboard(outcome.value.formatKey)
    const layer = studio.activeLayers.value.find(item => item.id === layerId)
    if (!layer?.importedFrom) return false
    studio.updateLayer(layerId, { src: logoUrl, fit: 'contain', imageCrop: undefined, isLogo: true, importedFrom: { ...layer.importedFrom, logoPlaceholder: false } })
    return true
  }

  return { open, source, starting, status, startError, applyError, outcome, busy, view, elapsedMs, waitingToPlace, openFor, start, placeLayers, replaceLogo, reset }
}
