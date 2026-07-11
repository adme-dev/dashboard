<script setup lang="ts">
defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { state } = useBannerStudio()
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

const name = ref('')
const category = ref('custom')
const description = ref('')
const tagsInput = ref('')
const saving = ref(false)

const categories = [
  { label: 'Automotive', value: 'automotive' },
  { label: 'Real Estate', value: 'real-estate' },
  { label: 'Retail', value: 'retail' },
  { label: 'Food', value: 'food' },
  { label: 'Finance', value: 'finance' },
  { label: 'Lifestyle', value: 'lifestyle' },
  { label: 'Minimal', value: 'minimal' },
  { label: 'Custom', value: 'custom' },
]

function resetForm() {
  name.value = ''
  category.value = 'custom'
  description.value = ''
  tagsInput.value = ''
}

function close() {
  emit('update:open', false)
  resetForm()
}

async function save() {
  if (!name.value.trim()) {
    toast.add({ title: 'Error', description: 'Template name is required', color: 'error' })
    return
  }
  if (!state.project?.id) {
    toast.add({ title: 'Error', description: 'No active project to save as template', color: 'error' })
    return
  }

  saving.value = true
  try {
    const tags = tagsInput.value
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)

    await apiFetch('/api/agency/banner-studio/templates/from-project', {
      method: 'POST',
      body: {
        projectId: state.project.id,
        name: name.value.trim(),
        category: category.value,
        description: description.value.trim() || null,
        tags,
      },
    })

    toast.add({ title: 'Template saved', description: `"${name.value}" is now available in your templates`, color: 'success' })
    close()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err?.data?.statusMessage || 'Failed to save template', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal :open="open" @update:open="emit('update:open', $event)">
    <template #content>
      <div class="p-5">
        <h3 class="text-lg font-semibold mb-4">Save as Template</h3>

        <div class="space-y-4">
          <div>
            <label class="text-sm font-medium text-(--ui-text) mb-1.5 block">Name</label>
            <UInput
              v-model="name"
              placeholder="e.g. Auto Sale Dark"
              autofocus
            />
          </div>

          <div>
            <label class="text-sm font-medium text-(--ui-text) mb-1.5 block">Category</label>
            <USelectMenu
              v-model="category"
              :items="categories"
              value-key="value"
            />
          </div>

          <div>
            <label class="text-sm font-medium text-(--ui-text) mb-1.5 block">Description</label>
            <UTextarea
              v-model="description"
              placeholder="Brief description of the template..."
              :rows="5"
            />
          </div>

          <div>
            <label class="text-sm font-medium text-(--ui-text) mb-1.5 block">Tags</label>
            <UInput
              v-model="tagsInput"
              placeholder="e.g. dark, automotive, sale (comma-separated)"
            />
            <p class="text-xs text-(--ui-text-muted) mt-1">Separate tags with commas</p>
          </div>
        </div>

        <div class="flex justify-end gap-2 mt-6">
          <UButton label="Cancel" variant="outline" size="sm" @click="close" />
          <UButton
            label="Save Template"
            icon="i-lucide-save"
            size="sm"
            :loading="saving"
            @click="save"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
