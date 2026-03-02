<script setup lang="ts">
import type { FeedBinding, FeedColumn } from '~/types/banner-studio'

const { selectedLayer, updateLayer } = useBannerStudio()
const { feedsState, activeFeed, computeOverrides } = useBannerFeeds()

// Which properties this layer type supports
const bindableProperties = computed(() => {
  if (!selectedLayer.value) return []
  const type = selectedLayer.value.type
  const props: { value: string; label: string }[] = []
  if (type === 'text' || type === 'button') {
    props.push({ value: 'text', label: 'Text' })
    props.push({ value: 'color', label: 'Text Color' })
    props.push({ value: 'fontSize', label: 'Font Size' })
  }
  if (type === 'button') {
    props.push({ value: 'bgColor', label: 'Background' })
  }
  if (type === 'image' || type === 'bg') {
    props.push({ value: 'src', label: 'Image Source' })
  }
  if (type === 'rect') {
    props.push({ value: 'fillColor', label: 'Fill Color' })
  }
  return props
})

// Current bindings on the layer
const currentBindings = computed(() => selectedLayer.value?.feedBindings || [])

// Compatible columns for a given property
function compatibleColumns(property: string): FeedColumn[] {
  const feed = activeFeed.value || feedsState.feeds[0]
  if (!feed) return []
  return feed.columns.filter(col => {
    if (property === 'text') return true
    if (property === 'src') return col.type === 'url'
    if (['color', 'bgColor', 'fillColor'].includes(property)) return col.type === 'color'
    if (property === 'fontSize') return col.type === 'number'
    return true
  })
}

// Available properties (not already bound)
const availableProperties = computed(() => {
  const bound = new Set(currentBindings.value.map(b => b.property))
  return bindableProperties.value.filter(p => !bound.has(p.value))
})

function addBinding(property: string, column: string) {
  if (!selectedLayer.value) return
  const feed = activeFeed.value || feedsState.feeds[0]
  if (!feed) return

  const bindings: FeedBinding[] = [...(selectedLayer.value.feedBindings || []), {
    feedId: feed.id,
    column,
    property,
  }]
  updateLayer(selectedLayer.value.id, { feedBindings: bindings })
  computeOverrides()
}

function removeBinding(index: number) {
  if (!selectedLayer.value) return
  const bindings = [...(selectedLayer.value.feedBindings || [])]
  bindings.splice(index, 1)
  updateLayer(selectedLayer.value.id, { feedBindings: bindings.length ? bindings : undefined })
  computeOverrides()
}

function updateBindingColumn(index: number, column: string) {
  if (!selectedLayer.value) return
  const bindings = [...(selectedLayer.value.feedBindings || [])]
  bindings[index] = { ...bindings[index], column }
  updateLayer(selectedLayer.value.id, { feedBindings: bindings })
  computeOverrides()
}

// Add binding UI state
const addProp = ref('')
const addCol = ref('')

function handleAdd() {
  if (!addProp.value || !addCol.value) return
  addBinding(addProp.value, addCol.value)
  addProp.value = ''
  addCol.value = ''
}

// Reset add column when property changes
watch(addProp, () => { addCol.value = '' })
</script>

<template>
  <div v-if="feedsState.feeds.length && selectedLayer" class="space-y-3">
    <div class="border-t border-(--ui-border) pt-3">
      <details open class="bs-section group">
        <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
          <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
          <UIcon name="i-lucide-database" class="w-3.5 h-3.5 text-[#888]" />
          <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Feed Bindings</span>
        </summary>
      <div class="pt-1.5">

      <!-- Existing bindings -->
      <div v-if="currentBindings.length" class="space-y-1.5 mb-2">
        <div
          v-for="(binding, idx) in currentBindings"
          :key="idx"
          class="flex items-center gap-1.5 p-1.5 rounded bg-(--ui-bg) border border-(--ui-border)"
        >
          <span class="text-[10px] font-medium text-(--ui-primary) min-w-[60px]">
            {{ bindableProperties.find(p => p.value === binding.property)?.label || binding.property }}
          </span>
          <UIcon name="i-lucide-arrow-left" class="w-3 h-3 text-(--ui-text-muted) shrink-0" />
          <select
            :value="binding.column"
            class="flex-1 text-[11px] bg-transparent border-none outline-none text-(--ui-text) min-w-0"
            @change="updateBindingColumn(idx, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="col in compatibleColumns(binding.property)" :key="col.name" :value="col.name">
              {{ col.name }}
            </option>
          </select>
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            size="xs"
            color="error"
            @click="removeBinding(idx)"
          />
        </div>
      </div>

      <!-- Add binding -->
      <div v-if="availableProperties.length" class="flex items-center gap-1.5">
        <select
          v-model="addProp"
          class="text-[11px] bg-(--ui-bg) border border-(--ui-border) rounded px-1.5 py-1 flex-1 min-w-0"
        >
          <option value="">Property...</option>
          <option v-for="p in availableProperties" :key="p.value" :value="p.value">{{ p.label }}</option>
        </select>
        <select
          v-model="addCol"
          class="text-[11px] bg-(--ui-bg) border border-(--ui-border) rounded px-1.5 py-1 flex-1 min-w-0"
          :disabled="!addProp"
        >
          <option value="">Column...</option>
          <option v-for="col in compatibleColumns(addProp)" :key="col.name" :value="col.name">
            {{ col.name }} ({{ col.type }})
          </option>
        </select>
        <UButton
          icon="i-lucide-plus"
          variant="soft"
          size="xs"
          :disabled="!addProp || !addCol"
          @click="handleAdd"
        />
      </div>

      <p v-else-if="!currentBindings.length" class="text-[10px] text-(--ui-text-muted)">
        No bindable properties for this layer type
      </p>
      </div>
      </details>
    </div>
  </div>
</template>
