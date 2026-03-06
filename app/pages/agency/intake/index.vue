<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Intake Forms',
  middleware: ['auth']
})

const toast = useToast()

// Tabs
const activeTab = ref<'forms' | 'submissions'>('forms')

// Filters for forms
const activeFilter = ref<string>('all')
const searchQuery = ref('')

// Filters for submissions
const statusFilter = ref<string>('all')
const priorityFilter = ref<string>('all')
const formFilter = ref<string>('all')

// Fetch forms
const { data: formsData, pending: loadingForms, refresh: refreshForms } = await useFetch('/api/agency/intake/forms', {
  query: {
    active: computed(() => activeFilter.value === 'all' ? undefined : activeFilter.value)
  }
})

const forms = computed(() => {
  let result = (formsData.value as any)?.forms || []
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter((f: any) =>
      f.name.toLowerCase().includes(query) ||
      f.description?.toLowerCase().includes(query)
    )
  }
  return result
})

// Fetch submissions
const { data: submissionsData, pending: loadingSubmissions, refresh: refreshSubmissions } = await useFetch('/api/agency/intake/submissions', {
  query: {
    status: computed(() => statusFilter.value === 'all' ? undefined : statusFilter.value),
    priority: computed(() => priorityFilter.value === 'all' ? undefined : priorityFilter.value),
    formId: computed(() => formFilter.value === 'all' ? undefined : formFilter.value),
    limit: 50
  }
})

const submissions = computed(() => (submissionsData.value as any)?.submissions || [])
const statusCounts = computed(() => (submissionsData.value as any)?.statusCounts || {})
const totalSubmissions = computed(() => (submissionsData.value as any)?.total || 0)

// Options
const activeOptions = [
  { label: 'All Forms', value: 'all' },
  { label: 'Active', value: 'true' },
  { label: 'Inactive', value: 'false' }
]

const statusOptions = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Reviewing', value: 'reviewing' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Converted', value: 'converted' }
]

const priorityOptions = [
  { label: 'All Priorities', value: 'all' },
  { label: 'Urgent', value: 'urgent' },
  { label: 'High', value: 'high' },
  { label: 'Normal', value: 'normal' },
  { label: 'Low', value: 'low' }
]

const formOptions = computed(() => [
  { label: 'All Forms', value: 'all' },
  ...forms.value.map((f: any) => ({ label: f.name, value: f.id }))
])

// Status badge colors
const getStatusColor = (status: string): 'neutral' | 'info' | 'warning' | 'success' | 'error' => {
  switch (status) {
    case 'pending': return 'warning'
    case 'reviewing': return 'info'
    case 'approved': return 'success'
    case 'rejected': return 'error'
    case 'converted': return 'success'
    case 'archived': return 'neutral'
    default: return 'neutral'
  }
}

// Priority badge colors
const getPriorityColor = (priority: string): 'neutral' | 'info' | 'warning' | 'error' => {
  switch (priority) {
    case 'urgent': return 'error'
    case 'high': return 'warning'
    case 'normal': return 'info'
    case 'low': return 'neutral'
    default: return 'neutral'
  }
}

// Format date
const formatDate = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy')
}

const formatDateTime = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy h:mm a')
}

// New form modal
const showNewFormModal = ref(false)
const newForm = ref({
  name: '',
  description: '',
  slug: '',
  isActive: true,
  isPublic: true
})

const creatingForm = ref(false)
const createForm = async () => {
  if (!newForm.value.name) {
    toast.add({ title: 'Please enter a form name', color: 'error' })
    return
  }

  // Auto-generate slug if not provided
  if (!newForm.value.slug) {
    newForm.value.slug = newForm.value.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }

  creatingForm.value = true
  try {
    const result = await $fetch('/api/agency/intake/forms', {
      method: 'POST',
      body: newForm.value
    }) as any

    toast.add({ title: 'Form created', color: 'success' })
    showNewFormModal.value = false
    resetNewForm()
    refreshForms()
    navigateTo(`/agency/intake/forms/${result.form.id}`)
  } catch (err: any) {
    toast.add({ title: 'Failed to create form', description: err.data?.message || err.message, color: 'error' })
  } finally {
    creatingForm.value = false
  }
}

const resetNewForm = () => {
  newForm.value = {
    name: '',
    description: '',
    slug: '',
    isActive: true,
    isPublic: true
  }
}

// Delete form
const deletingForm = ref<string | null>(null)
const deleteForm = async (formId: string) => {
  if (!confirm('Are you sure you want to delete this form? This will also delete all submissions.')) return

  deletingForm.value = formId
  try {
    await $fetch(`/api/agency/intake/forms/${formId}`, { method: 'DELETE' })
    toast.add({ title: 'Form deleted', color: 'success' })
    refreshForms()
  } catch (err: any) {
    toast.add({ title: 'Failed to delete form', description: err.data?.message, color: 'error' })
  } finally {
    deletingForm.value = null
  }
}

// Toggle form active status
const toggleFormActive = async (form: any) => {
  try {
    await $fetch(`/api/agency/intake/forms/${form.id}`, {
      method: 'PUT',
      body: { isActive: !form.isActive }
    })
    toast.add({ title: form.isActive ? 'Form deactivated' : 'Form activated', color: 'success' })
    refreshForms()
  } catch (err: any) {
    toast.add({ title: 'Failed to update form', description: err.data?.message, color: 'error' })
  }
}

// Copy public link
const copyPublicLink = (slug: string) => {
  const link = `${window.location.origin}/intake/${slug}`
  navigator.clipboard.writeText(link)
  toast.add({ title: 'Link copied to clipboard', color: 'success' })
}
</script>

<template>
  <div class="flex-1 min-w-0 min-h-0 flex flex-col">
    <UDashboardPanel>
      <UDashboardNavbar title="Intake Forms">
        <template #right>
          <UButton
            label="New Form"
            icon="i-lucide-plus"
            color="primary"
            @click="showNewFormModal = true"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Tab Navigation -->
        <div class="flex items-center gap-4 mb-6 border-b border-gray-200 dark:border-gray-700">
          <button
            class="pb-3 px-1 text-sm font-medium transition-colors relative"
            :class="activeTab === 'forms' ? 'text-primary-600' : 'text-gray-500 hover:text-gray-700'"
            @click="activeTab = 'forms'"
          >
            Forms
            <span
              v-if="activeTab === 'forms'"
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"
            />
          </button>
          <button
            class="pb-3 px-1 text-sm font-medium transition-colors relative"
            :class="activeTab === 'submissions' ? 'text-primary-600' : 'text-gray-500 hover:text-gray-700'"
            @click="activeTab = 'submissions'"
          >
            Submissions
            <UBadge
              v-if="statusCounts.pending > 0"
              color="warning"
              variant="subtle"
              size="xs"
              class="ml-2"
            >
              {{ statusCounts.pending }}
            </UBadge>
            <span
              v-if="activeTab === 'submissions'"
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"
            />
          </button>
        </div>

        <!-- Forms Tab -->
        <div v-if="activeTab === 'forms'">
          <!-- Summary Cards -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Total Forms</p>
                <p class="text-2xl font-bold">{{ forms.length }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Active</p>
                <p class="text-2xl font-bold text-emerald-500">
                  {{ forms.filter((f: any) => f.isActive).length }}
                </p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Total Submissions</p>
                <p class="text-2xl font-bold">
                  {{ forms.reduce((acc: number, f: any) => acc + f.totalSubmissions, 0) }}
                </p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Pending Review</p>
                <p class="text-2xl font-bold text-amber-500">
                  {{ forms.reduce((acc: number, f: any) => acc + f.pendingSubmissions, 0) }}
                </p>
              </div>
            </UCard>
          </div>

          <!-- Filters -->
          <div class="flex flex-wrap items-center gap-4 mb-6">
            <UInput
              v-model="searchQuery"
              placeholder="Search forms..."
              icon="i-lucide-search"
              class="w-64"
            />
            <USelectMenu
              v-model="activeFilter"
              :items="activeOptions"
              placeholder="Status"
              value-key="value"
              class="w-36"
            />
          </div>

          <!-- Loading -->
          <div v-if="loadingForms" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
          </div>

          <!-- Forms Grid -->
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <UCard
              v-for="form in forms"
              :key="form.id"
              class="hover:shadow-md transition-shadow"
            >
              <div class="flex flex-col h-full">
                <!-- Header -->
                <div class="flex items-start justify-between mb-3">
                  <div>
                    <NuxtLink
                      :to="`/agency/intake/forms/${form.id}`"
                      class="font-semibold text-lg hover:text-primary-500"
                    >
                      {{ form.name }}
                    </NuxtLink>
                    <div class="flex items-center gap-2 mt-1">
                      <UBadge
                        :color="form.isActive ? 'success' : 'neutral'"
                        variant="subtle"
                        size="xs"
                      >
                        {{ form.isActive ? 'Active' : 'Inactive' }}
                      </UBadge>
                      <UBadge
                        v-if="form.isPublic"
                        color="info"
                        variant="subtle"
                        size="xs"
                      >
                        Public
                      </UBadge>
                    </div>
                  </div>
                  <UDropdownMenu
                    :items="[[
                      { label: 'Edit', icon: 'i-lucide-pencil', onClick: () => navigateTo(`/agency/intake/forms/${form.id}`) },
                      { label: 'Copy Link', icon: 'i-lucide-link', onClick: () => copyPublicLink(form.slug) },
                      { label: form.isActive ? 'Deactivate' : 'Activate', icon: form.isActive ? 'i-lucide-pause' : 'i-lucide-play', onClick: () => toggleFormActive(form) }
                    ], [
                      { label: 'Delete', icon: 'i-lucide-trash', color: 'error', onClick: () => deleteForm(form.id) }
                    ]]"
                  >
                    <UButton variant="ghost" size="sm" icon="i-lucide-more-vertical" />
                  </UDropdownMenu>
                </div>

                <!-- Description -->
                <p v-if="form.description" class="text-sm text-gray-500 mb-3 line-clamp-2">
                  {{ form.description }}
                </p>

                <!-- Stats -->
                <div class="grid grid-cols-3 gap-3 mt-auto pt-3 border-t border-gray-100 dark:border-gray-800">
                  <div class="text-center">
                    <p class="text-lg font-semibold">{{ form.fieldCount }}</p>
                    <p class="text-xs text-gray-500">Fields</p>
                  </div>
                  <div class="text-center">
                    <p class="text-lg font-semibold">{{ form.totalSubmissions }}</p>
                    <p class="text-xs text-gray-500">Submissions</p>
                  </div>
                  <div class="text-center">
                    <p class="text-lg font-semibold text-amber-500">{{ form.pendingSubmissions }}</p>
                    <p class="text-xs text-gray-500">Pending</p>
                  </div>
                </div>

                <!-- Department & Last Submission -->
                <div class="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400">
                  <span v-if="form.department">{{ form.department.name }}</span>
                  <span v-else>No department</span>
                  <span v-if="form.lastSubmissionAt">Last: {{ formatDate(form.lastSubmissionAt) }}</span>
                </div>
              </div>
            </UCard>

            <div v-if="forms.length === 0" class="col-span-full text-center py-12 text-gray-500">
              <UIcon name="i-lucide-clipboard-list" class="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No intake forms found. Create one to start collecting client requests!</p>
            </div>
          </div>
        </div>

        <!-- Submissions Tab -->
        <div v-if="activeTab === 'submissions'">
          <!-- Summary Cards -->
          <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Total</p>
                <p class="text-2xl font-bold">{{ totalSubmissions }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Pending</p>
                <p class="text-2xl font-bold text-amber-500">{{ statusCounts.pending || 0 }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Reviewing</p>
                <p class="text-2xl font-bold text-blue-500">{{ statusCounts.reviewing || 0 }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Approved</p>
                <p class="text-2xl font-bold text-emerald-500">{{ statusCounts.approved || 0 }}</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Converted</p>
                <p class="text-2xl font-bold text-purple-500">{{ statusCounts.converted || 0 }}</p>
              </div>
            </UCard>
          </div>

          <!-- Filters -->
          <div class="flex flex-wrap items-center gap-4 mb-6">
            <USelectMenu
              v-model="formFilter"
              :items="formOptions"
              placeholder="Form"
              value-key="value"
              class="w-48"
            />
            <USelectMenu
              v-model="statusFilter"
              :items="statusOptions"
              placeholder="Status"
              value-key="value"
              class="w-40"
            />
            <USelectMenu
              v-model="priorityFilter"
              :items="priorityOptions"
              placeholder="Priority"
              value-key="value"
              class="w-40"
            />
          </div>

          <!-- Loading -->
          <div v-if="loadingSubmissions" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
          </div>

          <!-- Submissions List -->
          <div v-else class="space-y-3">
            <UCard
              v-for="submission in submissions"
              :key="submission.id"
              class="hover:shadow-md transition-shadow cursor-pointer"
              @click="navigateTo(`/agency/intake/submissions/${submission.id}`)"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                  <!-- Priority indicator -->
                  <div
                    class="w-1 h-12 rounded-full"
                    :class="{
                      'bg-red-500': submission.priority === 'urgent',
                      'bg-amber-500': submission.priority === 'high',
                      'bg-blue-500': submission.priority === 'normal',
                      'bg-gray-300': submission.priority === 'low'
                    }"
                  />

                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-semibold">{{ submission.submittedBy.name || submission.submittedBy.email }}</span>
                      <UBadge :color="getStatusColor(submission.status)" variant="subtle" size="xs">
                        {{ submission.status }}
                      </UBadge>
                      <UBadge :color="getPriorityColor(submission.priority)" variant="subtle" size="xs">
                        {{ submission.priority }}
                      </UBadge>
                    </div>
                    <p class="text-sm text-gray-500">
                      {{ submission.submittedBy.company || submission.submittedBy.email }}
                      <span class="mx-1">·</span>
                      {{ submission.formName }}
                    </p>
                  </div>
                </div>

                <div class="flex items-center gap-6">
                  <!-- Client -->
                  <div v-if="submission.client" class="text-right">
                    <p class="text-xs text-gray-400">Client</p>
                    <p class="text-sm font-medium">{{ submission.client.name }}</p>
                  </div>

                  <!-- Assigned -->
                  <div v-if="submission.assignedTo" class="text-right">
                    <p class="text-xs text-gray-400">Assigned</p>
                    <p class="text-sm font-medium">{{ submission.assignedTo.name }}</p>
                  </div>

                  <!-- Attachments -->
                  <div v-if="submission.attachmentCount > 0" class="flex items-center gap-1 text-gray-500">
                    <UIcon name="i-lucide-paperclip" class="w-4 h-4" />
                    <span class="text-sm">{{ submission.attachmentCount }}</span>
                  </div>

                  <!-- Date -->
                  <div class="text-right min-w-[100px]">
                    <p class="text-xs text-gray-400">Submitted</p>
                    <p class="text-sm">{{ formatDateTime(submission.createdAt) }}</p>
                  </div>

                  <!-- Converted -->
                  <div v-if="submission.convertedProject">
                    <UBadge color="success" variant="subtle" size="xs">
                      <UIcon name="i-lucide-check" class="w-3 h-3 mr-1" />
                      Converted
                    </UBadge>
                  </div>
                </div>
              </div>
            </UCard>

            <div v-if="submissions.length === 0" class="text-center py-12 text-gray-500">
              <UIcon name="i-lucide-inbox" class="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No submissions found.</p>
            </div>
          </div>
        </div>
      </div>
    </UDashboardPanel>

    <!-- New Form Slideover -->
    <USlideover v-model:open="showNewFormModal">
      <template #header>
        <h3 class="text-[16px] font-[500]">Create Intake Form</h3>
      </template>
      <template #body>
        <form @submit.prevent="createForm" class="px-1">
          <!-- Section: Details -->
          <fieldset class="space-y-5 pb-6 mb-6 border-b border-[var(--ui-border)]">
            <legend class="text-[11px] font-medium text-[var(--ui-text-muted)] uppercase tracking-widest mb-1">Details</legend>

            <div>
              <label class="block text-[13px] font-medium mb-2">Form Name <span class="text-red-500">*</span></label>
              <UInput v-model="newForm.name" placeholder="e.g., Project Request Form" size="xl" class="w-full" />
            </div>

            <div>
              <label class="block text-[13px] font-medium mb-2">URL Slug</label>
              <UInput v-model="newForm.slug" placeholder="Auto-generated from name" size="xl" class="w-full" />
              <p class="text-[12px] text-[var(--ui-text-muted)] mt-1.5">Will be accessible at /intake/{{ newForm.slug || 'your-slug' }}</p>
            </div>

            <div>
              <label class="block text-[13px] font-medium mb-2">Description</label>
              <UTextarea v-model="newForm.description" placeholder="Describe what this form is for..." :rows="4" size="xl" class="w-full" />
            </div>
          </fieldset>

          <!-- Section: Settings -->
          <fieldset class="space-y-4 pb-4">
            <legend class="text-[11px] font-medium text-[var(--ui-text-muted)] uppercase tracking-widest mb-1">Settings</legend>

            <div class="flex items-center gap-3">
              <UCheckbox v-model="newForm.isActive" />
              <label class="text-[13px] font-medium cursor-pointer" @click="newForm.isActive = !newForm.isActive">Active</label>
              <p class="text-[12px] text-[var(--ui-text-muted)]">Form accepts new submissions.</p>
            </div>

            <div class="flex items-center gap-3">
              <UCheckbox v-model="newForm.isPublic" />
              <label class="text-[13px] font-medium cursor-pointer" @click="newForm.isPublic = !newForm.isPublic">Public</label>
              <p class="text-[12px] text-[var(--ui-text-muted)]">No login required to submit.</p>
            </div>
          </fieldset>
        </form>
      </template>
      <template #footer>
        <div class="flex items-center justify-end gap-3">
          <UButton variant="ghost" color="neutral" label="Cancel" size="lg" @click="showNewFormModal = false" />
          <UButton
            color="primary"
            label="Create Form"
            size="lg"
            :loading="creatingForm"
            @click="createForm"
          />
        </div>
      </template>
    </USlideover>
  </div>
</template>
