<script setup lang="ts">
import { defaultFormOutcomes, FormOutcomeSettingsSchema, validateFormOutcomeFields } from '~~/shared/pageStudio/formOutcomes'
import type { FormSettingsState } from '~~/shared/pageStudio/formSettings'

const props = defineProps<{ siteId: string, pageId: string, formId: string, checkpointId: string, fields: Array<{ id: string, name: string, type: string }>, pages: Array<{ title: string, route: string }> }>()
const emit = defineEmits<{ dirty: [value: boolean], reload: [] }>()
const url = `/api/portal/page-studio/sites/${encodeURIComponent(props.siteId)}/pages/${encodeURIComponent(props.pageId)}/forms/${encodeURIComponent(props.formId)}/settings`
const { data, pending, error, refresh } = useFetch<FormSettingsState>(url)
const settings = ref(defaultFormOutcomes())
const baseline = ref(JSON.stringify(settings.value))
const saving = ref(false)
const saveError = ref('')
const savedNotice = ref('')
const ready = ref(false)
const unsavedFormSettings = useState<boolean>('studio-unsaved-form-settings', () => false)
const leaveOpen = ref(false)
let decideLeave: ((value: boolean) => void) | undefined
function finishLeave(value: boolean) {
  decideLeave?.(value)
  decideLeave = undefined
  leaveOpen.value = false
}
onBeforeRouteLeave(async () => {
  if (saving.value) return false
  if (!dirty.value) return true
  leaveOpen.value = true
  return await new Promise<boolean>((resolve) => {
    decideLeave = resolve
  })
})
watch(leaveOpen, (open) => {
  if (!open) finishLeave(false)
})
const dirty = computed(() => JSON.stringify(settings.value) !== baseline.value)
const canSave = computed(() => ready.value && data.value?.canEdit && dirty.value && !saving.value)
const availableFields = computed(() => props.fields.filter(field => field.type !== 'hidden'))
const operators = [{ label: 'equals', value: 'equals' }, { label: 'does not equal', value: 'not_equals' }, { label: 'contains', value: 'contains' }, { label: 'is greater than', value: 'greater_than' }, { label: 'is less than', value: 'less_than' }]
function resetFromSaved() {
  settings.value = JSON.parse(JSON.stringify(data.value?.record?.settings ?? defaultFormOutcomes()))
  baseline.value = JSON.stringify(settings.value)
  saveError.value = ''
  savedNotice.value = ''
}
watch(data, (value) => {
  if (!value || ready.value) return
  resetFromSaved()
  ready.value = true
}, { immediate: true })
watch(dirty, (value) => {
  emit('dirty', value)
  if (value) savedNotice.value = ''
}, { immediate: true })
watch([dirty, saving], ([hasEdits, inFlight]) => {
  unsavedFormSettings.value = hasEdits || inFlight
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => {
  unsavedFormSettings.value = false
  emit('dirty', false)
})
function addRule() {
  const field = availableFields.value[0]
  if (!field || settings.value.rules.length >= 20) return
  settings.value.rules.push({ fieldId: field.id, operator: 'equals', value: '', outcome: defaultFormOutcomes().fallback })
}
function moveRule(index: number) {
  const rule = settings.value.rules.splice(index, 1)[0]!
  settings.value.rules.splice(index - 1, 0, rule)
}
async function save() {
  if (!canSave.value) return
  const parsed = FormOutcomeSettingsSchema.safeParse(settings.value)
  const messages = parsed.success ? validateFormOutcomeFields(parsed.data, props.fields) : [parsed.error.issues[0]?.message ?? 'Check your settings.']
  if (messages.length) {
    saveError.value = messages[0]!
    return
  }
  saving.value = true
  saveError.value = ''
  savedNotice.value = ''
  try {
    const result = await $fetch<FormSettingsState>(url, { method: 'PUT', body: { checkpointId: props.checkpointId, expectedRevision: data.value?.record?.revision ?? 0, settings: parsed.success ? parsed.data : settings.value } })
    data.value = result
    resetFromSaved()
    savedNotice.value = `Draft revision ${result.record?.revision} saved. Your live form has not changed.`
  } catch (cause) {
    saveError.value = (cause as { statusCode?: number })?.statusCode === 409 ? 'A newer form or settings revision needs review. Your edits are preserved. Discard them and reload to continue.' : 'We could not confirm the save. Your edits are preserved. Reload the saved settings before retrying.'
  } finally {
    saving.value = false
  }
}
async function discardAndReload() {
  resetFromSaved()
  ready.value = false
  emit('reload')
  await refresh()
  if (data.value && !error.value) ready.value = true
}
</script>

<template>
  <section class="space-y-6" aria-label="After submission settings">
    <UAlert color="neutral" title="Draft settings" description="Save and test what happens after a successful enquiry. These settings are not active on your website yet. Publishing support is still being connected." />
    <UAlert
      v-if="error"
      color="error"
      title="Form settings are unavailable"
      description="The settings connection needs attention. Your live form has not changed."
    >
      <template #actions>
        <UButton
          label="Try again"
          color="neutral"
          variant="outline"
          @click="refresh()"
        />
      </template>
    </UAlert>
    <USkeleton v-if="pending && !ready" class="h-48 w-full" />
    <template v-else-if="ready">
      <p v-if="data?.record" class="text-xs text-muted">
        Saved draft revision {{ data.record.revision }}
      </p>
      <fieldset :disabled="!data?.canEdit || saving" class="min-w-0 space-y-6">
        <legend class="sr-only">
          Outcome settings
        </legend>
        <PageStudioFormOutcomeInput v-model="settings.fallback" label="Default outcome" :pages="pages" />
        <section class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="font-medium text-highlighted">
                Conditional outcomes
              </h3><p class="mt-1 text-sm text-muted">
                The first matching rule wins. Otherwise, use the default outcome.
              </p>
            </div>
            <UButton
              label="Add rule"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              :disabled="!availableFields.length || settings.rules.length >= 20"
              @click="addRule"
            />
          </div>
          <div v-for="(rule, index) in settings.rules" :key="index" class="@container space-y-4 rounded-lg border border-default p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h4 class="text-sm font-medium">
                Rule {{ index + 1 }}
              </h4>
              <div class="flex gap-2">
                <UButton
                  label="Move up"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="index === 0"
                  @click="moveRule(index)"
                />
                <UButton
                  label="Remove rule"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="() => { settings.rules.splice(index, 1) }"
                />
              </div>
            </div>
            <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
              <UFormField label="When this field">
                <USelect v-model="rule.fieldId" :items="availableFields.map(field => ({ label: field.name, value: field.id }))" class="w-full" />
              </UFormField>
              <UFormField label="Comparison">
                <USelect v-model="rule.operator" :items="operators" class="w-full" />
              </UFormField>
              <UFormField label="Answer to match" class="@lg:col-span-2">
                <UInput v-model="rule.value" class="w-full" />
              </UFormField>
            </div>
            <PageStudioFormOutcomeInput v-model="rule.outcome" label="Then" :pages="pages" />
          </div>
        </section>
      </fieldset>
      <UAlert v-if="saveError" color="error" :title="saveError" />
      <p v-if="savedNotice" class="text-sm text-success" role="status">
        {{ savedNotice }}
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <UButton
          label="Save draft settings"
          :disabled="!canSave"
          :loading="saving"
          @click="save"
        />
        <UButton
          label="Discard edits and reload"
          color="neutral"
          variant="outline"
          :disabled="saving"
          @click="discardAndReload"
        />
        <span v-if="dirty" class="text-xs text-muted">Unsaved changes</span>
      </div>
      <PageStudioFormOutcomePreview :settings="settings" :fields="availableFields" />
    </template>
    <UModal v-model:open="leaveOpen" title="Leave without saving?" description="Your changes to these draft settings have not been saved.">
      <template #footer>
        <UButton
          label="Keep editing"
          color="neutral"
          variant="outline"
          @click="finishLeave(false)"
        />
        <UButton label="Discard and leave" color="error" @click="finishLeave(true)" />
      </template>
    </UModal>
  </section>
</template>
