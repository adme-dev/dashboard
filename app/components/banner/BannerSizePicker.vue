<script setup lang="ts">
import { FORMATS, BANNER_SETS, PLATFORM_META } from '~/utils/banner-constants'
import type { Layer } from '~/types/banner-studio'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { state, addSizeToSet, addSizeWithLayers } = useBannerStudio()
const toast = useToast()

const selected = ref<Set<string>>(new Set())
const useSmartResize = ref(true)
const isResizing = ref(false)
const resizeProgress = ref(0)

// Group formats by platform
const platformGroups = computed(() => {
  const groups: Record<string, { key: string; format: typeof FORMATS[string] }[]> = {}
  for (const [key, fmt] of Object.entries(FORMATS)) {
    if (!groups[fmt.platform]) groups[fmt.platform] = []
    groups[fmt.platform].push({ key, format: fmt })
  }
  return groups
})

// Only new sizes (not already in set)
const newSizes = computed(() =>
  [...selected.value].filter(k => !state.sets[k])
)

function toggle(key: string) {
  if (selected.value.has(key)) selected.value.delete(key)
  else selected.value.add(key)
}

function quickSelect(set: typeof BANNER_SETS[number]) {
  set.keys.forEach(k => selected.value.add(k))
}

async function apply() {
  if (newSizes.value.length === 0) {
    emit('update:open', false)
    selected.value.clear()
    return
  }

  if (useSmartResize.value && newSizes.value.length > 0) {
    await applySmartResize()
  } else {
    newSizes.value.forEach(key => addSizeToSet(key))
    emit('update:open', false)
    selected.value.clear()
  }
}

async function applySmartResize() {
  const srcFmt = FORMATS[state.activeKey]
  if (!srcFmt) return

  const srcLayers = state.sets[state.activeKey]?.layers ?? []
  if (srcLayers.length === 0) return

  isResizing.value = true
  resizeProgress.value = 0
  const sizesToResize = newSizes.value
  let completed = 0

  for (const key of sizesToResize) {
    const tgtFmt = FORMATS[key]
    if (!tgtFmt) continue

    try {
      const result = await $fetch<{ layers: Partial<Layer>[] }>('/api/agency/banner-studio/ai/auto-resize', {
        method: 'POST',
        body: {
          layers: srcLayers,
          srcWidth: srcFmt.w,
          srcHeight: srcFmt.h,
          tgtWidth: tgtFmt.w,
          tgtHeight: tgtFmt.h,
        },
      })

      if (result.layers?.length) {
        addSizeWithLayers(key, result.layers)
      } else {
        addSizeToSet(key)
      }
    } catch {
      // Fallback to proportional
      addSizeToSet(key)
    }

    completed++
    resizeProgress.value = Math.round((completed / sizesToResize.length) * 100)
  }

  isResizing.value = false
  resizeProgress.value = 0

  toast.add({
    title: 'Smart Resize Complete',
    description: `${sizesToResize.length} size${sizesToResize.length > 1 ? 's' : ''} added with AI layout`,
    color: 'success',
  })

  emit('update:open', false)
  selected.value.clear()
}

function cancel() {
  emit('update:open', false)
  selected.value.clear()
}
</script>

<template>
  <UModal :open="props.open" @update:open="emit('update:open', $event)">
    <template #content>
      <div class="p-4 max-h-[80vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">Add Banner Sizes</h3>
          <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="cancel" />
        </div>

        <!-- Quick select sets -->
        <div class="mb-4">
          <h4 class="text-xs font-bold uppercase tracking-wider text-(--ui-text-muted) mb-2">Quick Select</h4>
          <div class="flex flex-wrap gap-1.5">
            <UButton
              v-for="set in BANNER_SETS"
              :key="set.id"
              :label="set.name"
              size="xs"
              variant="outline"
              @click="quickSelect(set)"
            />
          </div>
        </div>

        <!-- Platform groups -->
        <div class="space-y-4">
          <div v-for="(sizes, platform) in platformGroups" :key="platform">
            <div class="flex items-center gap-2 mb-2">
              <span
                class="w-3 h-3 rounded-full"
                :style="{ backgroundColor: PLATFORM_META[platform]?.color || '#888' }"
              />
              <h4 class="text-sm font-semibold">{{ PLATFORM_META[platform]?.label || platform }}</h4>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              <button
                v-for="{ key, format } in sizes"
                :key="key"
                class="rounded-md border p-2 text-left transition-all"
                :class="[
                  selected.has(key)
                    ? 'border-(--ui-primary) bg-(--ui-primary)/10 ring-1 ring-(--ui-primary)/30'
                    : 'border-(--ui-border) hover:border-(--ui-primary)/40',
                ]"
                @click="toggle(key)"
              >
                <div class="flex items-center justify-between mb-0.5">
                  <span class="text-xs font-medium">{{ format.name }}</span>
                  <UBadge v-if="state.sets[key]" color="success" variant="subtle" size="xs">In Set</UBadge>
                </div>
                <span class="text-[11px] font-mono text-(--ui-text-muted)">{{ format.w }}x{{ format.h }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Smart Resize Toggle -->
        <div
          v-if="newSizes.length > 0"
          class="mt-4 flex items-center gap-2 rounded-lg px-3 py-2.5 border transition-colors"
          :class="useSmartResize ? 'border-(--ui-primary)/30 bg-(--ui-primary)/5' : 'border-(--ui-border) bg-(--ui-bg)'"
        >
          <UCheckbox v-model="useSmartResize" />
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium flex items-center gap-1">
              <UIcon name="i-lucide-sparkles" class="w-3.5 h-3.5 text-(--ui-primary)" />
              AI Smart Resize
            </div>
            <p class="text-[11px] text-(--ui-text-muted) mt-0.5">
              Intelligently reflow layers for different aspect ratios instead of stretching
            </p>
          </div>
        </div>

        <!-- Resize Progress -->
        <div v-if="isResizing" class="mt-3">
          <div class="flex items-center gap-2 text-xs text-(--ui-text-muted) mb-1">
            <UIcon name="i-lucide-sparkles" class="w-3.5 h-3.5 text-(--ui-primary) animate-pulse" />
            <span>Resizing layouts... {{ resizeProgress }}%</span>
          </div>
          <div class="h-1.5 bg-(--ui-bg) rounded-full overflow-hidden">
            <div
              class="h-full bg-(--ui-primary) rounded-full transition-all duration-300"
              :style="{ width: `${resizeProgress}%` }"
            />
          </div>
        </div>

        <!-- Footer -->
        <div class="flex justify-end gap-2 mt-4 pt-3 border-t border-(--ui-border)">
          <UButton label="Cancel" variant="outline" size="sm" @click="cancel" :disabled="isResizing" />
          <UButton
            :label="isResizing ? 'Resizing...' : `Add ${selected.size} size${selected.size === 1 ? '' : 's'}`"
            size="sm"
            :disabled="selected.size === 0 || isResizing"
            :loading="isResizing"
            @click="apply"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
