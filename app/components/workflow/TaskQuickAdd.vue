<script setup lang="ts">
import type { TaskPriority } from '~/types'

const props = defineProps<{
  departmentId: string
  statusId: string
  projectId?: string
}>()

const emit = defineEmits<{
  created: [taskId: string]
  cancel: []
}>()

const title = ref('')
const priority = ref<TaskPriority>('medium')
const assigneeId = ref<string | null>(null)
const dueDate = ref<string | null>(null)

const loading = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

// Fetch team members for quick assignment
const { data: membersData } = await useFetch('/api/agency/departments/members', {
  query: { departmentId: props.departmentId }
})

const members = computed(() => {
  const response = membersData.value as { members?: any[] } | null
  const data = response?.members || []
  return data.map(m => ({
    label: m.name,
    value: m.id
  }))
})

// Priority options
const priorityOptions: { label: string; value: TaskPriority; icon: string; color: string }[] = [
  { label: 'Urgent', value: 'urgent', icon: 'i-lucide-alert-circle', color: 'text-red-500' },
  { label: 'High', value: 'high', icon: 'i-lucide-arrow-up', color: 'text-orange-500' },
  { label: 'Medium', value: 'medium', icon: 'i-lucide-minus', color: 'text-yellow-500' },
  { label: 'Low', value: 'low', icon: 'i-lucide-arrow-down', color: 'text-blue-500' }
]

const currentPriority = computed(() => priorityOptions.find(p => p.value === priority.value))

// Submit handler
const handleSubmit = async () => {
  if (!title.value.trim()) return

  loading.value = true

  try {
    const response = await $fetch('/api/agency/tasks', {
      method: 'POST',
      body: {
        title: title.value.trim(),
        departmentId: props.departmentId,
        statusId: props.statusId,
        projectId: props.projectId,
        priority: priority.value,
        assigneeId: assigneeId.value,
        dueDate: dueDate.value,
        taskType: 'task'
      }
    })

    emit('created', (response as unknown as { id: string }).id)

    // Reset form
    title.value = ''
    priority.value = 'medium'
    assigneeId.value = null
    dueDate.value = null

    // Focus input for next task
    nextTick(() => {
      inputRef.value?.focus()
    })
  } catch (error) {
    console.error('Failed to create task:', error)
  } finally {
    loading.value = false
  }
}

// Handle keyboard shortcuts
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    emit('cancel')
  }
}

// Focus input on mount
onMounted(() => {
  inputRef.value?.focus()
})
</script>

<template>
  <div
    class="p-3 bg-white dark:bg-neutral-800 rounded-lg border-2 border-primary shadow-lg"
    @keydown="handleKeydown"
  >
    <!-- Title Input -->
    <UInput
      ref="inputRef"
      v-model="title"
      placeholder="Task title..."
      :disabled="loading"
      class="mb-3"
      @keyup.enter="handleSubmit"
    />

    <!-- Quick Options Row -->
    <div class="flex items-center gap-2 mb-3">
      <!-- Priority -->
      <UTooltip text="Priority">
        <UDropdownMenu>
          <UButton
            :icon="currentPriority?.icon"
            :class="currentPriority?.color"
            color="neutral"
            variant="ghost"
            size="xs"
          />
          <template #content>
            <UDropdownMenuItem
              v-for="option in priorityOptions"
              :key="option.value"
              @click="priority = option.value"
            >
              <template #leading>
                <UIcon :name="option.icon" :class="option.color" class="h-4 w-4" />
              </template>
              {{ option.label }}
            </UDropdownMenuItem>
          </template>
        </UDropdownMenu>
      </UTooltip>

      <!-- Assignee -->
      <UTooltip text="Assignee">
        <UDropdownMenu>
          <UButton
            icon="i-lucide-user"
            color="neutral"
            variant="ghost"
            size="xs"
            :class="{ 'text-primary': assigneeId }"
          />
          <template #content>
            <UDropdownMenuItem @click="assigneeId = null">
              <template #leading>
                <UIcon name="i-lucide-user-x" class="h-4 w-4" />
              </template>
              Unassigned
            </UDropdownMenuItem>
            <UDropdownMenuSeparator />
            <UDropdownMenuItem
              v-for="member in members"
              :key="member.value"
              @click="assigneeId = member.value"
            >
              <template #leading>
                <UAvatar :alt="member.label" size="2xs" />
              </template>
              {{ member.label }}
            </UDropdownMenuItem>
          </template>
        </UDropdownMenu>
      </UTooltip>

      <!-- Due Date -->
      <UTooltip text="Due date">
        <UPopover>
          <UButton
            icon="i-lucide-calendar"
            color="neutral"
            variant="ghost"
            size="xs"
            :class="{ 'text-primary': dueDate }"
          />
          <template #content>
            <div class="p-2">
              <UInput
                v-model="dueDate"
                type="date"
                size="sm"
              />
              <UButton
                v-if="dueDate"
                label="Clear"
                color="neutral"
                variant="ghost"
                size="xs"
                class="mt-2"
                @click="dueDate = null"
              />
            </div>
          </template>
        </UPopover>
      </UTooltip>

      <div class="flex-1" />

      <!-- Cancel -->
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        @click="emit('cancel')"
      />

      <!-- Submit -->
      <UButton
        icon="i-lucide-check"
        color="primary"
        size="xs"
        :loading="loading"
        :disabled="!title.trim()"
        @click="handleSubmit"
      />
    </div>

    <!-- Helper Text -->
    <p class="text-xs text-muted">
      Press <kbd class="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded text-xs">Enter</kbd> to create,
      <kbd class="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded text-xs">Esc</kbd> to cancel
    </p>
  </div>
</template>
