<script setup lang="ts">
import { today, getLocalTimeZone } from '@internationalized/date'

const props = defineProps<{ title: string, templateId?: string | null, loading?: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ submit: [options: { projectName: string, startDate: string, projectTemplateId: string | null }] }>()
const projectName = ref('')
const startDate = shallowRef(today(getLocalTimeZone()))
const selected = ref('_none')
const templates = ref<{ id: string, name: string, taskCount: number }[]>([])
const loadingTemplates = ref(false)
const loadError = ref('')
const selectedTemplate = computed(() => templates.value.find(template => template.id === selected.value))
const options = computed(() => [
  { label: 'Project only — no tasks', value: '_none' },
  ...templates.value.map(template => ({ label: `${template.name} (${template.taskCount} tasks)`, value: template.id }))
])
const canSubmit = computed(() => !!projectName.value.trim() && !!startDate.value && !props.loading && !loadingTemplates.value
  && (selected.value === '_none' || (selectedTemplate.value?.taskCount || 0) > 0))

watch(open, async (shown) => {
  if (!shown) return
  projectName.value = props.title
  startDate.value = today(getLocalTimeZone())
  selected.value = props.templateId || '_none'
  templates.value = []
  loadError.value = ''
  loadingTemplates.value = true
  try {
    const result = await $fetch<{ templates: typeof templates.value }>('/api/agency/templates?limit=100')
    templates.value = result.templates
    // A linked template may be beyond the first page or hidden by duplicate grouping.
    if (props.templateId && !templates.value.some(template => template.id === props.templateId)) {
      const linked = await $fetch<{ template: { id: string, name: string }, tasks: unknown[] }>(`/api/agency/templates/${props.templateId}`)
      templates.value.push({ ...linked.template, taskCount: linked.tasks.length })
    }
  } catch {
    loadError.value = 'Unable to load job templates. Reopen this form to retry, or explicitly choose project only.'
  } finally {
    loadingTemplates.value = false
  }
}, { immediate: true })

function submit() {
  if (!canSubmit.value) return
  emit('submit', { projectName: projectName.value.trim(), startDate: startDate.value.toString(), projectTemplateId: selected.value === '_none' ? null : selected.value })
}
</script>

<template>
  <UModal v-model:open="open" title="Create project from brief" description="Choose the work to create for this client.">
    <template #body>
      <div class="space-y-4 max-h-[65svh] overflow-y-auto">
        <UAlert v-if="loadError" color="error" :description="loadError" />
        <UFormField label="Project name" required>
          <UInput v-model="projectName" class="w-full" />
        </UFormField>
        <UFormField label="Job template" help="Instructions and prerequisites are copied into new tasks. Customer publishing approval is a separate step.">
          <USelectMenu
            v-model="selected"
            :items="options"
            value-key="value"
            :loading="loadingTemplates"
            class="w-full"
          />
        </UFormField>
        <p class="text-sm text-muted" role="status">
          <template v-if="selected === '_none'">
            Creates one project with no tasks. You can add tasks later.
          </template>
          <template v-else-if="selectedTemplate">
            Creates one project with {{ selectedTemplate.taskCount }} tasks.
          </template>
          <template v-else>
            The selected template is unavailable.
          </template>
        </p>
        <UAlert v-if="selectedTemplate && !selectedTemplate.taskCount" color="warning" description="Add tasks to this template before using it, or choose project only." />
        <UFormField label="Start date" required>
          <UPopover>
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-calendar"
              class="w-full"
              :label="startDate?.toString() || 'Choose a date'"
            />
            <template #content>
              <UCalendar v-model="startDate" class="p-2" />
            </template>
          </UPopover>
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" :disabled="loading" @click="() => { open = false }">
          Cancel
        </UButton>
        <UButton :disabled="!canSubmit" :loading="loading" @click="submit">
          Create project
        </UButton>
      </div>
    </template>
  </UModal>
</template>
