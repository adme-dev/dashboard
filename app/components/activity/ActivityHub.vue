<script setup lang="ts">
import { useDraggable, useWindowSize, useLocalStorage } from '@vueuse/core'

const { isOpen, hidden, activeTab, sizeMode, savedPosition, totalUnreadBadge, toggle } = useActivityHub()

const panelEl = ref<HTMLElement | null>(null)
const headerRef = ref<InstanceType<any> | null>(null)

const { width: winW, height: winH } = useWindowSize()

// Free-resize: when the user drags the resize handle, we record an explicit
// size that overrides the sizeMode preset. Toggling sizeMode clears these
// (so the toggle still feels like "reset to preset").
const userWidth = useLocalStorage<number | null>('activity-hub-user-width', null)
const userHeight = useLocalStorage<number | null>('activity-hub-user-height', null)

const MIN_W = 320
const MIN_H = 380
const MAX_W = 900
const MAX_H = 1000

const presetWidth = computed(() => sizeMode.value === 'compact' ? 400 : 480)
const presetHeight = computed(() => sizeMode.value === 'compact' ? 520 : 650)

const panelWidth = computed(() => userWidth.value ?? presetWidth.value)
const panelHeight = computed(() => userHeight.value ?? presetHeight.value)

// Reset custom size when user explicitly toggles between compact/expanded.
watch(sizeMode, () => {
  userWidth.value = null
  userHeight.value = null
})

const isResizing = ref(false)

function startResize(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  isResizing.value = true
  const startCursorX = e.clientX
  const startCursorY = e.clientY
  const startW = panelWidth.value
  const startH = panelHeight.value
  const startX = x.value
  const startY = y.value

  function onMove(ev: MouseEvent) {
    // Drag from top-left corner: moving up-and-left grows the panel while
    // keeping the bottom-right corner anchored.
    const dx = startCursorX - ev.clientX
    const dy = startCursorY - ev.clientY
    const newW = Math.min(MAX_W, Math.max(MIN_W, startW + dx))
    const newH = Math.min(MAX_H, Math.max(MIN_H, startH + dy))
    userWidth.value = newW
    userHeight.value = newH
    x.value = startX - (newW - startW)
    y.value = startY - (newH - startH)
  }

  function onUp() {
    isResizing.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

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
      class="fixed z-50 rounded-xl shadow-xl border-2 border-neutral-300 dark:border-neutral-700 bg-default flex flex-col overflow-hidden"
      :style="{
        width: `${panelWidth}px`,
        height: `${panelHeight}px`,
        left: `${x}px`,
        top: `${y}px`,
      }"
    >
      <!-- Resize handle: drag from the top-left corner to grow/shrink the
           panel while keeping the bottom-right corner anchored. -->
      <div
        class="absolute top-0 left-0 w-4 h-4 z-30 cursor-nwse-resize group/resize"
        :class="isResizing ? 'bg-primary/10' : ''"
        @mousedown="startResize"
      >
        <div class="absolute top-1 left-1 w-2 h-2 border-l-2 border-t-2 border-muted group-hover/resize:border-primary transition-colors" />
      </div>

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
          <ActivityHubChat v-else-if="activeTab === 'chat'" key="chat" />
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
    <div
      v-show="!isOpen && !hidden"
      class="fixed bottom-6 right-6 z-50 w-12 h-12"
    >
      <button
        class="w-full h-full rounded-full shadow-lg bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors cursor-pointer"
        @click="toggle"
      >
        <UIcon name="i-lucide-activity" class="w-5 h-5" />
      </button>
      <!-- Badge is a SIBLING of the button, not a child. Safari clips
           absolute descendants of a `border-radius: 9999px` element, which
           cropped the unread count. Sibling avoids that. -->
      <span
        v-if="totalUnreadBadge > 0"
        class="pointer-events-none absolute -top-1 -right-1 min-w-5 h-5 px-1.5 rounded-full bg-error text-white text-[10px] font-bold leading-none flex items-center justify-center ring-2 ring-default shadow"
      >
        {{ totalUnreadBadge > 99 ? '99+' : totalUnreadBadge }}
      </span>
    </div>
  </Transition>
</template>
