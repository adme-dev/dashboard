<!-- app/components/email/builder/EdmFlyhubBuilder.client.vue -->
<!-- Editor shell: canvas (2a-ii-2) + block inspector (2a-ii-3) + toolbar with
     undo/redo, Editor/Preview/HTML views, and Save to edm_templates (2a-ii-4).
     Loads an existing template via ?id= or a starter layout via ?starter=. -->
<script setup lang="ts">
import { EDM_SECTION_CATEGORIES, findStarterTemplate } from '~~/app/utils/edmPresets'
import type { EdmSectionPreset } from '~~/app/utils/edmPresets'
import type { EdmFlyhubDocument } from '~~/app/types/edm'
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
const route = useRoute()
const toast = useToast()

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
const selectedBlock = computed(() => {
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
  Boolean(scheduleError.value) && isEmailBuilderScheduleBlocked(schedulePreflight.value)
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
    const res = await $fetch<{ html: string }>('/api/email/templates/render', {
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
  await $fetch(`/api/email/campaigns/${campaignId.value}`, {
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
    const res = await $fetch<typeof testSendResult.value>(request.url, {
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
  if (!scheduleAt.value) {
    scheduleError.value = 'Choose a send time.'
    toast.add({ title: 'Schedule time required', description: scheduleError.value, color: 'error' })
    return
  }

  const scheduledDate = new Date(scheduleAt.value)
  if (Number.isNaN(scheduledDate.getTime())) {
    scheduleError.value = 'Choose a valid send time.'
    toast.add({ title: 'Invalid schedule time', description: scheduleError.value, color: 'error' })
    return
  }

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
    const res = await $fetch<{
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
const TEMPLATE_KIND_OPTIONS: { label: string, value: TemplateKind }[] = [
  { label: 'Template', value: 'template' },
  { label: 'Draft', value: 'draft' }
]

async function save() {
  saving.value = true
  try {
    // Campaign mode: the campaign already exists (its name is managed in the
    // Campaigns tab), so we patch subject + body onto it — no name required.
    if (campaignId.value) {
      await saveCampaignContent()
      toast.add({ title: 'Saved', description: 'Campaign content saved.', color: 'success' })
      showSaveModal.value = false
      return
    }

    if (!name.value.trim()) {
      toast.add({ title: 'Name required', description: 'Give the template a name.', color: 'error' })
      return
    }
    const body = {
      name: name.value.trim(),
      subject: subject.value || null,
      preview_text: previewText.value || null,
      body_source: store.document.value,
      template_kind: templateKind.value,
      folder_name: templateFolderName.value.trim() || null
    }
    if (templateId.value) {
      await $fetch(`/api/email/templates/${templateId.value}`, { method: 'PATCH', body })
    } else {
      const res = await $fetch<{ template: { id: string } }>('/api/email/templates', {
        method: 'POST',
        body
      })
      templateId.value = res.template.id
    }
    toast.add({ title: 'Saved', description: 'Template saved.', color: 'success' })
    showSaveModal.value = false
  } catch {
    toast.add({
      title: 'Save failed',
      description: campaignId.value ? 'Could not save the campaign.' : 'Could not save the template.',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
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
  const campaign = route.query.campaign
  if (typeof campaign === 'string' && campaign) {
    campaignId.value = campaign
    try {
      const res = await $fetch<{
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
      toast.add({ title: 'Load failed', description: 'Could not load that campaign.', color: 'error' })
    }
    return
  }

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
    }
    return
  }

  const id = route.query.id
  if (typeof id !== 'string' || !id) return
  try {
    const res = await $fetch<{
      template: {
        id: string
        name: string
        subject: string | null
        preview_text: string | null
        body_source: unknown
        template_kind?: TemplateKind | null
        folder_name?: string | null
      }
    }>(`/api/email/templates/${id}`)
    if (res.template?.body_source) {
      store.resetDocument(res.template.body_source as EdmFlyhubDocument)
    }
    templateId.value = res.template.id
    name.value = res.template.name || ''
    subject.value = res.template.subject || ''
    previewText.value = res.template.preview_text || ''
    templateKind.value = res.template.template_kind === 'draft' ? 'draft' : 'template'
    templateFolderName.value = res.template.folder_name || ''
  } catch {
    toast.add({ title: 'Load failed', description: 'Could not load that template.', color: 'error' })
  }
})
</script>

<template>
  <div class="flex flex-col h-full">
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
        icon="i-lucide-save"
        color="primary"
        size="sm"
        :label="campaignId ? 'Save to campaign' : 'Save'"
        @click="showSaveModal = true"
      />
    </header>

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
        <div class="p-4 space-y-4">
          <p class="text-sm font-semibold">
            {{ campaignId ? `Save content to “${name || 'campaign'}”` : (templateId ? 'Update template' : 'Save template') }}
          </p>
          <p v-if="campaignId" class="text-sm text-muted">
            This updates the campaign's email content, subject, and sender. Manage its name and
            recipients from the Campaigns tab.
          </p>
          <UFormField v-if="!campaignId" label="Name" required>
            <UInput v-model="name" placeholder="e.g. Monthly newsletter" class="w-full" />
          </UFormField>
          <div v-if="!campaignId" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UFormField label="Save as">
              <USelect
                v-model="templateKind"
                :items="TEMPLATE_KIND_OPTIONS"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Folder">
              <UInput v-model="templateFolderName" placeholder="e.g. Newsletters" class="w-full" />
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
              :disabled="scheduleBlocked"
              @click="scheduleCampaignFromBuilder()"
            />
          </div>
        </div>
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
