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
  ...(projectsData.value?.projects?.map((p: any) => ({ label: p.name, value: p.id })) || [])
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
</script>

<template>
  <div class="p-6 space-y-6 max-w-7xl mx-auto">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Gallery</h1>
      <div v-if="data?.pagination" class="text-sm text-muted">
        {{ data.pagination.total }} deliverables
      </div>
    </div>

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
            v-if="d.thumbnailUrl"
            :src="d.thumbnailUrl"
            :alt="d.title"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <UIcon name="i-lucide-file" class="w-12 h-12 text-muted" />
          </div>
        </div>

        <!-- Overlay -->
        <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-3">
          <p class="text-sm font-medium text-white truncate">{{ d.title }}</p>
          <div class="flex items-center justify-between mt-1">
            <span class="text-xs text-white/70">{{ d.projectName }}</span>
            <span v-if="d.publishedAt" class="text-xs text-white/70">{{ formatDate(d.publishedAt) }}</span>
          </div>
        </div>

        <!-- Badges -->
        <div class="absolute top-2 right-2 flex items-center gap-1">
          <UBadge v-if="d.isFeatured" color="warning" size="xs">Featured</UBadge>
          <UBadge v-if="d.isFinal" color="success" size="xs">Final</UBadge>
        </div>

        <!-- File link -->
        <a
          v-if="d.fileUrl"
          :href="d.fileUrl"
          target="_blank"
          class="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <UButton size="xs" variant="solid" color="neutral" icon="i-lucide-download" />
        </a>
      </div>
    </div>

    <p v-if="!pending && (!data?.deliverables || data.deliverables.length === 0)" class="text-center text-muted py-12">
      No deliverables found
    </p>
  </div>
</template>
