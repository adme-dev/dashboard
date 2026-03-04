<script setup lang="ts">
import { FORMATS } from '~/utils/banner-constants'

const {
  publishedByProject,
  selectedPublishedIds,
  livePublished,
} = useMetaAdUpload()

const search = ref('')
const collapsedGroups = ref<Set<string>>(new Set())

const filteredByProject = computed(() => {
  const q = search.value.toLowerCase().trim()
  const result: Record<string, { projectName: string; items: any[] }> = {}

  for (const [pid, group] of Object.entries(publishedByProject.value)) {
    const matchesProject = !q || group.projectName.toLowerCase().includes(q)
    const filteredItems = group.items.filter((item: any) => {
      if (matchesProject) return true
      const formatName = FORMATS[item.formatKey]?.name || item.formatKey
      return formatName.toLowerCase().includes(q) || item.formatKey.toLowerCase().includes(q)
    })
    if (filteredItems.length) {
      result[pid] = { projectName: group.projectName, items: filteredItems }
    }
  }

  return result
})

const totalCount = computed(() => livePublished.value.length)
const selectedCount = computed(() => selectedPublishedIds.value.length)

function toggleAll(select: boolean) {
  if (select) {
    const allIds = livePublished.value.map((p: any) => p.id)
    selectedPublishedIds.value = [...new Set(allIds)]
  } else {
    selectedPublishedIds.value = []
  }
}

function toggleGroup(projectId: string, select: boolean) {
  const group = publishedByProject.value[projectId]
  if (!group) return
  const groupIds = group.items.map((p: any) => p.id)
  if (select) {
    const existing = new Set(selectedPublishedIds.value)
    for (const id of groupIds) existing.add(id)
    selectedPublishedIds.value = [...existing]
  } else {
    const removeSet = new Set(groupIds)
    selectedPublishedIds.value = selectedPublishedIds.value.filter(id => !removeSet.has(id))
  }
}

function isGroupFullySelected(projectId: string): boolean {
  const group = publishedByProject.value[projectId]
  if (!group) return false
  return group.items.every((p: any) => selectedPublishedIds.value.includes(p.id))
}

function isGroupPartiallySelected(projectId: string): boolean {
  const group = publishedByProject.value[projectId]
  if (!group) return false
  const has = group.items.some((p: any) => selectedPublishedIds.value.includes(p.id))
  const all = group.items.every((p: any) => selectedPublishedIds.value.includes(p.id))
  return has && !all
}

function toggleCollapse(projectId: string) {
  if (collapsedGroups.value.has(projectId)) {
    collapsedGroups.value.delete(projectId)
  } else {
    collapsedGroups.value.add(projectId)
  }
}

function toggleCreative(id: string) {
  const idx = selectedPublishedIds.value.indexOf(id)
  if (idx >= 0) {
    selectedPublishedIds.value.splice(idx, 1)
  } else {
    selectedPublishedIds.value.push(id)
  }
}

function formatDimensions(item: any): string {
  return `${item.width}×${item.height}`
}
</script>

<template>
  <div class="space-y-3">
    <!-- Header: search + global actions -->
    <div class="flex items-center gap-2">
      <UInput
        v-model="search"
        placeholder="Search by project or format..."
        icon="i-lucide-search"
        size="sm"
        class="flex-1"
      />
      <UBadge v-if="selectedCount > 0" color="primary" variant="subtle" size="sm">
        {{ selectedCount }} selected
      </UBadge>
    </div>

    <!-- Global select/deselect -->
    <div v-if="totalCount > 0" class="flex items-center gap-2">
      <UButton
        variant="ghost"
        size="xs"
        @click="toggleAll(true)"
      >
        Select All ({{ totalCount }})
      </UButton>
      <UButton
        v-if="selectedCount > 0"
        variant="ghost"
        size="xs"
        @click="toggleAll(false)"
      >
        Deselect All
      </UButton>
    </div>

    <!-- Empty state -->
    <div
      v-if="totalCount === 0"
      class="py-10 text-center bg-(--ui-bg) rounded-lg border border-(--ui-border)"
    >
      <UIcon name="i-lucide-image-off" class="w-8 h-8 text-(--ui-text-muted) mx-auto mb-2" />
      <p class="text-sm text-(--ui-text-muted)">No published banners found</p>
      <p class="text-xs text-(--ui-text-muted) mt-1">
        Publish banners from Banner Studio first.
      </p>
      <NuxtLink to="/agency/banner-studio">
        <UButton variant="outline" size="xs" class="mt-3" icon="i-lucide-palette">
          Open Banner Studio
        </UButton>
      </NuxtLink>
    </div>

    <!-- No search results -->
    <div
      v-else-if="!Object.keys(filteredByProject).length"
      class="py-6 text-center bg-(--ui-bg) rounded-lg border border-(--ui-border)"
    >
      <p class="text-xs text-(--ui-text-muted)">No banners match "{{ search }}"</p>
    </div>

    <!-- Project groups -->
    <div v-else class="space-y-2 max-h-[420px] overflow-y-auto">
      <div
        v-for="(group, projectId) in filteredByProject"
        :key="projectId"
        class="rounded-lg border border-(--ui-border) bg-(--ui-bg) overflow-hidden"
      >
        <!-- Group header -->
        <button
          class="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-(--ui-bg-elevated) transition-colors"
          @click="toggleCollapse(String(projectId))"
        >
          <UIcon
            :name="collapsedGroups.has(String(projectId)) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
            class="w-3.5 h-3.5 text-(--ui-text-muted) shrink-0"
          />
          <UIcon name="i-lucide-folder" class="w-3.5 h-3.5 text-(--ui-text-muted) shrink-0" />
          <span class="text-xs font-semibold flex-1 text-left truncate">{{ group.projectName }}</span>
          <UBadge variant="subtle" color="neutral" size="xs">{{ group.items.length }}</UBadge>

          <!-- Group select/deselect -->
          <UButton
            variant="ghost"
            size="xs"
            class="text-[10px]"
            @click.stop="toggleGroup(String(projectId), !isGroupFullySelected(String(projectId)))"
          >
            {{ isGroupFullySelected(String(projectId)) ? 'None' : 'All' }}
          </UButton>
        </button>

        <!-- Group items -->
        <div v-if="!collapsedGroups.has(String(projectId))" class="border-t border-(--ui-border)">
          <button
            v-for="item in group.items"
            :key="item.id"
            class="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-(--ui-bg-elevated) transition-colors"
            :class="selectedPublishedIds.includes(item.id) ? 'bg-blue-500/5' : ''"
            @click="toggleCreative(item.id)"
          >
            <UCheckbox
              :model-value="selectedPublishedIds.includes(item.id)"
              @click.stop
              @update:model-value="toggleCreative(item.id)"
            />
            <!-- Thumbnail -->
            <div class="w-10 h-10 rounded border border-(--ui-border) overflow-hidden shrink-0 bg-(--ui-bg-elevated)">
              <img
                v-if="item.url"
                :src="item.url"
                :alt="item.formatKey"
                class="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            <div class="flex-1 min-w-0">
              <span class="text-xs font-medium block truncate">
                {{ FORMATS[item.formatKey]?.name || item.formatKey }}
              </span>
              <span class="text-[10px] text-(--ui-text-muted)">
                {{ formatDimensions(item) }}
              </span>
            </div>
            <UIcon
              v-if="selectedPublishedIds.includes(item.id)"
              name="i-lucide-check"
              class="w-3.5 h-3.5 text-blue-500 shrink-0"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
