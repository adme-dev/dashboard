<script setup lang="ts">
import type { BannerProject } from '~/types/banner-studio'
import { isAmbiguousApiFailure } from '~/utils/apiError'
import { bannerDimensions, bannerLibraryFacets, filterBannerProjects, sortLibrary } from '~/utils/banner-library'
import type { LibrarySort } from '~/utils/banner-library'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const router = useRouter()
const toast = useToast()

const searchQuery = ref('')
const clientFilter = ref('all')
const folderFilter = ref('all')
const tagFilter = ref('all')
const view = useCookie<'list' | 'grid'>('banner-library-view', { default: () => 'list', sameSite: 'lax' })
const sort = ref<LibrarySort>('modified')
const page = ref(1)
const pageSize = 36
const showImportModal = ref(false)
const statusFilter = ref<'all' | 'draft' | 'published'>('all')
const showDeleteModal = ref(false)
const deleteTarget = ref<BannerProject | null>(null)

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown, headers?: Record<string, string> }
) => Promise<T>
const duplicateIdempotencyKeys = new Map<string, string>()
const projectsData = ref<BannerProject[]>([])
const fetchStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refresh() {
  fetchStatus.value = 'pending'
  try {
    projectsData.value = await apiFetch<BannerProject[]>('/api/agency/banner-studio/projects')
    fetchStatus.value = 'success'
  } catch {
    projectsData.value = []
    fetchStatus.value = 'error'
  }
}

onMounted(() => {
  void refresh()
})

const allProjects = computed(() => projectsData.value || [])

const clients = computed(() => {
  const records = new Map<string, { id: string, name: string, count: number }>()
  for (const project of allProjects.value) {
    const id = project.clientId || 'unassigned'
    const current = records.get(id)
    records.set(id, { id, name: project.clientId ? project.clientName || 'Unnamed client' : 'Unassigned', count: (current?.count || 0) + 1 })
  }
  return [...records.values()].sort((a, b) => a.name.localeCompare(b.name))
})
const clientProjects = computed(() => filterBannerProjects(allProjects.value, { client: clientFilter.value, tag: 'all', status: 'all', search: '' }))
const facets = computed(() => bannerLibraryFacets(clientProjects.value))
const folders = computed(() => facets.value.folders)
const categories = computed(() => facets.value.categories)
const projects = computed(() => sortLibrary(filterBannerProjects(clientProjects.value, {
  client: 'all', tag: tagFilter.value, status: statusFilter.value, search: searchQuery.value
}).filter(p => folderFilter.value === 'all' || p.tags?.includes(folderFilter.value)), sort.value))
const visibleProjects = computed(() => projects.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const libraryItems = computed(() => visibleProjects.value.map(p => ({
  id: p.id, name: p.name, client: p.clientName || (p.clientId ? 'Unnamed client' : 'Unassigned'),
  category: p.tags?.includes('import:needs-review') ? `${p.status} · Import needs review` : p.status, dimensions: bannerDimensions(p.canvasData), type: 'Native editable',
  date: p.updatedAt || p.createdAt, thumbnailUrl: p.thumbnailUrl, canvasData: p.canvasData,
  to: `/agency/banner-studio/${p.id}`
})))
const projectById = computed(() => new Map(allProjects.value.map(p => [p.id, p])))
watch([searchQuery, statusFilter, clientFilter, folderFilter, tagFilter, sort], () => {
  page.value = 1
})
watch(clientFilter, () => {
  folderFilter.value = 'all'
  tagFilter.value = 'all'
})
watch(projects, (list) => {
  page.value = Math.min(page.value, Math.max(1, Math.ceil(list.length / pageSize)))
})
const sortItems = [
  { label: 'Recently modified', value: 'modified' },
  { label: 'Name A–Z', value: 'name' },
  { label: 'Oldest modified', value: 'oldest' }
]

function newProject() {
  router.push('/agency/banner-studio/new')
}

function editProject(p: BannerProject) {
  router.push(`/agency/banner-studio/${p.id}`)
}

async function duplicateProject(p: BannerProject) {
  const idempotencyKey = duplicateIdempotencyKeys.get(p.id) || crypto.randomUUID()
  duplicateIdempotencyKeys.set(p.id, idempotencyKey)
  try {
    await apiFetch<{ project: BannerProject }>('/api/agency/banner-studio/projects', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: {
        name: `${p.name} (copy)`,
        clientId: p.clientId,
        canvasData: p.canvasData,
        status: 'draft'
      }
    })
    duplicateIdempotencyKeys.delete(p.id)
    toast.add({ title: 'Duplicated', description: `${p.name} copied`, color: 'success' })
    await refresh()
  } catch (error) {
    if (!isAmbiguousApiFailure(error)) duplicateIdempotencyKeys.delete(p.id)
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
    await apiFetch(`/api/agency/banner-studio/projects/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Deleted', description: `${deleteTarget.value.name} removed`, color: 'success' })
    showDeleteModal.value = false
    deleteTarget.value = null
    await refresh()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to delete project', color: 'error' })
  }
}

const statusItems = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' }
]

const dropdownItems = (p: BannerProject) => [
  [
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => editProject(p) },
    { label: 'Duplicate', icon: 'i-lucide-copy', onSelect: () => duplicateProject(p) }
  ],
  [
    { label: 'Delete', icon: 'i-lucide-trash-2', onSelect: () => confirmDelete(p) }
  ]
]

const hasActiveFilters = computed(() => statusFilter.value !== 'all' || searchQuery.value.length > 0 || clientFilter.value !== 'all' || folderFilter.value !== 'all' || tagFilter.value !== 'all')

function clearFilters() {
  searchQuery.value = ''
  statusFilter.value = 'all'
  clientFilter.value = 'all'
  folderFilter.value = 'all'
  tagFilter.value = 'all'
}
</script>

<template>
  <div class="flex h-full min-h-0 w-full flex-col bg-default">
    <header class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-default px-4 py-4 sm:px-6">
      <div>
        <h1 class="text-xl font-semibold">
          Banner Studio
        </h1>
        <p class="mt-0.5 text-xs text-muted">
          Your client banner library
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          to="/agency/banner-studio/custom-templates"
          color="neutral"
          variant="ghost"
          icon="i-lucide-code"
          size="sm"
        >
          Custom HTML
        </UButton>
        <UButton
          to="/agency/banner-studio/templates"
          color="neutral"
          variant="outline"
          icon="i-lucide-layout-template"
          size="sm"
        >
          Templates
        </UButton>
        <UButton
          to="/agency/banner-studio/brand-kits"
          color="neutral"
          variant="ghost"
          icon="i-lucide-palette"
          size="sm"
        >
          Brand Kits
        </UButton>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-upload"
          size="sm"
          @click="showImportModal = true"
        >
          Import from TheBrief
        </UButton>
        <UButton icon="i-lucide-plus" size="sm" @click="newProject">
          New Project
        </UButton>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside class="max-h-40 shrink-0 overflow-y-auto border-b border-default bg-elevated/30 p-3 md:max-h-none md:w-56 md:border-r md:border-b-0" aria-label="Banner library filters">
        <h2 class="px-2 pb-2 text-xs font-semibold text-muted">
          Clients
        </h2>
        <UButton
          label="All clients"
          icon="i-lucide-users"
          :aria-pressed="clientFilter === 'all'"
          :variant="clientFilter === 'all' ? 'soft' : 'ghost'"
          color="neutral"
          class="w-full justify-start"
          @click="clientFilter = 'all'"
        >
          <template #trailing>
            <span class="ml-auto text-xs text-muted">{{ allProjects.length }}</span>
          </template>
        </UButton>
        <UButton
          v-for="client in clients"
          :key="client.id"
          :label="client.name"
          :title="client.name"
          :variant="clientFilter === client.id ? 'soft' : 'ghost'"
          :aria-pressed="clientFilter === client.id"
          color="neutral"
          class="w-full justify-start"
          :ui="{ label: 'truncate' }"
          @click="clientFilter = client.id"
        >
          <template #trailing>
            <span class="ml-auto text-xs text-muted">{{ client.count }}</span>
          </template>
        </UButton>
        <h2 class="mt-6 px-2 pb-2 text-xs font-semibold text-muted">
          Folders
        </h2>
        <UButton
          label="All folders"
          icon="i-lucide-folders"
          :aria-pressed="folderFilter === 'all'"
          :variant="folderFilter === 'all' ? 'soft' : 'ghost'"
          color="neutral"
          class="w-full justify-start"
          @click="folderFilter = 'all'"
        />
        <UButton
          v-for="folder in folders"
          :key="folder"
          :label="folder.slice(14)"
          :title="folder.slice(14)"
          icon="i-lucide-folder"
          :variant="folderFilter === folder ? 'soft' : 'ghost'"
          :aria-pressed="folderFilter === folder"
          color="neutral"
          class="w-full justify-start"
          :ui="{ label: 'truncate' }"
          @click="folderFilter = folder"
        />
        <p v-if="!folders.length" class="px-2 py-2 text-xs text-muted">
          No source folders recorded.
        </p>
        <h2 class="mt-6 px-2 pb-2 text-xs font-semibold text-muted">
          Categories &amp; tags
        </h2>
        <UButton
          label="All categories"
          icon="i-lucide-tags"
          :aria-pressed="tagFilter === 'all'"
          :variant="tagFilter === 'all' ? 'soft' : 'ghost'"
          color="neutral"
          class="w-full justify-start"
          @click="tagFilter = 'all'"
        />
        <UButton
          v-for="tag in categories"
          :key="tag"
          :label="tag.replace(/^category:/, '')"
          :title="tag.replace(/^category:/, '')"
          :variant="tagFilter === tag ? 'soft' : 'ghost'"
          :aria-pressed="tagFilter === tag"
          color="neutral"
          class="w-full justify-start"
          :ui="{ label: 'truncate' }"
          @click="tagFilter = tag"
        />
        <p v-if="!categories.length" class="px-2 py-2 text-xs text-muted">
          No categories recorded.
        </p>
      </aside>

      <main class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="flex shrink-0 flex-wrap items-end gap-3 border-b border-default p-4">
          <UFormField label="Search banners" class="min-w-40 flex-1">
            <UInput
              v-model="searchQuery"
              icon="i-lucide-search"
              placeholder="Name, client, tag or dimensions"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Status">
            <USelect v-model="statusFilter" :items="statusItems" class="w-32" />
          </UFormField>
          <UFormField label="Sort">
            <USelect v-model="sort" :items="sortItems" class="w-44" />
          </UFormField>
          <div class="flex gap-1" role="group" aria-label="Library view">
            <UButton
              icon="i-lucide-list"
              aria-label="List view"
              :aria-pressed="view === 'list'"
              :variant="view === 'list' ? 'soft' : 'ghost'"
              color="neutral"
              @click="view = 'list'"
            />
            <UButton
              icon="i-lucide-layout-grid"
              aria-label="Grid view"
              :aria-pressed="view === 'grid'"
              :variant="view === 'grid' ? 'soft' : 'ghost'"
              color="neutral"
              @click="view = 'grid'"
            />
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div class="mb-4 flex items-center justify-between gap-2">
            <p class="text-xs text-muted" role="status">
              {{ projects.length }} project{{ projects.length === 1 ? '' : 's' }}
            </p>
            <UButton
              v-if="hasActiveFilters"
              label="Clear filters"
              variant="ghost"
              color="neutral"
              size="xs"
              icon="i-lucide-x"
              @click="clearFilters"
            />
          </div>
          <div
            v-if="fetchStatus === 'pending'"
            class="space-y-3"
            aria-label="Loading projects"
            aria-busy="true"
          >
            <USkeleton v-for="n in 6" :key="n" class="h-20 w-full" />
          </div>
          <UAlert
            v-else-if="fetchStatus === 'error'"
            title="Could not load your banners"
            description="Try loading the library again."
            color="error"
            icon="i-lucide-circle-alert"
            :actions="[{ label: 'Retry', onClick: refresh }]"
          />
          <BannerLibraryItems
            v-else-if="projects.length"
            :items="libraryItems"
            :view="view"
            context-label="Client"
          >
            <template #actions="{ id }">
              <UDropdownMenu :items="dropdownItems(projectById.get(id)!)">
                <UButton
                  icon="i-lucide-more-horizontal"
                  :aria-label="`Actions for ${projectById.get(id)?.name}`"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                />
              </UDropdownMenu>
            </template>
          </BannerLibraryItems>
          <div v-else class="py-16 text-center">
            <UIcon name="i-lucide-images" class="mb-3 size-8 text-muted" />
            <h2 class="font-semibold">
              {{ hasActiveFilters ? 'No matching banners' : 'Your banner library starts here' }}
            </h2>
            <p class="mt-1 text-sm text-muted">
              {{ hasActiveFilters ? 'Try a different client, folder or search.' : 'Create a project or import a design from TheBrief.' }}
            </p>
            <UButton
              v-if="hasActiveFilters"
              class="mt-4"
              variant="outline"
              color="neutral"
              @click="clearFilters"
            >
              Clear filters
            </UButton>
            <UButton
              v-else
              class="mt-4"
              icon="i-lucide-plus"
              @click="newProject"
            >
              New Project
            </UButton>
          </div>
          <UPagination
            v-if="projects.length > pageSize"
            v-model:page="page"
            :items-per-page="pageSize"
            :total="projects.length"
            class="mt-6 flex justify-center"
          />
        </div>
      </main>
    </div>
    <BannerTheBriefImportModal v-model:open="showImportModal" @imported="refresh" />
    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <div class="p-6">
          <h3 class="text-lg font-semibold text-[var(--ui-text-highlighted)] mb-2">
            Delete Project
          </h3>
          <p class="text-sm text-[var(--ui-text-muted)] mb-6">
            Are you sure you want to delete <span class="font-medium text-[var(--ui-text)]">"{{ deleteTarget?.name }}"</span>? This action cannot be undone.
          </p>
          <div class="flex justify-end gap-2">
            <UButton
              label="Cancel"
              variant="outline"
              color="neutral"
              @click="showDeleteModal = false"
            />
            <UButton label="Delete" color="error" @click="doDelete" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
