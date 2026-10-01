<script setup lang="ts">
import { defaultFormRecipients, FormRecipientSettingsSchema, effectiveFormRecipients, type FormRecipientsState } from '~~/shared/pageStudio/formRecipients'

const props = defineProps<{ siteId: string, checkpointId: string, definitionId?: string, forms: Array<{ definitionId?: string, name: string }>, reloadWorkspace: () => Promise<unknown> }>()
const emit = defineEmits<{ dirty: [value: boolean] }>()
const url = `/api/portal/page-studio/sites/${encodeURIComponent(props.siteId)}/forms/recipients`
const { data, pending, error, refresh } = useFetch<FormRecipientsState>(url)
const settings = ref(defaultFormRecipients())
const recipientsText = ref('')
const mode = ref('website')
const baseline = ref('')
const saving = ref(false)
const uncertain = ref(false)
const saveError = ref('')
const savedNotice = ref('')
const ready = ref(false)
const expectedRevision = ref(0)
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
const dirty = computed(() => ready.value && JSON.stringify([mode.value, recipientsText.value, settings.value.overrides]) !== baseline.value)
const canSave = computed(() => ready.value && data.value?.canEdit && dirty.value && !saving.value && !uncertain.value)
const recipientList = computed(() => recipientsText.value.split(/[\n,;]/).map(value => value.trim()).filter(Boolean))
const effective = computed(() => props.definitionId && mode.value === 'website' ? settings.value.recipients : recipientList.value)
const inheriting = computed(() => props.forms.filter(form => !settings.value.overrides.some(item => item.definitionId === form.definitionId)).map(form => form.name))
const removedOverrides = computed(() => settings.value.overrides.filter(item => !props.forms.some(form => form.definitionId === item.definitionId)))
const customForms = computed(() => settings.value.overrides.map(item => props.forms.find(form => form.definitionId === item.definitionId)?.name ?? item.definitionId))
function resetFromSaved() {
  expectedRevision.value = data.value?.record?.revision ?? 0
  settings.value = JSON.parse(JSON.stringify(data.value?.record?.settings ?? defaultFormRecipients()))
  const override = settings.value.overrides.find(item => item.definitionId === props.definitionId)
  mode.value = override ? 'custom' : 'website'
  recipientsText.value = (props.definitionId ? effectiveFormRecipients(settings.value, props.definitionId) : settings.value.recipients).join('\n')
  baseline.value = JSON.stringify([mode.value, recipientsText.value, settings.value.overrides])
  saveError.value = ''
  savedNotice.value = ''
  uncertain.value = false
}
watch(data, (value) => {
  if (!value || ready.value || saving.value) return
  resetFromSaved()
  ready.value = true
}, { immediate: true })
watch(dirty, (value) => {
  if (value) savedNotice.value = ''
}, { immediate: true })
watch([dirty, saving], ([hasEdits, inFlight]) => {
  unsavedFormSettings.value = hasEdits || inFlight
  emit('dirty', hasEdits || inFlight)
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => {
  unsavedFormSettings.value = false
  emit('dirty', false)
})
async function save() {
  if (!canSave.value) return
  const proposed = JSON.parse(JSON.stringify(settings.value))
  if (props.definitionId) {
    proposed.overrides = proposed.overrides.filter((item: { definitionId: string }) => item.definitionId !== props.definitionId)
    if (mode.value === 'custom') proposed.overrides.push({ definitionId: props.definitionId, recipients: recipientList.value })
  } else proposed.recipients = recipientList.value
  const parsed = FormRecipientSettingsSchema.safeParse(proposed)
  if (!parsed.success) {
    saveError.value = parsed.error.issues[0]?.message ?? 'Check your email addresses.'
    return
  }
  saving.value = true
  saveError.value = ''
  savedNotice.value = ''
  try {
    const result = await $fetch<FormRecipientsState>(url, { method: 'PUT', body: { checkpointId: props.checkpointId, expectedRevision: expectedRevision.value, settings: parsed.data } })
    data.value = result
    resetFromSaved()
    savedNotice.value = `Draft revision ${result.record?.revision} saved. No emails have been sent.`
  } catch (cause) {
    uncertain.value = true
    saveError.value = (cause as { statusCode?: number })?.statusCode === 409 ? 'A newer website or recipient revision needs review. Your edits are preserved. Discard them and reload to continue.' : 'We could not confirm the save. Your edits are preserved. Reload the saved settings before retrying.'
  } finally {
    saving.value = false
  }
}
async function discardAndReload() {
  saving.value = true
  ready.value = false
  try {
    await props.reloadWorkspace()
    await refresh()
    if (data.value && !error.value) {
      resetFromSaved()
      ready.value = true
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="space-y-6" aria-label="Email recipient drafts">
    <div>
      <h3 class="font-semibold text-highlighted">
        {{ definitionId ? 'Team notifications' : 'Website email defaults' }}
      </h3>
      <p class="mt-1 max-w-prose text-sm text-muted">
        {{ definitionId ? 'Choose who should receive enquiries from this form, wherever it appears.' : 'Set your team recipients once. Forms use these addresses unless you choose a custom list.' }}
      </p>
    </div>
    <UAlert color="neutral" title="Draft only" description="You can save recipient lists now. Email delivery, sender verification and templates are not connected yet. Saving does not send email." />
    <UAlert
      v-if="error"
      color="error"
      title="Email settings are unavailable"
      description="Your saved draft has not been loaded. Try again before editing."
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
    <USkeleton v-if="pending && !ready" class="h-40 w-full" />
    <template v-else-if="ready">
      <fieldset :disabled="!data?.canEdit || saving || uncertain" class="@container min-w-0 space-y-4">
        <legend class="sr-only">
          Team notification recipients
        </legend>
        <UFormField v-if="definitionId" label="Recipients">
          <USelect v-model="mode" :items="[{ value: 'website', label: 'Use website defaults' }, { value: 'custom', label: 'Custom for this form' }]" class="w-full" />
        </UFormField>
        <UFormField v-if="!definitionId || mode === 'custom'" label="Team email addresses" description="One address per line, up to 20. Leave empty to have no team recipients in this draft.">
          <UTextarea
            v-model="recipientsText"
            :rows="4"
            placeholder="team@example.com"
            class="w-full"
          />
        </UFormField>
      </fieldset>
      <div class="space-y-2 border-y border-default py-4">
        <p class="text-sm font-medium">
          {{ definitionId && mode === 'website' ? 'Using website defaults' : 'Effective draft recipients' }}
        </p>
        <p v-if="!effective.length" class="text-sm text-muted">
          No team recipients configured.
        </p>
        <ul v-else class="space-y-1 text-sm text-muted">
          <li v-for="address in effective" :key="address" class="break-all">
            {{ address }}
          </li>
        </ul>
      </div>
      <div v-if="!definitionId" class="space-y-2 text-sm">
        <p class="font-medium">
          Forms using website defaults ({{ inheriting.length }})
        </p>
        <p class="text-muted">
          {{ inheriting.join(', ') || 'No forms currently inherit these defaults.' }}
        </p>
        <p v-if="customForms.length" class="text-muted">
          Custom recipients stay unchanged: {{ customForms.join(', ') }}.
        </p>
      </div>
      <section v-if="!definitionId && removedOverrides.length" class="space-y-3" aria-label="Removed form overrides">
        <p class="text-sm text-muted">
          These forms are no longer in the saved website. Review and remove their recipient overrides before saving.
        </p>
        <div v-for="item in removedOverrides" :key="item.definitionId" class="flex flex-wrap items-center justify-between gap-3">
          <p class="break-all text-sm">
            {{ item.definitionId }}: {{ item.recipients.join(', ') || 'No recipients' }}
          </p>
          <UButton
            label="Remove obsolete override"
            color="neutral"
            variant="outline"
            :disabled="!data?.canEdit || saving || uncertain"
            @click="() => { settings.overrides = settings.overrides.filter(override => override.definitionId !== item.definitionId) }"
          />
        </div>
      </section>
      <UAlert v-if="saveError" color="error" :title="saveError" />
      <p v-if="savedNotice" role="status" class="text-sm text-success">
        {{ savedNotice }}
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <UButton
          label="Save recipient draft"
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
        <span v-if="dirty" class="text-xs text-muted">Unsaved changes. Save before refreshing or closing this tab.</span>
        <span v-else-if="data?.record" class="text-xs text-muted">Saved draft revision {{ data.record.revision }}</span>
      </div>
    </template>
    <UModal v-model:open="leaveOpen" title="Leave without saving?" description="Your recipient changes have not been saved.">
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
