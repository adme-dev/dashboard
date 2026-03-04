<script setup lang="ts">
import { useDraggable, useWindowSize } from '@vueuse/core'

const { isOpen, hidden, activeTab, sizeMode, savedPosition, totalUnreadBadge, toggle } = useActivityHub()

const panelEl = ref<HTMLElement | null>(null)
const headerRef = ref<InstanceType<any> | null>(null)

const { width: winW, height: winH } = useWindowSize()

const panelWidth = computed(() => sizeMode.value === 'compact' ? 400 : 480)
const panelHeight = computed(() => sizeMode.value === 'compact' ? 520 : 650)

const MARGIN = 24

// Compute default position (bottom-right)
const defaultX = computed(() => winW.value - panelWidth.value - MARGIN)
const defaultY = computed(() => winH.value - panelHeight.value - MARGIN)

// Resolve initial position
const initialX = computed(() => savedPosition.value.x >= 0 ? savedPosition.value.x : defaultX.value)
const initialY = computed(() => savedPosition.value.y >= 0 ? savedPosition.value.y : defaultY.value)

const { x, y, style: _dragStyle } = useDraggable(panelEl, {
  handle: computed(() => headerRef.value?.handleEl) as any,
  initialValue: { x: initialX.value, y: initialY.value },
})

// Clamp position within viewport
function clamp() {
  const maxX = winW.value - panelWidth.value
  const maxY = winH.value - panelHeight.value
  x.value = Math.max(0, Math.min(x.value, maxX))
  y.value = Math.max(0, Math.min(y.value, maxY))
}

// Save position after drag (debounced to avoid tight loop)
let clamping = false
watch([x, y], () => {
  if (clamping) return
  clamping = true
  clamp()
  savedPosition.value = { x: x.value, y: y.value }
  nextTick(() => { clamping = false })
})

// Re-clamp on window resize or size mode change
watch([winW, winH, sizeMode], () => {
  clamping = true
  clamp()
  savedPosition.value = { x: x.value, y: y.value }
  nextTick(() => { clamping = false })
})

// Reset position to default when opening if saved position is invalid
watch(isOpen, (open) => {
  if (open && savedPosition.value.x < 0) {
    x.value = defaultX.value
    y.value = defaultY.value
  }
})
</script>

<template>
  <!-- Panel (v-show so useDraggable ref stays attached) -->
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 translate-y-4 scale-95"
    enter-to-class="opacity-100 translate-y-0 scale-100"
    leave-active-class="transition-all duration-150 ease-in"
    leave-from-class="opacity-100 translate-y-0 scale-100"
    leave-to-class="opacity-0 translate-y-4 scale-95"
  >
    <div
      v-show="isOpen && !hidden"
      ref="panelEl"
      class="fixed z-50 rounded-xl shadow-xl border border-default bg-default flex flex-col overflow-hidden"
      :style="{
        width: `${panelWidth}px`,
        height: `${panelHeight}px`,
        left: `${x}px`,
        top: `${y}px`,
      }"
    >
      <ActivityHubHeader ref="headerRef" />
      <ActivityHubTabs />

      <!-- Tab content -->
      <div class="flex-1 min-h-0">
        <Transition
          mode="out-in"
          enter-active-class="transition-opacity duration-150"
          enter-from-class="opacity-0"
          enter-to-class="opacity-100"
          leave-active-class="transition-opacity duration-100"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <ActivityHubFeed v-if="activeTab === 'feed'" key="feed" />
          <ActivityHubForYou v-else-if="activeTab === 'for-you'" key="for-you" />
          <ActivityHubIncoming v-else-if="activeTab === 'incoming'" key="incoming" />
          <ActivityHubAi v-else-if="activeTab === 'ai'" key="ai" />
        </Transition>
      </div>
    </div>
  </Transition>

  <!-- FAB Button -->
  <Transition
    enter-active-class="transition-all duration-200 ease-out delay-150"
    enter-from-class="opacity-0 scale-75"
    enter-to-class="opacity-100 scale-100"
    leave-active-class="transition-all duration-100 ease-in"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-75"
  >
    <button
      v-show="!isOpen && !hidden"
      class="fixed bottom-6 right-6 z-50 rounded-full w-12 h-12 shadow-lg bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors cursor-pointer"
      @click="toggle"
    >
      <UChip :color="totalUnreadBadge > 0 ? 'error' : 'neutral'" :show="totalUnreadBadge > 0" inset>
        <UIcon name="i-lucide-activity" class="w-5 h-5" />
      </UChip>
    </button>
  </Transition>
</template>
