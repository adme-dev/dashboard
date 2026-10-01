<script setup lang="ts">
import { ValidatedEmailTemplateSchema, starterEmailTemplate, type EmailTemplate, type EmailTemplateBlock, type EmailTemplateState, type EmailAudience } from '~~/shared/pageStudio/emailTemplates'

const props = defineProps<{ siteId: string, checkpointId: string, audience: EmailAudience, forms: Array<{ key: string, name: string, pageId: string, formId: string }>, reloadWorkspace: () => Promise<unknown> }>()
const emit = defineEmits<{ dirty: [value: boolean] }>()
const url = `/api/portal/page-studio/sites/${encodeURIComponent(props.siteId)}/email-templates/${props.audience}`
const { data, pending, error, refresh } = useFetch<EmailTemplateState>(url)
const template = ref<EmailTemplate>(starterEmailTemplate(props.audience))
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
const dirty = computed(() => ready.value && JSON.stringify(template.value) !== baseline.value)
const canSave = computed(() => ready.value && data.value?.canEdit && (dirty.value || !data.value?.record) && !saving.value && !uncertain.value)
const preview = ref<{ html: string, subject: string, preheader: string } | null>(null)
const previewBusy = ref(false)
const previewError = ref('')
const previewForm = ref(props.forms[0]?.key ?? '__none__')
const device = ref('desktop')
const newBlockType = ref('text')
const insertionTarget = ref('subject')
const history = ref<string[]>([])
const future = ref<string[]>([])
let recording = true
watch(template, () => {
  preview.value = null
  previewError.value = ''
  if (!recording) return
  const snapshot = JSON.stringify(template.value)
  if (history.value.at(-1) !== snapshot) {
    history.value.push(snapshot)
    if (history.value.length > 30) history.value.shift()
    future.value = []
  }
}, { deep: true, flush: 'sync' })
watch(previewForm, () => {
  preview.value = null
})
const insertionChoices = computed(() => [{ label: 'Subject', value: 'subject' }, { label: 'Preheader', value: 'preheader' }, ...template.value.blocks.flatMap((block, index) => 'text' in block ? [{ label: `Block ${index + 1}: ${block.type}`, value: `block:${block.id}` }] : [])])
watch(insertionChoices, (choices) => {
  if (!choices.some(item => item.value === insertionTarget.value)) insertionTarget.value = 'subject'
})
function insertVariable(value: string) {
  if (insertionTarget.value === 'subject') template.value.subject += value
  else if (insertionTarget.value === 'preheader') template.value.preheader += value
  else {
    const block = template.value.blocks.find(item => `block:${item.id}` === insertionTarget.value)
    if (block && 'text' in block) block.text += value
  }
}
function undo() {
  if (history.value.length < 2) return
  future.value.push(history.value.pop()!)
  recording = false
  template.value = JSON.parse(history.value.at(-1)!)
  recording = true
}
function redo() {
  const snapshot = future.value.pop()
  if (!snapshot) return
  history.value.push(snapshot)
  recording = false
  template.value = JSON.parse(snapshot)
  recording = true
}
function addBlock() {
  if (template.value.blocks.length >= 30) return
  const id = `block_${crypto.randomUUID()}`
  const type = newBlockType.value
  const block: EmailTemplateBlock = type === 'divider' || type === 'answers' ? { id, type } : type === 'button' ? { id, type, text: 'Visit our website', url: 'https://example.com' } : { id, type: type === 'heading' ? 'heading' : 'text', text: '' }
  template.value.blocks.push(block)
}
function moveBlock(index: number, direction: number) {
  const blocks = [...template.value.blocks]
  const destination = index + direction
  if (destination < 0 || destination >= blocks.length) return
  const [block] = blocks.splice(index, 1)
  blocks.splice(destination, 0, block!)
  template.value.blocks = blocks
}
async function showPreview() {
  previewError.value = ''
  const parsed = ValidatedEmailTemplateSchema.safeParse(template.value)
  const form = props.forms.find(item => item.key === previewForm.value)
  if (!parsed.success || !form) {
    previewError.value = parsed.success ? 'Choose a form to preview.' : parsed.error.issues[0]?.message ?? 'Check your template.'
    return
  }
  const snapshot = JSON.stringify(template.value)
  previewBusy.value = true
  try {
    const result = await $fetch<{ html: string, subject: string, preheader: string }>(`${url}/preview`, { method: 'POST', body: { template: parsed.data, pageId: form.pageId, formId: form.formId } })
    if (snapshot === JSON.stringify(template.value) && form.key === previewForm.value) preview.value = result
  } catch {
    previewError.value = 'Preview is unavailable. Your draft has not changed.'
  } finally {
    previewBusy.value = false
  }
}
function resetFromSaved() {
  expectedRevision.value = data.value?.record?.revision ?? 0
  recording = false
  template.value = JSON.parse(JSON.stringify(data.value?.record?.template ?? starterEmailTemplate(props.audience)))
  recording = true
  history.value = [JSON.stringify(template.value)]
  future.value = []
  baseline.value = JSON.stringify(template.value)
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
  const parsed = ValidatedEmailTemplateSchema.safeParse(template.value)
  if (!parsed.success) {
    saveError.value = parsed.error.issues[0]?.message ?? 'Check your template.'
    return
  }
  saving.value = true
  saveError.value = ''
  savedNotice.value = ''
  try {
    const result = await $fetch<EmailTemplateState>(url, { method: 'PUT', body: { checkpointId: props.checkpointId, expectedRevision: expectedRevision.value, template: parsed.data } })
    data.value = result
    resetFromSaved()
    savedNotice.value = `Draft revision ${result.record?.revision} saved. No emails have been sent.`
  } catch (cause) {
    uncertain.value = true
    saveError.value = (cause as { statusCode?: number })?.statusCode === 409 ? 'A newer website or template revision needs review. Your edits are preserved. Discard them and reload to continue.' : 'We could not confirm the save. Your edits are preserved. Reload the saved settings before retrying.'
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
  <section class="@container space-y-5" :aria-label="audience === 'team' ? 'Team notification template' : 'Customer reply template'">
    <div>
      <h3 class="font-semibold text-highlighted">
        {{ audience === 'team' ? 'Team notification' : 'Customer reply' }}
      </h3>
      <p class="mt-1 max-w-prose text-sm text-muted">
        Design the website default email. Preview uses example answers; no email is sent.
      </p>
    </div>
    <UAlert
      color="neutral"
      variant="soft"
      title="Template draft"
      description="Save a reusable design now. Sender verification, customer reply routing and delivery are still being connected."
    />
    <UAlert
      v-if="error"
      color="error"
      title="Template storage is unavailable"
      description="Try loading the saved draft again before editing."
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
      <div class="grid min-w-0 grid-cols-1 gap-6 @3xl:grid-cols-2">
        <fieldset :disabled="!data?.canEdit || saving || uncertain" class="min-w-0 space-y-5">
          <legend class="sr-only">
            Template design
          </legend>
          <UFormField label="Subject">
            <UInput v-model="template.subject" class="w-full" />
          </UFormField>
          <UFormField label="Preheader" description="A short summary shown next to the subject in an inbox.">
            <UInput v-model="template.preheader" class="w-full" />
          </UFormField>
          <UAccordion :items="[{ label: 'Brand styling', slot: 'brand' }, { label: 'Insert a variable', slot: 'variables' }]">
            <template #brand>
              <div class="grid grid-cols-1 gap-4 pb-4 @lg:grid-cols-2">
                <UFormField v-for="field in [{ key: 'accentColor', label: 'Accent colour' }, { key: 'textColor', label: 'Text colour' }, { key: 'canvasColor', label: 'Email background' }, { key: 'backgroundColor', label: 'Outer background' }]" :key="field.key" :label="field.label">
                  <UInput v-model="template[field.key as 'accentColor' | 'textColor' | 'canvasColor' | 'backgroundColor']" class="w-full" />
                </UFormField>
                <UFormField label="Font" class="@lg:col-span-2">
                  <USelect v-model="template.fontFamily" :items="[{ label: 'Sans serif', value: 'MODERN_SANS' }, { label: 'Serif', value: 'BOOK_SERIF' }]" class="w-full" />
                </UFormField>
              </div>
            </template>
            <template #variables>
              <div class="space-y-3 pb-4">
                <p class="text-sm text-muted">
                  Website and form names resolve for each enquiry. The Answers block uses that form's visible fields.
                </p>
                <UFormField label="Insert into">
                  <USelect v-model="insertionTarget" :items="insertionChoices" class="w-full" />
                </UFormField>
                <div class="flex flex-wrap gap-2">
                  <UButton
                    label="Website name"
                    color="neutral"
                    variant="outline"
                    @click="insertVariable('{{site.name}}')"
                  /><UButton
                    label="Form name"
                    color="neutral"
                    variant="outline"
                    @click="insertVariable('{{form.name}}')"
                  />
                </div>
              </div>
            </template>
          </UAccordion>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h4 class="text-sm font-medium">
              Email content
            </h4><div class="flex gap-2">
              <UButton
                label="Undo"
                icon="i-lucide-undo-2"
                color="neutral"
                variant="ghost"
                :disabled="history.length < 2"
                @click="undo"
              /><UButton
                label="Redo"
                icon="i-lucide-redo-2"
                color="neutral"
                variant="ghost"
                :disabled="!future.length"
                @click="redo"
              />
            </div>
          </div>
          <div v-for="(block, index) in template.blocks" :key="block.id" class="space-y-3 rounded-lg border border-default p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-medium">
                {{ index + 1 }}. {{ block.type === 'answers' ? 'Answers' : block.type.charAt(0).toUpperCase() + block.type.slice(1) }}
              </p><div class="flex gap-1">
                <UButton
                  :aria-label="`Move block ${index + 1} up`"
                  icon="i-lucide-arrow-up"
                  color="neutral"
                  variant="ghost"
                  :disabled="index === 0"
                  @click="moveBlock(index, -1)"
                />
                <UButton
                  :aria-label="`Move block ${index + 1} down`"
                  icon="i-lucide-arrow-down"
                  color="neutral"
                  variant="ghost"
                  :disabled="index === template.blocks.length - 1"
                  @click="moveBlock(index, 1)"
                />
                <UButton
                  :aria-label="`Remove block ${index + 1}`"
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="ghost"
                  :disabled="template.blocks.length === 1"
                  @click="() => { template.blocks = template.blocks.filter(item => item.id !== block.id) }"
                />
              </div>
            </div>
            <UFormField v-if="'text' in block" :label="block.type === 'button' ? 'Button label' : 'Text'">
              <UTextarea v-model="block.text" :rows="block.type === 'heading' || block.type === 'button' ? 2 : 4" class="w-full" />
            </UFormField>
            <UFormField v-if="block.type === 'button'" label="HTTPS destination" description="Use a fixed link. Links are inactive in the preview.">
              <UInput v-model="block.url" class="w-full" />
            </UFormField>
            <p v-if="block.type === 'answers'" class="text-sm text-muted">
              Includes the selected form's visible field labels and example answers. Real enquiry data is never loaded for this preview.
            </p>
          </div>
          <div class="space-y-3">
            <UFormField label="New block">
              <USelect v-model="newBlockType" :items="[{ label: 'Text', value: 'text' }, { label: 'Heading', value: 'heading' }, { label: 'Divider', value: 'divider' }, { label: 'Answers', value: 'answers' }, { label: 'Button', value: 'button' }]" class="w-full" />
            </UFormField><UButton
              label="Add block"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              :disabled="template.blocks.length >= 30"
              @click="addBlock"
            />
          </div>
        </fieldset>
        <section class="min-w-0 space-y-4" aria-label="Email preview">
          <div class="@container space-y-4 rounded-lg border border-default p-4">
            <UFormField label="Preview form">
              <USelect
                v-model="previewForm"
                :items="forms.map(form => ({ label: form.name, value: form.key }))"
                :disabled="!forms.length"
                class="w-full"
              />
            </UFormField>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                label="Preview changes"
                :loading="previewBusy"
                :disabled="previewBusy || !forms.length"
                @click="showPreview"
              /><UButton
                v-for="size in ['desktop', 'mobile']"
                :key="size"
                :label="size === 'desktop' ? 'Desktop' : 'Mobile'"
                color="neutral"
                :variant="device === size ? 'soft' : 'ghost'"
                @click="() => { device = size }"
              />
            </div>
            <p class="text-xs text-muted">
              Synthetic preview only. Changing the draft clears the previous preview.
            </p>
          </div>
          <UAlert v-if="previewError" color="error" :title="previewError" />
          <template v-if="preview">
            <div class="space-y-1 text-sm">
              <p class="break-words font-medium">
                {{ preview.subject }}
              </p><p class="break-words text-muted">
                {{ preview.preheader }}
              </p>
            </div><iframe
              :srcdoc="preview.html"
              sandbox=""
              referrerpolicy="no-referrer"
              title="Email preview with example answers"
              class="mx-auto h-[700px] w-full rounded-lg border border-default"
              :style="{ maxWidth: device === 'mobile' ? '375px' : '100%' }"
            />
          </template>
          <p v-else class="py-10 text-center text-sm text-muted">
            Choose a form and preview your design.
          </p>
        </section>
      </div>
      <UAlert v-if="saveError" color="error" :title="saveError" />
      <p v-if="savedNotice" role="status" class="text-sm text-success">
        {{ savedNotice }}
      </p>
      <div class="flex flex-wrap items-center gap-3 border-t border-default pt-4">
        <UButton
          label="Save template draft"
          :disabled="!canSave"
          :loading="saving"
          @click="save"
        /><UButton
          label="Discard edits and reload"
          color="neutral"
          variant="outline"
          :disabled="saving"
          @click="discardAndReload"
        /><span v-if="dirty" class="text-xs text-muted">Unsaved changes. Save before refreshing or closing this tab.</span><span v-else-if="data?.record" class="text-xs text-muted">Saved draft revision {{ data.record.revision }}</span><span v-else class="text-xs text-muted">Starter design — not saved yet</span>
      </div>
    </template>
    <UModal v-model:open="leaveOpen" title="Leave without saving?" description="Your template changes have not been saved.">
      <template #footer>
        <UButton
          label="Keep editing"
          color="neutral"
          variant="outline"
          @click="finishLeave(false)"
        /><UButton label="Discard and leave" color="error" @click="finishLeave(true)" />
      </template>
    </UModal>
  </section>
</template>
