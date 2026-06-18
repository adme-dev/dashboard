<script setup lang="ts">
import { computed, ref, watch } from 'vue'

export interface VideoStudioOverlayProject {
  id: string
  name: string
  clientName?: string | null
  canvasData: Record<string, unknown>
  status?: string | null
}

const props = withDefaults(defineProps<{
  projects: VideoStudioOverlayProject[]
  loading?: boolean
}>(), {
  loading: false,
})

const emit = defineEmits<{
  (event: 'add-overlay', payload: { gsapProjectId: string; gsapFormatKey: string; projectName: string }): void
  (event: 'refresh'): void
}>()

const search = ref('')
const selectedProjectId = ref<string | null>(null)
const selectedFormat = ref<string | null>(null)

const filteredProjects = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.projects
  return props.projects.filter(project =>
    project.name.toLowerCase().includes(q) ||
    (project.clientName ?? '').toLowerCase().includes(q)
  )
})

const selectedProject = computed(() => props.projects.find(project => project.id === selectedProjectId.value) ?? null)
const selectedFormats = computed(() => Object.keys(selectedProject.value?.canvasData ?? {}))

function formatsFor(project: VideoStudioOverlayProject) {
  return Object.keys(project.canvasData ?? {})
}

function selectProject(project: VideoStudioOverlayProject) {
  selectedProjectId.value = project.id
  selectedFormat.value = formatsFor(project)[0] ?? null
}

function addOverlay() {
  if (!selectedProject.value || !selectedFormat.value) return
  emit('add-overlay', {
    gsapProjectId: selectedProject.value.id,
    gsapFormatKey: selectedFormat.value,
    projectName: selectedProject.value.name,
  })
}

watch(() => props.projects, (projects) => {
  if (!selectedProjectId.value && projects.length) selectProject(projects[0])
  if (selectedProjectId.value && !projects.some(project => project.id === selectedProjectId.value)) {
    selectedProjectId.value = null
    selectedFormat.value = null
  }
}, { immediate: true })
</script>

<template>
  <div class="rounded-md border border-default bg-elevated p-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm font-medium text-highlighted">Overlay</p>
        <p class="mt-0.5 text-xs leading-snug text-muted">Add Banner Studio formats onto the overlay lane.</p>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        size="xs"
        variant="ghost"
        color="neutral"
        :loading="props.loading"
        aria-label="Refresh overlays"
        @click="emit('refresh')"
      />
    </div>

    <div class="mt-3 space-y-2">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        size="xs"
        placeholder="Search Banner projects"
      />

      <div v-if="props.loading && !props.projects.length" class="space-y-2">
        <USkeleton v-for="n in 3" :key="n" class="h-14 w-full rounded-md" />
      </div>

      <div v-else-if="!filteredProjects.length" class="rounded-md border border-dashed border-default px-3 py-5 text-center">
        <UIcon name="i-lucide-shapes" class="mx-auto size-5 text-muted" />
        <p class="mt-2 text-xs font-medium text-highlighted">No overlays found</p>
        <p class="mt-1 text-[11px] text-muted">Create a Banner Studio project first.</p>
      </div>

      <div v-else class="max-h-44 space-y-2 overflow-y-auto pr-1">
        <button
          v-for="project in filteredProjects"
          :key="project.id"
          type="button"
          class="w-full rounded-md border p-2 text-left transition"
          :class="selectedProjectId === project.id ? 'border-primary bg-primary/10' : 'border-default bg-default/30 hover:border-primary/50'"
          @click="selectProject(project)"
        >
          <div class="flex items-start gap-2">
            <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <UIcon name="i-lucide-shapes" class="size-4 text-primary" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <p class="min-w-0 flex-1 truncate text-xs font-medium text-highlighted">{{ project.name }}</p>
                <UBadge :label="`${formatsFor(project).length} formats`" size="xs" variant="subtle" color="neutral" />
              </div>
              <p v-if="project.clientName" class="mt-0.5 truncate text-[11px] text-muted">{{ project.clientName }}</p>
            </div>
          </div>
        </button>
      </div>

      <div v-if="selectedProject" class="space-y-2">
        <p class="text-[11px] font-medium uppercase text-muted">Format</p>
        <div class="flex flex-wrap gap-1.5">
          <UButton
            v-for="format in selectedFormats"
            :key="format"
            :label="format"
            size="xs"
            :variant="selectedFormat === format ? 'solid' : 'soft'"
            :color="selectedFormat === format ? 'primary' : 'neutral'"
            @click="selectedFormat = format"
          />
        </div>
      </div>

      <UButton
        icon="i-lucide-list-plus"
        size="xs"
        color="primary"
        variant="soft"
        label="Add overlay"
        block
        :disabled="!selectedProject || !selectedFormat"
        @click="addOverlay"
      />
    </div>
  </div>
</template>
