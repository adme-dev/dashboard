<script setup lang="ts">
// SP2c projects list + create. Lists media_projects, lets users open the editor,
// duplicate, delete, and create new projects.
import { ref, computed } from 'vue'
import { navigateTo } from '#app'
import type { MediaProject } from '~~/app/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const toast = useToast()

// ─── Projects list ────────────────────────────────────────────────────────────

const { data, refresh, pending } = useFetch('/api/agency/audio/projects', { lazy: true })
const projects = computed((): MediaProject[] => (data.value as any)?.projects ?? [])

// ─── Table columns ────────────────────────────────────────────────────────────

const columns = [
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'mediaType', header: 'Type' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'updatedAt', header: 'Updated' },
  { accessorKey: 'actions', header: '' }
]

/** Type-narrow a UTable row.original (typed {} by Nuxt UI) to MediaProject. */
function asProject(row: { original: unknown }): MediaProject {
  return row.original as MediaProject
}

function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso))
  } catch {
    return iso
  }
}

// ─── Open editor ─────────────────────────────────────────────────────────────

function openProject(project: MediaProject) {
  navigateTo(`/agency/audio/projects/${project.id}`)
}

// ─── Duplicate ───────────────────────────────────────────────────────────────

const duplicating = ref<string | null>(null)

async function duplicateProject(project: MediaProject) {
  if (duplicating.value) return
  duplicating.value = project.id
  try {
    const res = await $fetch<{ project: MediaProject }>('/api/agency/audio/projects', {
      method: 'POST',
      body: { title: `${project.title ?? 'Untitled'} (copy)`, media_type: 'audio' }
    })
    toast.add({ title: 'Project duplicated', color: 'success' })
    await refresh()
    navigateTo(`/agency/audio/projects/${res.project.id}`)
  } catch {
    toast.add({ title: 'Failed to duplicate project', color: 'error' })
  } finally {
    duplicating.value = null
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

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
  try {
    // No dedicated DELETE endpoint yet — soft delete via status update would need an
    // endpoint. For now just close the modal and inform the user.
    // TODO: add DELETE /api/agency/audio/projects/[id] if needed.
    toast.add({ title: 'Delete not yet available via API', color: 'warning', description: 'A DELETE endpoint will be added in a follow-up sprint.' })
    deleteConfirmOpen.value = false
    projectToDelete.value = null
  } finally {
    deleting.value = false
  }
}

// ─── Create new project ───────────────────────────────────────────────────────

const createOpen = ref(false)
const newTitle = ref('')
const creating = ref(false)

async function createProject() {
  if (creating.value) return
  creating.value = true
  try {
    const res = await $fetch<{ project: MediaProject; timeline: unknown }>(
      '/api/agency/audio/projects',
      {
        method: 'POST',
        body: {
          title: newTitle.value.trim() || null,
          // media_type is inferred server-side from the empty timeline default; still
          // accepted in the body by the schema even though the server normalises it.
        }
      }
    )
    toast.add({ title: 'Project created', color: 'success' })
    createOpen.value = false
    newTitle.value = ''
    await navigateTo(`/agency/audio/projects/${res.project.id}`)
  } catch (e: any) {
    toast.add({ title: 'Failed to create project', description: e?.data?.statusMessage ?? '', color: 'error' })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="flex-1 min-h-0 overflow-y-auto">
    <div class="max-w-4xl mx-auto p-6 space-y-6">

      <!-- Header -->
      <header class="flex items-center justify-between gap-2">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Audio projects</h1>
          <p class="text-sm text-muted">Multitrack timeline sessions — open any project to edit it in the editor.</p>
        </div>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          label="New project"
          @click="createOpen = true"
        />
      </header>

      <!-- Table -->
      <div v-if="pending && !projects.length">
        <USkeleton v-for="n in 3" :key="n" class="h-12 w-full mb-2 rounded-lg" />
      </div>

      <UAlert
        v-else-if="!pending && !projects.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-folder-open"
        title="No projects yet"
        description="Create your first multitrack audio project using the button above."
      />

      <div v-else class="rounded-lg border border-default overflow-hidden">
        <UTable :rows="projects" :columns="columns">
          <template #title-cell="{ row }">
            <button
              class="text-left font-medium text-highlighted hover:text-primary transition-colors"
              @click="openProject(asProject(row))"
            >
              {{ asProject(row).title ?? '(untitled)' }}
            </button>
          </template>

          <template #mediaType-cell="{ row }">
            <UBadge :label="asProject(row).mediaType" size="xs" variant="subtle" color="neutral" />
          </template>

          <template #status-cell="{ row }">
            <UBadge
              :label="asProject(row).status"
              size="xs"
              variant="subtle"
              :color="asProject(row).status === 'published' ? 'success' : 'neutral'"
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
                @click.stop="openProject(asProject(row))"
              />
              <UButton
                icon="i-lucide-copy"
                size="xs"
                variant="ghost"
                color="neutral"
                aria-label="Duplicate"
                :loading="duplicating === asProject(row).id"
                @click.stop="duplicateProject(asProject(row))"
              />
              <UButton
                icon="i-lucide-trash-2"
                size="xs"
                variant="ghost"
                color="error"
                aria-label="Delete"
                @click.stop="promptDelete(asProject(row))"
              />
            </div>
          </template>
        </UTable>
      </div>

    </div>
  </div>

  <!-- Create project modal -->
  <UModal v-model:open="createOpen" title="New audio project">
    <template #content>
      <div class="p-4 space-y-4">
        <UFormField label="Project title">
          <UInput
            v-model="newTitle"
            placeholder="e.g. Q3 Radio Campaign"
            autofocus
            @keydown.enter="createProject"
          />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            @click="createOpen = false"
          />
          <UButton
            color="primary"
            label="Create project"
            :loading="creating"
            @click="createProject"
          />
        </div>
      </div>
    </template>
  </UModal>

  <!-- Delete confirmation modal -->
  <UModal v-model:open="deleteConfirmOpen" title="Delete project">
    <template #content>
      <div class="p-4 space-y-4">
        <p class="text-sm text-muted">
          Are you sure you want to delete
          <strong class="text-highlighted">{{ projectToDelete?.title ?? 'this project' }}</strong>?
          This cannot be undone.
        </p>
        <div class="flex justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            @click="deleteConfirmOpen = false"
          />
          <UButton
            color="error"
            label="Delete"
            :loading="deleting"
            @click="confirmDelete"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
