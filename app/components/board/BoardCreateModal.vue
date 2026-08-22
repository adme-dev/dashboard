<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'sm:max-w-lg' }">
    <template #content>
      <div class="p-6">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-semibold">
            Add new board
          </h2>
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-x"
            size="sm"
            @click="isOpen = false"
          />
        </div>

        <div class="flex justify-center mb-6">
          <div
            class="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold text-white"
            :style="{ backgroundColor: form.color }"
          >
            {{ form.name.trim().charAt(0).toUpperCase() || 'B' }}
          </div>
        </div>

        <div class="space-y-5">
          <UFormField label="Board name" :error="nameError">
            <UInput
              v-model="form.name"
              placeholder="e.g. Q1 Marketing Campaign"
              class="w-full"
              autofocus
              @keydown.enter.prevent="submit"
            />
          </UFormField>

          <UFormField label="Workspace" help="Where this board lives in the sidebar.">
            <USelectMenu
              v-model="form.workspaceId"
              :items="workspaceItems"
              value-key="value"
              :loading="workspacesLoading"
              placeholder="Select a workspace"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Description" hint="Optional">
            <UTextarea
              v-model="form.description"
              placeholder="What is this board for?"
              :rows="3"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Start with">
            <div class="grid grid-cols-2 gap-3">
              <button
                type="button"
                class="p-3 rounded-lg border-2 text-center transition-all"
                :class="!form.template ? 'border-primary bg-primary/5' : 'border-default hover:border-accented'"
                @click="form.template = null"
              >
                <UIcon name="i-lucide-plus" class="w-6 h-6 mx-auto mb-2" />
                <div class="text-sm font-medium">
                  Blank
                </div>
              </button>
              <button
                type="button"
                class="p-3 rounded-lg border-2 text-center transition-all"
                :class="form.template ? 'border-primary bg-primary/5' : 'border-default hover:border-accented'"
                @click="showTemplateSelector = true"
              >
                <UIcon name="i-lucide-layout-template" class="w-6 h-6 mx-auto mb-2" />
                <div class="text-sm font-medium truncate">
                  {{ form.template?.name || 'Template' }}
                </div>
              </button>
            </div>
          </UFormField>
        </div>

        <div class="flex justify-end gap-3 mt-8">
          <UButton variant="ghost" color="neutral" @click="isOpen = false">
            Cancel
          </UButton>
          <UButton
            color="primary"
            :loading="loading"
            :disabled="!form.name.trim()"
            @click="submit"
          >
            Add board
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <WorkspaceTemplateSelector v-model="showTemplateSelector" @select="onTemplateSelect" />
</template>

<script setup lang="ts">
interface WorkspaceOption { id: string, name: string }
interface CreatedBoard { id: string, name: string, slug: string, workspaceId: string | null }

const props = defineProps<{
  modelValue: boolean
  /** Workspace to pre-select (e.g. the one currently open). */
  workspaceId?: string | null
  /** Pass the caller's already-loaded workspaces to skip the fetch. */
  workspaces?: WorkspaceOption[] | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'created': [board: CreatedBoard]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val)
})

const toast = useToast()
// Bumped after every successful create so the layout sidebar (which owns its own
// workspace list) can refetch regardless of which entry point opened this modal.
const workspacesVersion = useState<number>('agency-workspaces-version', () => 0)
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string, body?: unknown }) => Promise<T>

const NO_WORKSPACE = '__none__'

const form = ref({
  name: '',
  description: '',
  color: '#10B981',
  workspaceId: NO_WORKSPACE as string,
  template: null as { id: string, name: string } | null
})

const loading = ref(false)
const nameError = ref<string | undefined>()
const showTemplateSelector = ref(false)

const fetchedWorkspaces = ref<WorkspaceOption[]>([])
const workspacesLoading = ref(false)

const allWorkspaces = computed(() => props.workspaces?.length ? props.workspaces : fetchedWorkspaces.value)

const workspaceItems = computed(() => [
  { label: 'No workspace', value: NO_WORKSPACE },
  ...allWorkspaces.value.map(w => ({ label: w.name, value: w.id }))
])

async function ensureWorkspaces() {
  if (props.workspaces?.length || fetchedWorkspaces.value.length) return
  workspacesLoading.value = true
  try {
    const data = await apiFetch<{ workspaces?: WorkspaceOption[] }>('/api/agency/workspaces')
    fetchedWorkspaces.value = data.workspaces || []
  } catch {
    fetchedWorkspaces.value = []
  } finally {
    workspacesLoading.value = false
  }
}

watch(isOpen, (open) => {
  if (!open) return
  nameError.value = undefined
  form.value.workspaceId = props.workspaceId || NO_WORKSPACE
  ensureWorkspaces()
})

function onTemplateSelect(template: { id: string, name: string }) {
  form.value.template = { id: template.id, name: template.name }
  showTemplateSelector.value = false
}

async function submit() {
  const name = form.value.name.trim()
  if (!name) {
    nameError.value = 'Give the board a name'
    return
  }
  loading.value = true
  try {
    const board = await apiFetch<CreatedBoard>('/api/agency/boards', {
      method: 'POST',
      body: {
        name,
        description: form.value.description.trim() || undefined,
        workspaceId: form.value.workspaceId === NO_WORKSPACE ? null : form.value.workspaceId,
        color: form.value.color
      }
    })

    if (form.value.template) {
      try {
        await apiFetch(`/api/agency/boards/templates/${form.value.template.id}/apply`, {
          method: 'POST',
          body: { departmentId: board.id }
        })
      } catch {
        toast.add({ title: 'Board created without template', description: 'The template could not be applied. You can add columns manually.', color: 'warning' })
      }
    }

    workspacesVersion.value++
    emit('created', board)
    isOpen.value = false
    form.value = { name: '', description: '', color: '#10B981', workspaceId: NO_WORKSPACE, template: null }
    toast.add({ title: 'Board created', description: board.name, color: 'success' })
    await navigateTo(`/agency/boards/${board.slug}`)
  } catch (err: unknown) {
    toast.add({ title: 'Could not create board', description: (err as { data?: { statusMessage?: string }, message?: string })?.data?.statusMessage || (err as Error)?.message || 'Unknown error', color: 'error' })
  } finally {
    loading.value = false
  }
}
</script>
