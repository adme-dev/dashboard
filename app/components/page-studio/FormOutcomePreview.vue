<script setup lang="ts">
import { evaluateFormOutcome, validateFormOutcomeFields, type FormOutcomeSettings } from '~~/shared/pageStudio/formOutcomes'

const props = defineProps<{ settings: FormOutcomeSettings, fields: Array<{ id: string, name: string, type: string }> }>()
const answers = ref<Record<string, string>>({})
const result = ref<ReturnType<typeof evaluateFormOutcome> | null>(null)
const error = ref('')
const inputs = computed(() => props.fields.filter(field => props.settings.rules.some(rule => rule.fieldId === field.id)))
watch(() => props.settings, () => {
  result.value = null
}, { deep: true })
watch(answers, () => {
  result.value = null
}, { deep: true })
function preview() {
  try {
    if (validateFormOutcomeFields(props.settings, props.fields).length) throw new Error('Invalid rule fields')
    result.value = evaluateFormOutcome(props.settings, answers.value)
    error.value = ''
  } catch {
    error.value = 'Complete the outcome settings before previewing.'
    result.value = null
  }
}
</script>

<template>
  <section class="@container space-y-4 rounded-lg border border-default p-4" aria-label="Outcome preview">
    <div>
      <h3 class="font-medium text-highlighted">
        Test the outcome
      </h3>
      <p class="mt-1 text-sm text-muted">
        Use example answers. This preview stays in your browser and does not submit an enquiry or open a destination.
      </p>
    </div>
    <div v-if="inputs.length" class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
      <UFormField v-for="field in inputs" :key="field.id" :label="`Example: ${field.name}`">
        <UInput v-model="answers[field.id]" placeholder="Example answer" class="w-full" />
      </UFormField>
    </div>
    <UButton
      label="Preview outcome"
      color="neutral"
      variant="outline"
      @click="preview"
    />
    <UAlert v-if="error" :title="error" color="error" />
    <div v-if="result" class="space-y-2 border-t border-default pt-4" role="status">
      <p class="text-xs text-muted">
        {{ result.matchedRule === null ? 'Default outcome' : `Rule ${result.matchedRule + 1} matched` }}
      </p>
      <p v-if="result.outcome.type === 'message'" class="whitespace-pre-wrap break-words text-sm text-highlighted">
        {{ result.outcome.message }}
      </p>
      <p v-else class="break-all text-sm text-highlighted">
        Would open {{ result.outcome.path }}
      </p>
    </div>
  </section>
</template>
