<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EmailFieldOptionsSchema } from '~~/shared/pageStudio/emailTemplateCapabilities'
import { EmailFieldBindingSchema, emailFieldVariable } from '~~/shared/pageStudio/emailTemplateFields'
import { insertEmailFieldReference, replaceEmailFieldReference } from '~~/shared/pageStudio/emailTemplateFieldEditing'
import type { EmailTemplate } from '~~/shared/pageStudio/emailTemplates'

const props = defineProps<{ template: EmailTemplate, options: unknown, formKey: string, checkpointId: string, target: string, siteId: string, apiAudience: 'portal' | 'customer', disabled?: boolean, loading?: boolean, forms: Array<{ key: string, name: string }> }>()
const emit = defineEmits<{ change: [value: EmailTemplate] }>()
const selected = ref('__none__')
const fallback = ref('')
const fallbackBase = ref('')
const message = ref('')
const source = computed(() => {
  const parsed = EmailFieldOptionsSchema.safeParse(props.options)
  return parsed.success && parsed.data.available && parsed.data.siteId === props.siteId && parsed.data.apiAudience === props.apiAudience && parsed.data.formKey === props.formKey && parsed.data.checkpointId === props.checkpointId ? parsed.data : null
})
const items = computed(() => [{ label: 'Choose a saved field', value: '__none__' }, ...(source.value?.fields.map(field => ({ label: field.label, value: field.fieldId })) ?? [])])
watch(selected, () => {
  fallbackBase.value = props.template.fieldBindings?.find(binding => binding.formKey === props.formKey && binding.fieldId === selected.value)?.fallback ?? ''
  fallback.value = fallbackBase.value
  message.value = ''
})
watch(() => props.template.fieldBindings?.find(binding => binding.formKey === props.formKey && binding.fieldId === selected.value)?.fallback ?? '', (value) => {
  if (fallback.value === fallbackBase.value) fallback.value = value
  fallbackBase.value = value
})
watch(() => [props.formKey, props.checkpointId], () => {
  selected.value = '__none__'
  fallback.value = ''
})
watch(source, () => {
  if (!source.value?.fields.some(field => field.fieldId === selected.value)) selected.value = '__none__'
})

function insert() {
  const field = source.value?.fields.find(item => item.fieldId === selected.value)
  if (props.disabled || !field || !source.value) return
  try {
    emit('change', insertEmailFieldReference(props.template, source.value.formKey, field, fallback.value, props.target))
    message.value = ''
  } catch { message.value = 'Check the insertion target, fallback and template length before inserting this field.' }
}
function label(binding: NonNullable<EmailTemplate['fieldBindings']>[number]) {
  const field = source.value?.formKey === binding.formKey ? source.value.fields.find(item => item.fieldId === binding.fieldId) : undefined
  return field?.label ?? `${props.forms.find(form => form.key === binding.formKey)?.name ?? 'Previous form'}: saved field`
}
function updateFallback(variable: string, value: string) {
  if (props.disabled) return
  try {
    const draft = JSON.parse(JSON.stringify(props.template)) as EmailTemplate
    const binding = draft.fieldBindings?.find(item => emailFieldVariable(item) === variable)
    if (!binding) return
    binding.fallback = EmailFieldBindingSchema.parse({ ...binding, fallback: value }).fallback
    emit('change', draft)
    message.value = ''
  } catch { message.value = 'Use up to 200 characters of single-line fallback text.' }
}
function replace(variable: string) {
  if (props.disabled) return
  try {
    emit('change', replaceEmailFieldReference(props.template, variable))
    message.value = ''
  } catch { message.value = 'Finish this template and use plain fallback text before replacing the reference. Undo keeps your earlier version.' }
}
</script>

<template>
  <section class="space-y-4 @container" aria-label="Form field text">
    <p class="text-sm text-muted">
      Use an answer from the saved form. Fallback text appears when no answer is available or this template is used by another form.
    </p>
    <template v-if="source">
      <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <UFormField label="Saved form field">
          <USelect
            v-model="selected"
            :items="items"
            class="w-full"
            :disabled="disabled || loading"
          />
        </UFormField>
        <UFormField label="Fallback text" help="Leave blank to omit a missing answer.">
          <UInput
            v-model="fallback"
            class="w-full"
            :maxlength="200"
            :disabled="disabled"
          />
        </UFormField>
      </div>
      <UButton
        label="Insert field"
        size="sm"
        :disabled="disabled || selected === '__none__' || loading"
        @click="insert"
      />
    </template>
    <p v-else class="text-sm text-muted">
      {{ loading ? 'Checking field availability…' : 'Field insertion is not ready for this website or saved version yet.' }}
    </p>
    <div v-for="binding in template.fieldBindings ?? []" :key="emailFieldVariable(binding)" class="space-y-2 border-t border-default pt-3">
      <UFormField :label="`${label(binding)} — fallback`">
        <UInput
          :model-value="binding.fallback"
          :maxlength="200"
          class="w-full"
          :disabled="disabled"
          @update:model-value="value => updateFallback(emailFieldVariable(binding), String(value))"
        />
      </UFormField>
      <UButton
        label="Use fallback text"
        size="xs"
        color="neutral"
        variant="outline"
        :disabled="disabled"
        @click="replace(emailFieldVariable(binding))"
      />
    </div>
    <UAlert
      v-if="message"
      :description="message"
      color="warning"
      variant="subtle"
    />
  </section>
</template>
