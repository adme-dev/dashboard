<script setup lang="ts">
import { FORMATS, PLATFORM_META } from '~/utils/banner-constants'
import { buildBannerHTML } from '~/utils/banner-html-builder'
import { getScaledLayers } from '~/utils/banner-scaling'
import type { Layer } from '~/types/banner-studio'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; generated: [] }>()

const { state, activeLayers } = useBannerStudio()
const { feedsState } = useBannerFeeds()
const { getExportCustomFonts } = useBannerFonts()
const toast = useToast()

// Form state
const selectedFeedId = ref<string | null>(null)

// Feed items for USelect
const feedSelectModel = computed({
  get: () => selectedFeedId.value || 'none',
  set: (val: string) => { selectedFeedId.value = val === 'none' ? null : val },
})
const feedSelectItems = computed(() => [
  { label: 'Select a feed...', value: 'none' },
  ...feedsWithBindings.value.map(f => ({ label: `${f.name} (${f.rowCount} rows)`, value: f.id })),
])
const clickUrl = ref('')
const rowStart = ref(0)
const rowEnd = ref<number | null>(null) // null = all rows
const isGenerating = ref(false)
const progress = ref(0)
const progressLabel = ref('')

// Selected formats
const selected = ref<Set<string>>(new Set(state.setKeys))

const selectedFeed = computed(() =>
  selectedFeedId.value ? feedsState.feeds.find(f => f.id === selectedFeedId.value) || null : null,
)

// Only feeds that have bindings on at least one layer
const feedsWithBindings = computed(() => {
  const allBindingFeedIds = new Set<string>()
  for (const key of state.setKeys) {
    const layers = state.sets[key]?.layers || []
    for (const l of layers) {
      if (l.feedBindings?.length) {
        for (const b of l.feedBindings) {
          allBindingFeedIds.add(b.feedId)
        }
      }
    }
  }
  // Also check active layers (may be the only artboard with data)
  for (const l of activeLayers.value) {
    if (l.feedBindings?.length) {
      for (const b of l.feedBindings) {
        allBindingFeedIds.add(b.feedId)
      }
    }
  }
  return feedsState.feeds.filter(f => allBindingFeedIds.has(f.id))
})

const effectiveRowEnd = computed(() => {
  if (!selectedFeed.value) return 0
  return rowEnd.value !== null ? Math.min(rowEnd.value, selectedFeed.value.rowCount - 1) : selectedFeed.value.rowCount - 1
})

const rowCount = computed(() => {
  if (!selectedFeed.value) return 0
  return effectiveRowEnd.value - rowStart.value + 1
})

const totalVariants = computed(() => rowCount.value * selected.value.size)

// Platform groups (same pattern as publish modal)
const platformGroups = computed(() => {
  const groups: Record<string, string[]> = {}
  state.setKeys.forEach((key) => {
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
  keys.forEach((k) => {
    if (allSelected) selected.value.delete(k)
    else selected.value.add(k)
  })
}

function toggleSize(key: string) {
  if (selected.value.has(key)) selected.value.delete(key)
  else selected.value.add(key)
}

function applyFeedRow(layers: Layer[], row: Record<string, string>, feedId: string): Layer[] {
  return layers.map((l) => {
    if (!l.feedBindings?.length) return l
    const clone = { ...JSON.parse(JSON.stringify(l)) }
    for (const binding of l.feedBindings) {
      if (binding.feedId !== feedId) continue
      const val = row[binding.column]
      if (val === undefined) continue
      switch (binding.property) {
        case 'text': clone.text = val; break
        case 'src': clone.src = val; break
        case 'color': clone.color = val; break
        case 'bgColor': clone.bgColor = val; break
        case 'fillColor': clone.fillColor = val; break
        case 'fontSize': clone.fontSize = parseInt(val) || clone.fontSize; break
      }
    }
    return clone
  })
}

async function generate() {
  if (!selectedFeed.value || !state.project?.id) return

  const keys = [...selected.value]
  if (!keys.length) return

  isGenerating.value = true
  progress.value = 0

  try {
    // Fetch all feed rows from API
    progressLabel.value = 'Loading feed data...'
    const { rows } = await $fetch<{ rows: Record<string, string>[]; total: number }>(
      `/api/agency/banner-studio/feeds/${selectedFeed.value.id}/rows`,
      { params: { offset: 0, limit: 10000 } },
    )

    const startIdx = Math.max(0, rowStart.value)
    const endIdx = effectiveRowEnd.value
    const selectedRows = (rows || []).slice(startIdx, endIdx + 1)

    if (!selectedRows.length) {
      toast.add({ title: 'No rows', description: 'No feed rows in the selected range', color: 'warning' })
      return
    }

    const total = selectedRows.length * keys.length
    let completed = 0
    let errors = 0

    // Generate and upload variants — batch 10 concurrent requests
    const batchSize = 10
    const tasks: Array<() => Promise<void>> = []

    for (const key of keys) {
      const fmt = FORMATS[key]
      if (!fmt) continue

      const baseLayers = getScaledLayers(key, state.sets, state.activeKey, activeLayers.value)
      const bgColor = state.sets[key]?.bgColor || state.bgColor || '#0a0a10'

      for (let i = 0; i < selectedRows.length; i++) {
        const row = selectedRows[i]
        const rowIndex = startIdx + i

        tasks.push(async () => {
          try {
            // Apply feed data to layers (pre-bake — no runtime script)
            const mutatedLayers = applyFeedRow(baseLayers, row, selectedFeed.value!.id)

            // Build HTML with pre-baked data (no feedUrl/feedBindings)
            const html = buildBannerHTML(key, mutatedLayers, {
              includeAnimations: true,
              bgColor,
              customFonts: getExportCustomFonts(mutatedLayers),
            })

            // Upload to server
            await $fetch('/api/agency/banner-studio/variants/upload', {
              method: 'POST',
              body: {
                projectId: state.project!.id,
                feedId: selectedFeed.value!.id,
                formatKey: key,
                html,
                width: fmt.w,
                height: fmt.h,
                rowIndex,
                rowData: row,
                clickUrl: clickUrl.value || undefined,
              },
            })
          } catch (err) {
            console.error(`DCO variant failed: ${key} row ${rowIndex}`, err)
            errors++
          }
          completed++
          progress.value = Math.round((completed / total) * 100)
          progressLabel.value = `Generating ${completed} of ${total}...`
        })
      }
    }

    // Execute in batches
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize)
      await Promise.all(batch.map(fn => fn()))
    }

    const generated = total - errors
    toast.add({
      title: 'DCO Complete',
      description: `${generated} variant${generated !== 1 ? 's' : ''} generated${errors > 0 ? ` (${errors} errors)` : ''}`,
      color: errors > 0 ? 'warning' : 'success',
    })

    emit('generated')
  } catch (err: any) {
    toast.add({
      title: 'Generation failed',
      description: err?.data?.statusMessage || err?.message || 'Failed to generate variants',
      color: 'error',
    })
  } finally {
    isGenerating.value = false
    progress.value = 0
    progressLabel.value = ''
  }
}

// Set initial feed if there's only one with bindings
watch(feedsWithBindings, (feeds) => {
  if (feeds.length === 1 && !selectedFeedId.value) {
    selectedFeedId.value = feeds[0].id
  }
}, { immediate: true })

// Reset rowEnd when feed changes
watch(selectedFeedId, () => {
  rowEnd.value = null
  rowStart.value = 0
})
</script>

<template>
  <UModal :open="props.open" @update:open="emit('update:open', $event)" :ui="{ width: 'max-w-2xl' }">
    <template #content>
      <div class="p-5">
        <div class="flex items-center justify-between mb-5">
          <div class="flex items-center gap-2.5">
            <UIcon name="i-lucide-layers" class="w-5 h-5" style="color: var(--nb-accent-red);" />
            <div>
              <h3 class="text-xl font-bold">DCO — Generate Variants</h3>
              <p class="text-xs text-(--ui-text-muted)">Pre-generate static HTML variants per feed row</p>
            </div>
          </div>
          <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="emit('update:open', false)" />
        </div>

        <!-- No feeds with bindings -->
        <div v-if="!feedsWithBindings.length" class="text-center py-8">
          <p class="text-sm text-(--ui-text-muted) mb-2">No feeds with layer bindings found.</p>
          <p class="text-xs text-(--ui-text-muted)">Upload a data feed and bind columns to layers first.</p>
        </div>

        <template v-else>
          <!-- Feed selector -->
          <div class="mb-4 bg-(--ui-bg-elevated)/50 rounded-lg p-4 border border-(--ui-border)">
            <label class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-muted) mb-2 block">Data Feed</label>
            <USelect
              v-model="feedSelectModel"
              :items="feedSelectItems"
              size="sm"
            />
          </div>

          <template v-if="selectedFeed">
            <!-- Row range -->
            <div class="mb-4 p-4 bg-(--ui-bg-elevated)/50 rounded-lg border border-(--ui-border)">
              <label class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-muted) mb-2 block">Row Range</label>
              <div class="flex items-center gap-2">
                <UInput
                  v-model.number="rowStart"
                  type="number"
                  :min="0"
                  :max="selectedFeed.rowCount - 1"
                  size="sm"
                  placeholder="Start"
                  class="w-24"
                />
                <span class="text-xs text-(--ui-text-muted)">to</span>
                <UInput
                  :model-value="rowEnd !== null ? rowEnd : ''"
                  type="number"
                  :min="rowStart"
                  :max="selectedFeed.rowCount - 1"
                  size="sm"
                  :placeholder="`${selectedFeed.rowCount - 1} (all)`"
                  class="w-24"
                  @update:model-value="rowEnd = $event !== '' ? Number($event) : null"
                />
                <span class="text-xs text-(--ui-text-muted) ml-1">
                  {{ rowCount }} row{{ rowCount !== 1 ? 's' : '' }}
                </span>
              </div>
            </div>

            <!-- Click-through URL -->
            <div class="mb-4">
              <label class="text-xs font-medium text-(--ui-text-muted) mb-1 block">Click-through URL (optional)</label>
              <UInput
                v-model="clickUrl"
                placeholder="https://example.com/landing-page"
                size="sm"
                icon="i-lucide-external-link"
              />
            </div>

            <!-- Format Selection -->
            <div class="mb-4">
              <label class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-muted) mb-2 block">Formats</label>
              <div class="space-y-2 max-h-[180px] overflow-y-auto">
                <div v-for="(keys, platform) in platformGroups" :key="platform">
                  <div
                    class="flex items-center gap-2 mb-1 rounded-md px-3 py-1.5"
                    :style="{ backgroundColor: (PLATFORM_META[platform]?.color || '#888') + '10' }"
                  >
                    <UCheckbox
                      :model-value="keys.every(k => selected.has(k))"
                      @update:model-value="togglePlatform(platform)"
                    />
                    <span
                      class="w-2.5 h-2.5 rounded-full"
                      :style="{ backgroundColor: PLATFORM_META[platform]?.color || '#888' }"
                    />
                    <span class="text-xs font-semibold">{{ PLATFORM_META[platform]?.label || platform }}</span>
                  </div>
                  <div class="ml-6 space-y-0.5">
                    <div v-for="key in keys" :key="key" class="flex items-center gap-2">
                      <UCheckbox
                        :model-value="selected.has(key)"
                        @update:model-value="toggleSize(key)"
                      />
                      <span class="text-xs">{{ FORMATS[key]?.name }}</span>
                      <span class="text-[11px] font-mono text-(--ui-text-muted)">{{ FORMATS[key]?.w }}x{{ FORMATS[key]?.h }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Summary -->
            <NbCard variant="primary" class="mb-4" body-class="!p-4 text-center">
              <p class="text-2xl font-bold">
                {{ totalVariants }}
              </p>
              <p class="text-xs text-(--ui-text-muted)">
                variant{{ totalVariants !== 1 ? 's' : '' }} &mdash;
                {{ rowCount }} row{{ rowCount !== 1 ? 's' : '' }} &times; {{ selected.size }} format{{ selected.size !== 1 ? 's' : '' }}
              </p>
            </NbCard>

            <!-- Progress -->
            <div v-if="isGenerating" class="mb-4">
              <NbProgress
                :progress="progress"
                :label="progressLabel"
                show-value
              />
            </div>

            <!-- Actions -->
            <div class="flex gap-2">
              <NbButton
                variant="primary"
                icon="i-lucide-layers"
                block
                :disabled="!selectedFeed || selected.size === 0 || totalVariants === 0 || isGenerating"
                :loading="isGenerating"
                @click="generate"
              >
                Generate Variants
              </NbButton>
              <NbButton
                v-if="state.project?.id"
                variant="ghost"
                icon="i-lucide-grid-3x3"
                :to="`/agency/banner-studio/${state.project.id}/variants`"
              >
                View Gallery
              </NbButton>
            </div>
          </template>
        </template>
      </div>
    </template>
  </UModal>
</template>
