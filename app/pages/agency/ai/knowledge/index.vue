<script setup lang="ts">
import type { KnowledgeCategory } from '~/types'

definePageMeta({ layout: 'agency' })

const toast = useToast()
const {
  articles, total, loading, searchQuery, activeCategory, offset, limit,
  fetchArticles, searchArticles, createArticle, updateArticle, deleteArticle,
  setCategory, nextPage, prevPage,
} = useAiKnowledge()

// Modal state
const showCreateModal = ref(false)
const showEditModal = ref(false)
const showDeleteConfirm = ref(false)
const editingArticle = ref<any>(null)
const deletingArticleId = ref<string | null>(null)

// Form state
const form = reactive({
  title: '',
  content: '',
  category: '' as string,
  tags: '',
})

function resetForm() {
  form.title = ''
  form.content = ''
  form.category = ''
  form.tags = ''
}

function openCreate() {
  resetForm()
  showCreateModal.value = true
}

function openEdit(article: any) {
  editingArticle.value = article
  form.title = article.title
  form.content = article.content
  form.category = article.category || ''
  form.tags = (article.tags || []).join(', ')
  showEditModal.value = true
}

function confirmDelete(id: string) {
  deletingArticleId.value = id
  showDeleteConfirm.value = true
}

async function handleCreate() {
  try {
    await createArticle({
      title: form.title,
      content: form.content,
      category: form.category || undefined,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    })
    showCreateModal.value = false
    toast.add({ title: 'Article created', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to create article', color: 'error' })
  }
}

async function handleUpdate() {
  if (!editingArticle.value) return
  try {
    await updateArticle(editingArticle.value.id, {
      title: form.title,
      content: form.content,
      category: form.category || undefined,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    })
    showEditModal.value = false
    toast.add({ title: 'Article updated', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to update article', color: 'error' })
  }
}

async function handleDelete() {
  if (!deletingArticleId.value) return
  try {
    await deleteArticle(deletingArticleId.value)
    showDeleteConfirm.value = false
    deletingArticleId.value = null
    toast.add({ title: 'Article deleted', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to delete article', color: 'error' })
  }
}

// Search debounce
let searchTimeout: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    if (searchQuery.value.trim()) {
      searchArticles(searchQuery.value)
    } else {
      fetchArticles()
    }
  }, 300)
}

const categories: { label: string; value: KnowledgeCategory | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'SOP', value: 'sop' },
  { label: 'Process', value: 'process' },
  { label: 'FAQ', value: 'faq' },
  { label: 'Client Preference', value: 'client_preference' },
  { label: 'Best Practice', value: 'best_practice' },
]

const categoryOptions = [
  { label: 'No category', value: '' },
  { label: 'SOP', value: 'sop' },
  { label: 'Process', value: 'process' },
  { label: 'FAQ', value: 'faq' },
  { label: 'Client Preference', value: 'client_preference' },
  { label: 'Best Practice', value: 'best_practice' },
]

const categoryColors: Record<string, string> = {
  sop: 'info',
  process: 'primary',
  faq: 'success',
  client_preference: 'warning',
  best_practice: 'secondary',
}

const hasMore = computed(() => offset.value + limit < total.value)
const hasPrev = computed(() => offset.value > 0)

onMounted(() => {
  fetchArticles()
})
</script>

<template>
  <div class="p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Knowledge Base</h1>
        <p class="text-sm text-muted mt-1">SOPs, processes, FAQs, and best practices for the AI assistant</p>
      </div>
      <UButton icon="i-lucide-plus" label="New Article" @click="openCreate" />
    </div>

    <!-- Search + Category Tabs -->
    <div class="flex flex-col sm:flex-row gap-4 mb-6">
      <UInput
        v-model="searchQuery"
        icon="i-lucide-search"
        placeholder="Search articles..."
        class="flex-1"
        @input="onSearchInput"
      />
    </div>

    <div class="flex gap-2 mb-6 flex-wrap">
      <UButton
        v-for="cat in categories"
        :key="cat.value"
        :variant="activeCategory === cat.value ? 'solid' : 'ghost'"
        :color="activeCategory === cat.value ? 'primary' : 'neutral'"
        size="sm"
        :label="cat.label"
        @click="setCategory(cat.value)"
      />
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-muted" />
    </div>

    <!-- Articles Grid -->
    <div v-else-if="articles.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="article in articles"
        :key="article.id"
        class="border border-default rounded-lg p-4 hover:bg-elevated/50 transition-colors cursor-pointer"
        @click="openEdit(article)"
      >
        <div class="flex items-start justify-between mb-2">
          <h3 class="font-semibold text-sm line-clamp-2">{{ article.title }}</h3>
          <UDropdownMenu
            :items="[
              [
                { label: 'Edit', icon: 'i-lucide-pencil', click: () => openEdit(article) },
                { label: 'Delete', icon: 'i-lucide-trash-2', click: () => confirmDelete(article.id) },
              ],
            ]"
            @click.stop
          >
            <UButton
              icon="i-lucide-more-horizontal"
              variant="ghost"
              color="neutral"
              size="xs"
              @click.stop
            />
          </UDropdownMenu>
        </div>

        <p class="text-xs text-muted line-clamp-3 mb-3">{{ article.content }}</p>

        <div class="flex items-center gap-2 flex-wrap">
          <UBadge
            v-if="article.category"
            :color="(categoryColors[article.category] as any) || 'neutral'"
            variant="subtle"
            size="xs"
          >
            {{ article.category?.replace('_', ' ') }}
          </UBadge>
          <UBadge
            v-for="tag in (article.tags || []).slice(0, 3)"
            :key="tag"
            color="neutral"
            variant="subtle"
            size="xs"
          >
            {{ tag }}
          </UBadge>
        </div>

        <div class="flex items-center gap-3 mt-3 text-xs text-muted">
          <span v-if="(article as any).authorName">{{ (article as any).authorName }}</span>
          <span>{{ article.viewCount }} views</span>
          <span>{{ new Date(article.updatedAt).toLocaleDateString() }}</span>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-12 text-muted">
      <UIcon name="i-lucide-book-open" class="w-12 h-12 mx-auto mb-3 opacity-50" />
      <p>No articles found</p>
      <p class="text-sm mt-1">Create your first knowledge article to help the AI assistant.</p>
    </div>

    <!-- Pagination -->
    <div v-if="total > limit" class="flex items-center justify-between mt-6">
      <span class="text-sm text-muted">{{ offset + 1 }}-{{ Math.min(offset + limit, total) }} of {{ total }}</span>
      <div class="flex gap-2">
        <UButton
          icon="i-lucide-chevron-left"
          variant="ghost"
          size="sm"
          :disabled="!hasPrev"
          @click="prevPage"
        />
        <UButton
          icon="i-lucide-chevron-right"
          variant="ghost"
          size="sm"
          :disabled="!hasMore"
          @click="nextPage"
        />
      </div>
    </div>

    <!-- Create Modal -->
    <UModal v-model:open="showCreateModal">
      <template #content>
        <div class="p-6">
          <h2 class="text-lg font-semibold mb-4">New Article</h2>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">Title</label>
              <UInput v-model="form.title" placeholder="Article title..." />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Content</label>
              <UTextarea v-model="form.content" placeholder="Write the article content..." :rows="8" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Category</label>
              <USelect v-model="form.category" :items="categoryOptions" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Tags</label>
              <UInput v-model="form.tags" placeholder="Comma-separated tags..." />
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <UButton variant="ghost" label="Cancel" @click="showCreateModal = false" />
            <UButton label="Create" :disabled="!form.title.trim() || !form.content.trim()" @click="handleCreate" />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Edit Modal -->
    <UModal v-model:open="showEditModal">
      <template #content>
        <div class="p-6">
          <h2 class="text-lg font-semibold mb-4">Edit Article</h2>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">Title</label>
              <UInput v-model="form.title" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Content</label>
              <UTextarea v-model="form.content" :rows="8" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Category</label>
              <USelect v-model="form.category" :items="categoryOptions" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Tags</label>
              <UInput v-model="form.tags" />
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <UButton variant="ghost" label="Cancel" @click="showEditModal = false" />
            <UButton label="Save" :disabled="!form.title.trim() || !form.content.trim()" @click="handleUpdate" />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Delete Confirmation -->
    <UModal v-model:open="showDeleteConfirm">
      <template #content>
        <div class="p-6">
          <h2 class="text-lg font-semibold mb-2">Delete Article</h2>
          <p class="text-muted mb-6">Are you sure you want to delete this article? This action cannot be undone.</p>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" label="Cancel" @click="showDeleteConfirm = false" />
            <UButton color="error" label="Delete" @click="handleDelete" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
