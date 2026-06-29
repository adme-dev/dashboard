<script setup lang="ts">
// Dialog to reorganise dashboard widgets without scrolling a tall, below-the-fold page.
// Two columns of draggable tiles (drag to reorder within a column) + a hidden tray to
// show/hide. Saves order + visibility via the existing dashboard-preferences API.
// v2: drag across columns (needs per-widget column override in the render).

const {
  activeWidgets, allWidgets, availableWidgets,
  reorderWidgets, savePreferences, resetToDefaults, saving,
} = useDashboardWidgets()

const open = ref(false)
const localActive = ref<string[]>([])
const dragId = ref<string | null>(null)

watch(open, (v) => { if (v) localActive.value = [...activeWidgets.value] })

function def(id: string) {
  return allWidgets.find(w => w.id === id)
}
const leftIds = computed(() => localActive.value.filter(id => def(id)?.column === 'left'))
const rightIds = computed(() => localActive.value.filter(id => def(id)?.column !== 'left'))
const hidden = computed(() => availableWidgets.value.filter(w => !localActive.value.includes(w.id)))

function onDrop(targetId: string) {
  const id = dragId.value
  dragId.value = null
  if (!id || id === targetId) return
  // Only reorder within the same column for now.
  if (def(id)?.column !== def(targetId)?.column) return
  const list = localActive.value.filter(x => x !== id)
  const at = list.indexOf(targetId)
  list.splice(at < 0 ? list.length : at, 0, id)
  localActive.value = list
}
function show(id: string) { if (!localActive.value.includes(id)) localActive.value = [...localActive.value, id] }
function hide(id: string) { localActive.value = localActive.value.filter(x => x !== id) }

async function save() {
  reorderWidgets(localActive.value)
  await savePreferences()
  open.value = false
}
function reset() {
  resetToDefaults()
  localActive.value = [...activeWidgets.value]
}
</script>

<template>
  <div>
    <UButton icon="i-lucide-layout-dashboard" color="neutral" variant="outline" size="sm" @click="open = true">
      Customize
    </UButton>

    <UModal v-model:open="open" title="Customize dashboard" :ui="{ content: 'max-w-3xl' }">
      <template #body>
        <p class="text-sm text-[var(--ui-text-muted)] mb-4">
          Drag tiles to reorder within a column. Use the tray below to show or hide widgets.
        </p>

        <div class="grid grid-cols-2 gap-4">
          <div v-for="col in [{ key: 'left', label: 'Left column', ids: leftIds }, { key: 'right', label: 'Right column', ids: rightIds }]" :key="col.key">
            <p class="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)] mb-2">{{ col.label }}</p>
            <div class="space-y-1.5 min-h-12">
              <div
                v-for="id in col.ids"
                :key="id"
                draggable="true"
                class="flex items-center gap-2 p-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] cursor-grab active:cursor-grabbing"
                :class="{ 'opacity-40': dragId === id }"
                @dragstart="dragId = id"
                @dragend="dragId = null"
                @dragover.prevent
                @drop="onDrop(id)"
              >
                <UIcon name="i-lucide-grip-vertical" class="w-4 h-4 text-[var(--ui-text-dimmed)] shrink-0" />
                <UIcon :name="def(id)?.icon || 'i-lucide-square'" class="w-4 h-4 text-[var(--ui-text-muted)] shrink-0" />
                <span class="text-sm text-[var(--ui-text-highlighted)] truncate flex-1">{{ def(id)?.title || id }}</span>
                <UButton icon="i-lucide-eye-off" color="neutral" variant="ghost" size="xs" @click="hide(id)" />
              </div>
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
