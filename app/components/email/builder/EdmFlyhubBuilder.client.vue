<!-- app/components/email/builder/EdmFlyhubBuilder.client.vue -->
<!-- Editor shell: canvas (2a-ii-2) + block inspector (2a-ii-3) + toolbar with
     undo/redo, Editor/Preview/HTML views, and Save to edm_templates (2a-ii-4).
     Loads an existing template via ?id= or a starter layout via ?starter=. -->
<script setup lang="ts">
import { templateCopyCategory, markTemplateClientCopy, templateCopyName } from '~~/app/utils/edmTemplateProvenance'
import { EDM_SECTION_CATEGORIES, findStarterTemplate } from '~~/app/utils/edmPresets'
import type { EdmSectionPreset } from '~~/app/utils/edmPresets'
import type { EdmFlyhubBlock, EdmFlyhubDocument } from '~~/app/types/edm'
import { extractFragment, reidFragment } from '~~/app/utils/edmModuleFragment'
import { resolveRootDropIndex, type EdmRootDropPlacement } from '~~/app/utils/edmDragReorder'
import { getBlockForDevice, isHiddenOnDevice, type EdmDevice } from '~~/app/utils/edmResponsive'
import {
  getHtmlEditableSelection,
  updateHtmlEditable,
  type EdmHtmlEditableSelection,
  type EdmHtmlEditableUpdate
} from '~~/app/utils/edmHtmlEditables'
import { normaliseEmailImageAssetUrl, type EdmImageAsset } from '~~/app/utils/edmImageAssets'
import { buildCampaignEditorPatch } from '~~/app/utils/emailCampaignEditor'
import {
  buildEmailBuilderTestSendRequest,
  describeEmailBuilderTestSendError
} from '~~/app/utils/emailBuilderTestSend'
import {
  buildEmailBuilderScheduleRequest,
  extractEmailBuilderScheduleError,
  isEmailBuilderScheduleBlocked,
  shouldDisableEmailBuilderScheduleAction,
  validateEmailBuilderScheduleAt,
  type EmailBuilderSchedulePreflight,
  type EmailBuilderScheduleRecipientSnapshot
} from '~~/app/utils/emailBuilderSchedule'
import {
  CUSTOM_MODULE_NEW_CATEGORY,
  EDM_CUSTOM_MODULE_CATEGORY_OPTIONS,
  inferCustomModuleCategoryFromBlockType,
  labelCustomModuleCategory,
  normaliseCustomModuleCategory,
  resolveCustomModuleCategorySelection
} from '~~/app/utils/edmCustomModuleCategories'
import type { EdmCustomModule } from '~~/app/composables/useEdmCustomModules'

const store = useEdmBuilder()
const designFlow = useEdmDesignRoundtrip()
const figflowEnabled = useRuntimeConfig().public.figflowEdmEnabled === true
const showFigflow = ref(false)
const showDiscardFigflow = ref(false)
const showDesignDraftCopy = ref(false)
const draftCopyUnconfirmed = ref(false)
const designLocalConflict = ref(false)
const designServiceUnavailable = ref(false)
const designRevisionRequired = ref(false)
const loadedDesignRevisionId = ref<string | null>(null)
const route = useRoute()
const router = useRouter()
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>

const layout = computed(() => store.getLayoutSettings())

// ── Palette ───────────────────────────────────────────────────────────────
// Slim category list; each category opens a single top-docked flyout panel
// immediately to the rail's right, matching the Postcards module browser.
const activeFlyoutCategoryId = ref<string | null>(null)
const activeFlyoutCategory = computed(() => {
  return EDM_SECTION_CATEGORIES.find(category => category.id === activeFlyoutCategoryId.value) ?? null
})

// Insert by preset OBJECT so callers don't depend on the active category.
// Handles both Basic blocks (kind:'block') and full sections (kind:'section').
function insertPreset(preset: EdmSectionPreset, position?: number) {
  if (preset.kind === 'block') {
    const block = preset.blocks[0]
    if (!block) return
    store.addBlock(block.type, 'root', position, block.data)
    return
  }
  store.insertSectionPreset(preset.id, position)
}

// Hybrid open/close: click/focus keeps the panel keyboard reachable while a
// short hover-close delay lets the pointer travel from the rail into the panel.
const closeTimers: Record<string, ReturnType<typeof setTimeout> | undefined> = {}
const FLYOUT_TIMER_ID = 'module-rail'

function cancelCloseFlyout() {
  if (closeTimers[FLYOUT_TIMER_ID]) {
    clearTimeout(closeTimers[FLYOUT_TIMER_ID])
    closeTimers[FLYOUT_TIMER_ID] = undefined
  }
}

function openFlyout(id: string) {
  cancelCloseFlyout()
  activeFlyoutCategoryId.value = id
}

function closeFlyout() {
  cancelCloseFlyout()
  activeFlyoutCategoryId.value = null
}

function scheduleCloseFlyout() {
  cancelCloseFlyout()
  closeTimers[FLYOUT_TIMER_ID] = setTimeout(() => {
    closeFlyout()
    closeTimers[FLYOUT_TIMER_ID] = undefined
  }, 150)
}

function insertFromFlyout(preset: EdmSectionPreset) {
  insertPreset(preset)
  closeFlyout()
}

function onCanvasClick() {
  store.clearSelection()
  closeFlyout()
}

const addAtEndOpen = ref(false)
const emptyAddOpen = ref(false)

const childBlocks = computed(() => {
  const root = store.document.value.root
  const childrenIds = root?.data?.childrenIds || []
  return childrenIds.map(id => ({
    id,
    type: store.document.value[id]?.type || 'Unknown',
    data: store.document.value[id]?.data || {}
  }))
})

const draggedRootBlockId = ref<string | null>(null)
const rootDropPreview = ref<{ targetBlockId: string, placement: EdmRootDropPlacement } | null>(null)

function moveBlock(blockId: string, direction: 'up' | 'down') {
  const root = store.document.value.root
  const childrenIds = [...(root?.data?.childrenIds || [])]
  const index = childrenIds.indexOf(blockId)
  if (index === -1) return
  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= childrenIds.length) return
  ;[childrenIds[index], childrenIds[newIndex]] = [childrenIds[newIndex], childrenIds[index]]
  store.updateBlockData('root', { childrenIds })
}

function getRootChildrenIds() {
  return store.document.value.root?.data?.childrenIds || []
}

function getDropBoundaryIndex(targetBlockId: string, placement: EdmRootDropPlacement) {
  const targetIndex = getRootChildrenIds().indexOf(targetBlockId)
  if (targetIndex === -1) return null
  return placement === 'after' ? targetIndex + 1 : targetIndex
}

function startRootDrag(blockId: string) {
  draggedRootBlockId.value = blockId
  rootDropPreview.value = null
  store.setSelectedBlockId(blockId)
}

function previewRootDrop(targetBlockId: string, placement: EdmRootDropPlacement) {
  const draggedBlockId = draggedRootBlockId.value
  const dropBoundaryIndex = getDropBoundaryIndex(targetBlockId, placement)
  if (!draggedBlockId || dropBoundaryIndex === null) {
    rootDropPreview.value = null
    return
  }

  const newIndex = resolveRootDropIndex(getRootChildrenIds(), draggedBlockId, dropBoundaryIndex)
  rootDropPreview.value = newIndex === null ? null : { targetBlockId, placement }
}

function clearRootDropPreview(targetBlockId: string) {
  if (rootDropPreview.value?.targetBlockId === targetBlockId) {
    rootDropPreview.value = null
  }
}

function dropRootBlock(targetBlockId: string, placement: EdmRootDropPlacement) {
  const draggedBlockId = draggedRootBlockId.value
  const dropBoundaryIndex = getDropBoundaryIndex(targetBlockId, placement)
  if (draggedBlockId && dropBoundaryIndex !== null) {
    const newIndex = resolveRootDropIndex(getRootChildrenIds(), draggedBlockId, dropBoundaryIndex)
    if (newIndex !== null) {
      store.moveBlock(draggedBlockId, 'root', newIndex)
    }
  }
  clearRootDrag()
}

function clearRootDrag() {
  draggedRootBlockId.value = null
  rootDropPreview.value = null
}

function updateLayout(patch: Record<string, unknown>) {
  store.updateLayoutSettings(patch)
}

// The selected block (null when nothing or the root layout is selected → show
// email-layout settings instead of the per-block inspector).
const selectedBlock = computed<{
  id: string
  type: string
  data: EdmFlyhubBlock['data']
  baseData: EdmFlyhubBlock['data']
} | null>(() => {
  const id = store.selectedBlockId.value
  if (!id || id === 'root') return null
  const b = store.document.value[id]
  if (!b) return null
  const active = getBlockForDevice({ id, type: b.type, data: b.data }, activeDevice.value)
  return { id, type: b.type, data: active.data, baseData: b.data }
})

function onBlockUpdate(updates: { style?: unknown, props?: unknown, visibility?: { hideOnMobile?: boolean, hideOnDesktop?: boolean }, htmlEditable?: EdmHtmlEditableUpdate }) {
  const id = store.selectedBlockId.value
  if (!id) return
  if (updates.htmlEditable) updateSelectedHtmlEditable(updates.htmlEditable)
  if (updates.visibility) store.updateBlockVisibility(id, updates.visibility)
  if (activeDevice.value === 'mobile') {
    if (updates.style) store.updateBlockMobileStyle(id, updates.style as Record<string, unknown>)
    if (updates.props) store.updateBlockMobileProps(id, updates.props as Record<string, unknown>)
    return
  }
  if (updates.style) store.updateBlockStyle(id, updates.style as Record<string, unknown>)
  if (updates.props) store.updateBlockProps(id, updates.props as Record<string, unknown>)
}

function blockForCanvas(blockId: string) {
  const block = store.document.value[blockId]
  return block ? getBlockForDevice(block, activeDevice.value) : null
}

function hiddenOnCanvas(blockId: string): boolean {
  const block = store.document.value[blockId]
  return block ? isHiddenOnDevice(block, activeDevice.value) : false
}

function updateCanvasText(blockId: string, text: string) {
  if (activeDevice.value === 'mobile') {
    store.updateBlockMobileProps(blockId, { text })
    return
  }
  store.updateBlockProps(blockId, { text })
}

function updateCanvasProps(blockId: string, propsPatch: Record<string, unknown>) {
  if (activeDevice.value === 'mobile') {
    store.updateBlockMobileProps(blockId, propsPatch)
    return
  }
  store.updateBlockProps(blockId, propsPatch)
}

function updateCanvasStyle(blockId: string, stylePatch: Record<string, unknown>) {
  if (activeDevice.value === 'mobile') {
    store.updateBlockMobileStyle(blockId, stylePatch)
    return
  }
  store.updateBlockStyle(blockId, stylePatch)
}

function selectCanvasHtmlEditable(blockId: string, selection: EdmHtmlEditableSelection | null) {
  store.setSelectedBlockId(blockId)
  store.selectHtmlEditable(selection ? { ...selection, blockId } : null)
}

function selectedHtmlEditableFor(blockId: string): EdmHtmlEditableSelection | null {
  const selection = store.selectedHtmlEditable.value
  return selection?.blockId === blockId ? selection : null
}

function updateSelectedHtmlEditable(update: EdmHtmlEditableUpdate) {
  const blockId = store.selectedBlockId.value
  const selection = blockId ? selectedHtmlEditableFor(blockId) : null
  if (!blockId || !selection) return

  const activeBlock = blockForCanvas(blockId)
  const contents = (activeBlock?.data?.props?.contents as string) || ''
  const next = updateHtmlEditable(contents, selection.id, update)
  if (next === contents) return

  updateCanvasProps(blockId, { contents: next })
  const nextSelection = getHtmlEditableSelection(next, selection.id)
  store.selectHtmlEditable(nextSelection ? { ...nextSelection, blockId } : null)
}

const imageLibraryOpen = ref(false)
const imageLibraryTarget = ref<{ blockId: string, selectionId: string } | null>(null)

function openHtmlImageLibrary(blockId: string, selection: EdmHtmlEditableSelection) {
  selectCanvasHtmlEditable(blockId, selection)
  imageLibraryTarget.value = { blockId, selectionId: selection.id }
  imageLibraryOpen.value = true
}

function applyImageLibraryAsset(asset: EdmImageAsset) {
  const target = imageLibraryTarget.value
  if (!target) return
  const selection = selectedHtmlEditableFor(target.blockId)
  if (!selection || selection.id !== target.selectionId || selection.kind !== 'image') return
  updateSelectedHtmlEditable({ kind: 'image', src: normaliseEmailImageAssetUrl(asset.url), alt: selection.alt || asset.name })
  imageLibraryOpen.value = false
  imageLibraryTarget.value = null
}

// ── View modes + preview ────────────────────────────────────────────────
type ViewMode = 'editor' | 'preview' | 'html'
const viewMode = ref<ViewMode>('editor')
const activeDevice = ref<EdmDevice>('desktop')
const previewHtml = ref('')
const previewLoading = ref(false)
const previewError = ref('')
const showTestSendModal = ref(false)
const testSendTo = ref('')
const testSending = ref(false)
const testSendError = ref('')
const testSendResult = ref<{
  sent_to: string
  message_id?: string | null
  sendability?: {
    ok: boolean
    htmlBytes: number
    warnings: Array<{ code: string, message: string }>
    errors: Array<{ code: string, message: string }>
  }
} | null>(null)
const showScheduleModal = ref(false)
const scheduleAt = ref('')
const scheduling = ref(false)
const scheduleError = ref('')
const campaignPreflight = ref<EmailBuilderSchedulePreflight | null>(null)
const campaignSnapshot = ref<EmailBuilderScheduleRecipientSnapshot | null>(null)
const schedulePreflight = ref<EmailBuilderSchedulePreflight | null>(null)
const scheduleSnapshot = ref<EmailBuilderScheduleRecipientSnapshot | null>(null)
const scheduleBlocked = computed(() =>
  isEmailBuilderScheduleBlocked(schedulePreflight.value)
)
const scheduleActionDisabled = computed(() =>
  shouldDisableEmailBuilderScheduleAction(schedulePreflight.value, scheduleAt.value)
)

const VIEW_TABS: { value: ViewMode, label: string, icon: string }[] = [
  { value: 'editor', label: 'Editor', icon: 'i-lucide-pencil' },
  { value: 'preview', label: 'Preview', icon: 'i-lucide-eye' },
  { value: 'html', label: 'HTML', icon: 'i-lucide-code' }
]

const DEVICE_TABS: { value: EdmDevice, label: string, icon: string }[] = [
  { value: 'desktop', label: 'Desktop', icon: 'i-lucide-monitor' },
  { value: 'mobile', label: 'Mobile', icon: 'i-lucide-smartphone' }
]

const previewFrameClass = computed(() => {
  return activeDevice.value === 'mobile'
    ? 'max-w-[390px]'
    : 'max-w-[760px]'
})

async function renderPreview() {
  previewLoading.value = true
  previewError.value = ''
  try {
    const res = await apiFetch<{ html: string }>('/api/email/templates/render', {
      method: 'POST',
      body: {
        body_source: store.document.value,
        subject: subject.value || null,
        preview_text: previewText.value || null
      }
    })
    previewHtml.value = res.html
  } catch {
    previewError.value = 'Failed to render preview.'
    toast.add({ title: 'Preview failed', description: 'Could not render the email.', color: 'error' })
  } finally {
    previewLoading.value = false
  }
}

watch(viewMode, (mode) => {
  if (mode === 'preview' || mode === 'html') renderPreview()
})

function copyHtml() {
  navigator.clipboard?.writeText(previewHtml.value)
  toast.add({ title: 'Copied', description: 'HTML copied to clipboard.', color: 'success' })
}

function openTestSend() {
  testSendError.value = ''
  testSendResult.value = null
  showTestSendModal.value = true
}

function openSchedule() {
  scheduleAt.value = ''
  scheduleError.value = ''
  schedulePreflight.value = campaignPreflight.value
  scheduleSnapshot.value = campaignSnapshot.value
  showScheduleModal.value = true
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function saveCampaignContent() {
  if (!campaignId.value) return
  await apiFetch(`/api/email/campaigns/${campaignId.value}` as string, {
    method: 'PATCH',
    body: buildCampaignEditorPatch({
      subject: subject.value,
      previewText: previewText.value,
      fromEmail: fromEmail.value,
      bodySource: store.document.value
    })
  })
}

function testSendSuccessDescription(result: NonNullable<typeof testSendResult.value>) {
  const renderDetails = result.sendability ? ` Rendered HTML: ${result.sendability.htmlBytes} bytes.` : ''
  return `Sent to ${result.sent_to}.${renderDetails}`
}

async function sendTestEmail() {
  const recipient = testSendTo.value.trim()
  if (recipient && !isEmailAddress(recipient)) {
    testSendError.value = 'Enter a valid email address, or leave the recipient blank to use your account email.'
    toast.add({ title: 'Invalid recipient', description: testSendError.value, color: 'error' })
    return
  }

  testSending.value = true
  testSendError.value = ''
  testSendResult.value = null
  try {
    if (campaignId.value) await saveCampaignContent()
    const request = buildEmailBuilderTestSendRequest({
      campaignId: campaignId.value,
      to: recipient,
      subject: subject.value,
      previewText: previewText.value,
      bodySource: store.document.value
    })
    const res = await apiFetch<typeof testSendResult.value>(request.url, {
      method: 'POST',
      body: request.body
    })
    testSendResult.value = res
    toast.add({
      title: 'Test sent',
      description: `Sent to ${res?.sent_to || testSendTo.value || 'your account email'}.`,
      color: 'success'
    })
  } catch (error) {
    testSendError.value = describeEmailBuilderTestSendError(error)
    toast.add({ title: 'Test send failed', description: testSendError.value, color: 'error' })
  } finally {
    testSending.value = false
  }
}

async function scheduleCampaignFromBuilder() {
  if (!campaignId.value) return
  if (scheduleBlocked.value) {
    toast.add({
      title: 'Campaign is blocked',
      description: 'Resolve the blocked preflight checks before scheduling.',
      color: 'error'
    })
    return
  }
  const scheduleValidation = validateEmailBuilderScheduleAt(scheduleAt.value)
  if (scheduleValidation) {
    scheduleError.value = scheduleValidation
    toast.add({
      title: scheduleAt.value ? 'Invalid schedule time' : 'Schedule time required',
      description: scheduleError.value,
      color: 'error'
    })
    return
  }

  const scheduledDate = new Date(scheduleAt.value)
  scheduling.value = true
  scheduleError.value = ''
  schedulePreflight.value = null
  scheduleSnapshot.value = null
  try {
    await saveCampaignContent()
    const request = buildEmailBuilderScheduleRequest({
      campaignId: campaignId.value,
      scheduledAt: scheduledDate.toISOString()
    })
    const res = await apiFetch<{
      campaign?: {
        preflight_result?: EmailBuilderSchedulePreflight | null
        recipient_snapshot?: EmailBuilderScheduleRecipientSnapshot | null
      }
    }>(request.url, {
      method: 'PATCH',
      body: request.body
    })
    campaignPreflight.value = res.campaign?.preflight_result ?? null
    campaignSnapshot.value = res.campaign?.recipient_snapshot ?? null
    schedulePreflight.value = campaignPreflight.value
    scheduleSnapshot.value = campaignSnapshot.value
    toast.add({ title: 'Campaign scheduled', color: 'success' })
    showScheduleModal.value = false
  } catch (error) {
    const details = extractEmailBuilderScheduleError(error)
    scheduleError.value = details.message
    schedulePreflight.value = details.preflight
    scheduleSnapshot.value = details.recipientSnapshot
    toast.add({ title: 'Schedule failed', description: details.message, color: 'error' })
  } finally {
    scheduling.value = false
  }
}

// ── Save / load ─────────────────────────────────────────────────────────
// The composer doubles as a campaign body editor: opened with ?campaign=<id> it
// loads and saves that campaign's body (subject + body_source) instead of an
// edm_template. ?id=<templateId> is the original template-editing path.
const templateId = ref<string | null>(null)
const templateLoading = ref(true)
const templateLoadError = ref('')
let retryInitialLoad: (() => Promise<void>) | null = null
const campaignId = ref<string | null>(null)
const name = ref('')
const subject = ref('')
const previewText = ref('')
const fromEmail = ref('')
const saving = ref(false)
const showSaveModal = ref(false)
type TemplateKind = 'template' | 'draft'
const templateKind = ref<TemplateKind>('template')
const templateFolderName = ref('')
const templateClient = ref<string | undefined>()
const templateClients = ref<Array<{ id: string, name: string }>>([])
const canUseSharedTemplates = ref(false)
const loadingTemplateClients = ref(true)
const templateClientsError = ref(false)
const templateClientOptions = computed(() => [
  ...(canUseSharedTemplates.value ? [{ label: 'Shared default', value: '__shared__' }] : []),
  ...templateClients.value.map(client => ({ label: client.name, value: client.id }))
])
const hasValidTemplateClient = computed(() => templateClientOptions.value.some(option => option.value === templateClient.value))

async function loadTemplateClients() {
  loadingTemplateClients.value = true
  templateClientsError.value = false
  try {
    const result = await apiFetch<{ clients: Array<{ id: string, name: string }>, canUseSharedTemplates: boolean }>('/api/email/template-clients')
    templateClients.value = result.clients
    canUseSharedTemplates.value = result.canUseSharedTemplates
    const requested = route.query.client
    templateClient.value = typeof requested === 'string' && result.clients.some(client => client.id === requested)
      ? requested
      : undefined
  } catch {
    templateClientsError.value = true
  } finally {
    loadingTemplateClients.value = false
  }
}
const TEMPLATE_KIND_OPTIONS: { label: string, value: TemplateKind }[] = [
  { label: 'Template', value: 'template' },
  { label: 'Draft', value: 'draft' }
]

async function save(): Promise<boolean> {
  if (templateLoading.value || templateLoadError.value) return false
  if (designRevisionRequired.value && (designServiceUnavailable.value || designFlow.draft.value?.state !== 'structured')) {
    designFlow.error.value = 'The design service is unavailable. Your content is kept; reconnect it before saving this versioned draft.'
    return false
  }
  if (designFlow.hasPending.value) {
    designFlow.error.value = 'Reconcile the saved action before saving more changes.'
    return false
  }
  saving.value = true
  try {
    // Campaign mode: the campaign already exists (its name is managed in the
    // Campaigns tab), so we patch subject + body onto it — no name required.
    if (campaignId.value) {
      await saveCampaignContent()
      toast.add({ title: 'Saved', description: 'Campaign content saved.', color: 'success' })
      showSaveModal.value = false
      return true
    }

    if (!name.value.trim() || name.value.trim().length > 200) {
      toast.add({ title: 'Name required', description: 'Give the template a name up to 200 characters.', color: 'error' })
      return false
    }
    if (loadingTemplateClients.value || templateClientsError.value || !hasValidTemplateClient.value) {
      toast.add({ title: 'Client required', description: 'Choose an available client or shared default before saving.', color: 'error' })
      return false
    }
    const body = {
      client_id: templateClient.value === '__shared__' ? null : templateClient.value,
      name: name.value.trim(),
      subject: subject.value || null,
      preview_text: previewText.value || null,
      body_source: store.document.value,
      template_kind: templateKind.value,
      folder_name: templateFolderName.value.trim() || null
    }
    if (designFlow.draft.value?.state === 'structured') {
      await designFlow.saveStructured(store.document.value)
      await designFlow.saveMetadata(body.subject, body.preview_text)
    } else if (templateId.value) {
      await apiFetch(`/api/email/templates/${templateId.value}`, { method: 'PATCH', body })
    } else {
      const res = await apiFetch<{ template: { id: string } }>('/api/email/templates', {
        method: 'POST',
        body
      })
      templateId.value = res.template.id
      const query = { ...route.query }
      query.id = res.template.id
      delete query.copy
      delete query.starter
      void router.replace({ query }).catch(() => {
        toast.add({ title: 'Template saved', description: 'The address could not update. Reopen this template from the library before refreshing.', color: 'warning' })
      })
    }
    toast.add({ title: 'Saved', description: 'Template saved.', color: 'success' })
    showSaveModal.value = false
    return true
  } catch {
    toast.add({
      title: 'Save failed',
      description: campaignId.value ? 'Could not save the campaign.' : designFlow.draft.value?.state === 'structured' ? 'The draft could not finish saving. Your local changes are kept; retry the same save or reload to resolve a newer revision.' : 'Could not save the template.',
      color: 'error'
    })
    return false
  } finally {
    saving.value = false
  }
}

// FigFlow edits an independent template draft; campaigns and library originals
// keep their identities. The server owns scope, revisions and proposal effects.
async function beginFigflow(createDraft = false) {
  if (designFlow.hasPending.value) {
    await reconcileDesignAction()
    return
  }
  try {
    await designFlow.run(async () => {
      const openingSource = JSON.stringify(store.document.value)
      if (!hasValidTemplateClient.value || !name.value.trim()) {
        showSaveModal.value = true
        throw new Error('Name and client required')
      }
      if (createDraft) {
        if (draftCopyUnconfirmed.value) throw new Error('Check the draft library before creating another copy.')
        const draftName = `${name.value.slice(0, 180)} (design draft)`
        draftCopyUnconfirmed.value = true
        const result = await apiFetch<{ template: { id: string } }>('/api/email/templates', {
          method: 'POST', body: {
            name: draftName, subject: subject.value || null, preview_text: previewText.value || null,
            body_source: store.document.value, template_kind: 'draft', folder_name: templateFolderName.value || null,
            client_id: templateClient.value === '__shared__' ? null : templateClient.value
          }
        })
        draftCopyUnconfirmed.value = false
        templateId.value = result.template.id
        templateKind.value = 'draft'
        name.value = draftName
        designFlow.draft.value = null
        showDesignDraftCopy.value = false
        await router.replace({ query: { id: result.template.id } })
      } else if (!await save()) return
      if (!templateId.value) return
      if (JSON.stringify(store.document.value) !== openingSource) throw new Error('The composer changed while saving. Save again before opening FigFlow.')
      const result = await designFlow.open(templateId.value, templateClient.value === '__shared__' ? null : templateClient.value!)
      designRevisionRequired.value = true
      designServiceUnavailable.value = false
      designLocalConflict.value = false
      showFigflow.value = true
      await router.replace({ query: { ...route.query, designSession: result.id } })
    })
  } catch { /* The flow retains the failed operation and displays recovery. */ }
}
function sameDesignSource(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameDesignSource((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}
async function reconnectDesignService() {
  if (!templateId.value) return
  try {
    const expected = designFlow.draft.value?.headRevisionId ?? loadedDesignRevisionId.value ?? undefined
    const current = await designFlow.lookup(templateId.value, expected)
    if (designRevisionRequired.value && current?.state !== 'structured') throw new Error('Versioned draft unavailable')
    if (!expected && current?.state === 'structured' && !sameDesignSource(store.document.value, current.source.blocks)) {
      designFlow.draft.value = null
      designRevisionRequired.value = true
      throw new Error('The draft changed; reload before saving')
    }
    if (current?.state === 'structured' && current.projection.state !== 'current') throw new Error('Design projection needs reconciliation')
    designRevisionRequired.value = current?.state === 'structured'
    designServiceUnavailable.value = false
  } catch { designServiceUnavailable.value = true }
}
function closeFigflow() {
  if (designFlow.handoff.value?.state === 'open') showDiscardFigflow.value = true
  else showFigflow.value = false
}
function editInFigflow() {
  if (designFlow.handoff.value?.state === 'open' || designFlow.handoff.value?.state === 'proposed') {
    showFigflow.value = true
  } else if (!templateId.value || templateKind.value !== 'draft') {
    showDesignDraftCopy.value = true
  } else void beginFigflow()
}
async function proposeFigflow(design: import('~~/shared/emailRendering/designContract').EmailDesignDocument) {
  try {
    await designFlow.run(() => designFlow.propose(design))
  } catch { /* Shown in panel. */ }
}
async function applyFigflow() {
  const handoff = designFlow.handoff.value
  if (!handoff?.proposal) return
  // Compare without touching undo history before committing remotely. Compare
  // again after the response to preserve any edits made while awaiting it.

  if (!sameDesignSource(store.document.value, handoff.source.blocks)) {
    designLocalConflict.value = true
    return
  }
  try {
    await designFlow.run(async () => {
      const result = await designFlow.finish('apply')
      const current = designFlow.draft.value
      if (!current || current.headRevisionId !== result.appliedRevisionId || !store.applyDesignReturn(handoff.source.blocks, handoff.proposal!.blocks)) {
        designLocalConflict.value = true
        throw new Error('Current draft changed; local edits kept')
      }
      showFigflow.value = false
      toast.add({ title: 'Design changes saved', description: 'Applied as one undoable change.', color: 'success' })
    })
  } catch { /* The server conflicts or the local draft is preserved. */ }
}
async function cancelFigflow() {
  try {
    await designFlow.run(async () => {
      await designFlow.finish('cancel')
      showFigflow.value = false
    })
  } catch { /* Shown in panel. */ }
}
async function reconcileDesignAction() {
  try {
    await designFlow.run(async () => {
      const result = await designFlow.reconcile()
      if (!result) return
      if (result.templateId !== templateId.value) throw new Error('Design draft mismatch')
      if (result.state === 'applied' && result.proposal) {
        const current = designFlow.draft.value
        designLocalConflict.value = current?.headRevisionId !== result.appliedRevisionId
          || !store.applyDesignReturn(result.source.blocks, result.proposal.blocks)
      }
      showFigflow.value = true
      await router.replace({ query: { ...route.query, designSession: result.id } })
    })
  } catch { /* Keep original payload pending until its receipt is confirmed. */ }
}
async function resumeFigflow() {
  const id = designFlow.handoff.value?.id
  if (!id) return
  try {
    await designFlow.run(() => designFlow.resume(id))
  } catch { /* Shown in panel. */ }
}

// ── Save selection as a custom module ────────────────────────────────────
// Captures the selected block's subtree (extractFragment) and persists it as a
// reusable module that shows up in the "Custom Modules" palette category.
const customModules = useEdmCustomModules()
const showSaveModuleModal = ref(false)
const moduleName = ref('')
const moduleDescription = ref('')
const moduleCategory = ref('custom')
const moduleCustomCategory = ref('')
const saveModuleBlockType = ref('')
const savingModule = ref(false)
const moduleCategoryOptions = computed(() => [
  ...EDM_CUSTOM_MODULE_CATEGORY_OPTIONS.map(option => ({ label: option.label, value: option.value })),
  { label: 'Create new category...', value: CUSTOM_MODULE_NEW_CATEGORY }
])

function openSaveModule() {
  if (!selectedBlock.value) return
  moduleName.value = ''
  moduleDescription.value = ''
  moduleCategory.value = inferCustomModuleCategoryFromBlockType(selectedBlock.value.type)
  moduleCustomCategory.value = ''
  saveModuleBlockType.value = selectedBlock.value.type
  showSaveModuleModal.value = true
}

function openSaveModuleForBlock(blockId: string) {
  store.setSelectedBlockId(blockId)
  openSaveModule()
}

async function saveModule() {
  const block = selectedBlock.value
  if (!block) return
  if (!moduleName.value.trim()) {
    toast.add({ title: 'Name required', description: 'Give the module a name.', color: 'error' })
    return
  }
  savingModule.value = true
  try {
    const fragment = extractFragment(store.document.value, block.id)
    await customModules.save({
      name: moduleName.value.trim(),
      description: moduleDescription.value.trim() || null,
      category: resolveCustomModuleCategorySelection(moduleCategory.value, moduleCustomCategory.value),
      blocks: fragment
    })
    toast.add({ title: 'Saved', description: 'Module saved to your palette.', color: 'success' })
    showSaveModuleModal.value = false
  } catch {
    toast.add({ title: 'Save failed', description: 'Could not save the module.', color: 'error' })
  } finally {
    savingModule.value = false
  }
}

// Insert a saved module: re-ID its fragment so ids never collide with blocks
// already in the document, then splice it in at the given position.
function insertCustomModule(module: EdmCustomModule, position?: number) {
  const fragment = reidFragment(module.blocks)
  store.insertBlocks(fragment.blocks, fragment.rootChildrenIds, 'root', position)
}

// ── Manage saved modules (rename / delete) ───────────────────────────────
const showRenameModuleModal = ref(false)
const showDeleteModuleModal = ref(false)
const moduleBeingManaged = ref<EdmCustomModule | null>(null)
const renameModuleName = ref('')
const renameModuleDescription = ref('')
const renameModuleCategory = ref('custom')
const renameModuleCustomCategory = ref('')
const renamingModule = ref(false)
const deletingModule = ref(false)

function openRenameModule(module: EdmCustomModule) {
  moduleBeingManaged.value = module
  renameModuleName.value = module.name
  renameModuleDescription.value = module.description ?? ''
  const category = normaliseCustomModuleCategory(module.category)
  const known = EDM_CUSTOM_MODULE_CATEGORY_OPTIONS.some(option => option.value === category)
  renameModuleCategory.value = known ? category : CUSTOM_MODULE_NEW_CATEGORY
  renameModuleCustomCategory.value = known ? '' : labelCustomModuleCategory(category)
  showRenameModuleModal.value = true
}

async function confirmRenameModule() {
  const module = moduleBeingManaged.value
  if (!module) return
  if (!renameModuleName.value.trim()) {
    toast.add({ title: 'Name required', description: 'Give the module a name.', color: 'error' })
    return
  }
  renamingModule.value = true
  try {
    await customModules.rename(module.id, {
      name: renameModuleName.value.trim(),
      description: renameModuleDescription.value.trim() || null,
      category: resolveCustomModuleCategorySelection(renameModuleCategory.value, renameModuleCustomCategory.value)
    })
    toast.add({ title: 'Renamed', description: 'Module updated.', color: 'success' })
    showRenameModuleModal.value = false
  } catch {
    toast.add({ title: 'Rename failed', description: 'Could not update the module.', color: 'error' })
  } finally {
    renamingModule.value = false
  }
}

function openDeleteModule(module: EdmCustomModule) {
  moduleBeingManaged.value = module
  showDeleteModuleModal.value = true
}

async function confirmDeleteModule() {
  const module = moduleBeingManaged.value
  if (!module) return
  deletingModule.value = true
  try {
    await customModules.remove(module.id)
    toast.add({ title: 'Deleted', description: 'Module removed.', color: 'success' })
    showDeleteModuleModal.value = false
  } catch {
    toast.add({ title: 'Delete failed', description: 'Could not delete the module.', color: 'error' })
  } finally {
    deletingModule.value = false
  }
}

onMounted(async () => {
  async function initialise() {
    templateLoading.value = true
    templateLoadError.value = ''
    try {
      const campaign = route.query.campaign
      if (typeof campaign === 'string' && campaign) {
        campaignId.value = campaign
        try {
          const res = await apiFetch<{
            campaign: {
              id: string
              name: string
              subject: string | null
              from_email: string | null
              preview_text: string | null
              body_source: unknown
              preflight_result?: EmailBuilderSchedulePreflight | null
              recipient_snapshot?: EmailBuilderScheduleRecipientSnapshot | null
            }
          }>(`/api/email/campaigns/${campaign}`)
          if (res.campaign?.body_source) {
            store.resetDocument(res.campaign.body_source as EdmFlyhubDocument)
          }
          name.value = res.campaign.name || ''
          subject.value = res.campaign.subject || ''
          fromEmail.value = res.campaign.from_email || ''
          previewText.value = res.campaign.preview_text || ''
          campaignPreflight.value = res.campaign.preflight_result ?? null
          campaignSnapshot.value = res.campaign.recipient_snapshot ?? null
          schedulePreflight.value = campaignPreflight.value
          scheduleSnapshot.value = campaignSnapshot.value
        } catch {
          templateLoadError.value = 'Could not load this campaign. Retry before editing.'
          toast.add({ title: 'Load failed', description: 'Could not load that campaign.', color: 'error' })
        }
        return
      }

      await loadTemplateClients()
      if (templateClientsError.value) throw new Error('Client choices could not load.')

      const starter = route.query.starter
      if (typeof starter === 'string' && starter) {
        const starterTemplate = findStarterTemplate(starter)
        if (starterTemplate) {
          store.setTemplatePreset(starterTemplate.id)
          name.value = starterTemplate.name
          subject.value = starterTemplate.subject
          previewText.value = starterTemplate.previewText
          templateKind.value = 'template'
          templateFolderName.value = ''
        } else { templateLoadError.value = 'This starter template is not available. Return to the library to choose another.' }
        return
      }

      const copying = typeof route.query.copy === 'string' && !!route.query.copy
      const id = copying ? route.query.copy : route.query.id
      if (typeof id !== 'string' || !id) return
      try {
        const res = await apiFetch<{
          template: {
            id: string
            name: string
            subject: string | null
            preview_text: string | null
            body_source: unknown
            template_kind?: TemplateKind | null
            folder_name?: string | null
            client_id: string | null
            email_design_revision_id?: string | null
          }
        }>(`/api/email/templates/${id}`)
        if (res.template?.body_source) {
          store.resetDocument((copying ? markTemplateClientCopy(res.template.body_source, res.template.id) : res.template.body_source) as EdmFlyhubDocument)
        }
        templateId.value = copying ? null : res.template.id
        name.value = copying ? templateCopyName(res.template.name) : res.template.name || ''
        subject.value = res.template.subject || ''
        previewText.value = res.template.preview_text || ''
        templateKind.value = res.template.template_kind === 'draft' ? 'draft' : 'template'
        templateFolderName.value = copying ? templateCopyCategory(res.template.body_source, res.template.folder_name) : res.template.folder_name || ''
        if (!copying) templateClient.value = res.template.client_id ?? '__shared__'
        loadedDesignRevisionId.value = copying ? null : res.template.email_design_revision_id ?? null
        designRevisionRequired.value = !!loadedDesignRevisionId.value
        if (figflowEnabled && !copying) {
          await reconnectDesignService()
          const sessionId = route.query.designSession
          if (!designServiceUnavailable.value && typeof sessionId === 'string') {
            try {
              const session = await designFlow.resume(sessionId)
              if (session.templateId !== res.template.id) throw new Error('Design draft mismatch')
              showFigflow.value = session.state === 'open' || session.state === 'proposed'
            } catch {
              designFlow.handoff.value = null
              designFlow.error.value = 'The saved FigFlow handoff could not be reopened. Your composer content is kept.'
            }
          }
        } else designServiceUnavailable.value = designRevisionRequired.value
      } catch {
        templateLoadError.value = 'Could not load this template. Retry before editing.'
        toast.add({ title: 'Load failed', description: 'Could not load that template.', color: 'error' })
      }
    } catch {
      templateLoadError.value = 'The editor could not load its template or client choices. Retry before editing.'
    } finally {
      templateLoading.value = false
    }
  }
  retryInitialLoad = initialise
  await initialise()
})
</script>

<template>
  <div v-if="templateLoading || templateLoadError" class="space-y-4 p-6" role="status">
    <p v-if="templateLoading" class="text-sm text-muted">
      Loading your email workspace…
    </p>
    <UAlert
      v-else
      color="error"
      :title="templateLoadError"
      :actions="[{ label: 'Retry', onClick: () => retryInitialLoad?.() }]"
    />
    <UButton
      to="/agency/email?tab=templates"
      label="Back to templates"
      variant="outline"
      color="neutral"
    />
  </div>
  <div v-show="!templateLoading && !templateLoadError" class="flex flex-col h-full">
    <!-- Toolbar -->
    <header class="flex items-center gap-2 px-4 py-2 border-b border-default">
      <div class="flex items-center gap-1">
        <UButton
          icon="i-lucide-undo-2"
          variant="ghost"
          color="neutral"
          size="sm"
          :disabled="!store.canUndo.value"
          title="Undo"
          @click="store.undo()"
        />
        <UButton
          icon="i-lucide-redo-2"
          variant="ghost"
          color="neutral"
          size="sm"
          :disabled="!store.canRedo.value"
          title="Redo"
          @click="store.redo()"
        />
      </div>

      <div class="flex items-center gap-1 ml-2">
        <UButton
          v-for="t in VIEW_TABS"
          :key="t.value"
          :icon="t.icon"
          :label="t.label"
          size="sm"
          :variant="viewMode === t.value ? 'solid' : 'ghost'"
          :color="viewMode === t.value ? 'primary' : 'neutral'"
          @click="viewMode = t.value"
        />
      </div>

      <div class="inline-flex rounded-md border border-default bg-default p-1 ml-2">
        <UButton
          v-for="device in DEVICE_TABS"
          :key="device.value"
          :icon="device.icon"
          :label="device.label"
          size="xs"
          :variant="activeDevice === device.value ? 'solid' : 'ghost'"
          color="neutral"
          @click="activeDevice = device.value"
        />
      </div>

      <span v-if="name" class="ml-2 text-xs text-muted truncate max-w-48">{{ name }}</span>

      <div class="flex-1" />

      <UBadge
        v-if="campaignId"
        color="primary"
        variant="subtle"
        icon="i-lucide-send"
        label="Editing campaign"
        class="mr-1"
      />
      <UButton
        v-if="viewMode !== 'editor'"
        icon="i-lucide-refresh-cw"
        variant="ghost"
        color="neutral"
        size="sm"
        :loading="previewLoading"
        label="Refresh"
        @click="renderPreview()"
      />
      <UButton
        v-if="campaignId"
        icon="i-lucide-calendar-clock"
        variant="outline"
        color="neutral"
        size="sm"
        label="Schedule"
        @click="openSchedule()"
      />
      <UButton
        icon="i-lucide-send"
        variant="outline"
        color="neutral"
        size="sm"
        label="Send test"
        @click="openTestSend()"
      />
      <UButton
        v-if="figflowEnabled && !campaignId"
        icon="i-lucide-pen-tool"
        label="Edit in FigFlow"
        variant="outline"
        color="neutral"
        size="sm"
        :loading="designFlow.busy.value"
        :disabled="saving"
        @click="editInFigflow"
      />
      <UButton
        icon="i-lucide-save"
        color="primary"
        size="sm"
        :label="campaignId ? 'Save to campaign' : 'Save'"
        @click="showSaveModal = true"
      />
    </header>

    <UAlert
      v-if="designServiceUnavailable"
      color="warning"
      title="FigFlow is temporarily unavailable"
      :description="designRevisionRequired ? 'Your content is kept. Reconnect the design service before saving this versioned draft.' : 'You can continue editing and saving this template in the composer.'"
      :actions="[{ label: 'Reconnect design service', onClick: reconnectDesignService }]"
      class="m-3"
    />
    <UAlert
      v-if="(designFlow.error.value || designFlow.hasPending.value) && !showFigflow"
      color="error"
      :title="designFlow.error.value || 'The last save is unconfirmed. Reconcile it before making another save.'"
      class="m-3"
      :actions="designFlow.hasPending.value ? [{ label: 'Reconcile saved action', onClick: reconcileDesignAction }] : []"
    />
    <!-- Body -->
    <div class="flex-1 overflow-hidden">
      <!-- Editor -->
      <div v-show="viewMode === 'editor'" class="flex h-full">
        <!-- Left: slim category rail with a top-docked flyout panel. -->
        <div class="relative flex h-full shrink-0" @keydown.esc.stop="closeFlyout()">
          <aside class="w-52 border-r border-default bg-default p-2 overflow-auto">
            <p class="px-2 py-2 text-[11px] font-semibold uppercase text-muted">
              Modules
            </p>
            <button
              v-for="category in EDM_SECTION_CATEGORIES"
              :key="category.id"
              type="button"
              class="w-full flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors"
              :class="activeFlyoutCategoryId === category.id ? 'bg-elevated text-default font-semibold' : 'text-muted hover:text-default hover:bg-elevated/60'"
              @mouseenter="openFlyout(category.id)"
              @mouseleave="scheduleCloseFlyout()"
              @focus="openFlyout(category.id)"
              @click="openFlyout(category.id)"
            >
              <UIcon :name="category.icon" class="h-4 w-4 shrink-0" />
              <span class="truncate flex-1">{{ category.label }}</span>
              <UIcon name="i-lucide-chevron-right" class="h-3.5 w-3.5 shrink-0 opacity-50" />
            </button>
          </aside>

          <EmailBuilderEdmCategoryFlyoutPanel
            v-if="activeFlyoutCategory"
            :category="activeFlyoutCategory"
            @insert="insertFromFlyout"
            @mouseenter="cancelCloseFlyout()"
            @mouseleave="scheduleCloseFlyout()"
          />
        </div>

        <!-- Center: canvas -->
        <main
          class="flex-1 p-6 overflow-auto"
          :style="{ backgroundColor: layout.backdropColor }"
          @click="onCanvasClick()"
        >
          <div
            class="mx-auto max-w-[600px] min-h-64 rounded shadow-sm"
            :style="{ backgroundColor: layout.canvasColor, color: layout.textColor }"
            @click.stop
          >
            <!-- Empty state: click to open the unified Add module bubble (opens
                 on Basic modules). Hovering the left rail still works too. -->
            <div
              v-if="childBlocks.length === 0"
              class="flex flex-col items-center justify-center py-20 text-center"
            >
              <UPopover v-model:open="emptyAddOpen" :content="{ side: 'bottom', align: 'center' }">
                <button
                  type="button"
                  class="flex flex-col items-center justify-center text-center rounded-lg px-6 py-4 transition-colors hover:bg-elevated/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <UIcon name="i-lucide-plus" class="h-12 w-12 text-muted/50 mb-4" />
                  <span class="font-medium text-default">Start with a section or Basic block</span>
                  <span class="mt-1 text-sm text-muted">Add a Basic module or a section to begin.</span>
                </button>
                <template #content>
                  <EmailBuilderEdmAddModuleMenu
                    @insert="(preset) => { insertPreset(preset, 0); emptyAddOpen = false }"
                    @insert-module="(m) => { insertCustomModule(m, 0); emptyAddOpen = false }"
                    @rename-module="openRenameModule"
                    @delete-module="openDeleteModule"
                  />
                </template>
              </UPopover>
            </div>

            <!-- Block list -->
            <template v-for="(block, index) in childBlocks" :key="block.id">
              <EmailBuilderEditorBlockWrapper
                :block-id="block.id"
                :is-drag-source="draggedRootBlockId === block.id"
                :drop-placement="rootDropPreview?.targetBlockId === block.id ? rootDropPreview.placement : null"
                @move-up="moveBlock(block.id, 'up')"
                @move-down="moveBlock(block.id, 'down')"
                @duplicate="store.duplicateBlock(block.id)"
                @save="openSaveModule()"
                @delete="store.removeBlock(block.id)"
                @insert-preset-above="(preset) => insertPreset(preset, index)"
                @insert-preset-below="(preset) => insertPreset(preset, index + 1)"
                @insert-module-above="(module) => insertCustomModule(module, index)"
                @insert-module-below="(module) => insertCustomModule(module, index + 1)"
                @rename-module="openRenameModule"
                @delete-module="openDeleteModule"
                @drag-start="startRootDrag(block.id)"
                @drag-over="(placement) => previewRootDrop(block.id, placement)"
                @drag-leave="clearRootDropPreview(block.id)"
                @drop="(placement) => dropRootBlock(block.id, placement)"
                @drag-end="clearRootDrag"
              >
                <EmailBuilderContainerBlockRenderer
                  v-if="block.type === 'Container'"
                  :block-id="block.id"
                  :style="blockForCanvas(block.id)?.data?.style"
                  :props="blockForCanvas(block.id)?.data?.props"
                  :device="activeDevice"
                  @save-block="openSaveModuleForBlock"
                />
                <EmailBuilderColumnsContainerRenderer
                  v-else-if="block.type === 'ColumnsContainer'"
                  :block-id="block.id"
                  :style="blockForCanvas(block.id)?.data?.style"
                  :props="blockForCanvas(block.id)?.data?.props"
                  :device="activeDevice"
                />
                <EmailBuilderEdmBlockRenderer
                  v-else
                  :type="block.type"
                  :style="blockForCanvas(block.id)?.data?.style"
                  :props="blockForCanvas(block.id)?.data?.props"
                  :hidden-on-device="hiddenOnCanvas(block.id)"
                  :selected-html-editable-id="selectedHtmlEditableFor(block.id)?.id"
                  :html-editing-enabled="store.selectedBlockId.value === block.id"
                  :image-library-enabled="true"
                  editable
                  @update:text="(t) => updateCanvasText(block.id, t)"
                  @update:props="(p) => updateCanvasProps(block.id, p)"
                  @update:style="(s) => updateCanvasStyle(block.id, s)"
                  @select:html-editable="(selection) => selectCanvasHtmlEditable(block.id, selection)"
                  @request:html-image-library="(selection) => openHtmlImageLibrary(block.id, selection)"
                />
              </EmailBuilderEditorBlockWrapper>
            </template>

            <!-- Add at end: category browser with live thumbnails, inserts at
                 the end of the block list (position = childBlocks.length). -->
            <div v-if="childBlocks.length > 0" class="flex justify-center py-3">
              <UPopover v-model:open="addAtEndOpen" :content="{ side: 'bottom', align: 'center' }">
                <UButton
                  icon="i-lucide-plus"
                  variant="soft"
                  color="primary"
                  size="sm"
                  label="Add block"
                />
                <template #content>
                  <EmailBuilderEdmAddModuleMenu
                    @insert="(preset) => { insertPreset(preset, childBlocks.length); addAtEndOpen = false }"
                    @insert-module="(m) => { insertCustomModule(m, childBlocks.length); addAtEndOpen = false }"
                    @rename-module="openRenameModule"
                    @delete-module="openDeleteModule"
                  />
                </template>
              </UPopover>
            </div>
          </div>
        </main>

        <!-- Right: block inspector when a block is selected, else email settings -->
        <aside class="w-80 border-l border-default p-3 overflow-auto">
          <template v-if="selectedBlock">
            <div class="flex items-center justify-between mb-3">
              <p class="text-xs font-semibold uppercase text-muted">
                {{ selectedBlock.type }} settings
              </p>
              <UTooltip text="Save this block as a reusable module">
                <UButton
                  icon="i-lucide-bookmark-plus"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  label="Save module"
                  @click="openSaveModule()"
                />
              </UTooltip>
            </div>
            <EmailBuilderBlockSettingsPanel
              :block="selectedBlock"
              :base-block="{ id: selectedBlock.id, type: selectedBlock.type, data: selectedBlock.baseData }"
              :device="activeDevice"
              :html-editable="selectedHtmlEditableFor(selectedBlock.id)"
              @update="onBlockUpdate"
            />
          </template>
          <template v-else>
            <p class="text-xs font-semibold uppercase text-muted mb-3">
              Email settings
            </p>
            <EmailBuilderEmailLayoutSettings :settings="layout" @update="updateLayout" />
          </template>
        </aside>
      </div>

      <!-- Preview -->
      <div v-if="viewMode === 'preview'" class="h-full overflow-auto bg-elevated/30 p-6">
        <div v-if="previewError" class="mx-auto max-w-[600px]">
          <UAlert color="error" :title="previewError" />
        </div>
        <iframe
          v-else
          :srcdoc="previewHtml"
          sandbox=""
          title="Email preview"
          :class="[
            'mx-auto block w-full h-full min-h-[600px] rounded border border-default bg-white',
            previewFrameClass
          ]"
        />
      </div>

      <!-- HTML -->
      <div v-if="viewMode === 'html'" class="h-full overflow-auto p-6">
        <div class="mx-auto max-w-3xl space-y-3">
          <div class="flex justify-end">
            <UButton
              icon="i-lucide-copy"
              variant="outline"
              color="neutral"
              size="sm"
              label="Copy HTML"
              @click="copyHtml()"
            />
          </div>
          <UTextarea
            :model-value="previewHtml"
            readonly
            :rows="24"
            class="w-full font-mono text-xs"
          />
        </div>
      </div>
    </div>

    <!-- Save modal -->
    <UModal v-model:open="showSaveModal" :title="campaignId ? 'Save to campaign' : 'Save template'">
      <template #content>
        <div class="@container p-4 space-y-4">
          <p class="text-sm font-semibold">
            {{ campaignId ? `Save content to “${name || 'campaign'}”` : (templateId ? 'Update template' : 'Save template') }}
          </p>
          <p v-if="campaignId" class="text-sm text-muted">
            This updates the campaign's email content, subject, and sender. Manage its name and
            recipients from the Campaigns tab.
          </p>
          <UFormField v-if="!campaignId" label="Name" required>
            <UInput
              v-model="name"
              :disabled="designFlow.draft.value?.state === 'structured'"
              :maxlength="200"
              placeholder="e.g. Monthly newsletter"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="!campaignId"
            label="Client"
            required
            :error="templateClientsError ? 'Client choices could not load. Reload the builder to try again.' : undefined"
            help="Shared defaults are reusable agency templates. Client copies are independent."
          >
            <USelect
              v-model="templateClient"
              :items="templateClientOptions"
              value-key="value"
              placeholder="Choose a client"
              :loading="loadingTemplateClients"
              :disabled="loadingTemplateClients || templateClientsError || designFlow.draft.value?.state === 'structured'"
              class="w-full"
            />
          </UFormField>
          <div v-if="!campaignId" class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <UFormField label="Save as">
              <USelect
                v-model="templateKind"
                :disabled="designFlow.draft.value?.state === 'structured'"
                :items="TEMPLATE_KIND_OPTIONS"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Category">
              <UInput
                v-model="templateFolderName"
                :disabled="designFlow.draft.value?.state === 'structured'"
                placeholder="e.g. Newsletters"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField label="Subject line">
            <UInput v-model="subject" placeholder="Subject shown in the inbox" class="w-full" />
          </UFormField>
          <UFormField
            v-if="campaignId"
            label="From email"
            required
            help="Use an address on an authenticated sender domain."
          >
            <UInput
              v-model="fromEmail"
              type="email"
              placeholder="newsletter@example.com"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Preview text" help="The snippet shown after the subject in most inboxes.">
            <UInput v-model="previewText" placeholder="Preview text" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              label="Cancel"
              @click="showSaveModal = false"
            />
            <UButton
              color="primary"
              label="Save"
              :loading="saving"
              :disabled="!campaignId && (loadingTemplateClients || templateClientsError || !hasValidTemplateClient)"
              @click="save()"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Save selection as a reusable custom module -->
    <UModal v-model:open="showSaveModuleModal" title="Save as module">
      <template #content>
        <div class="p-4 space-y-4">
          <p class="text-sm text-muted">
            Saves the selected <span class="font-medium text-default">{{ saveModuleBlockType }}</span>
            block (and its contents) as a reusable module. It'll appear in the
            <span class="font-medium text-default">Custom Modules</span> palette category for any email.
          </p>
          <UFormField label="Name" required>
            <UInput v-model="moduleName" placeholder="e.g. Brand header, Footer with socials" class="w-full" />
          </UFormField>
          <UFormField label="Description" help="Optional — a short note to recognise it later.">
            <UInput v-model="moduleDescription" placeholder="Optional description" class="w-full" />
          </UFormField>
          <UFormField label="Category">
            <USelect
              v-model="moduleCategory"
              :items="moduleCategoryOptions"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="moduleCategory === CUSTOM_MODULE_NEW_CATEGORY"
            label="New category"
          >
            <UInput
              v-model="moduleCustomCategory"
              placeholder="e.g. Dealer specials"
              class="w-full"
            />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              label="Cancel"
              @click="showSaveModuleModal = false"
            />
            <UButton
              color="primary"
              label="Save module"
              :loading="savingModule"
              @click="saveModule()"
            />
          </div>
        </div>
      </template>
    </UModal>

    <EmailBuilderEdmImageLibraryPicker
      v-model:open="imageLibraryOpen"
      @pick="applyImageLibraryAsset"
    />

    <!-- Send a single test email from the active builder context. -->
    <UModal v-model:open="showTestSendModal" title="Send test email">
      <template #content>
        <div class="p-4 space-y-4">
          <p class="text-sm text-muted">
            <template v-if="campaignId">
              Saves the current campaign content, then checks campaign preflight and sender-domain readiness before Resend receives it.
            </template>
            <template v-else>
              Sends the current editor content through the production renderer and checks the sendability gate before Resend receives it.
            </template>
          </p>
          <UFormField label="Recipient" help="Leave blank to send to your account email.">
            <UInput
              v-model="testSendTo"
              type="email"
              name="email"
              autocomplete="email"
              inputmode="email"
              autocapitalize="none"
              autocorrect="off"
              :spellcheck="false"
              placeholder="name@example.com"
              class="w-full"
            />
          </UFormField>
          <UAlert
            v-if="testSendError"
            color="error"
            title="Test send failed"
            :description="testSendError"
          />
          <UAlert
            v-if="testSendResult"
            color="success"
            title="Test sent"
            :description="testSendSuccessDescription(testSendResult)"
          />
          <div
            v-if="testSendResult?.sendability?.warnings.length"
            class="rounded-md border border-warning/30 bg-warning/5 p-3"
          >
            <p class="text-xs font-semibold uppercase text-warning mb-2">
              Sendability warnings
            </p>
            <ul class="space-y-1 text-sm text-muted">
              <li
                v-for="warning in testSendResult.sendability?.warnings"
                :key="warning.code"
              >
                {{ warning.message }}
              </li>
            </ul>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              label="Cancel"
              @click="showTestSendModal = false"
            />
            <UButton
              color="primary"
              icon="i-lucide-send"
              label="Send test"
              :loading="testSending"
              @click="sendTestEmail()"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Schedule the active campaign from the builder after saving current content. -->
    <UModal v-model:open="showScheduleModal" title="Schedule campaign" :ui="{ content: 'max-w-2xl' }">
      <template #content>
        <div class="p-4 space-y-4">
          <div>
            <p class="text-sm font-semibold">
              Schedule “{{ name || 'campaign' }}”
            </p>
            <p class="text-sm text-muted">
              Saves the current campaign content, then runs the campaign preflight before booking the send.
            </p>
          </div>

          <EmailCampaignPreflightPanel
            :preflight="schedulePreflight"
            :recipient-snapshot="scheduleSnapshot"
          />

          <UFormField label="Send at" required>
            <UInput
              v-model="scheduleAt"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>

          <UAlert
            v-if="scheduleError"
            color="error"
            :icon="scheduleBlocked ? 'i-lucide-shield-alert' : undefined"
            :title="scheduleBlocked ? 'Campaign is blocked' : 'Schedule failed'"
            :description="scheduleBlocked ? 'Resolve the blocked preflight checks before scheduling.' : scheduleError"
          />

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              label="Cancel"
              @click="showScheduleModal = false"
            />
            <UButton
              color="primary"
              icon="i-lucide-calendar-check"
              label="Schedule"
              :loading="scheduling"
              :disabled="scheduleActionDisabled"
              @click="scheduleCampaignFromBuilder()"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showDesignDraftCopy" title="Create a design draft">
      <template #body>
        <UAlert
          v-if="draftCopyUnconfirmed"
          color="warning"
          title="Draft creation is unconfirmed"
          description="Check the template library for the design draft before creating another copy. The request may have succeeded."
        />
        <p class="text-sm text-muted">
          Create an independent draft from the current composer content, then open it in FigFlow. The library template remains available for other emails.
        </p>
      </template>
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="outline"
          @click="showDesignDraftCopy = false"
        />
        <UButton
          label="Create draft and open FigFlow"
          :disabled="draftCopyUnconfirmed"
          :loading="designFlow.busy.value"
          @click="beginFigflow(true)"
        />
      </template>
    </UModal>
    <UModal
      v-model:open="showFigflow"
      fullscreen
      :dismissible="false"
      title="Edit email in FigFlow"
    >
      <template #content>
        <div class="flex h-full min-h-0 flex-col gap-4 p-4 sm:p-6">
          <header class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-lg font-semibold">
                {{ name }}
              </h2><p class="text-sm text-muted">
                FigFlow email design · changes are reviewed before applying
              </p>
            </div>
            <UButton
              icon="i-lucide-x"
              label="Back to composer"
              color="neutral"
              variant="ghost"
              :disabled="designFlow.busy.value"
              @click="closeFigflow"
            />
          </header>
          <UButton
            v-if="designFlow.hasPending.value"
            label="Reconcile saved action"
            color="neutral"
            variant="outline"
            :loading="designFlow.busy.value"
            @click="reconcileDesignAction"
          />
          <EmailBuilderEdmFigflowHandoff
            v-if="designFlow.handoff.value"
            :key="designFlow.handoff.value.id"
            :handoff="designFlow.handoff.value"
            :busy="designFlow.busy.value"
            :error="designFlow.error.value"
            :conflict="designLocalConflict"
            :subject="subject"
            :preview-text="previewText"
            @propose="proposeFigflow"
            @apply="applyFigflow"
            @cancel="cancelFigflow"
            @resume="resumeFigflow"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showDiscardFigflow" title="Leave FigFlow without returning?">
      <template #body>
        <p class="text-sm text-muted">
          Changes inside FigFlow are saved only after Return for review. Leaving now discards those unsaved edits. Your saved composer draft stays available.
        </p>
      </template>
      <template #footer>
        <UButton
          label="Keep editing"
          color="neutral"
          variant="outline"
          @click="showDiscardFigflow = false"
        />
        <UButton label="Discard unsaved FigFlow edits" color="error" @click="showDiscardFigflow = false; showFigflow = false" />
      </template>
    </UModal>

    <!-- Rename a saved module -->
    <UModal v-model:open="showRenameModuleModal" title="Rename module">
      <template #content>
        <div class="p-4 space-y-4">
          <UFormField label="Name" required>
            <UInput v-model="renameModuleName" placeholder="Module name" class="w-full" />
          </UFormField>
          <UFormField label="Description" help="Optional.">
            <UInput v-model="renameModuleDescription" placeholder="Optional description" class="w-full" />
          </UFormField>
          <UFormField label="Category">
            <USelect
              v-model="renameModuleCategory"
              :items="moduleCategoryOptions"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="renameModuleCategory === CUSTOM_MODULE_NEW_CATEGORY"
            label="New category"
          >
            <UInput
              v-model="renameModuleCustomCategory"
              placeholder="e.g. Dealer specials"
              class="w-full"
            />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              label="Cancel"
              @click="showRenameModuleModal = false"
            />
            <UButton
              color="primary"
              label="Save"
              :loading="renamingModule"
              @click="confirmRenameModule()"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Delete a saved module (confirm) -->
    <UModal v-model:open="showDeleteModuleModal" title="Delete module">
      <template #content>
        <div class="p-4 space-y-4">
          <p class="text-sm text-muted">
            Delete <span class="font-medium text-default">{{ moduleBeingManaged?.name }}</span>?
            This removes it from the Custom Modules palette. Emails you already built with it are unaffected.
          </p>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              label="Cancel"
              @click="showDeleteModuleModal = false"
            />
            <UButton
              color="error"
              label="Delete"
              :loading="deletingModule"
              @click="confirmDeleteModule()"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
