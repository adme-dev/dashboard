<script setup lang="ts">
import JSZip from 'jszip'
import { FORMATS, PLATFORM_META } from '~/utils/banner-constants'
import { buildBannerHTML } from '~/utils/banner-html-builder'
import type { Layer, ImageExportResult } from '~/types/banner-studio'
import { summarizeExportJobs } from '~/utils/bannerExportPoll'
import type { ExportJob } from '~/utils/bannerExportPoll'
import { describeBannerVideoExportError } from '~/utils/bannerExportError'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { state, activeLayers } = useBannerStudio()
const { estimateSize } = useBannerFileSize()
const { getExportCustomFonts } = useBannerFonts()
const toast = useToast()

const selected = ref<Set<string>>(new Set(state.setKeys))
const isExporting = ref(false)
const exportProgress = ref(0)

// Export type: html5, png, jpg, gif, mp4
const exportType = ref<'html5' | 'png' | 'jpg' | 'gif' | 'mp4'>('html5')
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
  { label: 'MP4', value: 'mp4', icon: 'i-lucide-video', desc: 'Video files (H.264)' },
]

const isImageExport = computed(() => exportType.value === 'png' || exportType.value === 'jpg')
const isGifExport = computed(() => exportType.value === 'gif')
const isVideoExport = computed(() => exportType.value === 'mp4')
const estimatedGifFrames = computed(() => Math.ceil(state.duration * gifFps.value))
const estimatedVideoFrames = computed(() => Math.ceil(state.duration * videoFps.value))

// Group by platform
const platformGroups = computed(() => {
  const groups: Record<string, string[]> = {}
  state.setKeys.forEach(key => {
    const fmt = FORMATS[key]
    if (!fmt) return
    if (!groups[fmt.platform]) groups[fmt.platform] = []
    groups[fmt.platform].push(key)
  })
  return groups
})

function togglePlatform(platform: string) {
  const keys = platformGroups.value[platform] || []
  const allSelected = keys.every(k => selected.value.has(k))
  keys.forEach(k => {
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
    includeAnimations: !isImageExport.value,
    bgColor: state.sets[fmtKey]?.bgColor || state.bgColor || '#0a0a10',
    customFonts: getExportCustomFonts(layers),
  })
}

function getScaledLayers(fmtKey: string): Layer[] {
  // Use existing layers for this size if available
  if (state.sets[fmtKey]?.layers) return state.sets[fmtKey].layers

  // Otherwise proportionally scale from active artboard
  const srcFmt = FORMATS[state.activeKey]
  const tgtFmt = FORMATS[fmtKey]
  if (!srcFmt || !tgtFmt) return []

  const srcLayers = activeLayers.value
  const sx = tgtFmt.w / srcFmt.w
  const sy = tgtFmt.h / srcFmt.h

  return srcLayers.map(l => {
    const n = { ...JSON.parse(JSON.stringify(l)) }
    n.x = Math.round(l.x * sx)
    n.y = Math.round(l.y * sy)
    n.w = Math.round(l.w * sx)
    n.h = Math.round(l.h * sy)
    if (n.type === 'bg') { n.w = tgtFmt.w; n.h = tgtFmt.h }
    if (n.fontSize) n.fontSize = Math.max(7, Math.round(n.fontSize * Math.min(sx, sy)))
    return n
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadHTML(html: string, filename: string) {
  downloadBlob(new Blob([html], { type: 'text/html' }), filename)
}

function exportCurrent() {
  if (isVideoExport.value || isGifExport.value || isImageExport.value) {
    // For image/gif/video export of single size, use the bulk flow with just one format
    const keys = new Set([state.activeKey])
    const prevSelected = selected.value
    selected.value = keys
    const exportFn = isVideoExport.value ? exportVideos : isGifExport.value ? exportGifs : exportImages
    exportFn().finally(() => { selected.value = prevSelected })
    return
  }
  const html = buildExportHTML(state.activeKey, activeLayers.value)
  const fmt = FORMATS[state.activeKey]
  downloadHTML(html, `${state.project?.name || 'banner'}_${fmt.w}x${fmt.h}.html`)
  toast.add({ title: 'Exported', description: `${fmt.w}x${fmt.h} exported as HTML`, color: 'success' })
}

async function exportZip() {
  const keys = [...selected.value]
  if (!keys.length) return

  isExporting.value = true
  exportProgress.value = 0

  try {
    const zip = new JSZip()
    const projectName = state.project?.name || 'banners'

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const fmt = FORMATS[key]
      if (!fmt) continue
      const layers = getScaledLayers(key)
      const html = buildExportHTML(key, layers)
      zip.file(`${projectName}_${fmt.w}x${fmt.h}.html`, html)
      exportProgress.value = Math.round(((i + 1) / keys.length) * 100)
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(blob, `${projectName}_export.zip`)

    toast.add({ title: 'Export complete', description: `${keys.length} banners exported as ZIP`, color: 'success' })
    emit('update:open', false)
  } catch (err) {
    toast.add({ title: 'Export failed', description: 'Something went wrong during export', color: 'error' })
  } finally {
    isExporting.value = false
    exportProgress.value = 0
  }
}

async function exportImages() {
  const keys = [...selected.value]
  if (!keys.length) return

  if (!state.project?.id) {
    toast.add({ title: 'Save first', description: 'Save the project before exporting images', color: 'warning' })
    return
  }

  isExporting.value = true
  exportProgress.value = 0

  try {
    // Build HTML for each selected format (static, no animations)
    const formats = keys.map(key => {
      const fmt = FORMATS[key]
      if (!fmt) return null
      const layers = getScaledLayers(key)
      const html = buildExportHTML(key, layers)
      return { key, html, width: fmt.w, height: fmt.h }
    }).filter(Boolean)

    exportProgress.value = 20

    // Send to server for rendering
    const results = await $fetch<ImageExportResult[]>('/api/agency/banner-studio/export-image', {
      method: 'POST',
      body: {
        projectId: state.project.id,
        formats,
        quality: imageQuality.value,
        format: exportType.value,
        jpgQuality: exportType.value === 'jpg' ? jpgQuality.value : undefined,
      },
    })

    exportProgress.value = 80

    if (results.length === 1) {
      // Single image — open in new tab for download
      window.open(results[0].url, '_blank')
    } else if (results.length > 1) {
      // Multiple images — download as ZIP
      const zip = new JSZip()
      const projectName = state.project?.name || 'banners'
      const ext = exportType.value === 'jpg' ? 'jpg' : 'png'

      for (const result of results) {
        const fmt = FORMATS[result.formatKey]
        const filename = `${projectName}_${fmt?.w || 0}x${fmt?.h || 0}.${ext}`
        // Fetch the image blob
        const response = await fetch(result.url)
        const blob = await response.blob()
        zip.file(filename, blob)
      }

      exportProgress.value = 95

      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(blob, `${projectName}_images.zip`)
    }

    exportProgress.value = 100

    const qualityLabel = imageQuality.value === 2 ? '@2x' : ''
    toast.add({
      title: 'Export complete',
      description: `${results.length} ${exportType.value.toUpperCase()}${qualityLabel} images exported`,
      color: 'success',
    })
    emit('update:open', false)
  } catch (err: any) {
    const message = err?.data?.statusMessage || err?.message || 'Image export failed'
    toast.add({ title: 'Export failed', description: message, color: 'error' })
  } finally {
    isExporting.value = false
    exportProgress.value = 0
  }
}

async function exportGifs() {
  const keys = [...selected.value]
  if (!keys.length) return

  if (!state.project?.id) {
    toast.add({ title: 'Save first', description: 'Save the project before exporting GIFs', color: 'warning' })
    return
  }

  isExporting.value = true
  exportProgress.value = 0

  try {
    // Build HTML for each selected format (WITH animations for GSAP)
    const formats = keys.map(key => {
      const fmt = FORMATS[key]
      if (!fmt) return null
      const layers = getScaledLayers(key)
      const html = buildBannerHTML(key, layers, {
        includeAnimations: true,
        bgColor: state.sets[key]?.bgColor || state.bgColor || '#0a0a10',
        customFonts: getExportCustomFonts(layers),
      })
      return { key, html, width: fmt.w, height: fmt.h }
    }).filter(Boolean)

    exportProgress.value = 10

    const results = await $fetch<ImageExportResult[]>('/api/agency/banner-studio/export-gif', {
      method: 'POST',
      body: {
        projectId: state.project.id,
        formats,
        fps: gifFps.value,
      },
    })

    exportProgress.value = 80

    if (results.length === 1) {
      window.open(results[0].url, '_blank')
    } else if (results.length > 1) {
      const zip = new JSZip()
      const projectName = state.project?.name || 'banners'

      for (const result of results) {
        const fmt = FORMATS[result.formatKey]
        const filename = `${projectName}_${fmt?.w || 0}x${fmt?.h || 0}.gif`
        const response = await fetch(result.url)
        const blob = await response.blob()
        zip.file(filename, blob)
      }

      exportProgress.value = 95

      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(blob, `${projectName}_gifs.zip`)
    }

    exportProgress.value = 100
    toast.add({
      title: 'Export complete',
      description: `${results.length} GIF${results.length > 1 ? 's' : ''} exported at ${gifFps.value}fps`,
      color: 'success',
    })
    emit('update:open', false)
  } catch (err: any) {
    const message = err?.data?.statusMessage || err?.message || 'GIF export failed'
    toast.add({ title: 'Export failed', description: message, color: 'error' })
  } finally {
    isExporting.value = false
    exportProgress.value = 0
  }
}

async function exportVideos() {
  const keys = [...selected.value]
  if (!keys.length) return

  if (!state.project?.id) {
    toast.add({ title: 'Save first', description: 'Save the project before exporting videos', color: 'warning' })
    return
  }

  isExporting.value = true
  exportProgress.value = 0

  let pollTimer: ReturnType<typeof setTimeout> | null = null

  try {
    const formats = keys.map(key => {
      const fmt = FORMATS[key]
      if (!fmt) return null
      const layers = getScaledLayers(key)
      const html = buildBannerHTML(key, layers, {
        includeAnimations: true,
        bgColor: state.sets[key]?.bgColor || state.bgColor || '#0a0a10',
        customFonts: getExportCustomFonts(layers),
      })
      return { key, html, width: fmt.w, height: fmt.h }
    }).filter(Boolean)

    exportProgress.value = 5

    // Enqueue render jobs
    const { jobIds } = await $fetch<{ jobIds: string[] }>('/api/agency/banner-studio/export-video', {
      method: 'POST',
      body: {
        projectId: state.project.id,
        formats,
        fps: videoFps.value,
        quality: videoQuality.value,
        crf: videoCrf.value,
      },
    })

    exportProgress.value = 10

    // Poll until all jobs finish (max 150 polls ≈ 5 min at 2s intervals)
    const MAX_POLL_ATTEMPTS = 150
    let pollAttempts = 0
    await new Promise<void>((resolve, reject) => {
      const poll = async () => {
        pollAttempts++
        if (pollAttempts > MAX_POLL_ATTEMPTS) {
          if (pollTimer) clearTimeout(pollTimer)
          isExporting.value = false
          toast.add({
            title: 'Still processing',
            description: 'Still processing — check the exports gallery.',
            color: 'warning',
          })
          resolve()
          return
        }
        try {
          const { jobs } = await $fetch<{ jobs: ExportJob[] }>(
            `/api/agency/banner-studio/export-video/jobs?ids=${jobIds.join(',')}`,
          )
          const summary = summarizeExportJobs(jobs)
          // Map render progress to 10–95% range
          exportProgress.value = 10 + Math.round(summary.progress * 0.85)

          if (summary.finished) {
            if (summary.failed > 0) {
              toast.add({
                title: 'Some exports failed',
                description: `${summary.failed} of ${summary.total} MP4 render${summary.failed > 1 ? 's' : ''} failed`,
                color: 'error',
              })
            }
            if (summary.urls.length > 0) {
              const projectName = state.project?.name || 'banners'
              if (summary.urls.length === 1) {
                window.open(summary.urls[0], '_blank')
              } else {
                // Download as ZIP using the same downloadBlob helper
                const zip = new JSZip()
                const jobsDone = jobs.filter(j => j.status === 'done')
                for (const job of jobsDone) {
                  const fmt = FORMATS[job.formatKey]
                  const filename = `${projectName}_${fmt?.w || 0}x${fmt?.h || 0}.mp4`
                  const response = await fetch(job.url as string)
                  const blob = await response.blob()
                  zip.file(filename, blob)
                }
                exportProgress.value = 97
                const blob = await zip.generateAsync({ type: 'blob' })
                downloadBlob(blob, `${projectName}_videos.zip`)
              }
              exportProgress.value = 100
              toast.add({
                title: 'Export complete',
                description: `${summary.urls.length} MP4 video${summary.urls.length > 1 ? 's' : ''} ready at ${videoFps.value}fps`,
                color: 'success',
              })
              emit('update:open', false)
            }
            resolve()
          } else {
            pollTimer = setTimeout(poll, 2000)
          }
        } catch (pollErr) {
          reject(pollErr)
        }
      }
      poll()
    })
  } catch (err: any) {
    const status = err?.statusCode ?? err?.status
    const message = status === 503
      ? 'MP4 export isn\'t enabled yet — the render queue binding is not active'
      : describeBannerVideoExportError(err)
    toast.add({ title: 'Export failed', description: message, color: 'error' })
  } finally {
    if (pollTimer) clearTimeout(pollTimer)
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
      <div class="p-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">Export Banners</h3>
          <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="emit('update:open', false)" />
        </div>

        <!-- Export type selector -->
        <div class="flex gap-1.5 mb-4 p-1 bg-(--ui-bg) rounded-lg">
          <button
            v-for="opt in exportTypeOptions"
            :key="opt.value"
            class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            :class="exportType === opt.value
              ? 'bg-(--ui-bg-elevated) text-(--ui-text) shadow-sm'
              : 'text-(--ui-text-muted) hover:text-(--ui-text)'"
            @click="exportType = opt.value as any"
          >
            <UIcon :name="opt.icon" class="w-3.5 h-3.5" />
            {{ opt.label }}
          </button>
        </div>

        <!-- Image export options -->
        <div v-if="isImageExport" class="space-y-3 mb-4 p-3 bg-(--ui-bg) rounded-lg">
          <!-- Resolution -->
          <div>
            <label class="text-xs font-medium text-(--ui-text-muted) mb-1.5 block">Resolution</label>
            <div class="flex gap-2">
              <button
                class="flex-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
                :class="imageQuality === 1
                  ? 'border-(--ui-primary) bg-(--ui-primary)/10 text-(--ui-primary)'
                  : 'border-(--ui-border) text-(--ui-text-muted) hover:border-(--ui-text-muted)'"
                @click="imageQuality = 1"
              >
                Standard (1x)
              </button>
              <button
                class="flex-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
                :class="imageQuality === 2
                  ? 'border-(--ui-primary) bg-(--ui-primary)/10 text-(--ui-primary)'
                  : 'border-(--ui-border) text-(--ui-text-muted) hover:border-(--ui-text-muted)'"
                @click="imageQuality = 2"
              >
                Retina (2x)
              </button>
            </div>
          </div>

          <!-- JPG quality slider -->
          <div v-if="exportType === 'jpg'">
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-xs font-medium text-(--ui-text-muted)">Quality</label>
              <span class="text-xs font-mono text-(--ui-text-muted)">{{ jpgQuality }}%</span>
            </div>
            <input
              v-model.number="jpgQuality"
              type="range"
              min="60"
              max="100"
              step="5"
              class="w-full accent-(--ui-primary)"
            />
          </div>
        </div>

        <!-- GIF export options -->
        <div v-if="isGifExport" class="space-y-3 mb-4 p-3 bg-(--ui-bg) rounded-lg">
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-xs font-medium text-(--ui-text-muted)">Frame Rate</label>
              <span class="text-xs font-mono text-(--ui-text-muted)">{{ gifFps }} fps</span>
            </div>
            <input
              v-model.number="gifFps"
              type="range"
              min="5"
              max="15"
              step="1"
              class="w-full accent-(--ui-primary)"
            />
          </div>
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-(--ui-text-muted)">
              Est. frames: <span class="font-mono">{{ estimatedGifFrames }}</span>
            </span>
            <span v-if="estimatedGifFrames > 50" class="text-amber-500 flex items-center gap-1">
              <UIcon name="i-lucide-alert-triangle" class="w-3 h-3" />
              May take a while
            </span>
          </div>
        </div>

        <!-- MP4 export options -->
        <div v-if="isVideoExport" class="space-y-3 mb-4 p-3 bg-(--ui-bg) rounded-lg">
          <!-- Frame rate -->
          <div>
            <label class="text-xs font-medium text-(--ui-text-muted) mb-1.5 block">Frame Rate</label>
            <div class="flex gap-2">
              <button
                v-for="fps in [24, 30, 60]"
                :key="fps"
                class="flex-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
                :class="videoFps === fps
                  ? 'border-(--ui-primary) bg-(--ui-primary)/10 text-(--ui-primary)'
                  : 'border-(--ui-border) text-(--ui-text-muted) hover:border-(--ui-text-muted)'"
                @click="videoFps = fps"
              >
                {{ fps }}fps
              </button>
            </div>
          </div>

          <!-- Resolution -->
          <div>
            <label class="text-xs font-medium text-(--ui-text-muted) mb-1.5 block">Resolution</label>
            <div class="flex gap-2">
              <button
                class="flex-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
                :class="videoQuality === 1
                  ? 'border-(--ui-primary) bg-(--ui-primary)/10 text-(--ui-primary)'
                  : 'border-(--ui-border) text-(--ui-text-muted) hover:border-(--ui-text-muted)'"
                @click="videoQuality = 1"
              >
                Standard (1x)
              </button>
              <button
                class="flex-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
                :class="videoQuality === 2
                  ? 'border-(--ui-primary) bg-(--ui-primary)/10 text-(--ui-primary)'
                  : 'border-(--ui-border) text-(--ui-text-muted) hover:border-(--ui-text-muted)'"
                @click="videoQuality = 2"
              >
                Retina (2x)
              </button>
            </div>
          </div>

          <!-- CRF quality -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-xs font-medium text-(--ui-text-muted)">Quality (CRF)</label>
              <span class="text-xs font-mono text-(--ui-text-muted)">{{ videoCrf }}</span>
            </div>
            <input
              v-model.number="videoCrf"
              type="range"
              min="15"
              max="35"
              step="1"
              class="w-full accent-(--ui-primary)"
            />
            <div class="flex justify-between text-[10px] text-(--ui-text-dimmed) mt-0.5">
              <span>Higher quality</span>
              <span>Smaller file</span>
            </div>
          </div>

          <!-- Estimated frames -->
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-(--ui-text-muted)">
              Est. frames: <span class="font-mono">{{ estimatedVideoFrames }}</span>
            </span>
            <span v-if="estimatedVideoFrames > 300" class="text-amber-500 flex items-center gap-1">
              <UIcon name="i-lucide-alert-triangle" class="w-3 h-3" />
              May take a while
            </span>
          </div>
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
                <span class="text-xs">{{ FORMATS[key]?.name }}</span>
                <span class="text-[11px] font-mono text-(--ui-text-muted)">{{ FORMATS[key]?.w }}x{{ FORMATS[key]?.h }}</span>
                <span v-if="isImageExport && imageQuality === 2" class="text-[10px] text-(--ui-text-dimmed)">
                  ({{ (FORMATS[key]?.w || 0) * 2 }}x{{ (FORMATS[key]?.h || 0) * 2 }})
                </span>
                <BannerFileSizeMeter
                  v-if="state.sets[key]"
                  :total="estimateSize(key).total"
                  compact
                  class="flex-1"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Platform validation -->
        <div v-if="state.project?.id" class="mb-4 p-3 bg-(--ui-bg) rounded-lg">
          <div class="text-xs font-medium text-(--ui-text-muted) mb-2">Platform Compliance</div>
          <BannerValidationBadges :project-id="state.project.id" />
        </div>

        <!-- Progress -->
        <div v-if="isExporting" class="mb-4">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs text-(--ui-text-muted)">
              {{ isVideoExport ? 'Encoding videos...' : isGifExport ? 'Generating GIFs...' : isImageExport ? 'Rendering images...' : 'Exporting...' }}
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

        <!-- Actions -->
        <div class="flex gap-2 pt-3 border-t border-(--ui-border)">
          <UButton
            :label="isVideoExport ? 'Export Current as MP4' : isGifExport ? 'Export Current as GIF' : isImageExport ? `Export Current as ${exportType.toUpperCase()}` : 'Export Current Size'"
            :icon="isVideoExport ? 'i-lucide-video' : isGifExport ? 'i-lucide-film' : isImageExport ? 'i-lucide-image' : 'i-lucide-file-code'"
            variant="outline"
            size="sm"
            :disabled="isExporting"
            @click="exportCurrent"
          />
          <UButton
            :label="exportButtonLabel"
            :icon="isVideoExport ? 'i-lucide-video' : isGifExport ? 'i-lucide-film' : isImageExport ? 'i-lucide-images' : 'i-lucide-archive'"
            size="sm"
            class="flex-1"
            :disabled="selected.size === 0 || isExporting"
            :loading="isExporting"
            @click="handleExport"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
