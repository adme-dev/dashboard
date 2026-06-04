<!-- app/components/email/builder/EdmFlyhubBuilder.client.vue -->
<!-- Editor shell: canvas (2a-ii-2) + block inspector (2a-ii-3) + toolbar with
     undo/redo, Editor/Preview/HTML views, and Save to edm_templates (2a-ii-4).
     Loads an existing template via ?id= or a starter layout via ?starter=. -->
<script setup lang="ts">
import { getDefaultBlockData } from '~~/app/utils/edmBlocks'
import { EDM_SECTION_CATEGORIES, findStarterTemplate } from '~~/app/utils/edmPresets'
import type { EdmSectionPreset } from '~~/app/utils/edmPresets'
import type { EdmFlyhubDocument } from '~~/app/types/edm'

const store = useEdmBuilder()
const route = useRoute()
const toast = useToast()

const layout = computed(() => store.getLayoutSettings())

// ── Palette ───────────────────────────────────────────────────────────────
// Slim category list; each category is a hover/focus flyout (UPopover) that
// reveals live-rendered thumbnails of its presets. Per-category open state lets
// us close the flyout the moment a preset is inserted.
const flyoutOpen = reactive<Record<string, boolean>>({})

// Add-at-end picker keeps a selected category (its own popover is a
// category → presets browser anchored to the canvas "+" button).
const selectedCategoryId = ref(EDM_SECTION_CATEGORIES[0]?.id || 'basic')
const selectedCategory = computed(() => {
  return EDM_SECTION_CATEGORIES.find(category => category.id === selectedCategoryId.value) || EDM_SECTION_CATEGORIES[0]
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

// Hybrid open/close: controlled popover (click + Enter/Space + focus reachable)
// with hover-to-open layered on top. A short close delay lets the pointer
// travel from trigger into the panel without it snapping shut.
const closeTimers: Record<string, ReturnType<typeof setTimeout> | undefined> = {}

function cancelCloseFlyout(id: string) {
  if (closeTimers[id]) {
    clearTimeout(closeTimers[id])
    closeTimers[id] = undefined
  }
}

function openFlyout(id: string) {
  cancelCloseFlyout(id)
  flyoutOpen[id] = true
}

function scheduleCloseFlyout(id: string) {
  cancelCloseFlyout(id)
  closeTimers[id] = setTimeout(() => {
    flyoutOpen[id] = false
    closeTimers[id] = undefined
  }, 150)
}

function insertFromFlyout(category: { id: string }, preset: EdmSectionPreset) {
  insertPreset(preset)
  cancelCloseFlyout(category.id)
  flyoutOpen[category.id] = false
}

const addAtEndOpen = ref(false)

const childBlocks = computed(() => {
  const root = store.document.value.root
  const childrenIds = root?.data?.childrenIds || []
  return childrenIds.map(id => ({
    id,
    type: store.document.value[id]?.type || 'Unknown',
    data: store.document.value[id]?.data || {}
  }))
})

function addBlock(type: string, position?: number) {
  store.addBlock(type, 'root', position, getDefaultBlockData(type))
}

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
  return { id, type: b.type, data: b.data }
})

function onBlockUpdate(updates: { style?: unknown, props?: unknown }) {
  const id = store.selectedBlockId.value
  if (!id) return
  if (updates.style) store.updateBlockStyle(id, updates.style as Record<string, unknown>)
  if (updates.props) store.updateBlockProps(id, updates.props as Record<string, unknown>)
}

// ── View modes + preview ────────────────────────────────────────────────
type ViewMode = 'editor' | 'preview' | 'html'
const viewMode = ref<ViewMode>('editor')
const previewHtml = ref('')
const previewLoading = ref(false)
const previewError = ref('')

const VIEW_TABS: { value: ViewMode, label: string, icon: string }[] = [
  { value: 'editor', label: 'Editor', icon: 'i-lucide-pencil' },
  { value: 'preview', label: 'Preview', icon: 'i-lucide-eye' },
  { value: 'html', label: 'HTML', icon: 'i-lucide-code' }
]

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

// ── Save / load ─────────────────────────────────────────────────────────
// The composer doubles as a campaign body editor: opened with ?campaign=<id> it
// loads and saves that campaign's body (subject + body_source) instead of an
// edm_template. ?id=<templateId> is the original template-editing path.
const templateId = ref<string | null>(null)
const campaignId = ref<string | null>(null)
const name = ref('')
const subject = ref('')
const previewText = ref('')
const saving = ref(false)
const showSaveModal = ref(false)

async function save() {
  saving.value = true
  try {
    // Campaign mode: the campaign already exists (its name is managed in the
    // Campaigns tab), so we patch subject + body onto it — no name required.
    if (campaignId.value) {
      await $fetch(`/api/email/campaigns/${campaignId.value}`, {
        method: 'PATCH',
        body: {
          subject: subject.value || null,
          preview_text: previewText.value || null,
          body_source: store.document.value
        }
      })
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
      body_source: store.document.value
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
          preview_text: string | null
          body_source: unknown
        }
      }>(`/api/email/campaigns/${campaign}`)
      if (res.campaign?.body_source) {
        store.resetDocument(res.campaign.body_source as EdmFlyhubDocument)
      }
      name.value = res.campaign.name || ''
      subject.value = res.campaign.subject || ''
      previewText.value = res.campaign.preview_text || ''
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
      }
    }>(`/api/email/templates/${id}`)
    if (res.template?.body_source) {
      store.resetDocument(res.template.body_source as EdmFlyhubDocument)
    }
    templateId.value = res.template.id
    name.value = res.template.name || ''
    subject.value = res.template.subject || ''
    previewText.value = res.template.preview_text || ''
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
        <!-- Left: slim category rail; hovering/focusing a category opens a
             flyout of live-rendered section thumbnails (Postcards fidelity). -->
        <aside class="w-44 border-r border-default bg-default p-2 overflow-auto">
          <p class="px-2 py-2 text-[11px] font-semibold uppercase text-muted">Modules</p>
          <UPopover
            v-for="category in EDM_SECTION_CATEGORIES"
            :key="category.id"
            v-model:open="flyoutOpen[category.id]"
            :content="{ side: 'right', align: 'start' }"
          >
            <button
              type="button"
              class="w-full flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors"
              :class="flyoutOpen[category.id] ? 'bg-elevated text-default font-semibold' : 'text-muted hover:text-default hover:bg-elevated/60'"
              @mouseenter="openFlyout(category.id)"
              @mouseleave="scheduleCloseFlyout(category.id)"
            >
              <UIcon :name="category.icon" class="h-4 w-4 shrink-0" />
              <span class="truncate flex-1">{{ category.label }}</span>
              <UIcon name="i-lucide-chevron-right" class="h-3.5 w-3.5 shrink-0 opacity-50" />
            </button>

            <template #content>
              <div
                class="w-[340px] max-h-[70vh] overflow-auto p-3"
                @mouseenter="cancelCloseFlyout(category.id)"
                @mouseleave="scheduleCloseFlyout(category.id)"
              >
                <p class="text-[11px] font-semibold uppercase text-muted mb-3">{{ category.label }}</p>
                <div class="space-y-3">
                  <button
                    v-for="preset in category.presets"
                    :key="preset.id"
                    type="button"
                    class="block w-full overflow-hidden rounded-md border border-default bg-default text-left transition hover:border-primary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    @click="insertFromFlyout(category, preset)"
                  >
                    <!-- Fixed-height clip so short & tall presets yield even tiles. -->
                    <div class="h-32 overflow-hidden bg-elevated/40 flex items-start justify-center">
                      <EmailBuilderEdmSectionThumbnail :preset="preset" :width="300" />
                    </div>
                    <div class="p-3">
                      <p class="text-sm font-semibold">{{ preset.name }}</p>
                      <p class="mt-1 text-xs text-muted leading-snug">{{ preset.description }}</p>
                    </div>
                  </button>
                </div>
              </div>
            </template>
          </UPopover>
        </aside>

        <!-- Center: canvas -->
        <main
          class="flex-1 p-6 overflow-auto"
          :style="{ backgroundColor: layout.backdropColor }"
          @click="store.clearSelection()"
        >
          <div
            class="mx-auto max-w-[600px] min-h-64 rounded shadow-sm"
            :style="{ backgroundColor: layout.canvasColor, color: layout.textColor }"
            @click.stop
          >
            <!-- Empty state -->
            <div
              v-if="childBlocks.length === 0"
              class="flex flex-col items-center justify-center py-20 text-center"
            >
              <UIcon name="i-lucide-plus" class="h-12 w-12 text-muted/50 mb-4" />
              <p class="font-medium text-default">Start with a section or Basic block</p>
              <p class="mt-1 text-sm text-muted">Hover a module category on the left to preview and add a section.</p>
            </div>

            <!-- Block list -->
            <template v-for="(block, index) in childBlocks" :key="block.id">
              <EmailBuilderEditorBlockWrapper
                :block-id="block.id"
                @move-up="moveBlock(block.id, 'up')"
                @move-down="moveBlock(block.id, 'down')"
                @duplicate="store.duplicateBlock(block.id)"
                @delete="store.removeBlock(block.id)"
                @insert-above="addBlock($event, index)"
                @insert-below="addBlock($event, index + 1)"
              >
                <EmailBuilderContainerBlockRenderer
                  v-if="block.type === 'Container'"
                  :block-id="block.id"
                  :style="block.data?.style"
                  :props="block.data?.props"
                />
                <EmailBuilderColumnsContainerRenderer
                  v-else-if="block.type === 'ColumnsContainer'"
                  :block-id="block.id"
                  :style="block.data?.style"
                  :props="block.data?.props"
                />
                <EmailBuilderEdmBlockRenderer
                  v-else
                  :type="block.type"
                  :style="block.data?.style"
                  :props="block.data?.props"
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
                  <div class="flex w-[460px] max-h-[60vh]">
                    <div class="w-36 shrink-0 border-r border-default p-2 overflow-auto">
                      <button
                        v-for="category in EDM_SECTION_CATEGORIES"
                        :key="category.id"
                        type="button"
                        class="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors"
                        :class="selectedCategoryId === category.id ? 'bg-elevated text-default font-semibold' : 'text-muted hover:text-default hover:bg-elevated/60'"
                        @click="selectedCategoryId = category.id"
                      >
                        <UIcon :name="category.icon" class="h-3.5 w-3.5 shrink-0" />
                        <span class="truncate">{{ category.label }}</span>
                      </button>
                    </div>
                    <div class="flex-1 overflow-auto p-3 space-y-3">
                      <button
                        v-for="preset in selectedCategory?.presets"
                        :key="preset.id"
                        type="button"
                        class="block w-full overflow-hidden rounded-md border border-default bg-default text-left transition hover:border-primary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        @click="insertPreset(preset, childBlocks.length); addAtEndOpen = false"
                      >
                        <div class="h-28 overflow-hidden bg-elevated/40 flex items-start justify-center">
                          <EmailBuilderEdmSectionThumbnail :preset="preset" :width="240" />
                        </div>
                        <div class="p-2">
                          <p class="text-xs font-semibold">{{ preset.name }}</p>
                        </div>
                      </button>
                    </div>
                  </div>
                </template>
              </UPopover>
            </div>
          </div>
        </main>

        <!-- Right: block inspector when a block is selected, else email settings -->
        <aside class="w-80 border-l border-default p-3 overflow-auto">
          <template v-if="selectedBlock">
            <p class="text-xs font-semibold uppercase text-muted mb-3">
              {{ selectedBlock.type }} settings
            </p>
            <EmailBuilderBlockSettingsPanel :block="selectedBlock" @update="onBlockUpdate" />
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
          class="mx-auto block w-full max-w-[600px] h-full min-h-[600px] rounded border border-default bg-white"
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
            This updates the campaign's email content and subject. Manage its name and
            recipients from the Campaigns tab.
          </p>
          <UFormField v-if="!campaignId" label="Name" required>
            <UInput v-model="name" placeholder="e.g. Monthly newsletter" class="w-full" />
          </UFormField>
          <UFormField label="Subject line">
            <UInput v-model="subject" placeholder="Subject shown in the inbox" class="w-full" />
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
  </div>
</template>
