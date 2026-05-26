<script setup lang="ts">
import type { BannerProject } from '~/types/banner-studio'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const router = useRouter()
const toast = useToast()

const searchQuery = ref('')
const statusFilter = ref<'all' | 'draft' | 'published'>('all')
const showDeleteModal = ref(false)
const deleteTarget = ref<BannerProject | null>(null)

const { data: projectsData, refresh, status: fetchStatus } = useFetch<BannerProject[]>('/api/agency/banner-studio/projects', {
  default: () => [],
  onResponseError() {
    // API may not exist yet
  },
})

const allProjects = computed(() => projectsData.value || [])

const projects = computed(() => {
  let list = allProjects.value
  if (statusFilter.value !== 'all') {
    list = list.filter(p => p.status === statusFilter.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.clientName?.toLowerCase().includes(q)
    )
  }
  return list
})

// Summary stats
const totalCount = computed(() => allProjects.value.length)
const draftCount = computed(() => allProjects.value.filter(p => p.status === 'draft').length)
const publishedCount = computed(() => allProjects.value.filter(p => p.status === 'published').length)
const totalFormats = computed(() => {
  let count = 0
  for (const p of allProjects.value) {
    if (p.canvasData) count += Object.keys(p.canvasData).length
  }
  return count
})

function newProject() {
  router.push('/agency/banner-studio/new')
}

function editProject(p: BannerProject) {
  router.push(`/agency/banner-studio/${p.id}`)
}

async function duplicateProject(p: BannerProject) {
  try {
    await $fetch<{ project: BannerProject }>('/api/agency/banner-studio/projects', {
      method: 'POST',
      body: {
        name: `${p.name} (copy)`,
        clientId: p.clientId,
        canvasData: p.canvasData,
        status: 'draft',
      },
    })
    toast.add({ title: 'Duplicated', description: `${p.name} copied`, color: 'success' })
    await refresh()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to duplicate project', color: 'error' })
  }
}

function confirmDelete(p: BannerProject) {
  deleteTarget.value = p
  showDeleteModal.value = true
}

async function doDelete() {
  if (!deleteTarget.value) return
  try {
    await $fetch(`/api/agency/banner-studio/projects/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Deleted', description: `${deleteTarget.value.name} removed`, color: 'success' })
    showDeleteModal.value = false
    deleteTarget.value = null
    await refresh()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to delete project', color: 'error' })
  }
}

function formatDate(d: string) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCount(n: number) {
  return n.toString()
}

const statusItems = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
]

const dropdownItems = (p: BannerProject) => [
  [
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => editProject(p) },
    { label: 'Duplicate', icon: 'i-lucide-copy', onSelect: () => duplicateProject(p) },
  ],
  [
    { label: 'Delete', icon: 'i-lucide-trash-2', onSelect: () => confirmDelete(p) },
  ],
]

const hasActiveFilters = computed(() => statusFilter.value !== 'all' || searchQuery.value.length > 0)

function clearFilters() {
  searchQuery.value = ''
  statusFilter.value = 'all'
}
</script>

<template>
  <div class="min-h-screen bg-[var(--ui-bg)] w-full overflow-y-auto">
    <!-- Header -->
    <div class="border-b border-[var(--ui-border)]">
      <div class="px-6 lg:px-8 py-5">
        <div class="flex items-start justify-between">
          <div>
            <h1 class="text-2xl font-semibold text-[var(--ui-text-highlighted)]">Banner Studio</h1>
            <p class="text-sm text-[var(--ui-text-muted)] mt-0.5">Create and manage HTML5 banner ads</p>
          </div>
          <div class="flex items-center gap-2">
            <UButton to="/agency/banner-studio/custom-templates" color="neutral" variant="outline" icon="i-lucide-code" size="sm">
              Custom HTML
            </UButton>
            <UButton to="/agency/banner-studio/templates" color="neutral" variant="outline" icon="i-lucide-layout-template" size="sm">
              Templates
            </UButton>
            <UButton to="/agency/banner-studio/brand-kits" color="neutral" variant="outline" icon="i-lucide-palette" size="sm">
              Brand Kits
            </UButton>
            <UButton color="primary" icon="i-lucide-plus" size="sm" @click="newProject">
              New Project
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <div class="px-6 lg:px-8 py-6 space-y-6">
      <!-- Summary Stats -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <UCard>
          <div class="flex items-center gap-3">
            <div class="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-blue-50 dark:bg-blue-500/10">
              <UIcon name="i-lucide-folder-kanban" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div class="min-w-0">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">Total Projects</p>
              <USkeleton v-if="fetchStatus === 'pending'" class="h-7 w-10 rounded" />
              <p v-else class="text-2xl font-bold text-[var(--ui-text-highlighted)]">{{ formatCount(totalCount) }}</p>
            </div>
          </div>
        </UCard>
        <UCard>
          <div class="flex items-center gap-3">
            <div class="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-neutral-100 dark:bg-neutral-500/10">
              <UIcon name="i-lucide-file-edit" class="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
            </div>
            <div class="min-w-0">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">Draft</p>
              <USkeleton v-if="fetchStatus === 'pending'" class="h-7 w-10 rounded" />
              <p v-else class="text-2xl font-bold text-[var(--ui-text-highlighted)]">{{ formatCount(draftCount) }}</p>
            </div>
          </div>
        </UCard>
        <UCard>
          <div class="flex items-center gap-3">
            <div class="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-50 dark:bg-emerald-500/10">
              <UIcon name="i-lucide-globe" class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div class="min-w-0">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">Published</p>
              <USkeleton v-if="fetchStatus === 'pending'" class="h-7 w-10 rounded" />
              <p v-else class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{{ formatCount(publishedCount) }}</p>
            </div>
          </div>
        </UCard>
        <UCard>
          <div class="flex items-center gap-3">
            <div class="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-violet-50 dark:bg-violet-500/10">
              <UIcon name="i-lucide-layout-grid" class="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div class="min-w-0">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">Ad Formats</p>
              <USkeleton v-if="fetchStatus === 'pending'" class="h-7 w-10 rounded" />
              <p v-else class="text-2xl font-bold text-[var(--ui-text-highlighted)]">{{ formatCount(totalFormats) }}</p>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Filters -->
      <div class="flex items-center gap-3">
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="Search projects..."
          class="w-64"
          size="sm"
        />
        <USelectMenu
          v-model="statusFilter"
          :items="statusItems"
          value-key="value"
          class="w-36"
          size="sm"
        />
        <UButton
          v-if="hasActiveFilters"
          label="Clear"
          variant="ghost"
          color="neutral"
          size="xs"
          icon="i-lucide-x"
          @click="clearFilters"
        />
        <span class="text-xs text-[var(--ui-text-muted)] ml-auto">
          {{ projects.length }} project{{ projects.length !== 1 ? 's' : '' }}
        </span>
      </div>

      <!-- Project Grid -->
      <div v-if="projects.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <div
          v-for="p in projects"
          :key="p.id"
          class="group cursor-pointer rounded-lg border border-[var(--ui-border)] hover:border-[var(--ui-border-accented)] bg-[var(--ui-bg)] hover:shadow-md transition-all duration-150 overflow-hidden"
          @click="editProject(p)"
        >
          <!-- Thumbnail -->
          <div class="aspect-video bg-[var(--ui-bg-elevated)] flex items-center justify-center relative">
            <img
              v-if="safeMediaUrl(p.thumbnailUrl)"
              :src="safeMediaUrl(p.thumbnailUrl)"
              :alt="p.name"
              class="w-full h-full object-cover"
            >
            <BannerThumbnail
              v-else-if="p.canvasData && Object.keys(p.canvasData).length"
              :canvas-data="p.canvasData"
            />
            <UIcon v-else name="i-lucide-image" class="w-10 h-10 text-[var(--ui-text-muted)] opacity-20" />
            <!-- Hover overlay -->
            <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
              <div class="flex items-center gap-1.5 text-white text-xs font-semibold">
                <UIcon name="i-lucide-pencil" class="w-3.5 h-3.5" />
                Open Editor
              </div>
            </div>
          </div>

          <!-- Info -->
          <div class="p-3">
            <div class="flex items-start justify-between">
              <div class="min-w-0 flex-1">
                <h3 class="text-sm font-medium text-[var(--ui-text-highlighted)] truncate">{{ p.name }}</h3>
                <p v-if="p.clientName" class="text-xs text-[var(--ui-text-muted)] mt-0.5 truncate">{{ p.clientName }}</p>
              </div>
              <UDropdownMenu :items="dropdownItems(p)">
                <UButton icon="i-lucide-more-vertical" variant="ghost" color="neutral" size="xs" @click.stop />
              </UDropdownMenu>
            </div>

            <div class="flex items-center gap-2 mt-2">
              <UBadge :color="p.status === 'published' ? 'success' : 'neutral'" variant="subtle" size="sm">
                {{ p.status }}
              </UBadge>
              <span class="text-[11px] text-[var(--ui-text-muted)]">{{ formatDate(p.createdAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="text-center py-16">
        <div class="w-12 h-12 rounded-full bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center mx-auto mb-3">
          <UIcon name="i-lucide-image" class="w-6 h-6 text-violet-600 dark:text-violet-400" />
        </div>
        <p class="text-sm font-medium text-[var(--ui-text-highlighted)]">No projects yet</p>
        <p class="text-xs text-[var(--ui-text-muted)] mt-1">Create your first banner project to get started</p>
        <UButton color="primary" icon="i-lucide-plus" size="sm" class="mt-4" @click="newProject">
          New Project
        </UButton>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <div class="p-6">
          <h3 class="text-lg font-semibold text-[var(--ui-text-highlighted)] mb-2">Delete Project</h3>
          <p class="text-sm text-[var(--ui-text-muted)] mb-6">
            Are you sure you want to delete <span class="font-medium text-[var(--ui-text)]">"{{ deleteTarget?.name }}"</span>? This action cannot be undone.
          </p>
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" variant="outline" color="neutral" @click="showDeleteModal = false" />
            <UButton label="Delete" color="error" @click="doDelete" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
