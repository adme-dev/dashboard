<script setup lang="ts">
import { FORMATS } from '~/utils/banner-constants'

const props = defineProps<{
  projectId: string
}>()

const {
  livePublished,
  groupedCreatives,
  selectedPublishedIds,
  fetchPublished,
} = useMetaAdUpload()

onMounted(() => {
  fetchPublished(props.projectId)
})

function toggleCreative(id: string) {
  const idx = selectedPublishedIds.value.indexOf(id)
  if (idx >= 0) {
    selectedPublishedIds.value.splice(idx, 1)
  } else {
    selectedPublishedIds.value.push(id)
  }
}

function selectAll() {
  selectedPublishedIds.value = livePublished.value.map((p: any) => p.id)
}

function deselectAll() {
  selectedPublishedIds.value = []
}

function isSelected(id: string): boolean {
  return selectedPublishedIds.value.includes(id)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-sm font-semibold mb-1">Select Creatives</h3>
        <p class="text-xs text-(--ui-text-muted)">
          Choose which published banners to upload. {{ selectedPublishedIds.length }} selected.
        </p>
      </div>
      <div class="flex gap-1">
        <UButton variant="ghost" size="xs" @click="selectAll">All</UButton>
        <UButton variant="ghost" size="xs" @click="deselectAll">None</UButton>
      </div>
    </div>

    <!-- No published banners -->
    <div v-if="!livePublished.length" class="py-8 text-center bg-(--ui-bg) rounded-lg border border-(--ui-border)">
      <UIcon name="i-lucide-image-off" class="w-8 h-8 text-(--ui-text-muted) mx-auto mb-2" />
      <p class="text-sm text-(--ui-text-muted)">No published banners found</p>
      <p class="text-xs text-(--ui-text-muted) mt-1">Publish some banners first from the editor toolbar.</p>
    </div>

    <!-- Grouped by aspect ratio -->
    <div v-else class="space-y-4">
      <div
        v-for="(items, ratio) in groupedCreatives"
        :key="ratio"
        class="rounded-lg border border-(--ui-border) overflow-hidden"
      >
        <!-- Group header -->
        <div class="px-3 py-2 bg-(--ui-bg-elevated) border-b border-(--ui-border) flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold">{{ ratio }}</span>
            <span class="text-[10px] text-(--ui-text-muted)">{{ items.length }} banner{{ items.length > 1 ? 's' : '' }}</span>
          </div>
          <div class="flex gap-1">
            <UBadge
              v-for="placement in items[0]?.placements || []"
              :key="placement"
              variant="subtle"
              color="primary"
              size="xs"
            >
              {{ placement }}
            </UBadge>
          </div>
        </div>

        <!-- Creative items -->
        <div class="divide-y divide-(--ui-border)">
          <button
            v-for="item in items"
            :key="item.publishedId"
            class="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
            :class="isSelected(item.publishedId) ? 'bg-blue-500/5' : 'hover:bg-(--ui-bg)'"
            @click="toggleCreative(item.publishedId)"
          >
            <UCheckbox
              :model-value="isSelected(item.publishedId)"
              @update:model-value="toggleCreative(item.publishedId)"
              @click.stop
            />

            <!-- Thumbnail preview -->
            <div
              class="w-12 h-12 rounded border border-(--ui-border) bg-(--ui-bg) flex items-center justify-center overflow-hidden shrink-0"
            >
              <img
                v-if="item.url"
                :src="item.url"
                :alt="item.formatKey"
                class="w-full h-full object-contain"
              />
              <UIcon v-else name="i-lucide-image" class="w-5 h-5 text-(--ui-text-muted)" />
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <span class="text-xs font-medium block truncate">
                {{ FORMATS[item.formatKey]?.name || item.formatKey }}
              </span>
              <span class="text-[10px] text-(--ui-text-muted)">
                {{ item.width }}x{{ item.height }}
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
