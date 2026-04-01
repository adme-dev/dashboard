<template>
  <div class="h-full flex flex-col bg-gray-50">
    <!-- Header -->
    <div class="bg-white border-b px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-semibold">Monday.com User Sync</h1>
          <p class="text-gray-500 mt-1">
            Import and sync team members from your Monday.com account
          </p>
        </div>
        <div class="flex items-center gap-3">
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-refresh-cw"
            :loading="previewLoading"
            @click="loadPreview"
          >
            Refresh Preview
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-download"
            :loading="syncLoading"
            :disabled="!canSync"
            @click="startSync"
          >
            Sync Users
          </UButton>
        </div>
      </div>
    </div>

    <!-- Stats Cards -->
    <div v-if="preview" class="grid grid-cols-4 gap-4 p-6">
      <UCard class="bg-blue-50 border-blue-200">
        <div class="text-3xl font-bold text-blue-600">{{ preview.summary.mondayTotal }}</div>
        <div class="text-sm text-blue-700">Users in Monday.com</div>
      </UCard>
      
      <UCard class="bg-green-50 border-green-200">
        <div class="text-3xl font-bold text-green-600">{{ preview.summary.willCreate }}</div>
        <div class="text-sm text-green-700">New users to create</div>
      </UCard>
      
      <UCard class="bg-amber-50 border-amber-200">
        <div class="text-3xl font-bold text-amber-600">{{ preview.summary.willUpdate }}</div>
        <div class="text-sm text-amber-700">Users to update</div>
      </UCard>
      
      <UCard class="bg-gray-50 border-gray-200">
        <div class="text-3xl font-bold text-gray-600">{{ preview.summary.exists }}</div>
        <div class="text-sm text-gray-700">Already in sync</div>
      </UCard>
    </div>

    <!-- Loading State -->
    <div v-if="previewLoading" class="flex-1 flex items-center justify-center">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
      <span class="ml-2 text-gray-600">Loading preview...</span>
    </div>

    <!-- Preview Table -->
    <div v-else-if="preview" class="flex-1 overflow-hidden px-6 pb-6">
      <UCard class="h-full flex flex-col">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">Sync Preview</h3>
            <UInput
              v-model="filterQuery"
              icon="i-lucide-search"
              placeholder="Filter users..."
              size="sm"
              class="w-64"
            />
          </div>
        </template>

        <div class="flex-1 overflow-auto">
          <table class="w-full">
            <thead class="bg-gray-50 sticky top-0">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Changes</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr
                v-for="user in filteredPreview"
                :key="user.mondayId"
                class="hover:bg-gray-50"
              >
                <td class="px-4 py-3">
                  <UBadge
                    :color="getStatusColor(user.status)"
                    variant="soft"
                    size="sm"
                  >
                    {{ formatStatus(user.status) }}
                  </UBadge>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-3">
                    <UAvatar
                      :src="user.photoUrl"
                      :alt="user.name"
                      size="sm"
                    />
                    <span class="font-medium">{{ user.name }}</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">{{ user.email }}</td>
                <td class="px-4 py-3 text-sm">
                  <div v-if="user.changes" class="space-y-1">
                    <div v-if="user.changes.name" class="text-amber-600">
                      Name: {{ user.changes.name.from }} → {{ user.changes.name.to }}
                    </div>
                    <div v-if="user.changes.avatar" class="text-blue-600">
                      Avatar updated
                    </div>
                  </div>
                  <span v-else-if="user.status === 'exists'" class="text-gray-400">No changes</span>
                  <span v-else class="text-green-600">New user</span>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="filteredPreview.length === 0" class="py-12 text-center text-gray-500">
            <UIcon name="i-lucide-search-x" class="w-12 h-12 mx-auto mb-3" />
            <p>No users match your filter</p>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Orphaned Users Warning -->
    <div v-if="preview?.orphaned?.length" class="px-6 pb-6">
      <UCard color="amber" variant="outline">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-alert-triangle" class="w-5 h-5 text-amber-600" />
            <h3 class="font-semibold text-amber-800">
              {{ preview.orphaned.length }} local users not found in Monday.com
            </h3>
          </div>
        </template>
        <p class="text-sm text-amber-700 mb-3">
          These users exist in your local database but were not found in Monday.com.
          They may have been removed from Monday or have different email addresses.
        </p>
        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="user in preview.orphaned.slice(0, 10)"
            :key="user.id"
            class="bg-amber-100 text-amber-800"
          >
            {{ user.name }}
          </UBadge>
          <span v-if="preview.orphaned.length > 10" class="text-sm text-amber-600">
            +{{ preview.orphaned.length - 10 }} more
          </span>
        </div>
      </UCard>
    </div>

    <!-- Sync Confirm Modal -->
    <UModal v-model:open="showSyncConfirm">
      <template #content>
        <div class="p-6">
          <h3 class="text-lg font-semibold mb-2">Sync users</h3>
          <p class="text-sm text-muted mb-4">Are you sure you want to sync users from Monday.com?</p>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="showSyncConfirm = false">Cancel</UButton>
            <UButton color="primary" @click="onConfirmSync">Sync</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Sync Result Modal -->
    <UModal v-model:open="showResultModal" title="Sync Complete">
      <template #body>
        <div v-if="syncResult" class="space-y-4">
          <div class="grid grid-cols-3 gap-4">
            <div class="text-center p-4 bg-green-50 rounded-lg">
              <div class="text-2xl font-bold text-green-600">{{ syncResult.summary.created }}</div>
              <div class="text-sm text-green-700">Created</div>
            </div>
            <div class="text-center p-4 bg-blue-50 rounded-lg">
              <div class="text-2xl font-bold text-blue-600">{{ syncResult.summary.updated }}</div>
              <div class="text-sm text-blue-700">Updated</div>
            </div>
            <div class="text-center p-4 bg-gray-50 rounded-lg">
              <div class="text-2xl font-bold text-gray-600">{{ syncResult.summary.skipped }}</div>
              <div class="text-sm text-gray-700">Skipped</div>
            </div>
          </div>

          <div v-if="syncResult.summary.errors > 0" class="p-4 bg-red-50 rounded-lg">
            <div class="text-red-700 font-medium">
              {{ syncResult.summary.errors }} errors occurred
            </div>
          </div>

          <div class="max-h-64 overflow-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-2 text-left">User</th>
                  <th class="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                <tr
                  v-for="user in syncResult.users.slice(0, 20)"
                  :key="user.mondayId"
                  :class="{ 'bg-red-50': user.status === 'error' }"
                >
                  <td class="px-3 py-2">{{ user.name }} ({{ user.email }})</td>
                  <td class="px-3 py-2">
                    <UBadge
                      :color="user.status === 'created' ? 'success' : user.status === 'updated' ? 'info' : 'error'"
                      variant="subtle"
                      size="xs"
                    >
                      {{ user.status }}
                    </UBadge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="primary" @click="showResultModal = false; loadPreview()">
          Done
        </UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
interface PreviewUser {
  mondayId: string
  name: string
  email: string
  photoUrl?: string
  status: 'will_create' | 'will_update' | 'exists'
  existingId?: string
  changes?: {
    name?: { from: string; to: string }
    avatar?: { from: string; to: string }
  }
}

interface PreviewData {
  preview: PreviewUser[]
  orphaned: Array<{ id: string; name: string; email: string }>
  summary: {
    mondayTotal: number
    willCreate: number
    willUpdate: number
    exists: number
    orphaned: number
  }
}

interface SyncData {
  summary: {
    total: number
    created: number
    updated: number
    skipped: number
    errors: number
  }
  users: Array<{
    mondayId: string
    name: string
    email: string
    status: 'created' | 'updated' | 'error'
    error?: string
  }>
}

definePageMeta({ middleware: ['role-admin'] })

const toast = useToast()

const preview = ref<PreviewData | null>(null)
const previewLoading = ref(false)
const syncLoading = ref(false)
const showResultModal = ref(false)
const showSyncConfirm = ref(false)
const syncResult = ref<SyncData | null>(null)
const filterQuery = ref('')

const canSync = computed(() => {
  return preview.value && (preview.value.summary.willCreate > 0 || preview.value.summary.willUpdate > 0)
})

const filteredPreview = computed(() => {
  if (!preview.value) return []
  if (!filterQuery.value) return preview.value.preview
  
  const query = filterQuery.value.toLowerCase()
  return preview.value.preview.filter(user =>
    user.name.toLowerCase().includes(query) ||
    user.email.toLowerCase().includes(query)
  )
})

const getStatusColor = (status: string): 'success' | 'warning' | 'neutral' => {
  const colors: Record<string, 'success' | 'warning' | 'neutral'> = {
    will_create: 'success',
    will_update: 'warning',
    exists: 'neutral'
  }
  return colors[status] || 'neutral'
}

const formatStatus = (status: string) => {
  const labels: Record<string, string> = {
    will_create: 'Will Create',
    will_update: 'Will Update',
    exists: 'Exists'
  }
  return labels[status] || status
}

const loadPreview = async () => {
  previewLoading.value = true
  try {
    const data = await $fetch<PreviewData>('/api/monday/users/preview')
    preview.value = data
  } catch (err) {
    console.error('Failed to load preview:', err)
  } finally {
    previewLoading.value = false
  }
}

const startSync = () => {
  showSyncConfirm.value = true
}

const onConfirmSync = async () => {
  showSyncConfirm.value = false
  syncLoading.value = true
  try {
    const result = await $fetch<SyncData>('/api/monday/users/sync', {
      method: 'POST'
    })
    syncResult.value = result
    showResultModal.value = true
  } catch (err) {
    console.error('Sync failed:', err)
    toast.add({ title: 'Sync failed', description: 'Check console for details.', color: 'error' })
  } finally {
    syncLoading.value = false
  }
}

// Load preview on mount
onMounted(loadPreview)
</script>
