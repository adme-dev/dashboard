<script setup lang="ts">
import { hasScopedCanvas, SCOPED_DISSECTION_EXCLUSION } from '#shared/bannerScopedCanvas'
import JSZip from 'jszip'
import { apiErrorDescription, apiErrorStatus } from '~/utils/apiError'
import { PLATFORM_META, resolveBannerFormat } from '~/utils/banner-constants'
import { buildBannerHTML } from '~/utils/banner-html-builder'
import type { Layer, ImageExportResult } from '~/types/banner-studio'
import { exportFormatLabel } from '~/utils/bannerExportPoll'
import type { ExportJob } from '~/utils/bannerExportPoll'
import { describeBannerVideoExportError } from '~/utils/bannerExportError'
import { createBannerVideoExportSession } from '~/utils/bannerVideoExport'
import { bannerRenderSuggestions, snapshotBannerSocialSuggestion } from '~/utils/bannerRenderSuggestions'
import { fetchBannerRasterExport } from '~/utils/bannerRasterExportDownload'

const props = defineProps<{ open: boolean, initialType?: 'html5' | 'png' | 'jpg' | 'gif' | 'mp4', socialSuggestion?: { caption?: string, suggestedSchedule?: string } }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { state, activeLayers } = useBannerStudio()
const { estimateSize } = useBannerFileSize()
const { getExportCustomFonts } = useBannerFonts()
const toast = useToast()
const scopedCanvas = computed(() => hasScopedCanvas(state.sets) || hasScopedCanvas(state.project?.canvasData))
let exportSnapshot: string | null = null
const currentExportSnapshot = () => JSON.stringify([state.project?.id, state.project?.updatedAt, state.sets])
function readyForScopedExport(): boolean {
  if (!scopedCanvas.value) { exportSnapshot = null; return true }
  if (exportType.value === 'mp4') {
    toast.add({ title: 'Protected artwork', description: SCOPED_DISSECTION_EXCLUSION, color: 'warning' })
    return false
  }
  if (state.isDirty || state.isSaving || !state.project?.updatedAt) {
    toast.add({ title: 'Save before exporting', description: 'Save your changes before exporting protected artwork.', color: 'warning' })
    return false
  }
  exportSnapshot = currentExportSnapshot()
  return true
}
async function savedHtml(keys: string[]) {
  const result = await apiFetch<{ formats: { key: string, html: string }[] }>('/api/agency/banner-studio/export-html', {
    method: 'POST', body: { projectId: state.project?.id, sourceRevision: state.project?.updatedAt, formats: keys.map(key => ({ key })) }
  })
  if (result.formats.length !== keys.length) throw new Error('Some saved export files are missing')
  return new Map(result.formats.map(item => [item.key, item.html]))
}
const videoExportSession = createBannerVideoExportSession()
const apiFetch = $fetch as <T = unknown>(request: string, options?: {
  method?: string
  headers?: Record<string, string>
  body?: unknown
}) => Promise<T>

const selected = ref<Set<string>>(new Set(state.setKeys))
const isExporting = ref(false)
const exportProgress = ref(0)
const currentJobs = ref<ExportJob[]>([])
const videoJobsUnavailable = ref(true)
const videoPendingFormats = ref<string[]>([])
const videoJobsBlocked = computed(() => videoJobsUnavailable.value || videoPendingFormats.value.some(key => selected.value.has(key)))
const currentVideoBlocked = computed(() => videoJobsUnavailable.value || videoPendingFormats.value.includes(state.activeKey))

watch(() => props.open, (open) => {
  if (open) {
    selected.value = new Set(state.setKeys)
    if (props.initialType) exportType.value = props.initialType
  }
})
watch(() => state.project?.id, () => {
  currentJobs.value = []
  videoJobsUnavailable.value = true
  videoPendingFormats.value = []
})

// Export type: html5, png, jpg, gif, mp4
const exportType = ref<'html5' | 'png' | 'jpg' | 'gif' | 'mp4'>(props.initialType || 'html5')
const imageQuality = ref<1 | 2>(1) // 1x or 2x retina
const jpgQuality = ref(90) // 0-100
const gifFps = ref(10) // 5-15
const videoFps = ref(30) // 24, 30, or 60
const videoCrf = ref(23) // 0-51 (lower = better quality)
const videoQuality = ref<1 | 2>(1) // 1x or 2x

const exportTypeOptions = [
  { label: 'HTML5', value: 'html5', icon: 'i-lucide-file-code', desc: 'Animated banner files' },
  { label: 'PNG', value: 'png', icon: 'i-lucide-image', desc: 'Static images (lossless)' },
  { label: 'JPG', value: 'jpg', icon: 'i-lucide-image', desc: 'Static images (compressed)' },
  { label: 'GIF', value: 'gif', icon: 'i-lucide-film', desc: 'Animated images' },
  { label: 'MP4', value: 'mp4', icon: 'i-lucide-video', desc: 'Video files (H.264)' }
]

const isImageExport = computed(() => exportType.value === 'png' || exportType.value === 'jpg')
const isGifExport = computed(() => exportType.value === 'gif')
const isVideoExport = computed(() => exportType.value === 'mp4')
const estimatedGifFrames = computed(() => Math.ceil(state.duration * gifFps.value))
const estimatedVideoFrames = computed(() => Math.ceil(state.duration * videoFps.value))

// Group by platform
const platformGroups = computed(() => {
  const groups: Record<string, string[]> = {}
  state.setKeys.forEach((key) => {
    const fmt = resolveBannerFormat(key)
    if (!fmt) return
    const platform = isVideoExport.value && ['Facebook', 'Instagram'].includes(fmt.platform) ? 'Social formats' : fmt.platform
    if (!groups[platform]) groups[platform] = []
    groups[platform].push(key)
  })
  return groups
})

function togglePlatform(platform: string) {
  const keys = platformGroups.value[platform] || []
  const allSelected = keys.every(k => selected.value.has(k))
  keys.forEach((k) => {
    if (allSelected) selected.value.delete(k)
    else selected.value.add(k)
  })
}

function toggleSize(key: string) {
  if (selected.value.has(key)) selected.value.delete(key)
  else selected.value.add(key)
}

function buildExportHTML(fmtKey: string, layers: Layer[]): string {
  return buildBannerHTML(fmtKey, layers, {
    playback: state.sets[fmtKey]?.playback || state.sets[state.activeKey]?.playback,
    includeAnimations: !isImageExport.value,
    bgColor: state.sets[fmtKey]?.bgColor || state.bgColor || '#0a0a10',
    customFonts: getExportCustomFonts(layers)
  })
}

function getScaledLayers(fmtKey: string): Layer[] {
  // Use existing layers for this size if available
  if (state.sets[fmtKey]?.layers) return state.sets[fmtKey].layers

  // Otherwise proportionally scale from active artboard
  const srcFmt = resolveBannerFormat(state.activeKey)
  const tgtFmt = resolveBannerFormat(fmtKey)
  if (!srcFmt || !tgtFmt) return []

  const srcLayers = activeLayers.value
  const sx = tgtFmt.w / srcFmt.w
  const sy = tgtFmt.h / srcFmt.h

  return srcLayers.map((l) => {
    const n = { ...JSON.parse(JSON.stringify(l)) }
    n.x = Math.round(l.x * sx)
    n.y = Math.round(l.y * sy)
    n.w = Math.round(l.w * sx)
    n.h = Math.round(l.h * sy)
    if (n.type === 'bg') {
      n.w = tgtFmt.w
      n.h = tgtFmt.h
    }
    if (n.fontSize) n.fontSize = Math.max(7, Math.round(n.fontSize * Math.min(sx, sy)))
    return n
  })
}

function downloadBlob(blob: Blob, filename: string) {
  if (exportSnapshot !== null && (state.isDirty || state.isSaving || currentExportSnapshot() !== exportSnapshot)) {
    throw new Error('Artwork changed during export. Save your changes and export again.')
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.hidden = true
  document.body.append(a)
  try {
    a.click()
  } finally {
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

function downloadHTML(html: string, filename: string) {
  downloadBlob(new Blob([html], { type: 'text/html' }), filename)
}

async function exportCurrent() {
  if (isExporting.value || !readyForScopedExport()) return
  if (isVideoExport.value || isGifExport.value || isImageExport.value) {
    // For image/gif/video export of single size, use the bulk flow with just one format
    const keys = new Set([state.activeKey])
    const prevSelected = selected.value
    selected.value = keys
    const exportFn = isVideoExport.value ? exportVideos : isGifExport.value ? exportGifs : exportImages
    exportFn().finally(() => {
      selected.value = prevSelected
    })
    return
  }
  if (scopedCanvas.value) {
    isExporting.value = true
    try {
      const files = await savedHtml([state.activeKey])
      downloadHTML(files.get(state.activeKey)!, `${state.project?.name || 'banner'}_${state.activeKey}.html`)
    } catch (error) {
      toast.add({ title: 'Export failed', description: apiErrorDescription(error, 'Saved HTML export failed'), color: 'error' })
    } finally { isExporting.value = false }
    return
  }
  const html = buildExportHTML(state.activeKey, activeLayers.value)
  const fmt = resolveBannerFormat(state.activeKey)
  if (!fmt) return
  downloadHTML(html, `${state.project?.name || 'banner'}_${fmt.w}x${fmt.h}.html`)
  toast.add({ title: 'Exported', description: `${fmt.w}x${fmt.h} exported as HTML`, color: 'success' })
}

async function exportZip() {
  if (isExporting.value || !readyForScopedExport()) return
  const keys = [...selected.value]
  if (!keys.length) return

  isExporting.value = true
  exportProgress.value = 0

  try {
    const zip = new JSZip()
    const projectName = state.project?.name || 'banners'
    const protectedHtml = scopedCanvas.value ? await savedHtml(keys) : null

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const fmt = resolveBannerFormat(key)
      if (!fmt) continue
      const layers = getScaledLayers(key)
      const html = protectedHtml ? protectedHtml.get(key)! : buildExportHTML(key, layers)
      zip.file(`${projectName}_${fmt.w}x${fmt.h}.html`, html)
      exportProgress.value = Math.round(((i + 1) / keys.length) * 100)
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(blob, `${projectName}_export.zip`)

    toast.add({ title: 'Export complete', description: `${keys.length} banners exported as ZIP`, color: 'success' })
    emit('update:open', false)
  } catch (error) {
    toast.add({ title: 'Export failed', description: apiErrorDescription(error, 'HTML export failed'), color: 'error' })
  } finally {
    isExporting.value = false
    exportProgress.value = 0
  }
}

async function exportImages() {
  if (isExporting.value || !readyForScopedExport()) return
  const keys = [...selected.value]
  if (!keys.length) return
  const output = exportType.value === 'jpg' ? 'jpg' : 'png'
  const quality = imageQuality.value
  const projectName = state.project?.name || 'banners'

  if (!state.project?.id) {
    toast.add({ title: 'Save first', description: 'Save the project before exporting images', color: 'warning' })
    return
  }

  isExporting.value = true
  exportProgress.value = 0

  try {
    // Build HTML for each selected format (static, no animations)
    const formats = scopedCanvas.value ? keys.map(key => ({ key })) : keys.map((key) => {
      const fmt = resolveBannerFormat(key)
      if (!fmt) throw new Error(`Unknown canvas size: ${key}. Add a supported size before exporting.`)
      const layers = getScaledLayers(key)
      const html = buildExportHTML(key, layers)
      return { key, html, width: fmt.w, height: fmt.h }
    }).filter(Boolean)

    exportProgress.value = 20

    // Send to server for rendering
    const results = await apiFetch<ImageExportResult[]>('/api/agency/banner-studio/export-image', {
      method: 'POST',
      body: {
        projectId: state.project.id,
        formats,
        ...(scopedCanvas.value ? { sourceRevision: state.project.updatedAt } : {}),
        quality,
        format: output,
        jpgQuality: output === 'jpg' ? jpgQuality.value : undefined
      }
    })

    exportProgress.value = 80
    if (results.length !== keys.length) throw new Error('Some export files are missing. Please try again.')

    if (results.length === 1) {
      const fmt = resolveBannerFormat(results[0].formatKey)
      const blob = await fetchBannerRasterExport(results[0], output)
      downloadBlob(blob, `${projectName}_${fmt?.w || 0}x${fmt?.h || 0}.${output}`)
    } else if (results.length > 1) {
      // Multiple images — download as ZIP
      const zip = new JSZip()

      for (const result of results) {
        const fmt = resolveBannerFormat(result.formatKey)
        const filename = `${projectName}_${fmt?.w || 0}x${fmt?.h || 0}.${output}`
        const blob = await fetchBannerRasterExport(result, output)
        zip.file(filename, blob)
      }

      exportProgress.value = 95

      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(blob, `${projectName}_images.zip`)
    }

    exportProgress.value = 100

    const qualityLabel = quality === 2 ? '@2x' : ''
    toast.add({
      title: 'Export complete',
      description: `${results.length} ${output.toUpperCase()}${qualityLabel} images exported`,
      color: 'success'
    })
    emit('update:open', false)
  } catch (err: unknown) {
    const message = apiErrorDescription(err, 'Image export failed')
    toast.add({ title: 'Export failed', description: message, color: 'error' })
  } finally {
    isExporting.value = false
    exportProgress.value = 0
  }
}

async function exportGifs() {
  if (isExporting.value || !readyForScopedExport()) return
  const keys = [...selected.value]
  if (!keys.length) return
  const fps = gifFps.value
  const projectName = state.project?.name || 'banners'

  if (!state.project?.id) {
    toast.add({ title: 'Save first', description: 'Save the project before exporting GIFs', color: 'warning' })
    return
  }

  isExporting.value = true
  exportProgress.value = 0

  try {
    // Build HTML for each selected format (WITH animations for GSAP)
    const formats = scopedCanvas.value ? keys.map(key => ({ key })) : keys.map((key) => {
      const fmt = resolveBannerFormat(key)
      if (!fmt) throw new Error(`Unknown canvas size: ${key}. Add a supported size before exporting.`)
      const layers = getScaledLayers(key)
      const html = buildBannerHTML(key, layers, {
        playback: state.sets[key]?.playback || state.sets[state.activeKey]?.playback,
        includeAnimations: true,
        bgColor: state.sets[key]?.bgColor || state.bgColor || '#0a0a10',
        customFonts: getExportCustomFonts(layers)
      })
      return { key, html, width: fmt.w, height: fmt.h }
    }).filter(Boolean)

    exportProgress.value = 10

    const results = await apiFetch<ImageExportResult[]>('/api/agency/banner-studio/export-gif', {
      method: 'POST',
      body: {
        projectId: state.project.id,
        formats,
        ...(scopedCanvas.value ? { sourceRevision: state.project.updatedAt } : {}),
        fps
      }
    })

    exportProgress.value = 80
    if (results.length !== keys.length) throw new Error('Some export files are missing. Please try again.')

    if (results.length === 1) {
      const fmt = resolveBannerFormat(results[0].formatKey)
      const blob = await fetchBannerRasterExport(results[0], 'gif')
      downloadBlob(blob, `${projectName}_${fmt?.w || 0}x${fmt?.h || 0}.gif`)
    } else if (results.length > 1) {
      const zip = new JSZip()

      for (const result of results) {
        const fmt = resolveBannerFormat(result.formatKey)
        const filename = `${projectName}_${fmt?.w || 0}x${fmt?.h || 0}.gif`
        const blob = await fetchBannerRasterExport(result, 'gif')
        zip.file(filename, blob)
      }

      exportProgress.value = 95

      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(blob, `${projectName}_gifs.zip`)
    }

    exportProgress.value = 100
    toast.add({
      title: 'Export complete',
      description: `${results.length} GIF${results.length > 1 ? 's' : ''} exported at ${fps}fps`,
      color: 'success'
    })
    emit('update:open', false)
  } catch (err: unknown) {
    const message = apiErrorDescription(err, 'GIF export failed')
    toast.add({ title: 'Export failed', description: message, color: 'error' })
  } finally {
    isExporting.value = false
    exportProgress.value = 0
  }
}

async function exportVideos() {
  if (isExporting.value || !readyForScopedExport()) return
  if (videoJobsBlocked.value) return
  const keys = [...selected.value]
  if (!keys.length) return

  if (!state.project?.id) {
    toast.add({ title: 'Save first', description: 'Save the project before exporting videos', color: 'warning' })
    return
  }

  isExporting.value = true
  exportProgress.value = 0

  const projectId = state.project.id
  const suggestionClientId = state.project.clientId
  const socialSuggestion = snapshotBannerSocialSuggestion(props.socialSuggestion)

  try {
    const formats = keys.map((key) => {
      const fmt = resolveBannerFormat(key)
      if (!fmt) throw new Error(`Unknown canvas size: ${key}. Add a supported size before exporting.`)
      const layers = getScaledLayers(key)
      const html = buildBannerHTML(key, layers, {
        playback: state.sets[key]?.playback || state.sets[state.activeKey]?.playback,
        includeAnimations: true,
        bgColor: state.sets[key]?.bgColor || state.bgColor || '#0a0a10',
        customFonts: getExportCustomFonts(layers)
      })
      return { key, html, width: fmt.w, height: fmt.h }
    }).filter(Boolean)

    // Enqueue render jobs
    const { jobIds } = await videoExportSession.attempt(async headers =>
      await apiFetch<{ jobIds: string[] }>('/api/agency/banner-studio/export-video', {
        method: 'POST',
        headers,
        body: {
          projectId,
          formats,
          fps: videoFps.value,
          quality: videoQuality.value,
          crf: videoCrf.value
        }
      })
    )

    if (!jobIds.length) throw new Error('No render jobs were created. Try exporting again.')
    bannerRenderSuggestions.remember(projectId, suggestionClientId, jobIds, socialSuggestion)
    if (state.project?.id === projectId) {
      currentJobs.value = jobIds.map((jobId, index) => ({
        jobId, formatKey: formats[index]?.key || '', status: 'queued', url: null, fileSize: null, error: null
      }))
      videoPendingFormats.value = [...new Set([...videoPendingFormats.value, ...keys])]
    }
    toast.add({ title: 'Video exports queued', description: `${jobIds.length} render jobs saved. You can close this dialog and return to check their status.`, color: 'success' })
  } catch (err: unknown) {
    const status = apiErrorStatus(err) ?? (err && typeof err === 'object' && 'status' in err ? err.status : null)
    const message = status === 503
      ? 'MP4 export isn\'t enabled yet — the render queue binding is not active'
      : describeBannerVideoExportError(err)
    toast.add({ title: 'Export failed', description: message, color: 'error' })
  } finally {
    isExporting.value = false
    exportProgress.value = 0
  }
}

function handleExport() {
  if (isVideoExport.value) {
    exportVideos()
  } else if (isGifExport.value) {
    exportGifs()
  } else if (isImageExport.value) {
    exportImages()
  } else {
    exportZip()
  }
}

const exportButtonLabel = computed(() => {
  if (isVideoExport.value) {
    return `Export ${selected.value.size} as MP4`
  }
  if (isGifExport.value) {
    return `Export ${selected.value.size} as GIF`
  }
  if (isImageExport.value) {
    const qualityLabel = imageQuality.value === 2 ? ' @2x' : ''
    return `Export ${selected.value.size} as ${exportType.value.toUpperCase()}${qualityLabel}`
  }
  return `Export ${selected.value.size} as ZIP`
})
</script>

<template>
  <UModal :open="props.open" @update:open="emit('update:open', $event)">
    <template #content>
      <div class="p-4 max-h-[90dvh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">
            Export Banners
          </h3>
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            size="xs"
            @click="emit('update:open', false)"
          />
        </div>

        <UAlert v-if="scopedCanvas" class="mb-4" color="info" variant="subtle" title="Protected artwork"
          :description="state.isDirty || state.isSaving ? 'Save your changes before exporting. PNG, JPG, GIF and HTML use your saved artwork.' : 'PNG, JPG, GIF and HTML download your saved artwork. MP4 and publishing are unavailable.'" />

        <!-- Export type selector -->
        <div class="flex gap-1.5 mb-4 p-1 bg-(--ui-bg) rounded-lg">
          <UButton
            v-for="opt in exportTypeOptions"
            :key="opt.value"
            :disabled="scopedCanvas && opt.value === 'mp4'"
            class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            :class="exportType === opt.value
              ? 'bg-(--ui-bg-elevated) text-(--ui-text) shadow-sm'
              : 'text-(--ui-text-muted) hover:text-(--ui-text)'"
            @click="() => { exportType = opt.value as any }"
          >
            <UIcon :name="opt.icon" class="w-3.5 h-3.5" />
            {{ opt.label }}
          </UButton>
        </div>

        <!-- Options retain the dashboard typography and one-column modal spacing. -->
        <div v-if="isImageExport" class="space-y-3 mb-4 p-3 bg-elevated rounded-lg">
          <UFormField label="Resolution">
            <div class="flex gap-2">
              <UButton v-for="scale in [1, 2]" :key="scale" class="flex-1 justify-center" size="xs"
                :variant="imageQuality === scale ? 'soft' : 'ghost'" @click="imageQuality = scale as 1 | 2">
                {{ scale === 1 ? 'Standard (1x)' : 'Retina (2x)' }}
              </UButton>
            </div>
          </UFormField>
          <UFormField v-if="exportType === 'jpg'" :label="`Quality: ${jpgQuality}%`">
            <USlider v-model="jpgQuality" :min="60" :max="100" :step="5" class="w-full" />
          </UFormField>
        </div>

        <div v-if="isGifExport" class="space-y-3 mb-4 p-3 bg-elevated rounded-lg">
          <UFormField :label="`Frame rate: ${gifFps} fps`" :description="`Estimated frames: ${estimatedGifFrames}`">
            <USlider v-model="gifFps" :min="5" :max="15" :step="1" class="w-full" />
          </UFormField>
        </div>

        <div v-if="isVideoExport" class="space-y-3 mb-4 p-3 bg-elevated rounded-lg">
          <UFormField label="Frame rate">
            <div class="flex gap-2">
              <UButton v-for="fps in [24, 30, 60]" :key="fps" class="flex-1 justify-center" size="xs"
                :variant="videoFps === fps ? 'soft' : 'ghost'" @click="videoFps = fps">{{ fps }} fps</UButton>
            </div>
          </UFormField>
          <UFormField label="Resolution">
            <div class="flex gap-2">
              <UButton v-for="scale in [1, 2]" :key="scale" class="flex-1 justify-center" size="xs"
                :variant="videoQuality === scale ? 'soft' : 'ghost'" @click="videoQuality = scale as 1 | 2">
                {{ scale === 1 ? 'Standard (1x)' : 'Retina (2x)' }}
              </UButton>
            </div>
          </UFormField>
          <UFormField :label="`Quality (CRF): ${videoCrf}`" description="Lower values give higher quality; higher values give smaller files.">
            <USlider v-model="videoCrf" :min="15" :max="35" :step="1" class="w-full" />
          </UFormField>
          <p class="text-xs text-muted">Estimated frames: {{ estimatedVideoFrames }}</p>
        </div>

        <!-- Platform checkboxes -->
        <div class="space-y-3 mb-4 max-h-[280px] overflow-y-auto">
          <div v-for="(keys, platform) in platformGroups" :key="platform">
            <div class="flex items-center gap-2 mb-1.5">
              <UCheckbox
                :model-value="keys.every(k => selected.has(k))"
                @update:model-value="togglePlatform(platform)"
              />
              <span
                class="w-2.5 h-2.5 rounded-full"
                :style="{ backgroundColor: PLATFORM_META[platform]?.color || '#888' }"
              />
              <span class="text-sm font-semibold">{{ PLATFORM_META[platform]?.label || platform }}</span>
            </div>
            <div class="ml-6 space-y-1">
              <div
                v-for="key in keys"
                :key="key"
                class="flex items-center gap-2"
              >
                <UCheckbox
                  :model-value="selected.has(key)"
                  @update:model-value="toggleSize(key)"
                />
                <span class="text-xs">{{ exportFormatLabel(key, resolveBannerFormat(key)?.name) }}</span>
                <span class="text-[11px] font-mono text-(--ui-text-muted)">{{ resolveBannerFormat(key)?.w }}x{{ resolveBannerFormat(key)?.h }}</span>
                <span v-if="isImageExport && imageQuality === 2" class="text-[10px] text-(--ui-text-dimmed)">
                  ({{ (resolveBannerFormat(key)?.w || 0) * 2 }}x{{ (resolveBannerFormat(key)?.h || 0) * 2 }})
                </span>
                <BannerFileSizeMeter
                  v-if="exportType === 'html5' && state.sets[key]"
                  :total="estimateSize(key).total"
                  compact
                  class="flex-1"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Platform validation -->
        <div v-if="state.project?.id && exportType === 'html5'" class="mb-4 p-3 bg-(--ui-bg) rounded-lg">
          <div class="text-xs font-medium text-(--ui-text-muted) mb-2">
            HTML5 display-ad compliance
          </div>
          <BannerValidationBadges :project-id="state.project.id" />
        </div>

        <!-- Progress -->
        <div v-if="isExporting && !isVideoExport" class="mb-4">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs text-(--ui-text-muted)">
              {{ isGifExport ? 'Generating GIFs...' : isImageExport ? 'Rendering images...' : 'Exporting...' }}
            </span>
            <span class="text-xs font-mono text-(--ui-text-muted)">{{ exportProgress }}%</span>
          </div>
          <div class="h-1.5 bg-(--ui-bg) rounded-full overflow-hidden">
            <div
              class="h-full bg-(--ui-primary) rounded-full transition-all duration-200"
              :style="{ width: `${exportProgress}%` }"
            />
          </div>
        </div>

        <p v-if="isExporting && isVideoExport" role="status" class="mb-4 text-xs text-muted">
          Submitting render jobs…
        </p>

        <BannerVideoResults
          v-if="state.project?.id && isVideoExport"
          :key="state.project.id"
          :project-id="state.project.id"
          :client-id="state.project.clientId"
          :completed="currentJobs"
          :social-suggestion="props.socialSuggestion"
          :open="props.open"
          @blocked="videoJobsUnavailable = $event"
          @pending-formats="videoPendingFormats = $event"
        />

        <!-- Actions -->
        <div class="flex gap-2 pt-3 border-t border-(--ui-border)">
          <UButton
            :label="isVideoExport ? 'Export Current as MP4' : isGifExport ? 'Export Current as GIF' : isImageExport ? `Export Current as ${exportType.toUpperCase()}` : 'Export Current Size'"
            :icon="isVideoExport ? 'i-lucide-video' : isGifExport ? 'i-lucide-film' : isImageExport ? 'i-lucide-image' : 'i-lucide-file-code'"
            variant="outline"
            size="sm"
            :disabled="isExporting || (isVideoExport && currentVideoBlocked)"
            @click="exportCurrent"
          />
          <UButton
            :label="exportButtonLabel"
            :icon="isVideoExport ? 'i-lucide-video' : isGifExport ? 'i-lucide-film' : isImageExport ? 'i-lucide-images' : 'i-lucide-archive'"
            size="sm"
            class="flex-1"
            :disabled="selected.size === 0 || isExporting || (isVideoExport && videoJobsBlocked)"
            :loading="isExporting"
            @click="handleExport"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
