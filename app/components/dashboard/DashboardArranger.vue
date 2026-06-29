<script setup lang="ts">
// Dialog to reorganise dashboard widgets without scrolling a tall, below-the-fold
// page. Two columns of draggable tiles powered by VueUse `useSortable` (SortableJS) —
// drag a tile to reorder within a column — plus a tray to show/hide. Saves order +
// visibility via the existing dashboard-preferences API.
// v2: drag across columns (needs per-widget column override in index.vue's render).
import { useSortable } from '@vueuse/integrations/useSortable'

const {
  activeWidgets, allWidgets, availableWidgets,
  reorderWidgets, savePreferences, resetToDefaults, saving,
} = useDashboardWidgets()

const open = ref(false)
// Two independent lists — SortableJS keeps each in sync with its column's DOM order.
const leftList = ref<string[]>([])
const rightList = ref<string[]>([])

function def(id: string) {
  return allWidgets.find(w => w.id === id)
}

function syncFromActive() {
  const active = [...activeWidgets.value]
  leftList.value = active.filter(id => def(id)?.column === 'left')
  rightList.value = active.filter(id => def(id)?.column !== 'left')
}

const hidden = computed(() => {
  const shown = new Set([...leftList.value, ...rightList.value])
  return availableWidgets.value.filter(w => !shown.has(w.id))
})

const leftEl = ref<HTMLElement | null>(null)
const rightEl = ref<HTMLElement | null>(null)
// forceFallback + fallbackOnBody: the dialog uses CSS transforms for its open
// animation, which breaks native-HTML5 drag-ghost positioning. SortableJS's own
// pointer-based fallback (ghost appended to <body>) drags correctly inside it.
const sortOpts = {
  animation: 150,
  ghostClass: 'opacity-40',
  forceFallback: true,
  fallbackOnBody: true,
}
const { start: startLeft, stop: stopLeft } = useSortable(leftEl, leftList, sortOpts)
const { start: startRight, stop: stopRight } = useSortable(rightEl, rightList, sortOpts)

// The modal body is teleported and only mounted while open, so (re)bind Sortable once
// the column elements exist, and tear it down on close.
watch(open, async (v) => {
  if (v) {
    syncFromActive()
    await nextTick()
    startLeft()
    startRight()
  } else {
    stopLeft()
    stopRight()
  }
})

function show(id: string) {
  const list = def(id)?.column === 'left' ? leftList : rightList
  if (!list.value.includes(id)) list.value = [...list.value, id]
}
function hide(id: string) {
  leftList.value = leftList.value.filter(x => x !== id)
  rightList.value = rightList.value.filter(x => x !== id)
}

async function save() {
  // Concatenate columns — order within each column is what drives the page render;
  // cross-column relative order is irrelevant (each widget renders in its own column).
  reorderWidgets([...leftList.value, ...rightList.value])
  await savePreferences()
  open.value = false
}
function reset() {
  resetToDefaults()
  syncFromActive()
}
</script>

<template>
  <div>
    <UButton icon="i-lucide-layout-dashboard" color="neutral" variant="ghost" size="sm" @click="open = true">
      Arrange
    </UButton>

    <UModal v-model:open="open" title="Customize dashboard" :ui="{ content: 'max-w-3xl' }">
      <template #body>
        <p class="text-sm text-[var(--ui-text-muted)] mb-4">
          Drag a tile to reorder widgets within a column. Use the tray below to show or hide them.
        </p>

        <div class="grid grid-cols-2 gap-4">
          <!-- Left column -->
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)] mb-2">Left column</p>
            <div ref="leftEl" class="space-y-1.5 min-h-12">
              <div
                v-for="id in leftList"
                :key="id"
                class="flex items-center gap-2 p-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] cursor-grab active:cursor-grabbing"
              >
                <UIcon name="i-lucide-grip-vertical" class="w-4 h-4 text-[var(--ui-text-dimmed)] shrink-0" />
                <UIcon :name="def(id)?.icon || 'i-lucide-square'" class="w-4 h-4 text-[var(--ui-text-muted)] shrink-0" />
                <span class="text-sm text-[var(--ui-text-highlighted)] truncate flex-1">{{ def(id)?.title || id }}</span>
                <UButton icon="i-lucide-eye-off" color="neutral" variant="ghost" size="xs" @click="hide(id)" />
              </div>
              <p v-if="!leftList.length" class="text-xs text-[var(--ui-text-dimmed)] italic px-2 py-3">No widgets here</p>
            </div>
          </div>

          <!-- Right column -->
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)] mb-2">Right column</p>
            <div ref="rightEl" class="space-y-1.5 min-h-12">
              <div
                v-for="id in rightList"
                :key="id"
                class="flex items-center gap-2 p-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] cursor-grab active:cursor-grabbing"
              >
                <UIcon name="i-lucide-grip-vertical" class="w-4 h-4 text-[var(--ui-text-dimmed)] shrink-0" />
                <UIcon :name="def(id)?.icon || 'i-lucide-square'" class="w-4 h-4 text-[var(--ui-text-muted)] shrink-0" />
                <span class="text-sm text-[var(--ui-text-highlighted)] truncate flex-1">{{ def(id)?.title || id }}</span>
                <UButton icon="i-lucide-eye-off" color="neutral" variant="ghost" size="xs" @click="hide(id)" />
              </div>
              <p v-if="!rightList.length" class="text-xs text-[var(--ui-text-dimmed)] italic px-2 py-3">No widgets here</p>
            </div>
          </div>
        </div>

        <div v-if="hidden.length" class="mt-5 pt-4 border-t border-[var(--ui-border)]">
          <p class="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)] mb-2">Hidden</p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="w in hidden"
              :key="w.id"
              class="flex items-center gap-1.5 px-2 py-1 rounded-md border border-dashed border-[var(--ui-border)] text-xs text-[var(--ui-text-muted)] hover:text-[var(--ui-text-highlighted)] hover:border-[var(--ui-border-accented)] transition-colors"
              @click="show(w.id)"
            >
              <UIcon name="i-lucide-plus" class="w-3 h-3" />
              <UIcon :name="w.icon" class="w-3.5 h-3.5" />
              {{ w.title }}
            </button>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex items-center justify-between w-full">
          <UButton color="neutral" variant="ghost" size="sm" @click="reset">Reset to default</UButton>
          <div class="flex items-center gap-2">
            <UButton color="neutral" variant="ghost" size="sm" @click="open = false">Cancel</UButton>
            <UButton color="primary" size="sm" :loading="saving" @click="save">Save</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
