<script setup lang="ts">
import type { BannerProject } from '~/types/banner-studio'

definePageMeta({ layout: 'agency' })

const router = useRouter()
const toast = useToast()

const searchQuery = ref('')
const statusFilter = ref<'all' | 'draft' | 'published'>('all')
const showDeleteModal = ref(false)
const deleteTarget = ref<BannerProject | null>(null)

const { data: projectsData, refresh } = useFetch<BannerProject[]>('/api/agency/banner-studio/projects', {
  default: () => [],
  onResponseError() {
    // API may not exist yet
  },
})

const projects = computed(() => {
  let list = projectsData.value || []
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

function newProject() {
  router.push('/agency/banner-studio/new')
}

function editProject(p: BannerProject) {
  router.push(`/agency/banner-studio/${p.id}`)
}

async function duplicateProject(p: BannerProject) {
  try {
    const result = await $fetch<{ project: BannerProject }>('/api/agency/banner-studio/projects', {
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
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <BrandCube color="teal" :size="32" :animated="false" />
        <div>
          <h1 class="text-2xl font-bold">Banner Studio</h1>
          <p class="text-sm text-(--ui-text-muted) mt-0.5">Create and manage HTML5 banner ads</p>
        </div>
      </div>
      <NbButton variant="primary" icon="i-lucide-plus" @click="newProject">New Project</NbButton>
    </div>

    <!-- Filters -->
    <div class="flex items-center gap-3 mb-4 bg-(--ui-bg-elevated)/50 rounded-lg px-4 py-3 border border-(--ui-border)">
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
      <span class="text-xs text-(--ui-text-muted) ml-auto">{{ projects.length }} project{{ projects.length !== 1 ? 's' : '' }}</span>
    </div>

    <!-- Project Grid -->
    <div v-if="projects.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <NbCard
        v-for="p in projects"
        :key="p.id"
        hoverable
        body-class="!p-0"
        class="cursor-pointer overflow-hidden group"
        @click="editProject(p)"
      >
        <!-- Thumbnail -->
        <div class="aspect-video bg-(--ui-bg) flex items-center justify-center relative">
          <img
            v-if="p.thumbnailUrl"
            :src="p.thumbnailUrl"
            :alt="p.name"
            class="w-full h-full object-cover"
          >
          <UIcon v-else name="i-lucide-image" class="w-10 h-10 text-(--ui-text-muted)/30" />
          <!-- Hover overlay -->
          <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
            <span class="text-white text-xs font-semibold tracking-wide">Open Editor</span>
          </div>
        </div>

        <!-- Info -->
        <div class="p-3">
          <div class="flex items-start justify-between">
            <div class="min-w-0 flex-1">
              <h3 class="text-sm font-semibold truncate">{{ p.name }}</h3>
              <p v-if="p.clientName" class="text-xs text-(--ui-text-muted) mt-0.5">{{ p.clientName }}</p>
            </div>
            <UDropdownMenu :items="dropdownItems(p)">
              <UButton icon="i-lucide-more-vertical" variant="ghost" size="xs" @click.stop />
            </UDropdownMenu>
          </div>

          <div class="flex items-center gap-2 mt-2">
            <NbBadge :variant="p.status === 'published' ? 'success' : 'neutral'">
              {{ p.status }}
            </NbBadge>
            <span class="text-[11px] text-(--ui-text-muted)">{{ formatDate(p.createdAt) }}</span>
          </div>
        </div>
      </NbCard>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-16">
      <div class="flex justify-center mb-4">
        <BrandCube color="teal" :size="48" />
      </div>
      <h3 class="text-lg font-semibold mb-1">No projects yet</h3>
      <p class="text-sm text-(--ui-text-muted) mb-5">Create your first banner project to get started</p>
      <NbButton variant="primary" icon="i-lucide-plus" @click="newProject">New Project</NbButton>
    </div>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <div class="p-4">
          <h3 class="text-lg font-semibold mb-2">Delete Project</h3>
          <p class="text-sm text-(--ui-text-muted) mb-4">
            Are you sure you want to delete "{{ deleteTarget?.name }}"? This action cannot be undone.
          </p>
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" variant="outline" size="sm" @click="showDeleteModal = false" />
            <UButton label="Delete" color="error" size="sm" @click="doDelete" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
