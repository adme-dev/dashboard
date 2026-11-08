<script setup lang="ts">
import type { MediaProject, MediaProjectStatus } from '~~/app/types'

type GalleryMediaProject = MediaProject & {
  cover?: {
    url: string
    kind: 'image' | 'video'
    label?: string
  } | null
}

type ProjectView = 'grid' | 'list'
type StatusFilter = 'all' | MediaProjectStatus

const props = withDefaults(defineProps<{
  projects: GalleryMediaProject[]
  clients?: Array<{ id: string, name: string }>
  pending?: boolean
  error?: string | null
  duplicatingId?: string | null
  view?: ProjectView
}>(), {
  clients: () => [],
  pending: false,
  error: null,
  duplicatingId: null,
  view: 'grid'
})

const emit = defineEmits<{
  (event: 'open' | 'duplicate' | 'delete', project: GalleryMediaProject): void
  (event: 'create' | 'retry'): void
  (event: 'update:view', view: ProjectView): void
}>()

const search = ref('')
const status = ref<StatusFilter>('all')
const client = ref('all')
const failedCovers = ref(new Set<string>())

const statusOptions: Array<{ label: string, value: StatusFilter }> = [
  { label: 'All statuses', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'In review', value: 'in_review' },
  { label: 'Approved', value: 'approved' },
  { label: 'Archived', value: 'archived' }
]

const clientOptions = computed(() => [
  { label: 'All clients', value: 'all' },
  { label: 'Agency', value: 'agency' },
  ...props.clients.map(item => ({ label: item.name, value: item.id }))
])

const hasActiveFilters = computed(() => Boolean(search.value.trim()) || status.value !== 'all' || client.value !== 'all')

const visibleProjects = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return props.projects.filter((project) => {
    if (status.value !== 'all' && project.status !== status.value) return false
    if (client.value === 'agency' && project.clientId) return false
    if (client.value !== 'all' && client.value !== 'agency' && project.clientId !== client.value) return false
    if (!query) return true
    return `${projectTitle(project)} ${clientLabel(project)}`.toLocaleLowerCase().includes(query)
  })
})

const resultLabel = computed(() => {
  const count = visibleProjects.value.length
  if (hasActiveFilters.value) return `${count} of ${props.projects.length} projects`
  return `${count} ${count === 1 ? 'project' : 'projects'}`
})

function projectTitle(project: GalleryMediaProject) {
  return project.title?.trim() || 'Untitled video'
}

function clientLabel(project: GalleryMediaProject) {
  if (!project.clientId) return 'Agency'
  return props.clients.find(item => item.id === project.clientId)?.name ?? 'Client project'
}

function statusLabel(value: MediaProjectStatus) {
  return statusOptions.find(item => item.value === value)?.label ?? value
}

function statusColor(value: MediaProjectStatus): 'success' | 'warning' | 'neutral' {
  if (value === 'approved') return 'success'
  if (value === 'in_review') return 'warning'
  return 'neutral'
}

function formatDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Recently updated'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function coverUrl(project: GalleryMediaProject) {
  return project.cover?.url.trim() || ''
}

function coverKey(project: GalleryMediaProject) {
  return `${project.id}:${project.cover?.kind}:${coverUrl(project)}`
}

function showCover(project: GalleryMediaProject) {
  return Boolean(coverUrl(project)) && !failedCovers.value.has(coverKey(project))
}

function markCoverFailed(project: GalleryMediaProject) {
  const next = new Set(failedCovers.value)
  next.add(coverKey(project))
  failedCovers.value = next
}

function clearFailedCover(project: GalleryMediaProject) {
  if (!failedCovers.value.has(coverKey(project))) return
  const next = new Set(failedCovers.value)
  next.delete(coverKey(project))
  failedCovers.value = next
}

function actionItems(project: GalleryMediaProject) {
  return [[
    {
      label: 'Duplicate project',
      icon: 'i-lucide-copy',
      disabled: Boolean(props.duplicatingId),
      onSelect: () => emit('duplicate', project)
    },
    {
      label: 'Delete project',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      disabled: Boolean(props.duplicatingId),
      onSelect: () => emit('delete', project)
    }
  ]]
}

function clearFilters() {
  search.value = ''
  status.value = 'all'
  client.value = 'all'
}
</script>

<template>
  <section aria-label="Video projects">
    <UAlert
      v-if="props.error && props.projects.length"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Projects could not be refreshed"
      :description="props.error"
      class="mb-5"
    >
      <template #actions>
        <UButton
          color="error"
          variant="soft"
          size="sm"
          icon="i-lucide-refresh-cw"
          label="Try again"
          :loading="props.pending"
          @click="emit('retry')"
        />
      </template>
    </UAlert>

    <template v-if="props.projects.length">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="video-projects-heading" class="text-xl font-semibold tracking-tight text-highlighted">
            Your projects
          </h2>
          <p class="mt-1 text-sm text-muted" role="status">
            {{ props.pending ? 'Refreshing projects…' : resultLabel }}
          </p>
        </div>
        <UButton
          v-if="hasActiveFilters"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-x"
          label="Clear filters"
          @click="clearFilters"
        />
      </div>

      <div class="mt-4 rounded-xl border border-default bg-elevated/30 p-3 sm:p-4">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_12rem_14rem_auto]">
          <UFormField label="Search projects">
            <UInput
              v-model="search"
              icon="i-lucide-search"
              placeholder="Search by title or client"
              class="w-full"
              type="search"
            />
          </UFormField>
          <UFormField label="Status">
            <USelect
              v-model="status"
              :items="statusOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Client">
            <USelect
              v-model="client"
              :items="clientOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Layout">
            <div class="flex rounded-lg border border-default bg-default p-1" role="group" aria-label="Project layout">
              <UButton
                icon="i-lucide-grid-2x2"
                label="Gallery"
                size="sm"
                :color="props.view === 'grid' ? 'primary' : 'neutral'"
                :variant="props.view === 'grid' ? 'soft' : 'ghost'"
                :aria-pressed="props.view === 'grid'"
                class="flex-1 justify-center"
                @click="emit('update:view', 'grid')"
              />
              <UButton
                icon="i-lucide-list"
                label="List"
                size="sm"
                :color="props.view === 'list' ? 'primary' : 'neutral'"
                :variant="props.view === 'list' ? 'soft' : 'ghost'"
                :aria-pressed="props.view === 'list'"
                class="flex-1 justify-center"
                @click="emit('update:view', 'list')"
              />
            </div>
          </UFormField>
        </div>
      </div>
    </template>

    <div v-if="props.pending && !props.projects.length" :class="props.view === 'grid' ? 'mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3' : 'mt-6 space-y-3'">
      <div
        v-for="index in 6"
        :key="index"
        class="overflow-hidden rounded-xl border border-default bg-default"
        :class="props.view === 'list' ? 'flex flex-col sm:flex-row' : ''"
      >
        <USkeleton :class="props.view === 'list' ? 'aspect-video w-full sm:w-56' : 'aspect-video w-full'" />
        <div class="flex-1 space-y-3 p-4">
          <USkeleton class="h-5 w-2/3" />
          <USkeleton class="h-4 w-1/3" />
          <USkeleton class="h-8 w-28" />
        </div>
      </div>
    </div>

    <div v-else-if="props.error && !props.projects.length" class="mt-6 rounded-xl border border-dashed border-default px-5 py-12">
      <UAlert
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Projects could not be loaded"
        :description="props.error"
      />
      <UButton
        class="mt-4"
        color="neutral"
        variant="soft"
        icon="i-lucide-refresh-cw"
        label="Try again"
        @click="emit('retry')"
      />
    </div>

    <template v-else-if="props.projects.length">
      <div v-if="visibleProjects.length" :class="props.view === 'grid' ? 'mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3' : 'mt-6 space-y-3'">
        <article
          v-for="project in visibleProjects"
          :key="project.id"
          class="group overflow-hidden rounded-xl border border-default bg-default transition-colors focus-within:border-primary/50 hover:border-primary/40"
          :class="props.view === 'list' ? 'flex flex-col sm:flex-row' : ''"
        >
          <div class="relative shrink-0 overflow-hidden bg-elevated" :class="props.view === 'list' ? 'aspect-video w-full sm:w-56' : 'aspect-video w-full'">
            <UButton
              color="neutral"
              variant="ghost"
              class="absolute inset-0 block h-full w-full rounded-none p-0"
              :aria-label="`Open ${projectTitle(project)}`"
              @click="emit('open', project)"
            >
              <template v-if="showCover(project)">
                <img
                  v-if="project.cover?.kind === 'image'"
                  :src="coverUrl(project)"
                  :alt="project.cover.label || `${projectTitle(project)} preview`"
                  loading="lazy"
                  class="h-full w-full object-cover"
                  @load="clearFailedCover(project)"
                  @error="markCoverFailed(project)"
                >
                <video
                  v-else
                  :src="coverUrl(project)"
                  :aria-label="project.cover?.label || `${projectTitle(project)} preview`"
                  preload="metadata"
                  muted
                  playsinline
                  class="h-full w-full object-cover"
                  @loadeddata="clearFailedCover(project)"
                  @error="markCoverFailed(project)"
                />
              </template>
              <span v-else class="flex h-full w-full flex-col items-center justify-center gap-2 bg-elevated px-4 text-center">
                <UIcon name="i-lucide-film" class="size-7 text-muted" />
                <span class="text-sm font-medium text-highlighted">No preview yet</span>
                <span class="text-xs leading-5 text-muted">Open the editor to add footage or a still.</span>
              </span>
            </UButton>
          </div>

          <div class="flex min-w-0 flex-1 flex-col p-4">
            <div class="flex items-start gap-3">
              <div class="min-w-0 flex-1">
                <UButton
                  color="neutral"
                  variant="link"
                  class="block max-w-full justify-start truncate p-0 text-base font-semibold text-highlighted"
                  :label="projectTitle(project)"
                  :title="projectTitle(project)"
                  @click="emit('open', project)"
                />
                <p class="mt-1 truncate text-sm text-muted">
                  {{ clientLabel(project) }}
                </p>
              </div>
              <UDropdownMenu :items="actionItems(project)">
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-ellipsis"
                  size="sm"
                  :loading="props.duplicatingId === project.id"
                  :aria-label="`Actions for ${projectTitle(project)}`"
                />
              </UDropdownMenu>
            </div>

            <div class="mt-4 flex flex-wrap items-center gap-2">
              <UBadge
                :label="statusLabel(project.status)"
                :color="statusColor(project.status)"
                variant="subtle"
                size="sm"
              />
              <span class="text-xs text-muted">
                Updated <time :datetime="project.updatedAt">{{ formatDate(project.updatedAt) }}</time>
              </span>
            </div>

            <div class="mt-auto pt-4">
              <UButton
                color="neutral"
                variant="soft"
                icon="i-lucide-arrow-up-right"
                label="Open project"
                class="w-full justify-center sm:w-auto"
                @click="emit('open', project)"
              />
            </div>
          </div>
        </article>
      </div>

      <div v-else class="mt-6 rounded-xl border border-dashed border-default px-6 py-14 text-center">
        <UIcon name="i-lucide-search-x" class="mx-auto size-8 text-muted" />
        <h3 class="mt-4 text-lg font-semibold text-highlighted">
          No matching projects
        </h3>
        <p class="mx-auto mt-1 max-w-md text-sm leading-6 text-muted">
          Try another title or client, or clear the filters to see every video project.
        </p>
        <UButton
          class="mt-5"
          color="neutral"
          variant="soft"
          icon="i-lucide-x"
          label="Clear filters"
          @click="clearFilters"
        />
      </div>
    </template>

    <div v-else class="mt-6 rounded-xl border border-dashed border-default bg-elevated/20 px-6 py-14 text-center sm:py-20">
      <div class="mx-auto flex size-14 items-center justify-center rounded-2xl border border-default bg-elevated text-muted">
        <UIcon name="i-lucide-clapperboard" class="size-7" />
      </div>
      <h2 id="video-projects-heading" class="mt-5 text-xl font-semibold tracking-tight text-highlighted">
        Create your first video
      </h2>
      <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
        Start with an empty timeline, then add your own footage, audio, and storyboard in the editor.
      </p>
      <UButton
        class="mt-6"
        color="primary"
        icon="i-lucide-plus"
        label="New video project"
        @click="emit('create')"
      />
    </div>
  </section>
</template>
