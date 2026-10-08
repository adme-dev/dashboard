<script setup lang="ts">
import PageStudioEmailTemplateAi from './EmailTemplateAi.client.vue'
import { EmailTemplateProposalDraftSchema } from '~~/shared/pageStudio/emailTemplateProposals'
import PageStudioEmailTemplateHistory from './EmailTemplateHistory.client.vue'
import { formSiteApi, type FormApiAudience } from '~/utils/pageStudioFormApi'
import { ValidatedEmailTemplateSchema, effectiveEmailTemplate, starterEmailTemplate, socialPlatforms, type EmailTemplate, type EmailTemplateBlock, type EmailTemplateState, type EmailTemplateHistoricalVersion, type EmailAudience, type EmailImage, emailTemplateImages } from '~~/shared/pageStudio/emailTemplates'

import type { StandaloneSiteWorkspace } from '~~/shared/pageStudio/standaloneWorkspace'
import { emailDesigns, styleEmailTemplate, emailStarterLayout, prepareEmailTemplate, type EmailDesignId } from '~~/shared/pageStudio/emailTemplateDesigns'

const props = withDefaults(defineProps<{ siteId: string, apiAudience?: FormApiAudience, canEdit?: boolean, assets: StandaloneSiteWorkspace['assets'], checkpointId: string, definitionId?: string, placementCount?: number, audience: EmailAudience, forms: Array<{ key: string, name: string, pageId: string, formId: string }>, reloadWorkspace: () => Promise<unknown> }>(), { canEdit: undefined })
const editable = computed(() => props.canEdit !== false && !error.value && !pending.value && Boolean(data.value?.canEdit))
let active = true
const emit = defineEmits<{ dirty: [value: boolean] }>()
const websiteUrl = `${formSiteApi(props.siteId, props.apiAudience)}/email-templates/${props.audience}`
const url = props.definitionId ? `${formSiteApi(props.siteId, props.apiAudience)}/forms/${encodeURIComponent(props.definitionId)}/email-templates/${props.audience}` : websiteUrl
const customised = ref(false)
const savedHistoryOpen = ref(false)
const restoredRevision = ref<number | null>(null)
const exactTemplate = ref<EmailTemplate | null>(null)
const exactPreparedSnapshot = ref('')
function setEditableTemplate(value: EmailTemplate | null) {
  exactTemplate.value = value ? JSON.parse(JSON.stringify(value)) : null
  template.value = prepareEmailTemplate(value, props.audience)
  exactPreparedSnapshot.value = JSON.stringify(template.value)
}
function applySavedVersion(version: EmailTemplateHistoricalVersion) {
  if (!editable.value || saving.value || uncertain.value) return
  restoredRevision.value = version.revision
  customised.value = Boolean(props.definitionId && version.template)
  setEditableTemplate(version.template ?? effectiveEmailTemplate(data.value?.record ?? null, props.audience))
  openBlock.value = template.value.blocks[0]?.id
  savedHistoryOpen.value = false
}
const resetOpen = ref(false)
const removedOverrideIds = ref<string[]>([])
const obsoleteTemplates = computed(() => data.value?.record?.overrides?.filter(item => data.value?.removedDefinitionIds?.includes(item.definitionId)) ?? [])
const snapshot = () => JSON.stringify({ template: template.value, customised: customised.value, removedOverrideIds: removedOverrideIds.value, restoredRevision: restoredRevision.value })
function toggleRemoval(definitionId: string) {
  if (props.definitionId || !editable.value || saving.value || uncertain.value) return
  if (!obsoleteTemplates.value.some(item => item.definitionId === definitionId)) return
  removedOverrideIds.value = removedOverrideIds.value.includes(definitionId)
    ? removedOverrideIds.value.filter(id => id !== definitionId)
    : [...removedOverrideIds.value, definitionId]
}
const inheritedCount = computed(() => props.forms.filter(form => !data.value?.record?.overrides?.some(item => item.definitionId === form.key)).length)
function customise() {
  customised.value = true
}
function resetToDefault() {
  customised.value = false
  setEditableTemplate(effectiveEmailTemplate(data.value?.record ?? null, props.audience))
  resetOpen.value = false
}
const { data, pending, error, refresh } = useFetch<EmailTemplateState>(url, { getCachedData: () => undefined })
const template = ref<EmailTemplate>(starterEmailTemplate(props.audience))
const baseline = ref('')
const saving = ref(false)
const aiDirty = ref(false)
const aiBusy = ref(false)
const hasUnsavedChanges = computed(() => dirty.value || aiDirty.value)
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
  if (saving.value || aiBusy.value) return false
  if (!hasUnsavedChanges.value) return true
  leaveOpen.value = true
  return await new Promise<boolean>((resolve) => {
    decideLeave = resolve
  })
})
watch(leaveOpen, (open) => {
  if (!open) finishLeave(false)
})
const dirty = computed(() => ready.value && snapshot() !== baseline.value)
const canSave = computed(() => ready.value && editable.value && (dirty.value || (!props.definitionId && !data.value?.record)) && !saving.value && !aiBusy.value && !uncertain.value)
const previewForm = ref(props.forms[0]?.key ?? '__none__')
const device = ref('desktop')
const panel = ref('content')
const openBlock = ref<string | undefined>()
const layout = ref<'enquiry' | 'booking'>('enquiry')
const replaceLayoutOpen = ref(false)
const identity = computed(() => template.value.identity!)
const pickerOpen = ref(false)
const imageTarget = ref('new')
const imageCount = computed(() => emailTemplateImages(template.value).length)
function chooseImage(target: string) {
  imageTarget.value = target
  pickerOpen.value = true
}
function updateImage(id: string, value: EmailImage) {
  template.value.blocks = template.value.blocks.map(block => block.id === id && block.type === 'image' ? { ...block, ...value } : block)
}
function selectImage(asset: StandaloneSiteWorkspace['assets'][number]) {
  if (!editable.value || saving.value || uncertain.value) return
  const image: EmailImage = { assetId: asset.id, alt: asset.altText || '', width: imageTarget.value === 'logo' ? 160 : 520, alignment: 'center' }
  if (imageTarget.value === 'logo') {
    if (!identity.value.logo && imageCount.value >= 6) return
    identity.value.logo = { ...image, width: identity.value.logo?.width ?? 160, alignment: identity.value.logo?.alignment ?? 'left' }
  } else if (imageTarget.value === 'new') {
    if (template.value.blocks.length >= 30 || imageCount.value >= 6) return
    const id = `image_${crypto.randomUUID()}`
    template.value.blocks.push({ ...image, id, type: 'image' })
    openBlock.value = id
  } else {
    const block = template.value.blocks.find(item => item.id === imageTarget.value)
    if (block?.type === 'image') updateImage(block.id, { ...block, assetId: image.assetId, alt: image.alt })
  }
}
const blockItems = computed(() => template.value.blocks.map((block, index) => ({ value: block.id, label: block.type === 'answers' ? 'Enquiry details' : block.type.charAt(0).toUpperCase() + block.type.slice(1), description: block.type === 'image' ? (block.alt || 'Add an image description') : 'text' in block ? block.text.slice(0, 65) : block.type === 'answers' ? 'The fields from your form' : 'A little breathing room', slot: 'block' as const, block, index })))
function chooseDesign(id: EmailDesignId) {
  template.value = styleEmailTemplate(template.value, id)
}
function useLayout() {
  template.value = emailStarterLayout(props.audience, layout.value, template.value)
  openBlock.value = template.value.blocks[0]?.id
  replaceLayoutOpen.value = false
  panel.value = 'content'
}
function addSocial() {
  const platform = socialPlatforms.find(value => !identity.value.socials.some(item => item.platform === value))
  if (platform) identity.value.socials.push({ platform, url: '' })
}

const blockChoices = [
  { type: 'heading', label: 'Heading', icon: 'i-lucide-heading' },
  { type: 'text', label: 'Text', icon: 'i-lucide-align-left' },
  { type: 'answers', label: 'Answers', icon: 'i-lucide-list' },
  { type: 'button', label: 'Button', icon: 'i-lucide-mouse-pointer-2' },
  { type: 'divider', label: 'Divider', icon: 'i-lucide-minus' },
  { type: 'image', label: 'Image', icon: 'i-lucide-image' }
] as const
const validTemplate = computed(() => ValidatedEmailTemplateSchema.safeParse(template.value))
const previewInput = computed(() => {
  const form = props.forms.find(item => item.key === previewForm.value)
  const parsed = validTemplate.value
  return ready.value && !error.value && parsed.success && form
    ? { template: parsed.data, pageId: form.pageId, formId: form.formId }
    : null
})
const aiDraft = computed(() => {
  if (!previewInput.value) return null
  const parsed = EmailTemplateProposalDraftSchema.safeParse({ ...previewInput.value, siteId: props.siteId,
    apiAudience: props.apiAudience ?? 'portal', audience: props.audience, definitionId: props.definitionId,
    checkpointId: props.checkpointId, expectedRevision: expectedRevision.value, customised: customised.value })
  return parsed.success ? parsed.data : null
})
function applyAiTemplate(value: EmailTemplate) {
  if (!editable.value || saving.value || uncertain.value || (props.definitionId && !customised.value)) return
  setEditableTemplate(value)
  restoredRevision.value = null
  openBlock.value = template.value.blocks[0]?.id
}
const { preview, status: previewStatus, error: previewError, refresh: showPreview } = useEmailTemplatePreview(
  () => previewInput.value,
  (body, signal) => $fetch(`${websiteUrl}/preview`, { method: 'POST', body, signal })
)
watch(() => props.forms, (forms) => {
  if (!forms.some(form => form.key === previewForm.value)) previewForm.value = forms[0]?.key ?? '__none__'
})
const insertionTarget = ref('subject')
const history = ref<string[]>([])
const future = ref<string[]>([])
let recording = true
watch(template, () => {
  if (!recording) return
  const snapshot = JSON.stringify(template.value)
  if (history.value.at(-1) !== snapshot) {
    history.value.push(snapshot)
    if (history.value.length > 30) history.value.shift()
    future.value = []
  }
}, { deep: true, flush: 'sync' })
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
function addBlock(type: EmailTemplateBlock['type']) {
  if (type === 'image') {
    chooseImage('new')
    return
  }
  if (template.value.blocks.length >= 30) return
  const id = `block_${crypto.randomUUID()}`
  const block: EmailTemplateBlock = type === 'divider' || type === 'answers' ? { id, type } : type === 'button' ? { id, type, text: 'Visit our website', url: 'https://example.com' } : { id, type: type === 'heading' ? 'heading' : 'text', text: '' }
  template.value.blocks.push(block)
  openBlock.value = id
}
function moveBlock(index: number, direction: number) {
  const blocks = [...template.value.blocks]
  const destination = index + direction
  if (destination < 0 || destination >= blocks.length) return
  const [block] = blocks.splice(index, 1)
  blocks.splice(destination, 0, block!)
  template.value.blocks = blocks
}
function resetFromSaved() {
  restoredRevision.value = null
  removedOverrideIds.value = []
  expectedRevision.value = data.value?.record?.revision ?? 0
  recording = false
  const override = data.value?.record?.overrides?.find(item => item.definitionId === props.definitionId)
  customised.value = Boolean(override)
  setEditableTemplate(props.definitionId ? effectiveEmailTemplate(data.value?.record ?? null, props.audience, props.definitionId) : data.value?.record?.template ?? null)
  openBlock.value = template.value.blocks[0]?.id
  recording = true
  history.value = [JSON.stringify(template.value)]
  future.value = []
  baseline.value = snapshot()
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
watch([hasUnsavedChanges, saving], ([hasEdits, inFlight]) => {
  unsavedFormSettings.value = hasEdits || inFlight
  emit('dirty', hasEdits || inFlight)
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => {
  active = false
  finishLeave(false)
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
    // Editor-only identity defaults must not rewrite an unchanged saved revision.
    const nextTemplate = exactTemplate.value && JSON.stringify(template.value) === exactPreparedSnapshot.value ? exactTemplate.value : parsed.data
    const result = await $fetch<EmailTemplateState>(url, { method: 'PUT', body: { checkpointId: props.checkpointId, expectedRevision: expectedRevision.value, template: props.definitionId && !customised.value ? null : nextTemplate, ...(!props.definitionId && removedOverrideIds.value.length ? { removeOverrideDefinitionIds: removedOverrideIds.value } : {}) } })
    if (!active) return
    data.value = result
    resetFromSaved()
    savedNotice.value = props.definitionId && !customised.value ? 'Uses the website default again. No emails have been sent.' : `Draft revision ${result.record?.revision} saved. No emails have been sent.`
  } catch (cause) {
    if (!active) return
    if ((cause as { statusCode?: number })?.statusCode === 400) {
      saveError.value = (cause as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Check the template fields and size before saving.'
      return
    }
    uncertain.value = true
    saveError.value = (cause as { statusCode?: number })?.statusCode === 409 ? 'A newer website or template revision needs review. Your edits are preserved. Discard them and reload to continue.' : 'We could not confirm the save. Your edits are preserved. Reload the saved settings before retrying.'
  } finally {
    saving.value = false
  }
}
async function discardAndReload() {
  if (saving.value || aiBusy.value) return
  aiDirty.value = false
  saving.value = true
  ready.value = false
  try {
    await props.reloadWorkspace()
    if (!active) return
    await refresh()
    if (active && data.value && !error.value) {
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
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <h3 class="font-semibold text-highlighted">
            {{ audience === 'team' ? 'Team notification' : 'Customer reply' }}
          </h3>
          <UBadge
            label="Draft only"
            color="neutral"
            variant="subtle"
            size="sm"
          />
        </div>
        <p class="mt-1 text-sm text-muted">
          {{ audience === 'team' ? 'Give your team the details they need to follow up.' : 'A thoughtful first reply, in your own style.' }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          label="Revision history"
          icon="i-lucide-history"
          color="neutral"
          variant="outline"
          :disabled="!ready || Boolean(error) || pending || saving"
          @click="() => { savedHistoryOpen = true }"
        />
        <UButton
          label="Save template draft"
          icon="i-lucide-check"
          :disabled="!canSave"
          :loading="saving"
          @click="save"
        />
      </div>
    </div>
    <UAlert
      v-if="error"
      color="error"
      title="Template storage is unavailable"
      description="Load the saved draft before editing."
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
    <USkeleton v-if="pending && !ready" class="h-96 w-full" />
    <template v-else-if="ready">
      <div v-if="definitionId" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default px-4 py-3">
        <div>
          <p class="text-sm font-medium">
            {{ customised ? 'Custom template' : 'Uses website default' }}
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ customised ? 'Website template changes will not replace this design.' : 'Changes to the website template will also update this form.' }} Applies to all {{ placementCount || 1 }} {{ placementCount === 1 ? 'page' : 'pages' }} using this form.
          </p>
        </div>
        <UButton
          v-if="!customised"
          label="Customise for this form"
          color="neutral"
          variant="outline"
          :disabled="!editable || saving || uncertain"
          @click="customise"
        />
        <UButton
          v-else
          label="Use website default"
          color="neutral"
          variant="outline"
          :disabled="!editable || saving || uncertain"
          @click="() => { resetOpen = true }"
        />
      </div>
      <p v-else class="text-sm text-muted">
        Used by {{ inheritedCount }} of {{ forms.length }} forms. Custom form templates keep their own design.
      </p>
      <PageStudioEmailTemplateAi
        :url="url"
        :website-url="websiteUrl"
        :draft="aiDraft"
        :can-edit="editable && !saving && !uncertain && (!definitionId || customised)"
        :native="apiAudience === 'customer'"
        @apply="applyAiTemplate"
        @dirty="aiDirty = $event"
        @busy="aiBusy = $event"
      />
      <div class="grid min-w-0 grid-cols-1 items-start gap-6" :class="!definitionId || customised ? '@3xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.3fr)]' : ''">
        <div v-if="!definitionId || customised" class="min-w-0 rounded-xl border border-default bg-default">
          <UTabs
            v-model="panel"
            :items="[{ label: 'Content', value: 'content', icon: 'i-lucide-align-left' }, { label: 'Design', value: 'design', icon: 'i-lucide-palette' }, { label: 'Details', value: 'details', icon: 'i-lucide-building-2' }]"
            :content="false"
            class="w-full border-b border-default p-2"
          />
          <fieldset :disabled="!editable || saving || uncertain" class="@container min-w-0 space-y-5 p-4 @3xl:max-h-[740px] @3xl:overflow-y-auto">
            <legend class="sr-only">
              Template design
            </legend>
            <template v-if="panel === 'content'">
              <UFormField label="Subject">
                <UInput v-model="template.subject" class="w-full" />
              </UFormField>
              <UFormField label="Inbox preview" description="The short line shown beside your subject.">
                <UInput v-model="template.preheader" class="w-full" />
              </UFormField>
              <div class="flex flex-wrap items-center justify-between gap-2 border-t border-default pt-4">
                <h4 class="text-sm font-medium">
                  Your message
                </h4>
                <div class="flex gap-1">
                  <UButton
                    aria-label="Undo"
                    icon="i-lucide-undo-2"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    :disabled="history.length < 2"
                    @click="undo"
                  />
                  <UButton
                    aria-label="Redo"
                    icon="i-lucide-redo-2"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    :disabled="!future.length"
                    @click="redo"
                  />
                </div>
              </div>
              <UAccordion v-model="openBlock" :items="blockItems">
                <template #default="{ item }">
                  <span class="block text-sm font-medium">{{ item.label }}</span>
                  <span class="block max-w-60 truncate text-xs font-normal text-muted">{{ item.description || 'Add your text' }}</span>
                </template>
                <template #block="{ item }">
                  <div class="space-y-3 pb-4">
                    <UFormField v-if="'text' in item.block" :label="item.block.type === 'button' ? 'Button label' : 'Text'">
                      <UTextarea v-model="item.block.text" :rows="item.block.type === 'text' ? 4 : 2" class="w-full" />
                    </UFormField>
                    <UFormField v-if="item.block.type === 'button'" label="Website link" description="Use an HTTPS address. Preview links are inactive.">
                      <UInput v-model="item.block.url" class="w-full" />
                    </UFormField>
                    <PageStudioEmailImageFields
                      v-if="item.block.type === 'image'"
                      :model-value="item.block"
                      @update:model-value="value => updateImage(item.block.id, value)"
                      @replace="chooseImage(item.block.id)"
                    />
                    <p v-if="item.block.type === 'answers'" class="text-sm text-muted">
                      Includes the visible fields from the selected form. The preview uses example answers.
                    </p>
                    <div class="flex items-center justify-end gap-1">
                      <UButton
                        :aria-label="`Move block ${item.index + 1} up`"
                        icon="i-lucide-arrow-up"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        :disabled="item.index === 0"
                        @click="moveBlock(item.index, -1)"
                      />
                      <UButton
                        :aria-label="`Move block ${item.index + 1} down`"
                        icon="i-lucide-arrow-down"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        :disabled="item.index === template.blocks.length - 1"
                        @click="moveBlock(item.index, 1)"
                      />
                      <UButton
                        :aria-label="`Remove block ${item.index + 1}`"
                        icon="i-lucide-trash-2"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        :disabled="template.blocks.length === 1"
                        @click="() => { template.blocks = template.blocks.filter(block => block.id !== item.block.id) }"
                      />
                    </div>
                  </div>
                </template>
              </UAccordion>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Add content block">
                <UButton
                  v-for="choice in blockChoices"
                  :key="choice.type"
                  :label="choice.label"
                  :aria-label="`Add ${choice.label.toLowerCase()} block`"
                  :icon="choice.icon"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :disabled="template.blocks.length >= 30 || (choice.type === 'image' && imageCount >= 6)"
                  @click="addBlock(choice.type)"
                />
              </div>
              <UAccordion :items="[{ label: 'Personalise with website details', slot: 'variables' }]">
                <template #variables>
                  <div class="space-y-3 pb-3">
                    <UFormField label="Insert into">
                      <USelect v-model="insertionTarget" :items="insertionChoices" class="w-full" />
                    </UFormField>
                    <div class="flex flex-wrap gap-2">
                      <UButton
                        label="Website name"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        @click="insertVariable('{{site.name}}')"
                      /><UButton
                        label="Form name"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        @click="insertVariable('{{form.name}}')"
                      />
                    </div>
                  </div>
                </template>
              </UAccordion>
            </template>
            <template v-else-if="panel === 'design'">
              <div>
                <h4 class="text-sm font-medium">
                  Choose a look
                </h4><p class="mt-1 text-xs text-muted">
                  Your wording and contact details stay as they are.
                </p>
              </div>
              <div class="space-y-2">
                <UButton
                  v-for="design in emailDesigns"
                  :key="design.id"
                  color="neutral"
                  variant="outline"
                  class="w-full justify-start gap-3 p-3 text-left"
                  :aria-label="`Use ${design.name} style`"
                  @click="chooseDesign(design.id)"
                >
                  <span class="flex h-14 w-12 shrink-0 flex-col gap-1 rounded border border-black/10 p-2" :style="{ background: design.canvasColor, color: design.accentColor }" aria-hidden="true"><span class="text-base font-semibold" :class="design.fontFamily === 'BOOK_SERIF' ? 'font-serif' : 'font-sans'">Aa</span><span class="h-0.5 w-full bg-current opacity-30" /><span class="h-0.5 w-2/3 bg-current opacity-30" /></span>
                  <span><span class="block font-medium">{{ design.name }}</span><span class="block text-xs font-normal text-muted">{{ design.description }}</span></span>
                </UButton>
              </div>
              <UAccordion :items="[{ label: 'Custom colours & type', slot: 'brand' }, { label: 'Start with a ready-made message', slot: 'layout' }]">
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
                <template #layout>
                  <div class="space-y-3 pb-4">
                    <UFormField label="Starting layout">
                      <USelect v-model="layout" :items="audience === 'customer' ? [{ label: 'Enquiry acknowledgement', value: 'enquiry' }, { label: 'Booking enquiry', value: 'booking' }] : [{ label: 'Team enquiry summary', value: 'enquiry' }]" class="w-full" />
                    </UFormField>
                    <p class="text-xs text-muted">
                      Replace the message with a starting layout. Your style and business details are kept.
                    </p>
                    <UButton
                      label="Use starting layout"
                      color="neutral"
                      variant="outline"
                      @click="() => { replaceLayoutOpen = true }"
                    />
                  </div>
                </template>
              </UAccordion>
            </template>
            <template v-else>
              <div>
                <h4 class="text-sm font-medium">
                  Header & footer
                </h4><p class="mt-1 text-xs text-muted">
                  Identify your business and make it easy to get in touch. Empty details are hidden.
                </p>
              </div>
              <div class="space-y-3 border-b border-default pb-4">
                <h4 class="text-sm font-medium">
                  Business logo
                </h4>
                <template v-if="identity.logo">
                  <PageStudioEmailImageFields :model-value="identity.logo" @update:model-value="value => { identity.logo = value }" @replace="chooseImage('logo')" />
                  <UButton
                    label="Remove logo"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    @click="() => { delete identity.logo }"
                  />
                </template>
                <UButton
                  v-else
                  label="Choose logo"
                  icon="i-lucide-image"
                  color="neutral"
                  variant="outline"
                  :disabled="imageCount >= 6"
                  @click="chooseImage('logo')"
                />
              </div>
              <UFormField label="Business name" description="Shown in the header and footer.">
                <UInput v-model="identity.businessName" placeholder="Your business name" class="w-full" />
              </UFormField>
              <UFormField label="Header tagline" hint="Optional">
                <UInput v-model="identity.tagline" placeholder="A short line about your business" class="w-full" />
              </UFormField>
              <div class="space-y-4 border-t border-default pt-4">
                <UFormField label="Phone number">
                  <UInput v-model="identity.phone" class="w-full" />
                </UFormField>
                <UFormField label="Contact email" description="Displayed in the footer; this does not set the sending address.">
                  <UInput v-model="identity.email" type="email" class="w-full" />
                </UFormField>
                <UFormField label="Business address">
                  <UTextarea v-model="identity.address" :rows="2" class="w-full" />
                </UFormField>
                <UFormField label="Website">
                  <UInput v-model="identity.websiteUrl" placeholder="https://yourwebsite.com" class="w-full" />
                </UFormField>
              </div>
              <div class="space-y-3 border-t border-default pt-4">
                <div class="flex items-center justify-between gap-2">
                  <h4 class="text-sm font-medium">
                    Social links
                  </h4><UButton
                    label="Add social link"
                    icon="i-lucide-plus"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    :disabled="identity.socials.length >= socialPlatforms.length"
                    @click="addSocial"
                  />
                </div>
                <div v-for="(social, index) in identity.socials" :key="index" class="space-y-2 rounded-lg border border-default p-3">
                  <UFormField :label="`Social platform ${index + 1}`">
                    <USelect v-model="social.platform" :items="socialPlatforms.filter(value => value === social.platform || !identity.socials.some(item => item.platform === value))" class="w-full" />
                  </UFormField>
                  <UFormField :label="`${social.platform} link`">
                    <UInput v-model="social.url" placeholder="https://…" class="w-full" />
                  </UFormField>
                  <UButton
                    :label="`Remove ${social.platform}`"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    @click="() => { identity.socials.splice(index, 1) }"
                  />
                </div>
              </div>
              <UFormField label="Disclaimer or business note" description="Optional text shown at the bottom of the email.">
                <UTextarea v-model="identity.disclaimer" :rows="4" class="w-full" />
              </UFormField>
            </template>
          </fieldset>
        </div>
        <section class="min-w-0 overflow-hidden rounded-xl border border-default bg-elevated/40" aria-label="Email preview" :aria-busy="previewStatus === 'waiting' || previewStatus === 'loading'">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-default px-4 py-3">
            <div class="flex items-center gap-2 text-sm font-medium">
              <UIcon name="i-lucide-mail" class="size-4 text-muted" /> Email preview
            </div>
            <div class="flex items-center gap-1">
              <UButton
                v-for="size in ['desktop', 'mobile']"
                :key="size"
                :aria-label="size === 'desktop' ? 'Desktop' : 'Mobile'"
                :icon="size === 'desktop' ? 'i-lucide-monitor' : 'i-lucide-smartphone'"
                color="neutral"
                :variant="device === size ? 'soft' : 'ghost'"
                size="sm"
                @click="() => { device = size }"
              />
              <UButton
                aria-label="Refresh preview"
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="ghost"
                size="sm"
                :loading="previewStatus === 'loading'"
                :disabled="previewStatus === 'loading' || !previewInput"
                @click="showPreview"
              />
            </div>
          </div>
          <div class="space-y-3 p-4">
            <UFormField label="Preview with">
              <USelect
                v-model="previewForm"
                :items="forms.map(form => ({ label: form.name, value: form.key }))"
                :disabled="!forms.length"
                class="w-full"
              />
            </UFormField>
            <UAlert v-if="previewError" color="error" :title="previewError" />
            <UAlert
              v-else-if="!validTemplate.success"
              color="warning"
              variant="soft"
              title="Preview paused"
              :description="validTemplate.error.issues[0]?.message"
            />
            <UAlert
              v-if="preview?.warnings?.length"
              color="warning"
              title="Check your images"
              :description="preview.warnings.join(' ')"
            />
            <template v-if="preview">
              <div class="space-y-1 rounded-lg bg-default px-4 py-3 text-sm">
                <p class="break-words font-medium">
                  {{ preview.subject }}
                </p><p class="break-words text-xs text-muted">
                  {{ preview.preheader }}
                </p>
              </div>
              <iframe
                :srcdoc="preview.html"
                sandbox=""
                referrerpolicy="no-referrer"
                title="Email preview with example answers"
                class="mx-auto h-[600px] w-full rounded-lg border border-default"
                :style="{ maxWidth: device === 'mobile' ? '375px' : '100%' }"
              />
            </template>
            <div v-else class="flex min-h-80 items-center justify-center px-6 text-center text-sm text-muted">
              {{ previewStatus === 'waiting' || previewStatus === 'loading' ? 'Updating your preview…' : 'Complete the details to see your email here.' }}
            </div>
            <p class="text-xs text-muted">
              Live preview with example answers. Links are inactive.
            </p>
          </div>
        </section>
      </div>
      <section v-if="!definitionId && !error && obsoleteTemplates.length" aria-label="Templates for removed forms" class="space-y-3 border-t border-default pt-5">
        <div>
          <h4 class="text-sm font-medium text-highlighted">
            Templates for removed forms
          </h4>
          <p class="mt-1 text-sm text-muted">
            These forms are no longer in your website. Their custom templates are kept until you remove them and save this draft.
          </p>
        </div>
        <div v-for="item in obsoleteTemplates" :key="item.definitionId" class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-elevated px-4 py-3">
          <div class="min-w-0 flex-1 basis-48">
            <p class="break-words text-sm font-medium" :class="removedOverrideIds.includes(item.definitionId) ? 'text-muted line-through' : 'text-highlighted'">
              {{ item.template.subject }}
            </p>
            <p class="mt-1 break-words text-xs text-muted">
              {{ removedOverrideIds.includes(item.definitionId) ? 'Will be removed when you save' : `Removed form: ${item.definitionId}` }}
            </p>
          </div>
          <UButton
            :label="removedOverrideIds.includes(item.definitionId) ? 'Undo removal' : 'Remove template'"
            :icon="removedOverrideIds.includes(item.definitionId) ? 'i-lucide-undo-2' : 'i-lucide-trash-2'"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="!editable || saving || uncertain"
            @click="toggleRemoval(item.definitionId)"
          />
        </div>
      </section>
      <UAlert v-if="saveError" color="error" :title="saveError" />
      <p v-if="savedNotice" role="status" class="text-sm text-success">
        {{ savedNotice }}
      </p>
      <div class="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span v-if="hasUnsavedChanges">Unsaved changes. Save before closing this tab.</span><span v-else-if="data?.record">Saved draft · Revision {{ data.record.revision }}</span><span v-else>Starting design · Not saved yet</span>
        <UButton
          label="Discard edits and reload"
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="saving || aiBusy"
          @click="discardAndReload"
        />
      </div>
      <p class="text-xs text-muted">
        Design only. Sending and reply routing are not enabled yet.
      </p>
    </template>
    <PageStudioEmailTemplateHistory
      v-if="savedHistoryOpen"
      :url="url"
      :website-url="websiteUrl"
      :audience="audience"
      :is-form="Boolean(definitionId)"
      :can-apply="editable && !saving && !uncertain"
      :current-default="effectiveEmailTemplate(data?.record ?? null, audience)"
      :preview-form="forms.find(item => item.key === previewForm) ?? null"
      @close="savedHistoryOpen = false"
      @apply="applySavedVersion"
    />
    <PageStudioEmailMediaPicker
      v-model:open="pickerOpen"
      :site-id="siteId"
      :api-audience="apiAudience"
      :assets="assets"
      @select="selectImage"
    />
    <UModal v-model:open="resetOpen" title="Use the website template?" description="This form will follow the website default, including future changes. Save the draft to apply this reset.">
      <template #footer>
        <UButton
          label="Keep custom template"
          color="neutral"
          variant="outline"
          @click="() => { resetOpen = false }"
        />
        <UButton label="Use website default" :disabled="saving || uncertain || !editable" @click="resetToDefault" />
      </template>
    </UModal>
    <UModal v-model:open="replaceLayoutOpen" title="Use this starting layout?" description="This replaces your subject and message. Your business details and style stay the same. You can undo this change.">
      <template #footer>
        <UButton
          label="Keep my message"
          color="neutral"
          variant="outline"
          @click="() => { replaceLayoutOpen = false }"
        /><UButton label="Use layout" :disabled="saving || uncertain || !editable" @click="useLayout" />
      </template>
    </UModal>
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
