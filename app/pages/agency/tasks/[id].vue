<template>
  <div class="h-full flex flex-col bg-white">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b">
      <div class="flex items-center gap-3">
        <UButton 
          icon="i-lucide-arrow-left" 
          variant="ghost" 
          @click="$router.back()" 
        />
        <UBreadcrumb :items="breadcrumbItems" />
      </div>
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide-share" variant="ghost" />
        <UButton icon="i-lucide-more-horizontal" variant="ghost" />
        <UButton icon="i-lucide-x" variant="ghost" @click="$router.back()" />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="flex-1 flex items-center justify-center">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <UIcon name="i-lucide-alert-circle" class="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h3 class="font-medium">Failed to load task</h3>
        <UButton color="primary" class="mt-4" @click="refresh()">Try Again</UButton>
      </div>
    </div>

    <!-- Task Content -->
    <div v-else class="flex-1 flex overflow-hidden">
      <!-- Main Content -->
      <div class="flex-1 overflow-auto p-6">
        <!-- Title Section -->
        <div class="mb-6">
          <div v-if="task?.groupName" class="flex items-center gap-2 mb-2">
            <span 
              class="w-2 h-2 rounded-sm" 
              :style="{ backgroundColor: task.groupColor || '#579BFC' }" 
            />
            <span class="text-sm text-gray-500">{{ task.groupName }}</span>
          </div>
          
          <h1 class="text-2xl font-semibold">{{ task?.title }}</h1>
          
          <!-- Quick Actions -->
          <div class="flex items-center gap-2 mt-4">
            <UButton icon="i-lucide-check" color="primary" size="sm">
              Mark Complete
            </UButton>
            <UButton icon="i-lucide-user-plus" variant="outline" size="sm">
              Assign
            </UButton>
            <UButton icon="i-lucide-calendar" variant="outline" size="sm">
              Set Due Date
            </UButton>
          </div>
        </div>

        <!-- Columns/Fields -->
        <div class="grid grid-cols-2 gap-4 mb-8 p-4 bg-gray-50 rounded-lg">
          <div v-for="col in task?.columnValues" :key="col.column_id" class="flex flex-col">
            <span class="text-xs text-gray-500 uppercase">{{ col.column_title }}</span>
            <span class="font-medium">{{ col.text_value || '-' }}</span>
          </div>
        </div>

        <!-- Description -->
        <div class="mb-8">
          <h3 class="font-medium mb-2">Description</h3>
          <div class="prose max-w-none">
            {{ task?.description || 'No description provided.' }}
          </div>
        </div>

        <!-- Subitems -->
        <div v-if="task?.subitems?.length" class="mb-8">
          <h3 class="font-medium mb-2">Subitems</h3>
          <div class="space-y-2">
            <div 
              v-for="sub in task.subitems" 
              :key="sub.id"
              class="flex items-center gap-3 p-3 border rounded-lg"
            >
              <UCheckbox />
              <span>{{ sub.title }}</span>
            </div>
          </div>
        </div>

        <!-- Updates Section -->
        <div class="border-t pt-6">
          <h3 class="font-medium mb-4">Updates</h3>
          
          <!-- New Update -->
          <div class="border rounded-lg p-3 mb-6">
            <UTextarea 
              v-model="newUpdate" 
              placeholder="Write an update..." 
              :rows="3"
              variant="none"
            />
            <div class="flex justify-between items-center mt-2 pt-2 border-t">
              <div class="flex gap-1">
                <UButton icon="i-lucide-at-sign" variant="ghost" size="xs" />
                <UButton icon="i-lucide-paperclip" variant="ghost" size="xs" />
                <UButton icon="i-lucide-image" variant="ghost" size="xs" />
              </div>
              <UButton size="xs" color="primary" :disabled="!newUpdate.trim()" @click="postUpdate">
                Post Update
              </UButton>
            </div>
          </div>

          <!-- Updates List -->
          <div class="space-y-4">
            <div v-for="update in updates" :key="update.id" class="flex gap-3">
              <UAvatar :src="update.author.avatar" :alt="update.author.name" size="sm" />
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-sm">{{ update.author.name }}</span>
                  <span class="text-xs text-gray-500">{{ formatRelativeTime(update.createdAt) }}</span>
                </div>
                <p class="text-sm text-gray-700 mt-1">{{ update.content }}</p>
                <div class="flex items-center gap-4 mt-2">
                  <button class="flex items-center gap-1 text-xs text-gray-500 hover:text-primary">
                    <UIcon name="i-lucide-thumbs-up" class="w-3 h-3" />
                    {{ update.likes }}
                  </button>
                  <button class="text-xs text-gray-500 hover:text-primary">Reply</button>
                </div>
              </div>
            </div>

            <div v-if="!updates.length" class="text-center py-8 text-gray-400">
              <UIcon name="i-lucide-message-square" class="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p class="text-sm">No updates yet</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Sidebar -->
      <div class="w-80 border-l bg-gray-50 p-4 overflow-auto">
        <h3 class="font-medium mb-4">Task Info</h3>
        
        <div class="space-y-4">
          <div>
            <span class="text-xs text-gray-500">Status</span>
            <UBadge :color="getStatusColor(task?.status)" class="mt-1">
              {{ task?.status || 'Unknown' }}
            </UBadge>
          </div>
          
          <div>
            <span class="text-xs text-gray-500">Priority</span>
            <p class="font-medium capitalize">{{ task?.priority }}</p>
          </div>
          
          <div>
            <span class="text-xs text-gray-500">Due Date</span>
            <p class="font-medium">{{ task?.dueDate ? formatDate(task.dueDate) : '-' }}</p>
          </div>
          
          <div>
            <span class="text-xs text-gray-500">Assignees</span>
            <div v-if="task?.assignees?.length" class="flex flex-wrap gap-1 mt-1">
              <UAvatar 
                v-for="person in task.assignees" 
                :key="person.name"
                :alt="person.name"
                :fallback="person.name?.charAt(0)"
                size="xs"
              />
            </div>
            <p v-else class="text-gray-400">-</p>
          </div>
          
          <div>
            <span class="text-xs text-gray-500">Created</span>
            <p class="font-medium">{{ task?.createdAt ? formatDate(task.createdAt) : '-' }}</p>
          </div>
          
          <div>
            <span class="text-xs text-gray-500">Last Updated</span>
            <p class="font-medium">{{ task?.updatedAt ? formatRelativeTime(task.updatedAt) : '-' }}</p>
          </div>
        </div>

        <!-- Activity Log -->
        <div class="mt-8 pt-4 border-t">
          <h3 class="font-medium mb-4">Activity</h3>
          <div class="space-y-3">
            <div v-for="activity in activityLog" :key="activity.id" class="flex gap-2 text-sm">
              <UIcon :name="getActivityIcon(activity.type)" class="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <p class="text-gray-700">
                  <span class="font-medium">{{ activity.user }}</span>
                  {{ activity.action }}
                </p>
                <p class="text-xs text-gray-500">{{ formatRelativeTime(activity.timestamp) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

// Page meta
definePageMeta({})

// Route
const route = useRoute()
const taskId = computed(() => route.params.id as string)

// Types
interface Task {
  id: string
  title: string
  description?: string
  dueDate?: string
  priority: string
  status: string
  statusColor: string
  createdAt: string
  updatedAt: string
  boardId: string
  boardName: string
  boardSlug: string
  groupName?: string
  groupColor?: string
  assignee?: { id: string; name: string; avatar?: string } | null
  assignees?: { name: string; avatar?: string }[]
  clients?: string[]
  columnValues?: any[]
  subitems?: { id: string; title: string; status_name?: string }[]
  mondayItemId?: string
  mondayBoardId?: string
}

// Fetch task data
const { data: task, pending, error, refresh } = await useFetch<Task>(() => `/api/agency/tasks/${taskId.value}`)

// Breadcrumb
const breadcrumbItems = computed(() => [
  { label: 'Boards', icon: 'i-lucide-columns-3', to: '/agency/boards' },
  { label: task.value?.boardName || 'Board', to: `/agency/boards/${task.value?.boardSlug}` },
  { label: task.value?.title || 'Task' }
])

// Updates
const newUpdate = ref('')
const updates = ref([
  {
    id: '1',
    author: { name: 'Paul Giurin', avatar: null },
    content: 'Started working on this task. Will update progress soon.',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    likes: 2
  }
])

const activityLog = ref([
  { id: '1', type: 'created', user: 'Paul Giurin', action: 'created this task', timestamp: new Date(Date.now() - 86400000).toISOString() },
  { id: '2', type: 'assigned', user: 'Paul Giurin', action: 'assigned to Sarah Chen', timestamp: new Date(Date.now() - 43200000).toISOString() }
])

function postUpdate() {
  if (!newUpdate.value.trim()) return
  updates.value.unshift({
    id: Date.now().toString(),
    author: { name: 'You', avatar: null },
    content: newUpdate.value,
    createdAt: new Date().toISOString(),
    likes: 0
  })
  newUpdate.value = ''
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

function formatRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function getStatusColor(status?: string): 'error' | 'warning' | 'neutral' | 'success' | 'primary' {
  const colors: Record<string, 'error' | 'warning' | 'neutral' | 'success' | 'primary'> = {
    'Done': 'success',
    'In Progress': 'primary',
    'To Do': 'neutral',
    'Urgent': 'error'
  }
  return colors[status || ''] || 'neutral'
}

function getActivityIcon(type: string): string {
  const icons: Record<string, string> = {
    created: 'i-lucide-plus',
    assigned: 'i-lucide-user-check',
    updated: 'i-lucide-edit'
  }
  return icons[type] || 'i-lucide-circle'
}
</script>
