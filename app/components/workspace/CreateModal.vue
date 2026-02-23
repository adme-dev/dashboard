<template>
  <UModal v-model:open="isOpen" :ui="{ width: 'sm:max-w-lg' }">
    <template #content>
      <div class="p-6">
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-semibold">Add new workspace</h2>
          <UButton variant="ghost" color="neutral" icon="i-lucide-x" size="sm" @click="isOpen = false" />
        </div>

        <!-- Icon -->
        <div class="flex justify-center mb-6">
          <div 
            class="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold text-white"
            :style="{ backgroundColor: form.color }"
          >
            {{ form.name.charAt(0).toUpperCase() || 'W' }}
          </div>
        </div>

        <!-- Form -->
        <div class="space-y-5">
          <!-- Name -->
          <UFormField label="Workspace name">
            <UInput 
              v-model="form.name" 
              placeholder="New Workspace"
              class="w-full"
            />
          </UFormField>

          <!-- Privacy -->
          <div>
            <label class="text-sm font-medium mb-3 block">Privacy</label>
            <URadioGroup v-model="form.privacy" :items="privacyOptions">
              <template #label="{ item }">
                <div class="flex items-center gap-2">
                  <span>{{ item.label }}</span>
                  <UIcon v-if="item.value === 'closed'" name="i-lucide-shield-check" class="w-4 h-4 text-emerald-500" />
                </div>
              </template>
            </URadioGroup>
            <p class="text-sm text-gray-500 mt-2">
              {{ privacyDescription }}
            </p>
          </div>

          <!-- Template Selection (optional) -->
          <UFormField label="Start with">
            <div class="grid grid-cols-3 gap-3">
              <button
                type="button"
                class="p-3 rounded-lg border-2 text-center transition-all"
                :class="form.template === 'blank' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'"
                @click="form.template = 'blank'"
              >
                <UIcon name="i-lucide-plus" class="w-6 h-6 mx-auto mb-2" />
                <div class="text-sm font-medium">Blank</div>
              </button>
              <button
                type="button"
                class="p-3 rounded-lg border-2 text-center transition-all"
                :class="form.template === 'template' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'"
                @click="selectTemplate"
              >
                <UIcon name="i-lucide-layout-template" class="w-6 h-6 mx-auto mb-2" />
                <div class="text-sm font-medium">Template</div>
              </button>
              <button
                type="button"
                class="p-3 rounded-lg border-2 text-center transition-all"
                :class="form.template === 'ai' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'"
                @click="form.template = 'ai'"
              >
                <UIcon name="i-lucide-sparkles" class="w-6 h-6 mx-auto mb-2" />
                <div class="text-sm font-medium">AI</div>
              </button>
            </div>
          </UFormField>
        </div>

        <!-- Footer -->
        <div class="flex justify-end gap-3 mt-8">
          <UButton variant="ghost" color="neutral" @click="isOpen = false">
            Cancel
          </UButton>
          <UButton color="primary" :loading="loading" @click="createWorkspace">
            Add workspace
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <!-- Template Selector Modal -->
  <WorkspaceTemplateSelector 
    v-model:open="showTemplateSelector"
    @select="onTemplateSelect"
  />
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'created': [workspace: any]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const loading = ref(false)
const showTemplateSelector = ref(false)

const form = ref({
  name: '',
  color: '#3B82F6',
  privacy: 'open' as 'open' | 'closed',
  template: 'blank' as 'blank' | 'template' | 'ai',
  templateId: null as string | null
})

const privacyOptions = [
  { label: 'Open', value: 'open' },
  { label: 'Closed', value: 'closed' }
]

const privacyDescription = computed(() => {
  return form.value.privacy === 'open' 
    ? 'Every team member in the account can join'
    : 'Only invited members can access this workspace'
})

const selectTemplate = () => {
  form.value.template = 'template'
  showTemplateSelector.value = true
}

const onTemplateSelect = (template: any) => {
  form.value.templateId = template.id
  showTemplateSelector.value = false
}

const createWorkspace = async () => {
  if (!form.value.name.trim()) return
  
  loading.value = true
  try {
    const workspace = await $fetch('/api/agency/workspaces', {
      method: 'POST',
      body: {
        name: form.value.name,
        color: form.value.color,
        privacy: form.value.privacy,
        templateId: form.value.templateId
      }
    })
    
    emit('created', workspace)
    isOpen.value = false
    
    // Reset form
    form.value = {
      name: '',
      color: '#3B82F6',
      privacy: 'open',
      template: 'blank',
      templateId: null
    }
    
    // Navigate to new workspace
    navigateTo(`/agency/w/${workspace.slug}`)
  } finally {
    loading.value = false
  }
}
</script>
