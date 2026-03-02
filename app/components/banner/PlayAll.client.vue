<script setup lang="ts">
import gsap from 'gsap'
import { FORMATS, PLATFORM_META } from '~/utils/banner-constants'

const props = defineProps<{
  open: boolean
}>()
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const { state } = useBannerStudio()
const { buildTimelineForKey } = useBannerTimeline()

const artboardRefs = ref<Record<string, any>>({})
const timelines = ref<gsap.core.Timeline[]>([])
const isPlaying = ref(false)
const isLooping = ref(true)
const playbackSpeed = ref(1)
const currentTime = ref(0)
const totalDuration = ref(5)

let timePoller: ReturnType<typeof setInterval> | null = null

function setArtboardRef(key: string, el: any) {
  if (el) artboardRefs.value[key] = el
}

// Scale each artboard to fit within a cell
function artboardScale(key: string): number {
  const fmt = FORMATS[key]
  if (!fmt) return 0.15
  const maxCell = 280
  return Math.min(maxCell / fmt.w, maxCell / fmt.h, 0.5)
}

function buildAll() {
  // Kill old timelines
  timelines.value.forEach(tl => tl.kill())
  timelines.value = []
  let maxEnd = 0

  nextTick(() => {
    state.setKeys.forEach(key => {
      const ref = artboardRefs.value[key]
      const artboardEl = ref?.artboardEl || ref?.$el
      if (!artboardEl) return

      const layers = state.sets[key]?.layers ?? []
      const tl = buildTimelineForKey(artboardEl, layers)

      // Override onComplete for synced loop behavior
      tl.eventCallback('onComplete', () => {
        if (isLooping.value) {
          timelines.value.forEach(t => t.restart())
        } else {
          isPlaying.value = false
          stopTimePoller()
        }
      })

      timelines.value.push(tl)
      maxEnd = Math.max(maxEnd, tl.duration())
    })
    totalDuration.value = maxEnd || 5
  })
}

function startTimePoller() {
  stopTimePoller()
  timePoller = setInterval(() => {
    if (timelines.value.length > 0 && isPlaying.value) {
      currentTime.value = timelines.value[0].time()
    }
  }, 50)
}

function stopTimePoller() {
  if (timePoller) { clearInterval(timePoller); timePoller = null }
}

function playAll() {
  isPlaying.value = true
  timelines.value.forEach(tl => {
    tl.timeScale(playbackSpeed.value)
    tl.play()
  })
  startTimePoller()
}

function pauseAll() {
  isPlaying.value = false
  timelines.value.forEach(tl => tl.pause())
  stopTimePoller()
  if (timelines.value.length > 0) {
    currentTime.value = timelines.value[0].time()
  }
}

function togglePlayAll() {
  if (isPlaying.value) {
    pauseAll()
  } else {
    playAll()
  }
}

function restartAll() {
  isPlaying.value = true
  currentTime.value = 0
  timelines.value.forEach(tl => {
    tl.timeScale(playbackSpeed.value)
    tl.restart()
  })
  startTimePoller()
}

function close() {
  pauseAll()
  emit('update:open', false)
}

function setSpeed(speed: number) {
  playbackSpeed.value = speed
  timelines.value.forEach(tl => tl.timeScale(speed))
}

function formatTime(t: number): string {
  const secs = Math.floor(t)
  const ms = Math.round((t - secs) * 10)
  return `${secs}.${ms}s`
}

const speedOptions = [
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
]

watch(() => props.open, (val) => {
  if (val) {
    nextTick(() => buildAll())
  } else {
    stopTimePoller()
    timelines.value.forEach(tl => tl.kill())
    timelines.value = []
    currentTime.value = 0
  }
})

onUnmounted(() => {
  stopTimePoller()
  timelines.value.forEach(tl => tl.kill())
})
</script>

<template>
  <UModal :open="open" @update:open="emit('update:open', $event)">
    <template #content>
      <div class="p-5">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-play-circle" class="w-4 h-4 text-(--ui-primary)" />
            <h3 class="text-sm font-semibold">Play All Formats</h3>
          </div>
          <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="close" />
        </div>

        <!-- Playback controls -->
        <div class="flex items-center gap-2 mb-4 px-2 py-2 rounded-lg bg-(--ui-bg) border border-(--ui-border)">
          <UButton
            :icon="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
            variant="soft"
            size="xs"
            @click="togglePlayAll"
          />
          <UButton
            icon="i-lucide-rotate-ccw"
            variant="ghost"
            size="xs"
            @click="restartAll"
          />
          <UButton
            icon="i-lucide-repeat"
            :variant="isLooping ? 'soft' : 'ghost'"
            size="xs"
            :color="isLooping ? 'primary' : undefined"
            @click="isLooping = !isLooping"
          />

          <!-- Time display -->
          <div class="text-xs font-mono text-(--ui-text-muted) ml-2">
            {{ formatTime(currentTime) }} / {{ formatTime(totalDuration) }}
          </div>

          <!-- Speed control -->
          <div class="ml-auto flex items-center gap-1">
            <button
              v-for="sp in speedOptions"
              :key="sp.value"
              class="text-[10px] px-2 py-0.5 rounded font-mono transition-colors"
              :class="playbackSpeed === sp.value
                ? 'bg-(--ui-primary)/15 text-(--ui-primary) font-bold'
                : 'text-(--ui-text-dimmed) hover:text-(--ui-text)'"
              @click="setSpeed(sp.value)"
            >{{ sp.label }}</button>
          </div>
        </div>

        <!-- Artboards grid -->
        <div class="grid gap-4 max-h-[65vh] overflow-auto" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))">
          <div
            v-for="key in state.setKeys"
            :key="key"
            class="flex flex-col items-center gap-2 p-3 rounded-lg bg-(--ui-bg-elevated)/50 border border-(--ui-border)/50"
          >
            <!-- Format label -->
            <div class="flex items-center gap-1.5 w-full">
              <span
                class="w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center shrink-0"
                :style="{
                  backgroundColor: PLATFORM_META[FORMATS[key]?.platform]?.bg || 'rgba(255,255,255,0.08)',
                  color: PLATFORM_META[FORMATS[key]?.platform]?.color || '#888',
                }"
              >{{ FORMATS[key]?.icon || '?' }}</span>
              <span class="text-[11px] font-medium text-(--ui-text)">{{ FORMATS[key]?.name }}</span>
              <UBadge size="xs" variant="subtle" class="ml-auto font-mono">{{ FORMATS[key]?.w }}x{{ FORMATS[key]?.h }}</UBadge>
            </div>

            <!-- Scaled artboard -->
            <div
              class="rounded ring-1 ring-(--ui-border)/30 overflow-hidden"
              :style="{
                width: `${(FORMATS[key]?.w || 300) * artboardScale(key)}px`,
                height: `${(FORMATS[key]?.h || 250) * artboardScale(key)}px`,
              }"
            >
              <div
                :style="{
                  transformOrigin: 'top left',
                  transform: `scale(${artboardScale(key)})`,
                  width: `${FORMATS[key]?.w || 300}px`,
                  height: `${FORMATS[key]?.h || 250}px`,
                }"
              >
                <BannerArtboard
                  :ref="(el: any) => setArtboardRef(key, el)"
                  :format-key="key"
                  :is-active="false"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
