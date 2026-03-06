<script setup lang="ts">
import type { CustomTemplate } from '~/types/banner-studio'

definePageMeta({ layout: 'agency' })

const router = useRouter()
const toast = useToast()

const search = ref('')
const activeCategory = ref('all')
const showUploadModal = ref(false)
const previewTemplate = ref<CustomTemplate | null>(null)
const showPreviewModal = ref(false)

const categories = [
  { value: 'all', label: 'All' },
  { value: 'event-entertainment', label: 'Event' },
  { value: 'product-ecommerce', label: 'Product' },
  { value: 'brand-corporate', label: 'Brand' },
  { value: 'social-lifestyle', label: 'Social' },
  { value: 'typography-kinetic', label: 'Typography' },
  { value: 'abstract-artistic', label: 'Abstract' },
]

const fetchParams = computed(() => {
  const params: Record<string, string> = {}
  if (activeCategory.value !== 'all') params.category = activeCategory.value
  if (search.value) params.search = search.value
  return params
})

const { data: templates, refresh, status } = useFetch<CustomTemplate[]>(
  '/api/agency/banner-studio/custom-templates',
  { query: fetchParams, default: () => [] },
)

function openPreview(tpl: CustomTemplate) {
  previewTemplate.value = tpl
  showPreviewModal.value = true
}

async function useTemplate(tpl: CustomTemplate) {
  try {
    const instance = await $fetch<{ id: string }>('/api/agency/banner-studio/custom-instances', {
      method: 'POST',
      body: { templateId: tpl.id },
    })
    router.push(`/agency/banner-studio/custom/${instance.id}`)
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to create instance', color: 'error' })
  }
}

async function deleteTemplate(tpl: CustomTemplate) {
  try {
    await $fetch(`/api/agency/banner-studio/custom-templates/${tpl.id}`, { method: 'DELETE' })
    toast.add({ title: 'Deleted', description: `${tpl.name} removed`, color: 'success' })
    await refresh()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to delete', color: 'error' })
  }
}

function onUploaded() {
  showUploadModal.value = false
  refresh()
}

function clearFilters() {
  search.value = ''
  activeCategory.value = 'all'
}

const categoryLabel = (cat: string) => categories.find(c => c.value === cat)?.label || cat
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
        <h1 class="text-lg font-semibold">Custom HTML Templates</h1>
        <p class="text-xs text-muted">Import and manage raw HTML/CSS/JS banner templates</p>
      </div>
      <UButton
        icon="i-lucide-plus"
        label="Upload Template"
        color="primary"
        size="sm"
        @click="showUploadModal = true"
      />
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-default bg-elevated/50">
      <UInput
        v-model="search"
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
      <span class="text-xs text-muted ml-auto">{{ templates?.length || 0 }} template{{ (templates?.length || 0) !== 1 ? 's' : '' }}</span>
    </div>

    <!-- Content -->
    <div class="flex-1 p-6">
      <!-- Loading -->
      <div v-if="status === 'pending'" class="flex items-center justify-center py-20">
        <XfLoader size="md" />
      </div>

      <!-- Empty State -->
      <div v-else-if="!templates?.length" class="text-center py-20">
        <UIcon name="i-lucide-code" class="text-4xl text-muted mb-3" />
        <h3 class="text-lg font-semibold mb-1">No templates found</h3>
        <p class="text-sm text-muted mb-4">
          {{ search || activeCategory !== 'all' ? 'Try adjusting your search or category filter' : 'Upload your first custom HTML template to get started' }}
        </p>
        <UButton
          v-if="search || activeCategory !== 'all'"
          label="Clear Filters"
          icon="i-lucide-x"
          variant="outline"
          size="sm"
          @click="clearFilters"
        />
      </div>

      <!-- Grid -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
      <div
        v-for="tpl in templates"
        :key="tpl.id"
        class="group rounded-lg border border-default bg-default overflow-hidden hover:border-primary transition-colors"
      >
        <!-- Thumbnail -->
        <div
          class="h-40 bg-elevated flex items-center justify-center cursor-pointer"
          @click="openPreview(tpl)"
        >
          <img
            v-if="tpl.thumbnailUrl"
            :src="tpl.thumbnailUrl"
            :alt="tpl.name"
            class="w-full h-full object-cover"
          >
          <UIcon v-else name="i-lucide-code" class="text-3xl text-muted" />
        </div>

        <!-- Info -->
        <div class="p-3">
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-medium text-sm truncate">{{ tpl.name }}</h3>
            <UDropdownMenu
              :items="[
                [
                  { label: 'Preview', icon: 'i-lucide-eye', click: () => openPreview(tpl) },
                  { label: 'Use Template', icon: 'i-lucide-copy', click: () => useTemplate(tpl) },
                ],
                [
                  { label: 'Delete', icon: 'i-lucide-trash-2', click: () => deleteTemplate(tpl) },
                ],
              ]"
            >
              <UButton
                icon="i-lucide-more-horizontal"
                variant="ghost"
                size="xs"
                class="opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </UDropdownMenu>
          </div>

          <div class="flex items-center gap-2 mt-1.5">
            <UBadge :label="categoryLabel(tpl.category)" variant="subtle" size="xs" />
            <span class="text-xs text-muted">{{ tpl.width }}x{{ tpl.height }}</span>
          </div>

          <div v-if="tpl.tags?.length" class="flex flex-wrap gap-1 mt-2">
            <UBadge
              v-for="tag in tpl.tags.slice(0, 3)"
              :key="tag"
              :label="tag"
              variant="subtle"
              color="neutral"
              size="xs"
            />
            <span v-if="tpl.tags.length > 3" class="text-xs text-muted">
              +{{ tpl.tags.length - 3 }}
            </span>
          </div>

          <div class="flex items-center justify-between mt-2 text-xs text-muted">
            <span>{{ tpl.usageCount || 0 }} uses</span>
            <UButton
              label="Use"
              icon="i-lucide-play"
              size="xs"
              color="primary"
              variant="soft"
              @click="useTemplate(tpl)"
            />
          </div>
        </div>
      </div>
    </div>

    </div>

    <!-- Upload Modal -->
    <BannerCustomTemplateUploadModal
      v-model:open="showUploadModal"
      @uploaded="onUploaded"
    />

    <!-- Preview Modal -->
    <BannerCustomTemplatePreviewModal
      v-if="previewTemplate"
      v-model:open="showPreviewModal"
      :template="previewTemplate"
      @use="useTemplate(previewTemplate!)"
    />
  </div>
</template>
