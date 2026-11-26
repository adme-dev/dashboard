<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { resolveBannerFormat } from '~/utils/banner-constants'
import type { ArtboardState } from '~/types/banner-studio'
import { withBannerPreviewAudio } from '~/utils/banner-preview-audio'
import { readBannerPreviewPlayback, withBannerPreviewPlayback, type BannerPreviewPlayback } from '~/utils/banner-preview-playback'

const props = defineProps<{ documents: Record<string, string>, canvas: Record<string, ArtboardState> }>()
const emit = defineEmits<{ focus: [key: string], unavailable: [] }>()
const gallery = ref<HTMLElement>()
const sizes = computed(() => Object.entries(props.documents).flatMap(([key, html], index) => {
  const format = resolveBannerFormat(key)
  if (!format) return []
  const id = index + 1
  return [{ key, id, format, html: withBannerPreviewPlayback(withBannerPreviewAudio(html), id) }]
}))
const audioSize = computed(() => sizes.value.find(size => props.canvas[size.key]?.layers.some(layer =>
  layer.type === 'audio' && layer.src && !layer.muted && !layer.hidden && (layer.volume ?? 1) > 0))?.id)
const muted = ref(false)
const audioError = ref('')
const states = reactive<Record<number, BannerPreviewPlayback['state']>>({})
const ready = computed(() => sizes.value.every(size => !!states[size.id]) && sizes.value.some(size => states[size.id] !== 'static'))
const playing = computed(() => Object.values(states).includes('playing'))
let sequence = 0
function frames() {
  return Array.from(gallery.value?.querySelectorAll('iframe') ?? [])
}
function setSound(frame: Window, id: number) {
  frame.postMessage({ type: 'banner-preview-sound', muted: muted.value || id !== audioSize.value }, '*')
}
function toggleSound() {
  muted.value = !muted.value
  audioError.value = ''
  frames().forEach((frame, i) => { if (frame.contentWindow) setSound(frame.contentWindow, sizes.value[i]!.id) })
}
function control(action: 'play' | 'pause' | 'replay') {
  sequence++
  frames().forEach((frame, i) => {
    if (!frame.contentWindow) return
    const id = sizes.value[i]!.id
    setSound(frame.contentWindow, id)
    frame.contentWindow.postMessage({ type: 'banner-preview-control', frameId: id, commandId: sequence, action }, '*')
  })
}
function receive(event: MessageEvent) {
  const data = event.data
  if (data?.type !== 'banner-preview-audio' && data?.type !== 'banner-preview-playback') return
  const index = frames().findIndex(frame => frame.contentWindow === event.source)
  const size = sizes.value[index]
  if (!size) return
  if (data.type === 'banner-preview-audio') {
    if (data.status === 'ready') setSound(event.source as Window, size.id)
    else if (size.id === audioSize.value && ['blocked', 'error'].includes(data.status)) audioError.value = 'Sound unavailable. Open this size to check its soundtrack.'
    return
  }
  if (data.commandId !== sequence) return
  const status = readBannerPreviewPlayback(data, size.id)
  if (!status) return
  if (status.state === 'unavailable') emit('unavailable')
  else if (states[size.id] !== status.state) states[size.id] = status.state
}
onMounted(() => window.addEventListener('message', receive))
onBeforeUnmount(() => window.removeEventListener('message', receive))
</script>

<template>
  <section ref="gallery" aria-label="All banner sizes" class="flex min-h-0 flex-1 flex-col">
    <div class="flex flex-wrap items-center gap-2 border-b border-default px-4 py-2 sm:px-6">
      <h2 class="me-auto text-sm font-semibold">All sizes ({{ sizes.length }})</h2>
      <UButton :label="playing ? 'Pause all' : 'Play all'" :icon="playing ? 'i-lucide-pause' : 'i-lucide-play'" :disabled="!ready" @click="control(playing ? 'pause' : 'play')" />
      <UButton label="Replay all" icon="i-lucide-rotate-ccw" color="neutral" variant="ghost" :disabled="!ready" @click="control('replay')" />
      <UButton v-if="audioSize" :aria-label="muted ? 'Unmute audio' : 'Mute audio'" :aria-pressed="!muted" :icon="muted ? 'i-lucide-volume-x' : 'i-lucide-volume-2'" color="neutral" variant="ghost" @click="toggleSound" />
    </div>
    <p v-if="audioError" role="status" class="px-4 py-2 text-sm">{{ audioError }}</p>
    <div class="grid min-h-0 flex-1 auto-rows-min grid-cols-1 items-start gap-4 overflow-y-auto bg-elevated/40 p-4 sm:grid-cols-2 xl:grid-cols-3">
      <article v-for="size in sizes" :key="size.key" class="min-w-0 overflow-hidden rounded-xl border border-default bg-default">
        <div class="grid h-[clamp(180px,42vh,420px)] place-items-center bg-elevated p-3">
          <div class="w-full" :style="{ maxWidth: `min(${size.format.w}px, calc((clamp(180px, 42vh, 420px) - 1.5rem) * ${size.format.w / size.format.h}))` }">
            <BannerSavedViewerFrame :html="size.html" :width="size.format.w" :height="size.format.h" :title="`${size.format.w} × ${size.format.h} preview`" />
          </div>
        </div>
        <div class="flex items-center justify-between gap-2 border-t border-default px-3 py-2">
          <h3 class="text-sm font-semibold tabular-nums">{{ size.format.w }} × {{ size.format.h }}</h3>
          <UButton label="View size" :aria-label="`View ${size.format.w} × ${size.format.h}`" trailing-icon="i-lucide-expand" color="neutral" variant="ghost" size="sm" @click="emit('focus', size.key)" />
        </div>
      </article>
    </div>
  </section>
</template>
