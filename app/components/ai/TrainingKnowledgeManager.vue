<script setup lang="ts">
import type { AiTrainingKnowledge, TrainingKnowledgeType } from '~/types'

const toast = useToast()

// Filters
const selectedType = ref<string>('all')
const selectedCategory = ref('')
const approvedFilter = ref<string>('all')

// Pagination
const page = ref(1)
const pageSize = 20

// Data fetching
const queryType = computed(() => selectedType.value === 'all' ? '' : selectedType.value)
const queryApproved = computed(() => approvedFilter.value === 'all' ? '' : approvedFilter.value)

const { data, pending, refresh } = useFetch('/api/agency/ai/training/knowledge', {
  query: {
    type: queryType,
    category: selectedCategory,
    approved: queryApproved,
    page,
    limit: pageSize,
  },
})

const entries = computed(() => ((data.value as any)?.items || []) as AiTrainingKnowledge[])
const total = computed(() => (data.value as any)?.total || 0)
const totalPages = computed(() => Math.ceil(total.value / pageSize))

// Reset page when filters change
watch([selectedType, selectedCategory, approvedFilter], () => {
  page.value = 1
})

// Table columns
const columns = [
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'knowledgeType', header: 'Type' },
  { accessorKey: 'category', header: 'Category' },
  { accessorKey: 'isApproved', header: 'Approved' },
  { accessorKey: 'createdAt', header: 'Created' },
  { accessorKey: 'actions', header: '' },
]

const typeOptions = [
  { label: 'All Types', value: 'all' },
  { label: 'SOP', value: 'sop' },
  { label: 'Client Context', value: 'client_context' },
  { label: 'Q&A Pair', value: 'qa_pair' },
  { label: 'Workflow', value: 'workflow' },
  { label: 'Glossary', value: 'glossary' },
]

const typeFormOptions = [
  { label: 'SOP', value: 'sop' },
  { label: 'Client Context', value: 'client_context' },
  { label: 'Q&A Pair', value: 'qa_pair' },
  { label: 'Workflow', value: 'workflow' },
  { label: 'Glossary', value: 'glossary' },
]

const approvedOptions = [
  { label: 'All', value: 'all' },
  { label: 'Approved', value: 'true' },
  { label: 'Pending', value: 'false' },
]

const typeBadgeColor = (type: string): 'primary' | 'success' | 'warning' | 'error' | 'neutral' => {
  const colors: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
    sop: 'primary',
    client_context: 'warning',
    qa_pair: 'success',
    workflow: 'neutral',
    glossary: 'neutral',
  }
  return colors[type] || 'neutral'
}

const typeLabel = (type: string) => {
  const labels: Record<string, string> = {
    sop: 'SOP',
    client_context: 'Client Context',
    qa_pair: 'Q&A Pair',
    workflow: 'Workflow',
    glossary: 'Glossary',
  }
  return labels[type] || type
}

// Add Entry Modal
const showAddModal = ref(false)
const saving = ref(false)
const editingEntry = ref<AiTrainingKnowledge | null>(null)
const form = ref({
  knowledgeType: 'sop' as TrainingKnowledgeType,
  title: '',
  content: '',
  answer: '',
  category: '',
  tags: '',
})

const resetForm = () => {
  form.value = {
    knowledgeType: 'sop',
    title: '',
    content: '',
    answer: '',
    category: '',
    tags: '',
  }
  editingEntry.value = null
}

const openAddModal = () => {
  resetForm()
  showAddModal.value = true
}

const openEditModal = (entry: AiTrainingKnowledge) => {
  editingEntry.value = entry
  form.value = {
    knowledgeType: entry.knowledgeType,
    title: entry.title,
    content: entry.content,
    answer: entry.answer || '',
    category: entry.category || '',
    tags: (entry.tags || []).join(', '),
  }
  showAddModal.value = true
}

const saveEntry = async () => {
  if (!form.value.title || !form.value.content) {
    toast.add({ title: 'Title and content are required', color: 'error' })
    return
  }
  saving.value = true
  try {
    const body = {
      ...form.value,
      tags: form.value.tags ? form.value.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    }
    if (editingEntry.value) {
      await $fetch(`/api/agency/ai/training/knowledge/${editingEntry.value.id}`, {
        method: 'PUT',
        body,
      })
      toast.add({ title: 'Knowledge entry updated', color: 'success' })
    } else {
      await $fetch('/api/agency/ai/training/knowledge', {
        method: 'POST',
        body,
      })
      toast.add({ title: 'Knowledge entry created', color: 'success' })
    }
    showAddModal.value = false
    refresh()
  } catch (error: any) {
    toast.add({
      title: 'Failed to save entry',
      description: error.data?.statusMessage || error.message,
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

// Approve
const approveEntry = async (entry: AiTrainingKnowledge) => {
  try {
    await $fetch(`/api/agency/ai/training/knowledge/${entry.id}/approve`, { method: 'PATCH' })
    toast.add({ title: 'Entry approved', color: 'success' })
    refresh()
  } catch (error: any) {
    toast.add({ title: 'Failed to approve', description: error.data?.statusMessage || error.message, color: 'error' })
  }
}

// Delete
const showDeleteModal = ref(false)
const deletingEntry = ref<AiTrainingKnowledge | null>(null)
const deleting = ref(false)

const confirmDelete = (entry: AiTrainingKnowledge) => {
  deletingEntry.value = entry
  showDeleteModal.value = true
}

const deleteEntry = async () => {
  if (!deletingEntry.value) return
  deleting.value = true
  try {
    await $fetch(`/api/agency/ai/training/knowledge/${deletingEntry.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Entry deleted', color: 'success' })
    showDeleteModal.value = false
    refresh()
  } catch (error: any) {
    toast.add({ title: 'Failed to delete', description: error.data?.statusMessage || error.message, color: 'error' })
  } finally {
    deleting.value = false
  }
}

// Bulk Upload Modal
const showUploadModal = ref(false)
const uploadType = ref<TrainingKnowledgeType>('sop')
const uploadFormat = ref('csv')
const uploadFile = ref<File | null>(null)
const uploading = ref(false)

const onFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  uploadFile.value = target.files?.[0] || null
}

const submitUpload = async () => {
  if (!uploadFile.value) {
    toast.add({ title: 'Please select a file', color: 'error' })
    return
  }
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', uploadFile.value)
    formData.append('knowledgeType', uploadType.value)
    formData.append('format', uploadFormat.value)
    await $fetch('/api/agency/ai/training/knowledge/upload', {
      method: 'POST',
      body: formData,
    })
    toast.add({ title: 'Bulk upload completed', color: 'success' })
    showUploadModal.value = false
    uploadFile.value = null
    refresh()
  } catch (error: any) {
    toast.add({
      title: 'Upload failed',
      description: error.data?.statusMessage || error.message,
      color: 'error',
    })
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Filter Bar -->
    <div class="flex flex-wrap items-center gap-3">
      <USelectMenu
        v-model="selectedType"
        :items="typeOptions"
        placeholder="Type"
        value-key="value"
        class="w-40"
      />
      <UInput
        v-model="selectedCategory"
        placeholder="Filter by category..."
        icon="i-lucide-search"
        class="w-48"
      />
      <USelectMenu
        v-model="approvedFilter"
        :items="approvedOptions"
        placeholder="Approval"
        value-key="value"
        class="w-32"
      />
      <div class="flex-1" />
      <UButton
        label="Bulk Upload"
        icon="i-lucide-upload"
        variant="soft"
        color="neutral"
        @click="showUploadModal = true"
      />
      <UButton
        label="Add Entry"
        icon="i-lucide-plus"
        color="primary"
        @click="openAddModal"
      />
    </div>

    <!-- Loading -->
    <div v-if="pending" class="flex items-center justify-center py-12">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
    </div>

    <!-- Table -->
    <UCard v-else>
      <UTable :data="entries" :columns="columns">
        <template #title-cell="{ row }">
          <div class="max-w-xs">
            <p class="font-medium truncate">{{ row.original.title }}</p>
          </div>
        </template>

        <template #knowledgeType-cell="{ row }">
          <UBadge :color="typeBadgeColor(row.original.knowledgeType)" variant="subtle">
            {{ typeLabel(row.original.knowledgeType) }}
          </UBadge>
        </template>

        <template #category-cell="{ row }">
          <span class="text-[var(--ui-text-muted)]">{{ row.original.category || '—' }}</span>
        </template>

        <template #isApproved-cell="{ row }">
          <UBadge
            :color="row.original.isApproved ? 'success' : 'neutral'"
            variant="subtle"
          >
            {{ row.original.isApproved ? 'Approved' : 'Pending' }}
          </UBadge>
        </template>

        <template #createdAt-cell="{ row }">
          <span class="text-sm text-[var(--ui-text-muted)]">
            {{ new Date(row.original.createdAt).toLocaleDateString() }}
          </span>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center gap-1">
            <UButton
              v-if="!row.original.isApproved"
              icon="i-lucide-check"
              variant="ghost"
              color="success"
              size="xs"
              @click="approveEntry(row.original)"
            />
            <UButton
              icon="i-lucide-edit"
              variant="ghost"
              color="neutral"
              size="xs"
              @click="openEditModal(row.original)"
            />
            <UButton
              icon="i-lucide-trash-2"
              variant="ghost"
              color="error"
              size="xs"
              @click="confirmDelete(row.original)"
            />
          </div>
        </template>
      </UTable>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex justify-center pt-4 border-t border-[var(--ui-border)]">
        <UPagination v-model="page" :total="total" :items-per-page="pageSize" />
      </div>
    </UCard>

    <!-- Add/Edit Modal -->
    <UModal v-model:open="showAddModal">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold text-[var(--ui-text-highlighted)]">
            {{ editingEntry ? 'Edit Knowledge Entry' : 'Add Knowledge Entry' }}
          </h3>

          <div>
            <label class="block text-sm font-medium text-[var(--ui-text)] mb-1.5">Type</label>
            <USelectMenu
              v-model="form.knowledgeType"
              :items="typeFormOptions"
              value-key="value"
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-[var(--ui-text)] mb-1.5">Title</label>
            <UInput v-model="form.title" placeholder="Entry title" class="w-full" />
          </div>

          <div>
            <label class="block text-sm font-medium text-[var(--ui-text)] mb-1.5">Content</label>
            <UTextarea v-model="form.content" placeholder="Knowledge content..." :rows="6" class="w-full" />
          </div>

          <div v-if="form.knowledgeType === 'qa_pair'">
            <label class="block text-sm font-medium text-[var(--ui-text)] mb-1.5">Answer</label>
            <UTextarea v-model="form.answer" placeholder="Answer for Q&A pair..." :rows="5" class="w-full" />
          </div>

          <div>
            <label class="block text-sm font-medium text-[var(--ui-text)] mb-1.5">Category</label>
            <UInput v-model="form.category" placeholder="e.g. onboarding, billing" class="w-full" />
          </div>

          <div>
            <label class="block text-sm font-medium text-[var(--ui-text)] mb-1.5">Tags</label>
            <UInput v-model="form.tags" placeholder="Comma-separated tags" class="w-full" />
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <UButton label="Cancel" variant="ghost" color="neutral" @click="showAddModal = false" />
            <UButton
              :label="editingEntry ? 'Update' : 'Create'"
              color="primary"
              :loading="saving"
              @click="saveEntry"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Bulk Upload Modal -->
    <UModal v-model:open="showUploadModal">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold text-[var(--ui-text-highlighted)]">Bulk Upload Knowledge</h3>

          <div>
            <label class="block text-sm font-medium text-[var(--ui-text)] mb-1.5">Type</label>
            <USelectMenu
              v-model="uploadType"
              :items="typeFormOptions"
              value-key="value"
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-[var(--ui-text)] mb-1.5">Format</label>
            <USelectMenu
              v-model="uploadFormat"
              :items="[{ label: 'CSV', value: 'csv' }, { label: 'JSONL', value: 'jsonl' }]"
              value-key="value"
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-[var(--ui-text)] mb-1.5">File</label>
            <input
              type="file"
              accept=".csv,.jsonl"
              class="block w-full text-sm text-[var(--ui-text-muted)] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900/20 dark:file:text-primary-400"
              @change="onFileChange"
            >
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <UButton label="Cancel" variant="ghost" color="neutral" @click="showUploadModal = false" />
            <UButton
              label="Upload"
              icon="i-lucide-upload"
              color="primary"
              :loading="uploading"
              @click="submitUpload"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold text-[var(--ui-text-highlighted)]">Delete Entry</h3>
          <p class="text-[var(--ui-text-muted)]">
            Are you sure you want to delete "{{ deletingEntry?.title }}"? This action cannot be undone.
          </p>
          <div class="flex justify-end gap-2 pt-2">
            <UButton label="Cancel" variant="ghost" color="neutral" @click="showDeleteModal = false" />
            <UButton
              label="Delete"
              color="error"
              :loading="deleting"
              @click="deleteEntry"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
