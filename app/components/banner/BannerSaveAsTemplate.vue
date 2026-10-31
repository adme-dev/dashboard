<script setup lang="ts">
import { apiErrorDescription } from '~/utils/apiError'

defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { state, saveProject } = useBannerStudio()
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string, body?: unknown }) => Promise<T>

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
  { label: 'Custom', value: 'custom' }
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
  if (saving.value) return
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
    await saveProject()
    if (state.isDirty) throw new Error('The project changed during saving. Try again to capture the latest layouts.')
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
        tags
      }
    })

    toast.add({ title: 'Template saved', description: `"${name.value}" is now available in your templates`, color: 'success' })
    close()
  } catch (err) {
    toast.add({ title: 'Error', description: apiErrorDescription(err, 'Failed to save template'), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    title="Save as template"
    description="Keep all layouts and their artwork together as a reusable design set."
    :dismissible="!saving"
    :close="!saving"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <p class="mb-4 text-sm text-muted">
        {{ state.setKeys.length }} layout{{ state.setKeys.length === 1 ? '' : 's' }} will be included.
      </p>
      <div class="grid grid-cols-1 gap-4">
        <UFormField label="Name">
          <UInput
            v-model="name"
            placeholder="e.g. Auto Sale — campaign set"
            class="w-full"
            :disabled="saving"
            autofocus
          />
        </UFormField>
        <UFormField label="Category">
          <USelectMenu
            v-model="category"
            :items="categories"
            value-key="value"
            class="w-full"
            :disabled="saving"
          />
        </UFormField>
        <UFormField label="Description">
          <UTextarea
            v-model="description"
            placeholder="When should the team use this design?"
            :rows="3"
            class="w-full"
            :disabled="saving"
          />
        </UFormField>
        <UFormField label="Tags" help="Separate tags with commas">
          <UInput
            v-model="tagsInput"
            placeholder="e.g. automotive, sale, social"
            class="w-full"
            :disabled="saving"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          variant="outline"
          color="neutral"
          :disabled="saving"
          @click="close"
        />
        <UButton
          label="Save template"
          icon="i-lucide-save"
          :loading="saving"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
