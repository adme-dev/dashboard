<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const projectFilter = ref('')
const typeFilter = ref('')

const { data, pending } = useFetch('/api/portal/deliverables', {
  query: {
    projectId: projectFilter,
    type: typeFilter,
    limit: 50
  }
})

// Get projects for filter
const { data: projectsData } = useFetch('/api/portal/projects', { query: { limit: 100 } })
const projectOptions = computed(() => [
  { label: 'All Projects', value: '' },
  ...(((projectsData.value as { projects?: Array<{ id: string, name: string }> } | null)?.projects || [])
    .map(project => ({ label: project.name, value: project.id })))
])

const typeOptions = [
  { label: 'All Types', value: '' },
  { label: 'Image', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: 'Document', value: 'document' },
  { label: 'Design', value: 'design' },
  { label: 'Presentation', value: 'presentation' }
]

function formatDate(date: string | null) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function formatCompact(value: number | null | undefined) {
  return new Intl.NumberFormat('en-AU', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0))
}

const deliverableTypeStats = computed(() => {
  const byType = data.value?.summary?.byType || {}
  return [
    { label: 'Images', type: 'image', value: byType.image || 0, icon: 'i-lucide-image' },
    { label: 'Video', type: 'video', value: byType.video || 0, icon: 'i-lucide-video' },
    { label: 'Documents', type: 'document', value: byType.document || 0, icon: 'i-lucide-file-text' },
    { label: 'Designs', type: 'design', value: byType.design || 0, icon: 'i-lucide-pen-tool' },
    { label: 'Presentations', type: 'presentation', value: byType.presentation || 0, icon: 'i-lucide-presentation' }
  ]
})
</script>

<template>
  <div class="p-6 space-y-6 max-w-7xl mx-auto">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        Gallery
      </h1>
      <div v-if="data?.pagination" class="text-sm text-muted">
        {{ data.pagination.total }} deliverables
      </div>
    </div>

    <UCard v-if="data?.summary">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-library" class="text-primary" />
          <span class="font-semibold">Deliverable Library Health</span>
        </div>
      </template>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="typeFilter = ''"
        >
          <p class="text-xs text-muted">
            Shared assets
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ data.summary.total }}
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ data.summary.recent }} shared in last 30d
          </p>
        </button>

        <button
          type="button"
          class="rounded-lg border border-default bg-default p-3 text-left transition-colors hover:bg-elevated"
          @click="typeFilter = ''"
        >
          <p class="text-xs text-muted">
            Final assets
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ data.summary.final }}
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ data.summary.featured }} featured
          </p>
        </button>

        <div class="rounded-lg border border-default bg-default p-3">
          <p class="text-xs text-muted">
            Engagement
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ formatCompact(data.summary.totalViews) }} views
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ formatCompact(data.summary.totalDownloads) }} downloads
          </p>
        </div>

        <div class="rounded-lg border border-default bg-default p-3">
          <p class="text-xs text-muted">
            Latest published
          </p>
          <p class="mt-1 text-sm font-semibold">
            {{ formatDate(data.summary.latestPublishedAt) || '-' }}
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ data.summary.published }} published
          </p>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <UButton
          v-for="item in deliverableTypeStats"
          :key="item.label"
          :icon="item.icon"
          size="xs"
          :color="item.value > 0 ? 'primary' : 'neutral'"
          :variant="typeFilter === item.type ? 'soft' : 'outline'"
          @click="typeFilter = item.type"
        >
          {{ item.label }} {{ item.value }}
        </UButton>
      </div>
    </UCard>

    <!-- Filters -->
    <div class="flex items-center gap-3">
      <USelect
        v-model="projectFilter"
        :options="projectOptions"
        placeholder="All Projects"
        class="w-48"
      />
      <USelect
        v-model="typeFilter"
        :options="typeOptions"
        placeholder="All Types"
        class="w-40"
      />
    </div>

    <div v-if="pending" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="i in 9" :key="i" class="aspect-video rounded-lg bg-elevated animate-pulse" />
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="d in data?.deliverables"
        :key="d.id"
        class="group relative rounded-lg overflow-hidden bg-elevated"
      >
        <div class="aspect-video">
          <img
            v-if="safeMediaUrl(d.thumbnailUrl)"
            :src="safeMediaUrl(d.thumbnailUrl)"
            :alt="d.title"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          >
          <div v-else class="w-full h-full flex items-center justify-center">
            <UIcon name="i-lucide-file" class="w-12 h-12 text-muted" />
          </div>
        </div>

        <!-- Overlay -->
        <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-3">
          <p class="text-sm font-medium text-white truncate">
            {{ d.title }}
          </p>
          <div class="flex items-center justify-between mt-1">
            <span class="text-xs text-white/70">{{ d.projectName }}</span>
            <span v-if="d.publishedAt" class="text-xs text-white/70">{{ formatDate(d.publishedAt) }}</span>
          </div>
        </div>

        <!-- Badges -->
        <div class="absolute top-2 right-2 flex items-center gap-1">
          <UBadge
            v-if="d.isFeatured"
            color="warning"
            size="xs"
          >
            Featured
          </UBadge>
          <UBadge
            v-if="d.isFinal"
            color="success"
            size="xs"
          >
            Final
          </UBadge>
        </div>

        <!-- File link -->
        <a
          v-if="safeMediaUrl(d.fileUrl)"
          :href="safeMediaUrl(d.fileUrl)"
          target="_blank"
          class="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <UButton
            size="xs"
            variant="solid"
            color="neutral"
            icon="i-lucide-download"
          />
        </a>
      </div>
    </div>

    <p v-if="!pending && (!data?.deliverables || data.deliverables.length === 0)" class="text-center text-muted py-12">
      No deliverables found
    </p>
  </div>
</template>
