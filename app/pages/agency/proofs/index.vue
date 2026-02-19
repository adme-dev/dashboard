<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Creative Proofs',
  middleware: ['auth']
})

const toast = useToast()

// Filters
const statusFilter = ref<string>('all')
const typeFilter = ref<string>('all')
const searchQuery = ref('')

// Fetch proofs
const { data: proofsData, pending, refresh } = await useFetch('/api/agency/proofs', {
  query: {
    status: computed(() => statusFilter.value === 'all' ? undefined : statusFilter.value),
    proofType: computed(() => typeFilter.value === 'all' ? undefined : typeFilter.value),
    search: searchQuery
  }
})

const proofs = computed(() => (proofsData.value as any)?.proofs || [])
const summary = computed(() => (proofsData.value as any)?.summary || { total: 0, byStatus: {} })

// Fetch projects for creating new proof
const { data: projectsData } = await useFetch('/api/agency/projects', {
  query: { limit: 100, status: 'active' }
})
const projects = computed(() => ((projectsData.value as any)?.projects || []) as any[])

// Status options
const statusOptions = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Internal Review', value: 'internal_review' },
  { label: 'Client Review', value: 'client_review' },
  { label: 'Changes Requested', value: 'changes_requested' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' }
]

// Type options
const typeOptions = [
  { label: 'All Types', value: 'all' },
  { label: 'Design', value: 'design' },
  { label: 'Video', value: 'video' },
  { label: 'Document', value: 'document' },
  { label: 'Website', value: 'website' },
  { label: 'Email', value: 'email' },
  { label: 'Social', value: 'social' },
  { label: 'Print', value: 'print' }
]

// Status badge colors
const getStatusColor = (status: string): 'neutral' | 'info' | 'warning' | 'success' | 'error' => {
  switch (status) {
    case 'draft': return 'neutral'
    case 'internal_review': return 'info'
    case 'client_review': return 'warning'
    case 'changes_requested': return 'warning'
    case 'approved': return 'success'
    case 'rejected': return 'error'
    case 'archived': return 'neutral'
    default: return 'neutral'
  }
}

const formatStatus = (status: string): string => {
  return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

// Type icons
const getTypeIcon = (type: string): string => {
  switch (type) {
    case 'design': return 'i-lucide-image'
    case 'video': return 'i-lucide-video'
    case 'document': return 'i-lucide-file-text'
    case 'website': return 'i-lucide-globe'
    case 'email': return 'i-lucide-mail'
    case 'social': return 'i-lucide-share-2'
    case 'print': return 'i-lucide-printer'
    default: return 'i-lucide-file'
  }
}

// Approval progress
const getApprovalProgress = (proof: any) => {
  if (!proof.stats.approvers) return 0
  return Math.round((proof.stats.approved / proof.stats.approvers) * 100)
}

// Format date
const formatDate = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy')
}

// New proof modal
const showNewModal = ref(false)
const newProof = ref({
  name: '',
  description: '',
  proofType: 'design',
  projectId: null as string | null,
  dueDate: '',
  isUrgent: false
})

const creatingProof = ref(false)
const createProof = async () => {
  if (!newProof.value.name || !newProof.value.projectId) {
    toast.add({ title: 'Please fill in required fields', color: 'error' })
    return
  }

  creatingProof.value = true
  try {
    const result = await $fetch('/api/agency/proofs', {
      method: 'POST',
      body: newProof.value
    }) as any

    toast.add({ title: 'Proof created', color: 'success' })
    showNewModal.value = false
    resetNewProof()
    refresh()
    navigateTo(`/agency/proofs/${result.proof.id}`)
  } catch (err: any) {
    toast.add({ title: 'Failed to create proof', description: err.data?.message || err.message, color: 'error' })
  } finally {
    creatingProof.value = false
  }
}

const resetNewProof = () => {
  newProof.value = {
    name: '',
    description: '',
    proofType: 'design',
    projectId: null,
    dueDate: '',
    isUrgent: false
  }
}
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Creative Proofs">
        <template #right>
          <UButton
            label="New Proof"
            icon="i-lucide-plus"
            color="primary"
            @click="showNewModal = true"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent>
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500">Total Proofs</p>
              <p class="text-2xl font-bold">{{ summary.total }}</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500">In Review</p>
              <p class="text-2xl font-bold text-blue-500">
                {{ (summary.byStatus?.internal_review || 0) + (summary.byStatus?.client_review || 0) }}
              </p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500">Changes Requested</p>
              <p class="text-2xl font-bold text-amber-500">{{ summary.byStatus?.changes_requested || 0 }}</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500">Approved</p>
              <p class="text-2xl font-bold text-emerald-500">{{ summary.byStatus?.approved || 0 }}</p>
            </div>
          </UCard>
          <UCard>
            <div class="text-center">
              <p class="text-sm text-gray-500">Drafts</p>
              <p class="text-2xl font-bold text-gray-400">{{ summary.byStatus?.draft || 0 }}</p>
            </div>
          </UCard>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-4 mb-6">
          <UInput
            v-model="searchQuery"
            placeholder="Search proofs..."
            icon="i-lucide-search"
            class="w-64"
          />
          <USelectMenu
            v-model="statusFilter"
            :items="statusOptions"
            placeholder="Status"
            value-key="value"
            class="w-44"
          />
          <USelectMenu
            v-model="typeFilter"
            :items="typeOptions"
            placeholder="Type"
            value-key="value"
            class="w-40"
          />
        </div>

        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
        </div>

        <!-- Proofs Grid -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <UCard
            v-for="proof in proofs"
            :key="proof.id"
            class="hover:shadow-md transition-shadow cursor-pointer"
            @click="navigateTo(`/agency/proofs/${proof.id}`)"
          >
            <div class="flex flex-col h-full">
              <!-- Header -->
              <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-2">
                  <div class="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                    <UIcon :name="getTypeIcon(proof.proofType)" class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div>
                    <h3 class="font-semibold line-clamp-1">{{ proof.name }}</h3>
                    <p class="text-xs text-gray-500">v{{ proof.version }}</p>
                  </div>
                </div>
                <UBadge v-if="proof.isUrgent" color="error" variant="subtle" size="xs">
                  Urgent
                </UBadge>
              </div>

              <!-- Project/Client -->
              <div class="mb-3">
                <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
                  {{ proof.project?.name || 'No project' }}
                </p>
                <p v-if="proof.client" class="text-xs text-gray-500">
                  {{ proof.client.name }}
                </p>
              </div>

              <!-- Status & Approval Progress -->
              <div class="flex items-center justify-between mb-3">
                <UBadge :color="getStatusColor(proof.status)" variant="subtle">
                  {{ formatStatus(proof.status) }}
                </UBadge>
                <div v-if="proof.stats.approvers > 0" class="flex items-center gap-2">
                  <div class="h-2 w-16 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      class="h-full bg-emerald-500 rounded-full transition-all"
                      :style="{ width: `${getApprovalProgress(proof)}%` }"
                    />
                  </div>
                  <span class="text-xs text-gray-500">
                    {{ proof.stats.approved }}/{{ proof.stats.approvers }}
                  </span>
                </div>
              </div>

              <!-- Stats Row -->
              <div class="grid grid-cols-3 gap-2 mt-auto pt-3 border-t border-gray-100 dark:border-gray-800">
                <div class="text-center">
                  <p class="text-lg font-semibold">{{ proof.stats.assets }}</p>
                  <p class="text-xs text-gray-500">Assets</p>
                </div>
                <div class="text-center">
                  <p class="text-lg font-semibold">{{ proof.stats.comments }}</p>
                  <p class="text-xs text-gray-500">Comments</p>
                </div>
                <div class="text-center">
                  <p class="text-lg font-semibold">{{ proof.viewCount || 0 }}</p>
                  <p class="text-xs text-gray-500">Views</p>
                </div>
              </div>

              <!-- Due Date -->
              <div v-if="proof.dueDate" class="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <span class="text-xs text-gray-500">Due {{ formatDate(proof.dueDate) }}</span>
                <span v-if="proof.stats.unresolvedComments > 0" class="text-xs text-amber-500">
                  {{ proof.stats.unresolvedComments }} unresolved
                </span>
              </div>
            </div>
          </UCard>

          <div v-if="proofs.length === 0" class="col-span-full text-center text-gray-500 py-12">
            No proofs found. Create one to get started!
          </div>
        </div>
      </UDashboardPanelContent>
    </UDashboardPanel>

    <!-- New Proof Modal -->
    <UModal v-model:open="showNewModal">
      <template #header>
        <h3 class="font-semibold">Create New Proof</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Proof Name" required>
            <UInput v-model="newProof.name" placeholder="e.g., Homepage Design v1" />
          </UFormField>

          <UFormField label="Project" required>
            <USelectMenu
              v-model="newProof.projectId"
              :items="projects.map(p => ({ label: p.name, value: p.id }))"
              placeholder="Select project"
              value-key="value"
            />
          </UFormField>

          <UFormField label="Proof Type">
            <USelectMenu
              v-model="newProof.proofType"
              :items="typeOptions.filter(t => t.value !== 'all')"
              value-key="value"
            />
          </UFormField>

          <UFormField label="Description">
            <UTextarea v-model="newProof.description" placeholder="Describe this proof..." :rows="2" />
          </UFormField>

          <UFormField label="Due Date">
            <UInput v-model="newProof.dueDate" type="date" />
          </UFormField>

          <UCheckbox v-model="newProof.isUrgent" label="Mark as urgent" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showNewModal = false" />
          <UButton
            color="primary"
            label="Create Proof"
            :loading="creatingProof"
            @click="createProof"
          />
        </div>
      </template>
    </UModal>
  </UDashboardPage>
</template>
