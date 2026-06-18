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
  currentTimeSec?: number
  selectedOverlayClip?: { clipId: string; startSec: number; durationSec: number } | null
}>(), {
  loading: false,
  currentTimeSec: 0,
  selectedOverlayClip: null,
})

const emit = defineEmits<{
  (event: 'add-overlay', payload: { gsapProjectId: string; gsapFormatKey: string; projectName: string; startSec: number; durationSec: number }): void
  (event: 'replace-overlay', payload: { gsapProjectId: string; gsapFormatKey: string; projectName: string; startSec: number; durationSec: number }): void
  (event: 'refresh'): void
}>()

const search = ref('')
const selectedProjectId = ref<string | null>(null)
const selectedFormat = ref<string | null>(null)
const startSec = ref(0)
const durationSec = ref(5)

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
const selectedFormatData = computed(() => selectedFormat.value ? selectedProject.value?.canvasData?.[selectedFormat.value] : null)
const selectedFormatSummary = computed(() => {
  if (!selectedFormat.value) return null
  const value = selectedFormatData.value
  const layerCount = value && typeof value === 'object' && 'layers' in value && Array.isArray((value as { layers?: unknown[] }).layers)
    ? (value as { layers: unknown[] }).layers.length
    : null
  return layerCount == null ? selectedFormat.value : `${selectedFormat.value} · ${layerCount} layers`
})

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
    startSec: Math.max(0, startSec.value),
    durationSec: Math.max(1, durationSec.value),
  })
}

function replaceOverlay() {
  if (!selectedProject.value || !selectedFormat.value) return
  emit('replace-overlay', {
    gsapProjectId: selectedProject.value.id,
    gsapFormatKey: selectedFormat.value,
    projectName: selectedProject.value.name,
    startSec: props.selectedOverlayClip?.startSec ?? Math.max(0, startSec.value),
    durationSec: Math.max(1, durationSec.value),
  })
}

watch(() => props.projects, (projects) => {
  if (!selectedProjectId.value && projects.length) selectProject(projects[0])
  if (selectedProjectId.value && !projects.some(project => project.id === selectedProjectId.value)) {
    selectedProjectId.value = null
    selectedFormat.value = null
  }
}, { immediate: true })

watch(() => props.currentTimeSec, (next) => {
  if (!props.selectedOverlayClip) startSec.value = Math.max(0, Math.round(next * 10) / 10)
}, { immediate: true })

watch(() => props.selectedOverlayClip, (clip) => {
  if (!clip) return
  startSec.value = Math.max(0, Math.round(clip.startSec * 10) / 10)
  durationSec.value = Math.max(1, Math.round(clip.durationSec * 10) / 10)
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

      <div v-if="selectedProject && selectedFormatSummary" class="rounded-md border border-default bg-default/30 p-2">
        <div class="flex items-start gap-2">
          <UIcon name="i-lucide-layout-template" class="mt-0.5 size-4 shrink-0 text-muted" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-medium text-highlighted">{{ selectedFormatSummary }}</p>
            <p class="mt-0.5 text-[11px] text-muted">{{ selectedProject.status ?? 'ready' }}</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <UFormField label="Start">
          <UInput v-model.number="startSec" type="number" min="0" step="0.1" size="xs" />
        </UFormField>
        <UFormField label="Duration">
          <UInput v-model.number="durationSec" type="number" min="1" step="0.5" size="xs" />
        </UFormField>
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
      <UButton
        v-if="props.selectedOverlayClip"
        icon="i-lucide-replace"
        size="xs"
        color="neutral"
        variant="ghost"
        label="Replace selected overlay"
        block
        :disabled="!selectedProject || !selectedFormat"
        @click="replaceOverlay"
      />
    </div>
  </div>
</template>
