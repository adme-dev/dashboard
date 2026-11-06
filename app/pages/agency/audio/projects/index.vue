<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { navigateTo } from '#app'
import type { MediaProject } from '~~/app/types'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

interface ClientOption {
  id: string
  name: string
}

type ProjectView = 'grid' | 'list'

const AGENCY_CLIENT = 'agency'
const VIEW_STORAGE_KEY = 'xeroflow-video-project-view'

const toast = useToast()
const route = useRoute()

function defaultTimelineState(): TimelineState {
  return {
    schema_version: 1,
    media_type: 'audio',
    sample_rate: 48000,
    fps: 30,
    width: 0,
    height: 0,
    duration_sec: 0,
    tracks: [
      { id: crypto.randomUUID(), name: 'Voiceover', kind: 'voiceover', gain_db: 0, muted: false, locked: false, hidden: false, clips: [] },
      { id: crypto.randomUUID(), name: 'Music', kind: 'music', gain_db: 0, muted: false, locked: false, hidden: false, clips: [] }
    ],
    ducking: []
  }
}

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown, headers?: Record<string, string> }
) => Promise<T>

const data = ref<{ projects: MediaProject[] } | null>(null)
const clients = ref<ClientOption[]>([])
const pending = ref(false)
const loadError = ref<string | null>(null)
const projectView = ref<ProjectView>('grid')

function apiErrorDescription(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'data' in error) {
    const message = (error as { data?: { statusMessage?: string } }).data?.statusMessage
    if (message) return message
  }
  return fallback
}

async function refresh() {
  if (pending.value) return
  pending.value = true
  loadError.value = null
  try {
    data.value = await apiFetch<{ projects: MediaProject[] }>('/api/agency/audio/projects')
  } catch (error: unknown) {
    loadError.value = apiErrorDescription(error, 'Could not load projects. Check your connection and try again.')
  } finally {
    pending.value = false
  }
}

async function loadClients() {
  try {
    clients.value = await apiFetch<ClientOption[]>('/api/agency/clients')
  } catch {
    clients.value = []
  }
}

onMounted(() => {
  try {
    const savedView = localStorage.getItem(VIEW_STORAGE_KEY)
    if (savedView === 'grid' || savedView === 'list') projectView.value = savedView
  } catch {
    projectView.value = 'grid'
  }
  void refresh()
  void loadClients()
})

watch(projectView, (view) => {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view)
  } catch {
    // The preference remains available for this session when storage is blocked.
  }
})

const allProjects = computed((): MediaProject[] => data.value?.projects ?? [])
const mediaTypeFilter = computed<'all' | 'audio' | 'av'>(() => {
  if (route.query.mediaType === 'av') return 'av'
  if (route.query.mediaType === 'audio') return 'audio'
  return 'all'
})
const isVideoStudio = computed(() => mediaTypeFilter.value === 'av')
const projects = computed((): MediaProject[] => {
  if (mediaTypeFilter.value === 'all') return allProjects.value
  return allProjects.value.filter(project => project.mediaType === mediaTypeFilter.value)
})
const pageTitle = computed(() => isVideoStudio.value ? 'Video Studio' : 'Audio & video projects')
const pageDescription = 'Multitrack audio and video timeline sessions. Open a project to edit it in the editor.'

useHead(() => ({ title: `${pageTitle.value} — XeroFlow Agency` }))

const columns = [
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'mediaType', header: 'Type' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'updatedAt', header: 'Updated' },
  { accessorKey: 'actions', header: '' }
]

function asProject(row: { original: unknown }): MediaProject {
  return row.original as MediaProject
}

function fmtDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Recently updated'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function openProject(project: MediaProject) {
  void navigateTo(`/agency/audio/projects/${project.id}`)
}

const duplicating = ref<string | null>(null)

async function duplicateProject(project: MediaProject) {
  if (duplicating.value) return
  duplicating.value = project.id
  try {
    const src = await apiFetch<{ project: MediaProject, timeline: { state: TimelineState } | null }>(
      `/api/agency/audio/projects/${project.id}`
    )
    const body: Record<string, unknown> = {
      title: `${project.title ?? 'Untitled'} (copy)`,
      clientId: project.clientId,
      mediaType: project.mediaType
    }
    if (src.timeline?.state) body.initialState = src.timeline.state
    else if (project.mediaType === 'audio') body.initialState = defaultTimelineState()

    const res = await apiFetch<{ project: MediaProject }>('/api/agency/audio/projects', {
      method: 'POST',
      headers: { 'Idempotency-Key': `media-duplicate:${project.id}:${Date.now().toString(36)}` },
      body
    })
    toast.add({ title: 'Project duplicated', color: 'success' })
    await refresh()
    await navigateTo(`/agency/audio/projects/${res.project.id}`)
  } catch (error: unknown) {
    toast.add({
      title: 'Failed to duplicate project',
      description: apiErrorDescription(error, 'The source project was not changed. Try again.'),
      color: 'error'
    })
  } finally {
    duplicating.value = null
  }
}

const deleteConfirmOpen = ref(false)
const projectToDelete = ref<MediaProject | null>(null)
const deleting = ref(false)

function promptDelete(project: MediaProject) {
  projectToDelete.value = project
  deleteConfirmOpen.value = true
}

async function confirmDelete() {
  if (!projectToDelete.value || deleting.value) return
  deleting.value = true
  const id = projectToDelete.value.id
  try {
    await apiFetch(`/api/agency/audio/projects/${id}`, {
      method: 'DELETE',
      headers: { 'Idempotency-Key': `media-delete:${id}` }
    })
    toast.add({ title: 'Project deleted', color: 'success' })
    deleteConfirmOpen.value = false
    projectToDelete.value = null
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Failed to delete project',
      description: apiErrorDescription(error, 'The project was not deleted. Try again.'),
      color: 'error'
    })
  } finally {
    deleting.value = false
  }
}

const createOpen = ref(false)
const differentProjectOpen = ref(false)
const newTitle = ref('')
const newClientId = ref(AGENCY_CLIENT)
const newKind = ref<'audio' | 'av'>(isVideoStudio.value ? 'av' : 'audio')
const creating = ref(false)
const createError = ref<string | null>(null)
const createIdempotencyKey = ref<string | null>(null)
const createAttemptFingerprint = ref<string | null>(null)
const createAudioSeed = ref<TimelineState | null>(null)

const createClientOptions = computed(() => [
  { label: 'Agency (no client)', value: AGENCY_CLIENT },
  ...clients.value.map(item => ({ label: item.name, value: item.id }))
])
const createModalTitle = computed(() => newKind.value === 'av' ? 'New video project' : 'New audio project')
const createButtonLabel = computed(() => newKind.value === 'av' ? 'Create video project' : 'Create audio project')
const createDescription = computed(() => newKind.value === 'av'
  ? 'Start with an empty video timeline. Add footage, audio, and storyboards after the project is created.'
  : 'Start with empty voiceover and music lanes in the multitrack editor.')

function resetCreateDraft() {
  newTitle.value = ''
  newClientId.value = AGENCY_CLIENT
  newKind.value = isVideoStudio.value ? 'av' : 'audio'
  createError.value = null
  createIdempotencyKey.value = null
  createAttemptFingerprint.value = null
  createAudioSeed.value = null
}

function openCreateProject() {
  if (!createIdempotencyKey.value) {
    resetCreateDraft()
    createIdempotencyKey.value = `media-create:${crypto.randomUUID()}`
  }
  createError.value = null
  createOpen.value = true
}

watch(createOpen, (open) => {
  if (!open && !creating.value && !createAttemptFingerprint.value) resetCreateDraft()
})

async function createProject() {
  if (creating.value) return

  const title = newTitle.value.trim() || null
  const clientId = newClientId.value === AGENCY_CLIENT ? null : newClientId.value
  const mediaType = newKind.value
  const fingerprint = JSON.stringify({ title, clientId, mediaType })

  if (createAttemptFingerprint.value && createAttemptFingerprint.value !== fingerprint) {
    createError.value = 'Resolve the previous attempt before changing its details, or explicitly start a different project.'
    return
  }
  const idempotencyKey = createIdempotencyKey.value ?? `media-create:${crypto.randomUUID()}`
  createIdempotencyKey.value = idempotencyKey
  createAttemptFingerprint.value = fingerprint

  const body: Record<string, unknown> = { title, clientId, mediaType }
  if (mediaType === 'audio') {
    createAudioSeed.value ??= defaultTimelineState()
    body.initialState = createAudioSeed.value
  }

  creating.value = true
  createError.value = null
  let createdId: string | null = null
  try {
    const res = await apiFetch<{ project: MediaProject }>('/api/agency/audio/projects', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body
    })
    createdId = res.project.id
  } catch (error: unknown) {
    createError.value = apiErrorDescription(error, 'The creation response could not be confirmed. Retry the same details to recover the original attempt; it may already have created a project.')
    toast.add({ title: 'Creation not confirmed', description: createError.value, color: 'error' })
  } finally {
    creating.value = false
  }

  if (!createdId) return
  toast.add({ title: 'Project created', color: 'success' })
  createOpen.value = false
  resetCreateDraft()
  await navigateTo(`/agency/audio/projects/${createdId}`)
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div
      class="mx-auto p-4 sm:p-6 lg:p-8"
      :class="isVideoStudio ? 'w-full max-w-[1600px]' : 'max-w-4xl space-y-6'"
    >
      <template v-if="isVideoStudio">
        <MediaVideoStudioWorkspaceHeader
          :project-count="projects.length"
          :pending="pending && !projects.length"
          active="studio"
          @create="openCreateProject"
        />
        <MediaVideoStudioProjectGallery
          v-model:view="projectView"
          class="mt-6"
          :projects="projects"
          :clients="clients"
          :pending="pending"
          :error="loadError"
          :duplicating-id="duplicating"
          @open="openProject"
          @duplicate="duplicateProject"
          @delete="promptDelete"
          @create="openCreateProject"
          @retry="refresh"
        />
      </template>

      <template v-else>
        <header class="flex items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold tracking-tight text-highlighted">
              {{ pageTitle }}
            </h1>
            <p class="mt-1 text-sm text-muted">
              {{ pageDescription }}
            </p>
          </div>
          <UButton
            icon="i-lucide-plus"
            color="primary"
            label="New project"
            class="shrink-0"
            @click="openCreateProject"
          />
        </header>

        <UAlert
          v-if="loadError && projects.length"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Projects could not be refreshed"
          :description="loadError"
        >
          <template #actions>
            <UButton
              color="error"
              variant="soft"
              size="sm"
              icon="i-lucide-refresh-cw"
              label="Try again"
              :loading="pending"
              @click="refresh"
            />
          </template>
        </UAlert>

        <div v-if="pending && !projects.length">
          <USkeleton v-for="n in 3" :key="n" class="mb-2 h-12 w-full rounded-lg" />
        </div>

        <div v-else-if="loadError && !projects.length" class="rounded-lg border border-dashed border-default p-5">
          <UAlert
            color="error"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="Projects could not be loaded"
            :description="loadError"
          />
          <UButton
            class="mt-4"
            color="neutral"
            variant="soft"
            icon="i-lucide-refresh-cw"
            label="Try again"
            @click="refresh"
          />
        </div>

        <UAlert
          v-else-if="!projects.length"
          color="neutral"
          variant="subtle"
          icon="i-lucide-folder-open"
          title="No projects yet"
          description="Create your first multitrack audio project using the button above."
        />

        <div v-else class="overflow-hidden rounded-lg border border-default">
          <UTable :data="projects" :columns="columns">
            <template #title-cell="{ row }">
              <UButton
                color="neutral"
                variant="link"
                class="max-w-full justify-start truncate p-0 font-medium text-highlighted"
                :label="asProject(row).title ?? 'Untitled project'"
                @click="openProject(asProject(row))"
              />
            </template>

            <template #mediaType-cell="{ row }">
              <UBadge
                :label="asProject(row).mediaType === 'av' ? 'Video' : 'Audio'"
                size="xs"
                variant="subtle"
                color="neutral"
              />
            </template>

            <template #status-cell="{ row }">
              <UBadge
                :label="asProject(row).status.replace('_', ' ')"
                size="xs"
                variant="subtle"
                :color="asProject(row).status === 'approved' ? 'success' : 'neutral'"
                class="capitalize"
              />
            </template>

            <template #updatedAt-cell="{ row }">
              <span class="text-sm text-muted">{{ fmtDate(asProject(row).updatedAt) }}</span>
            </template>

            <template #actions-cell="{ row }">
              <div class="flex items-center justify-end gap-1">
                <UButton
                  icon="i-lucide-pencil"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  aria-label="Open editor"
                  @click="openProject(asProject(row))"
                />
                <UButton
                  icon="i-lucide-copy"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  aria-label="Duplicate"
                  :loading="duplicating === asProject(row).id"
                  @click="duplicateProject(asProject(row))"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  size="xs"
                  variant="ghost"
                  color="error"
                  aria-label="Delete"
                  @click="promptDelete(asProject(row))"
                />
              </div>
            </template>
          </UTable>
        </div>
      </template>
    </div>
  </div>

  <UModal v-model:open="differentProjectOpen" title="Start a different project?">
    <template #content>
      <div class="space-y-4 p-6">
        <h2 class="text-lg font-semibold">
          Start a different project?
        </h2>
        <p class="text-sm text-muted">
          The previous request may already have created a project. Check your projects or retry that request first. Starting a different project uses a new creation request.
        </p>
        <div class="flex justify-end gap-2">
          <UButton
            label="Keep previous attempt"
            color="neutral"
            variant="ghost"
            @click="() => { differentProjectOpen = false }"
          />
          <UButton label="Start different project" @click="() => { resetCreateDraft(); differentProjectOpen = false }" />
        </div>
      </div>
    </template>
  </UModal>
  <UModal v-model:open="createOpen" :title="createModalTitle">
    <template #content>
      <div class="p-5 sm:p-6">
        <div>
          <h2 class="text-xl font-semibold tracking-tight text-highlighted">
            {{ createModalTitle }}
          </h2>
          <p class="mt-1.5 max-w-lg text-sm leading-6 text-muted">
            {{ createDescription }}
          </p>
        </div>

        <div class="mt-6 grid grid-cols-1 gap-4">
          <UFormField v-if="!isVideoStudio" label="Project type">
            <USelect
              v-model="newKind"
              :disabled="creating || Boolean(createAttemptFingerprint)"
              :items="[{ label: 'Audio (multitrack)', value: 'audio' }, { label: 'Video (footage + overlay)', value: 'av' }]"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Project title" hint="Optional">
            <UInput
              v-model="newTitle"
              :disabled="creating || Boolean(createAttemptFingerprint)"
              :placeholder="newKind === 'av' ? 'Untitled video' : 'Untitled audio project'"
              maxlength="200"
              class="w-full"
              autofocus
              @keydown.enter="createProject"
            />
          </UFormField>
          <UFormField label="Client" help="Choose Agency for internal work. Client projects can use portal and publishing hand-offs.">
            <USelectMenu
              v-model="newClientId"
              :disabled="creating || Boolean(createAttemptFingerprint)"
              :items="createClientOptions"
              value-key="value"
              class="w-full"
              placeholder="Choose a client"
              :search-input="{ placeholder: 'Search clients' }"
            />
          </UFormField>
        </div>

        <UAlert
          v-if="createError"
          class="mt-5"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Creation not confirmed"
          :description="createError"
        />

        <UButton
          v-if="createAttemptFingerprint && !creating"
          label="Start a different project"
          color="neutral"
          variant="link"
          class="mt-3"
          @click="() => { differentProjectOpen = true }"
        />
        <div class="mt-6 flex flex-col-reverse gap-2 border-t border-default pt-4 sm:flex-row sm:justify-end">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            :disabled="creating"
            @click="() => { createOpen = false }"
          />
          <UButton
            color="primary"
            icon="i-lucide-plus"
            :label="createButtonLabel"
            :loading="creating"
            @click="createProject"
          />
        </div>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="deleteConfirmOpen" title="Delete project">
    <template #content>
      <div class="space-y-4 p-5 sm:p-6">
        <div>
          <h2 class="text-xl font-semibold tracking-tight text-highlighted">
            Delete project
          </h2>
          <p class="mt-2 text-sm leading-6 text-muted">
            Are you sure you want to delete
            <strong class="text-highlighted">{{ projectToDelete?.title ?? 'this project' }}</strong>?
            This cannot be undone.
          </p>
        </div>
        <div class="flex justify-end gap-2 border-t border-default pt-4">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            :disabled="deleting"
            @click="() => { deleteConfirmOpen = false }"
          />
          <UButton
            color="error"
            icon="i-lucide-trash-2"
            label="Delete project"
            :loading="deleting"
            @click="confirmDelete"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
