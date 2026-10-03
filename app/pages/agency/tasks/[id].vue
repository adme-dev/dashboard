<script setup lang="ts">
definePageMeta({})

const route = useRoute()
const taskId = computed(() => route.params.id as string)
interface Task {
  id: string
  title: string
  description: string | null
  department: { id: string, slug: string | null, name: string }
}
const task = ref<Task | null>(null)
const pending = ref(false)
const error = ref(false)
let requestVersion = 0

async function refresh() {
  const version = ++requestVersion
  pending.value = true
  error.value = false
  task.value = null
  try {
    const result = await $fetch<Task>(`/api/agency/tasks/${taskId.value}`)
    if (version === requestVersion) task.value = result
  } catch {
    if (version === requestVersion) error.value = true
  } finally {
    if (version === requestVersion) pending.value = false
  }
}
watch(taskId, refresh, { immediate: true })

const boardUrl = computed(() => task.value?.department?.id
  ? `/agency/boards/${task.value.department.slug || task.value.department.id}`
  : '/agency/boards')
const breadcrumbItems = computed(() => [
  { label: 'Tasks', to: '/agency/tasks' },
  { label: task.value?.department?.name || 'Board', to: boardUrl.value },
  { label: task.value?.title || 'Task' }
])
</script>

<template>
  <div class="h-full min-h-0 flex flex-col bg-default">
    <div class="shrink-0 px-4 py-4 sm:px-6 border-b border-default">
      <UBreadcrumb :items="breadcrumbItems" />
    </div>
    <div v-if="pending" class="flex-1 flex items-center justify-center">
      <XfLoader />
    </div>
    <div v-else-if="error" class="flex-1 flex flex-col items-center justify-center gap-3">
      <p role="alert" class="text-error">
        Unable to load task.
      </p>
      <UButton variant="outline" @click="refresh">
        Try again
      </UButton>
    </div>
    <div v-else-if="task" class="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
      <div class="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-8">
        <main class="min-w-0 space-y-8">
          <div class="space-y-4">
            <h1 class="text-2xl font-semibold">
              {{ task.title }}
            </h1>
            <UButton :to="boardUrl" icon="i-lucide-columns-3" variant="outline">
              Open board
            </UButton>
          </div>
          <section class="space-y-2">
            <h2 class="font-semibold">
              Description
            </h2>
            <p class="text-sm text-muted whitespace-pre-wrap break-words">
              {{ task.description || 'No description provided.' }}
            </p>
          </section>
          <section class="space-y-3">
            <h2 class="font-semibold">
              Subtasks
            </h2>
            <TaskSubtaskList :key="task.id" :task-id="task.id" />
          </section>
          <section class="space-y-3">
            <h2 class="font-semibold">
              Updates
            </h2>
            <TaskCommentThread :key="task.id" :task-id="task.id" />
          </section>
        </main>
        <aside class="min-w-0">
          <TaskDetailsPanel :key="task.id" :task-id="task.id" />
        </aside>
      </div>
    </div>
  </div>
</template>
