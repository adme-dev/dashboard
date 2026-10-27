import type { QrCode } from '~/composables/useQrCodes'
import type { BannerProject } from '~/types/banner-studio'
import {
  artworkDocumentKey,
  fitArtwork
} from '~/utils/banner-artwork-creation'
import { bannerQrResponseSchema } from '~~/shared/bannerQr'

/** Keep the whole managed QR, including its rendered white quiet zone, in proportion. */
export function managedQrPlacement(
  asset: { width: number, height: number },
  format: { w: number, h: number }
) {
  const edge = Math.min(
    Math.min(format.w, format.h) * 0.6,
    Math.max(120, Math.min(format.w, format.h) * 0.25)
  )
  const fitted = fitArtwork(asset, { w: edge, h: edge })
  const margin = Math.min(format.w, format.h) * 0.04
  return {
    w: fitted.w,
    h: fitted.h,
    x: format.w - fitted.w - margin,
    y: format.h - fitted.h - margin
  }
}
export function useBannerQr() {
  const {
    state,
    activeFormat,
    getCanvasData,
    saveProject,
    addLayer,
    withCanvasUndo
  } = useBannerStudio()
  const registry = useQrCodes()
  const open = ref(false),
    loading = ref(false),
    inserting = ref(false),
    error = ref(''),
    selectedId = ref('none')
  const codes = ref<QrCode[]>([])
  let sequence = 0,
    documentVersion = 0,
    controller: AbortController | null = null
  const scope = () =>
    artworkDocumentKey([
      state.project?.id,
      state.project?.clientId,
      state.activeKey,
      state.selectedLayerId,
      getCanvasData()
    ])
  watch(
    scope,
    () => {
      documentVersion++
    },
    { flush: 'sync' }
  )
  const smallArtboard = computed(
    () =>
      !!activeFormat.value
      && Math.min(activeFormat.value.w, activeFormat.value.h) < 200
  )
  const selected = computed(
    () => codes.value.find(code => code.id === selectedId.value) ?? null
  )
  const managerUrl = computed(() =>
    state.project?.clientId
      ? `/agency/qr-codes?clientId=${encodeURIComponent(state.project.clientId)}`
      : '/agency/qr-codes'
  )
  function cancel() {
    sequence++
    controller?.abort()
    controller = null
    inserting.value = false
    loading.value = false
  }
  async function show() {
    cancel()
    selectedId.value = 'none'
    codes.value = []
    error.value = ''
    open.value = true
    const clientId = state.project?.clientId,
      projectId = state.project?.id,
      ticket = sequence
    if (!clientId) {
      error.value
        = 'Assign a client to this project before choosing a managed QR code.'
      return
    }
    loading.value = true
    try {
      const result = await registry.list({ clientId })
      if (
        ticket !== sequence
        || state.project?.id !== projectId
        || state.project?.clientId !== clientId
      )
        return
      codes.value = result.codes.filter(
        code => code.client_id === clientId && code.is_active
      )
    } catch (caught: unknown) {
      if (ticket === sequence) {
        const failure = caught as {
          statusCode?: number
          data?: { statusCode?: number }
        }
        error.value
          = (failure.statusCode ?? failure.data?.statusCode) === 403
            ? 'You do not have access to this client’s QR codes. Open QR Codes to review access.'
            : 'Could not load this client’s QR codes. Reopen to retry.'
      }
    } finally {
      if (ticket === sequence) loading.value = false
    }
  }
  async function insert() {
    if (
      inserting.value
      || !selected.value
      || !state.project?.id
      || !state.project.clientId
      || !activeFormat.value
    )
      return
    cancel()
    error.value = ''
    inserting.value = true
    controller = new AbortController()
    const ticket = sequence,
      baseline = scope(),
      version = documentVersion,
      projectId = state.project.id,
      clientId = state.project.clientId,
      qrId = selectedId.value,
      format = { ...activeFormat.value }
    const valid = () =>
      ticket === sequence
      && version === documentVersion
      && baseline === scope()
      && selectedId.value === qrId
    try {
      await saveProject()
      if (!valid() || state.isDirty)
        throw new Error(
          'Artwork changed while saving. Review it and add the QR again.'
        )
      const saved = await $fetch<BannerProject>(
        `/api/agency/banner-studio/projects/${projectId}`,
        { signal: controller.signal }
      )
      if (
        !valid()
        || saved.clientId !== clientId
        || saved.updatedAt !== state.project?.updatedAt
        || artworkDocumentKey(saved.canvasData)
        !== artworkDocumentKey(getCanvasData())
      )
        throw new Error(
          'The saved artwork changed. Reload before adding the QR.'
        )
      const response = await $fetch(
        `/api/agency/banner-studio/projects/${projectId}/qr`,
        {
          method: 'POST',
          signal: controller.signal,
          body: { qrCodeId: qrId, sourceRevision: saved.updatedAt }
        }
      )
      if (!valid() || state.project?.updatedAt !== saved.updatedAt) {
        if (ticket === sequence)
          throw new Error(
            'Artwork or selection changed. Add the QR again from the current revision.'
          )
        return
      }
      const parsed = bannerQrResponseSchema.safeParse(response)
      if (!parsed.success)
        throw new Error(
          'The managed QR response is incomplete. Reopen the picker and try again.'
        )
      const result = parsed.data
      if (
        result.projectId !== projectId
        || result.sourceRevision !== saved.updatedAt
        || result.platformQr.clientId !== clientId
        || result.platformQr.qrCodeId !== qrId
        || result.platformQr.assetId !== result.asset.id
      )
        throw new Error(
          'The QR response does not match the selected client and code. Choose it again.'
        )
      const placement = managedQrPlacement(result.asset, format)
      withCanvasUndo(() =>
        addLayer({
          type: 'image',
          name: `QR: ${result.platformQr.name}`,
          src: result.asset.url,
          srcType: 'image',
          fit: 'contain',
          animIn: 'none',
          animOut: 'none',
          visualFilter: 'none',
          mixBlendMode: 'normal',
          borderRadius: 0,
          ...placement,
          platformQr: result.platformQr
        })
      )
      // Import is one local undo. Saving uses the existing optimistic revision guard.
      cancel()
      selectedId.value = 'none'
      try {
        await saveProject()
        open.value = false
      } catch {
        error.value
          = 'The managed QR is on the canvas but could not be saved. Use Save to retry.'
      }
    } catch (caught: unknown) {
      if (ticket === sequence) {
        const failure = caught as {
          data?: { statusMessage?: string }
          message?: string
        }
        error.value
          = failure.data?.statusMessage
            || failure.message
            || 'The managed QR could not be added. Artwork is unchanged.'
      }
    } finally {
      if (ticket === sequence) inserting.value = false
    }
  }
  watch(
    selectedId,
    () => {
      if (inserting.value) cancel()
    },
    { flush: 'sync' }
  )
  watch(
    () => [state.project?.id, state.project?.clientId, state.activeKey],
    () => {
      cancel()
      open.value = false
      codes.value = []
    },
    { flush: 'sync' }
  )
  onScopeDispose(cancel)
  return {
    smallArtboard,
    open,
    loading,
    inserting,
    error,
    selectedId,
    codes,
    selected,
    managerUrl,
    show,
    insert,
    cancel
  }
}
