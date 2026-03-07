<script setup lang="ts">
import type { BannerTemplateDB } from '~/types/banner-studio'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const router = useRouter()
const toast = useToast()

const searchQuery = ref('')
const activeCategory = ref('all')
const showDeleteModal = ref(false)
const deleteTarget = ref<BannerTemplateDB | null>(null)

const categories = [
  { label: 'All', value: 'all' },
  { label: 'Automotive', value: 'automotive' },
  { label: 'Real Estate', value: 'real-estate' },
  { label: 'Retail', value: 'retail' },
  { label: 'Food', value: 'food' },
  { label: 'Finance', value: 'finance' },
  { label: 'Lifestyle', value: 'lifestyle' },
  { label: 'Minimal', value: 'minimal' },
  { label: 'Custom', value: 'custom' },
  { label: 'Custom HTML', value: 'custom-html' },
]

const fetchParams = computed(() => ({
  category: activeCategory.value !== 'all' && activeCategory.value !== 'custom-html' ? activeCategory.value : undefined,
  search: searchQuery.value || undefined,
}))

const { data: templates, refresh, status } = useFetch<BannerTemplateDB[]>('/api/agency/banner-studio/templates', {
  query: fetchParams,
  default: () => [],
})

// Also fetch custom HTML templates
const customFetchParams = computed(() => ({
  search: searchQuery.value || undefined,
}))

const { data: customTemplates, refresh: refreshCustom } = useFetch<any[]>('/api/agency/banner-studio/custom-templates', {
  query: customFetchParams,
  default: () => [],
})

// Merge both lists based on active category
const allTemplates = computed(() => {
  if (activeCategory.value === 'custom-html') {
    return customTemplates.value.map((t: any) => ({ ...t, _isCustomHtml: true }))
  }
  const visual = activeCategory.value === 'all' ? templates.value : templates.value
  const custom = activeCategory.value === 'all'
    ? customTemplates.value.map((t: any) => ({ ...t, _isCustomHtml: true }))
    : []
  return [...visual, ...custom]
})

async function useTemplate(tpl: any) {
  if (tpl._isCustomHtml) {
    // Create a new instance from the custom HTML template
    try {
      // Increment usage count
      $fetch(`/api/agency/banner-studio/custom-templates/${tpl.id}/use`, { method: 'POST' }).catch(() => {})
      // Create instance
      const inst = await $fetch<{ id: string }>('/api/agency/banner-studio/custom-instances', {
        method: 'POST',
        body: { templateId: tpl.id },
      })
      router.push(`/agency/banner-studio/custom/${inst.id}`)
    } catch (err: any) {
      toast.add({ title: 'Error', description: err?.data?.statusMessage || 'Failed to create instance', color: 'error' })
    }
    return
  }
  $fetch(`/api/agency/banner-studio/templates/${tpl.id}/use`, { method: 'POST' }).catch(() => {})
  router.push({ path: '/agency/banner-studio/new', query: { template: tpl.id } })
}

function confirmDelete(tpl: BannerTemplateDB) {
  deleteTarget.value = tpl
  showDeleteModal.value = true
}

async function doDelete() {
  if (!deleteTarget.value) return
  const tpl = deleteTarget.value as any
  const endpoint = tpl._isCustomHtml
    ? `/api/agency/banner-studio/custom-templates/${tpl.id}`
    : `/api/agency/banner-studio/templates/${tpl.id}`
  try {
    await $fetch(endpoint, { method: 'DELETE' })
    toast.add({ title: 'Deleted', description: `"${tpl.name}" has been removed`, color: 'success' })
    showDeleteModal.value = false
    deleteTarget.value = null
    await refresh()
    await refreshCustom()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err?.data?.statusMessage || 'Failed to delete template', color: 'error' })
  }
}

const dropdownItems = (tpl: BannerTemplateDB) => {
  const items: any[][] = [
    [{ label: 'Use Template', icon: 'i-lucide-play', onSelect: () => useTemplate(tpl) }],
  ]
  if (!tpl.isSystem) {
    items.push([
      { label: 'Delete', icon: 'i-lucide-trash-2', onSelect: () => confirmDelete(tpl) },
    ])
  }
  return items
}
</script>

<template>
  <div class="flex flex-col h-full overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center gap-3 px-6 py-4 border-b border-default">
      <UButton
        icon="i-lucide-arrow-left"
        variant="ghost"
        size="sm"
        @click="router.push('/agency/banner-studio')"
      />
      <div class="flex-1 min-w-0">
        <h1 class="text-lg font-semibold">Template Gallery</h1>
        <p class="text-xs text-muted">Browse and use banner templates</p>
      </div>
      <span class="text-xs text-muted">
        {{ allTemplates.length }} template{{ allTemplates.length !== 1 ? 's' : '' }}
      </span>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-default bg-elevated/50">
      <UInput
        v-model="searchQuery"
        icon="i-lucide-search"
        placeholder="Search templates..."
        class="w-64"
        size="sm"
      />
      <div class="flex gap-1">
        <UButton
          v-for="cat in categories"
          :key="cat.value"
          :label="cat.label"
          :variant="activeCategory === cat.value ? 'solid' : 'ghost'"
          :color="activeCategory === cat.value ? 'primary' : 'neutral'"
          size="xs"
          @click="activeCategory = cat.value"
        />
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 p-6">
      <!-- Loading -->
      <div v-if="status === 'pending'" class="flex items-center justify-center py-20">
        <XfLoader size="md" />
      </div>

      <!-- Grid -->
      <div v-else-if="allTemplates.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        <div
          v-for="tpl in allTemplates"
          :key="tpl.id"
          class="group rounded-lg border border-default bg-default overflow-hidden hover:border-primary transition-colors"
        >
          <!-- Thumbnail -->
          <div
            class="aspect-video bg-elevated flex items-center justify-center relative cursor-pointer"
            @click="useTemplate(tpl)"
          >
            <img
              v-if="tpl.thumbnailUrl"
              :src="tpl.thumbnailUrl"
              :alt="tpl.name"
              class="w-full h-full object-cover"
            >
            <BannerThumbnail
              v-else-if="!tpl._isCustomHtml && tpl.canvasData"
              :canvas-data="tpl.canvasData"
            />
            <UIcon v-else name="i-lucide-layout-template" class="text-3xl text-muted" />
            <UBadge
              v-if="tpl._isCustomHtml"
              label="Custom HTML"
              variant="solid"
              color="warning"
              size="xs"
              class="absolute top-2 left-2"
            />
            <UBadge
              v-else-if="tpl.isSystem"
              label="System"
              variant="solid"
              color="primary"
              size="xs"
              class="absolute top-2 left-2"
            />
            <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <UIcon name="i-lucide-play" class="text-white text-xl" />
            </div>
          </div>

          <!-- Info -->
          <div class="p-3">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <h3 class="text-sm font-medium truncate">{{ tpl.name }}</h3>
                <p
                  v-if="tpl.description"
                  class="text-xs text-muted mt-0.5 line-clamp-2"
                >
                  {{ tpl.description }}
                </p>
              </div>
              <UDropdownMenu :items="dropdownItems(tpl)">
                <UButton
                  icon="i-lucide-more-horizontal"
                  variant="ghost"
                  size="xs"
                  class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                />
              </UDropdownMenu>
            </div>

            <div class="flex items-center gap-2 mt-2">
              <UBadge :label="tpl.category" variant="subtle" size="xs" />
              <span
                v-if="tpl.formats?.length"
                class="text-xs text-muted flex items-center gap-0.5"
              >
                <UIcon name="i-lucide-layout-grid" class="w-3 h-3" />
                {{ tpl.formats.length }} {{ tpl.formats.length === 1 ? 'size' : 'sizes' }}
              </span>
              <span class="text-xs text-muted flex items-center gap-0.5 ml-auto">
                <UIcon name="i-lucide-download" class="w-3 h-3" />
                {{ tpl.usageCount || 0 }}
              </span>
            </div>

            <UButton
              label="Use Template"
              icon="i-lucide-play"
              size="xs"
              color="primary"
              variant="soft"
              class="w-full mt-3"
              @click="useTemplate(tpl)"
            />
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="text-center py-20">
        <UIcon name="i-lucide-layout-template" class="text-4xl text-muted mb-3" />
        <h3 class="text-lg font-semibold mb-1">No templates found</h3>
        <p class="text-sm text-muted mb-4">
          {{ searchQuery || activeCategory !== 'all' ? 'Try adjusting your search or category filter' : 'Save a project as a template to get started' }}
        </p>
        <UButton
          v-if="searchQuery || activeCategory !== 'all'"
          label="Clear Filters"
          icon="i-lucide-x"
          variant="outline"
          size="sm"
          @click="searchQuery = ''; activeCategory = 'all'"
        />
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <div class="p-5">
          <h3 class="text-lg font-semibold mb-2">Delete Template</h3>
          <p class="text-sm text-muted mb-5">
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
