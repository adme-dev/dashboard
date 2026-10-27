import { computed, getCurrentScope, onScopeDispose, readonly, ref, shallowRef, watch } from 'vue'
import { useBannerStudio } from './useBannerStudio'
import type { BannerProject, Layer } from '../types/banner-studio'
import { canonicalBridgeJson, hashBridgeValue } from '../../shared/bannerDocumentBridge'
import type { BridgeTextMeasurement } from '../../shared/bannerDocumentBridge'
import {
  COMPANION_VERSION,
  COMPANION_REQUEST_MAX_BYTES,
  COMPANION_PROPOSAL_MAX_BYTES,
  companionBlockReason,
  parseCompanionRequest,
  parseCompanionProposal,
  validateCompanionProposal
} from '../../shared/bannerCompanion'
import type { CompanionRequest, CompanionProposal, CompanionEditMetadata } from '../../shared/bannerCompanion'
import { BANNER_PINNED_FONT } from '../../shared/bannerPinnedFont'
import { assertManagedQrTransition } from '../../shared/bannerQrProtection'
import { measureBannerPinnedText } from '../utils/banner-pinned-font'

interface Dependencies {
  hash?: typeof hashBridgeValue
  measure?: typeof measureBannerPinnedText
  download?: (raw: string, name: string) => void
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
function downloadJson(raw: string, name: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** One component-local authority. Files and saved metadata cannot create it. */
export function useBannerCompanion(dependencies: Dependencies = {}) {
  const studio = useBannerStudio()
  const hash = dependencies.hash || hashBridgeValue
  const measure = dependencies.measure || measureBannerPinnedText
  const opened = ref(false),
    loading = ref(false),
    error = ref(''),
    reviewed = ref(false)
  const status = ref<'missing-request' | 'requested' | 'preview' | 'stale' | 'applied' | 'error'>('missing-request')
  const requestView = shallowRef<CompanionRequest | null>(null)
  const proposalView = shallowRef<CompanionProposal | null>(null)
  let revision = 0,
    operation = 0,
    disposed = false
  let controller: AbortController | null = null
  let authority: { request: CompanionRequest, source: string, revision: number } | null = null
  let candidate: CompanionProposal | null = null
  const blockReason = computed(() => companionBlockReason(studio.selectedLayer.value, studio.activeLayers.value))
  function snapshot(): BannerProject {
    if (!studio.state.project) throw new Error('Open a project before downloading a request.')
    return clone({ ...studio.state.project, canvasData: studio.getCanvasData() })
  }
  function cancelOperation() {
    operation++
    controller?.abort()
    controller = null
    loading.value = false
  }
  function clearPreview() {
    candidate = null
    proposalView.value = null
    reviewed.value = false
  }
  function invalidate(message = '') {
    cancelOperation()
    authority = null
    requestView.value = null
    clearPreview()
    error.value = message
    status.value = message ? 'stale' : 'missing-request'
  }
  const stop = watch(
    [
      () => studio.state.project,
      () => studio.state.sets,
      () => studio.state.activeKey,
      () => studio.state.selectedLayerId
    ],
    () => {
      revision++
      const hadWork = !!authority || loading.value || !!candidate
      invalidate(hadWork ? 'The document, saved revision or selection changed. Download a new companion request.' : '')
    },
    { deep: true, flush: 'sync' }
  )
  function begin() {
    cancelOperation()
    controller = new AbortController()
    loading.value = true
    error.value = ''
    return { token: operation, signal: controller.signal }
  }
  function current(token: number, captured: NonNullable<typeof authority>): boolean {
    return (
      !disposed
      && token === operation
      && authority === captured
      && revision === captured.revision
      && studio.state.activeKey === captured.request.boardKey
      && studio.state.selectedLayerId === captured.request.layerId
      && canonicalBridgeJson(snapshot()) === captured.source
      && !blockReason.value
    )
  }
  function fail(caught: unknown) {
    clearPreview()
    status.value = 'error'
    // Zod's input details are unnecessary in the inspector. Imported content is
    // never HTML and upstream exception bodies are not displayed.
    error.value
      = caught instanceof Error && caught.name !== 'ZodError'
        ? caught.message
        : 'Invalid companion file. Import only the returned wording JSON for this request.'
  }
  function checkBounds(bounds: BridgeTextMeasurement, layer: Layer) {
    if (
      !bounds
      || ![bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite)
      || bounds.left < 0
      || bounds.top < 0
      || bounds.right <= bounds.left
      || bounds.bottom <= bounds.top
      || bounds.right > layer.w
      || bounds.bottom > layer.h
    )
      throw new Error('The returned wording does not fit the unchanged heading box.')
  }
  async function createRequest(): Promise<CompanionRequest | null> {
    if (disposed) return null
    invalidate()
    opened.value = true
    if (blockReason.value) {
      fail(new Error(blockReason.value))
      return null
    }
    const { token } = begin(),
      capturedRevision = revision
    try {
      const project = snapshot(),
        source = canonicalBridgeJson(project)
      const boardKey = studio.state.activeKey,
        layerId = studio.state.selectedLayerId!
      if (new TextEncoder().encode(source).byteLength > COMPANION_REQUEST_MAX_BYTES)
        throw new Error('Companion request exceeds 64 MiB.')
      const sourceHash = await hash(project)
      if (
        disposed
        || token !== operation
        || revision !== capturedRevision
        || source !== canonicalBridgeJson(snapshot())
      )
        return null
      const request = freeze(
        parseCompanionRequest(
          JSON.stringify({
            version: COMPANION_VERSION,
            requestId: globalThis.crypto.randomUUID(),
            sourceHash,
            boardKey,
            layerId,
            revision: capturedRevision,
            snapshot: project,
            fontHash: BANNER_PINNED_FONT.sha256
          })
        )
      )
      authority = { request, source, revision: capturedRevision }
      requestView.value = request
      status.value = 'requested'
      return request
    } catch (caught) {
      if (token === operation && !disposed) fail(caught)
      return null
    } finally {
      if (token === operation) loading.value = false
    }
  }
  async function downloadRequest() {
    const request = await createRequest()
    // createRequest is itself asynchronous: a close/edit between its return and
    // this continuation must not download an obsolete authority.
    if (!request || disposed || authority?.request !== request || !current(operation, authority)) return false
    try {
      ;(dependencies.download || downloadJson)(
        JSON.stringify(request),
        `banner-companion-${request.requestId}.request.json`
      )
      return true
    } catch (caught) {
      invalidate()
      fail(caught)
      return false
    }
  }
  async function importFile(file: Pick<File, 'size' | 'text'>): Promise<boolean> {
    if (disposed) return false
    const captured = authority
    clearPreview()
    if (!captured) {
      cancelOperation()
      error.value = 'No active request in this session. Download a request before importing returned wording.'
      status.value = 'missing-request'
      return false
    }
    const { token, signal } = begin()
    try {
      if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > COMPANION_PROPOSAL_MAX_BYTES)
        throw new Error('Returned wording JSON must be at most 64 KiB.')
      const raw = await file.text()
      if (!current(token, captured)) return false
      const proposal = validateCompanionProposal(parseCompanionProposal(raw), captured.request)
      const sourceHash = await hash(snapshot())
      if (!current(token, captured)) return false
      if (sourceHash !== captured.request.sourceHash) throw new Error('Stale source. Download a new companion request.')
      const layer = clone(studio.selectedLayer.value!)
      const bounds = await measure(layer, proposal.text, { signal })
      if (!current(token, captured)) return false
      checkBounds(bounds, layer)
      candidate = freeze(clone(proposal))
      proposalView.value = candidate
      status.value = 'preview'
      return true
    } catch (caught) {
      if (current(token, captured)) fail(caught)
      return false
    } finally {
      if (token === operation) loading.value = false
    }
  }
  const canApply = computed(
    () => !!proposalView.value && !!requestView.value && reviewed.value && !loading.value && !blockReason.value
  )
  async function apply(): Promise<boolean> {
    const captured = authority,
      proposed = candidate
    if (!captured || !proposed || !canApply.value || !current(operation, captured)) return false
    const { token, signal } = begin()
    try {
      const proposal = validateCompanionProposal(proposed, captured.request)
      const sourceHash = await hash(snapshot())
      if (!current(token, captured) || candidate !== proposed || !reviewed.value) return false
      if (sourceHash !== captured.request.sourceHash) throw new Error('Stale source. Download a new companion request.')
      const layer = clone(studio.selectedLayer.value!)
      const bounds = await measure(layer, proposal.text, { signal })
      if (!current(token, captured) || candidate !== proposed || !reviewed.value) return false
      checkBounds(bounds, layer)
      const companionEdit: CompanionEditMetadata = {
        kind: 'manual-companion-wording',
        engineVerified: false,
        declaredEngine: clone(proposal.engine),
        requestId: proposal.requestId,
        sourceHash: proposal.sourceHash,
        fontHash: proposal.fontHash
      }
      const before = studio.getCanvasData(),
        after = clone(before)
      Object.assign(
        after[captured.request.boardKey]!.layers.find(item => item.id === layer.id)!,
        { text: proposal.text, companionEdit }
      )
      assertManagedQrTransition(before, after)
      // Consume authority before the synchronous store mutation. Only these two
      // fields change; the existing updateLayer transaction contributes one undo.
      invalidate()
      studio.updateLayer(layer.id, { text: proposal.text, companionEdit })
      status.value = 'applied'
      return true
    } catch (caught) {
      if (current(token, captured)) fail(caught)
      return false
    } finally {
      if (token === operation) loading.value = false
    }
  }
  function discard() {
    cancelOperation()
    clearPreview()
    error.value = ''
    status.value = authority ? 'requested' : 'missing-request'
  }
  function open() {
    if (!disposed) opened.value = true
  }
  function close() {
    invalidate()
    opened.value = false
  }
  function dispose() {
    if (disposed) return
    close()
    disposed = true
    stop()
  }
  if (getCurrentScope()) onScopeDispose(dispose)
  const beforeLayer = computed(
    () =>
      requestView.value?.snapshot.canvasData[requestView.value.boardKey]?.layers.find(
        layer => layer.id === requestView.value!.layerId
      ) || null
  )
  const previewLayer = computed(() =>
    proposalView.value && beforeLayer.value ? { ...beforeLayer.value, text: proposalView.value.text } : null
  )
  return {
    opened: readonly(opened),
    loading: readonly(loading),
    error: readonly(error),
    status: readonly(status),
    request: readonly(requestView),
    proposal: readonly(proposalView),
    reviewed,
    blockReason,
    canApply,
    beforeLayer,
    previewLayer,
    open,
    close,
    discard,
    createRequest,
    downloadRequest,
    importFile,
    apply,
    dispose
  }
}
