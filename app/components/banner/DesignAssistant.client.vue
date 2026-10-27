<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import type { ArtboardState } from '~/types/banner-studio'
import { resolveBannerFormat } from '~/utils/banner-constants'
import { buildBannerHTML } from '~/utils/banner-html-builder'
import { assertScopedDesignTransition, isDesignScopeProtected, validateDesignScope, type BannerDesignScope } from '~~/shared/bannerDesignScope'
import { assertScopedPreviewFits } from '~/utils/banner-scoped-preview'
import { apiErrorDescription } from '~/utils/apiError'

type Canvas = Record<string, ArtboardState>
type Message = { role: 'user' | 'assistant', content: string }
type DesignReference = { id: string, name: string, kind: 'image' | 'guide', description: string, url?: string, guideCharacterCount?: number, analysisModel?: string }
type Proposal = { scope?: BannerDesignScope, sourceRevision?: string, inventory?: { affectedLayerIds: number[], protectedLayerIds: number[] }, reply: string, model: string, canvasData: Canvas, caption?: string, suggestedSchedule?: string, context?: { brandKit: string | null, clientStyleGuide: boolean, references: Array<{ id: string, name: string, kind: 'image' | 'guide' }> } }
const props = defineProps<{ open: boolean, projectId: string }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  'prepare-social': [suggestion: { caption?: string, suggestedSchedule?: string }]
  'generate-image': []
}>()
const { state, getCanvasData, applyAssistantCanvas, canUndo, undo } = useBannerStudio()
const { getExportCustomFonts } = useBannerFonts()
const prompt = ref('')
const brief = ref('')
const messages = ref<Message[]>([])
const references = ref<DesignReference[]>([])
const referenceFiles = ref<File[]>([])
const uploadingReference = ref(false)
const uploadingName = ref('')
const attachmentErrors = ref<string[]>([])
const expandedReference = ref<string | null>(null)
let uploadVersion = 0
let uploadController: AbortController | undefined
const guideCharacters = computed(() => references.value.reduce((total, item) => total + (item.guideCharacterCount || 0), 0))
const model = ref<'auto' | 'fast' | 'quality'>('auto')
const allowLocked = ref(false)
const advanced = ref(false)
const pending = ref(false)
const error = ref('')
const proposal = ref<Proposal | null>(null)
const sourceSnapshot = ref('')
const appliedSnapshot = ref('')
const proposalProjectId = ref('')
const clientId = computed(() => state.project?.clientId || null)
const proposalClientId = ref<string | null>(null)
const previewKey = ref('')
const replay = ref(0)
let requestVersion = 0
let controller: AbortController | undefined
const scoped = ref(false)
const scopeLayerIds = ref<number[]>([])
const scopeRegion = ref({ x: 0, y: 0, w: 300, h: 250 })
const approvedCopyText = ref('')
const reviewedCopy = ref(false)
const applying = ref(false)
const fit = ref<'pending' | 'passed' | 'failed'>('pending')
const fitError = ref('')
let mounted = true
const requestedScope = ref<BannerDesignScope | null>(null)
const requestedRevision = ref('')
const sourceCanvas = ref<Canvas | null>(null)
const scopeBoard = computed(() => state.sets[state.activeKey])
const editableScopeLayers = computed(() => (scopeBoard.value?.layers || []).filter(layer => !isDesignScopeProtected(layer, scopeBoard.value!)).map(layer => ({ label: `${layer.name} (#${layer.id})`, value: layer.id })))
const currentScope = computed<BannerDesignScope>(() => ({ formatKey: state.activeKey, layerIds: scopeLayerIds.value, region: { ...scopeRegion.value }, approvedCopy: approvedCopyText.value.split('\n').map(line => line.trim()).filter(Boolean) }))
const scopeProblem = computed(() => {
  if (!scoped.value) return ''
  if (!state.project?.updatedAt) return 'Save this project before requesting a scoped edit.'
  try {
    validateDesignScope(getCanvasData(), currentScope.value)
    return ''
  } catch (cause) {
    return cause instanceof Error ? cause.message : 'Choose editable layers and a bounded region.'
  }
})
const scopeChanged = computed(() => !!requestedScope.value && (!scoped.value || JSON.stringify(currentScope.value) !== JSON.stringify(requestedScope.value) || state.project?.updatedAt !== requestedRevision.value))
function useSelectedLayer() {
  scopeLayerIds.value = state.selectedLayerId != null && editableScopeLayers.value.some(layer => layer.value === state.selectedLayerId) ? [state.selectedLayerId] : []
  const format = resolveBannerFormat(state.activeKey)
  if (format) scopeRegion.value = { x: 0, y: 0, w: format.w, h: format.h }
}
watch(scoped, () => {
  if (scoped.value) useSelectedLayer()
  reviewedCopy.value = false
})
watch([currentScope, () => state.project?.updatedAt], () => {
  reviewedCopy.value = false
}, { deep: true })
const changedLayers = computed(() => {
  if (!proposal.value?.inventory || !requestedScope.value) return []
  const key = requestedScope.value.formatKey
  return proposal.value.inventory.affectedLayerIds.map(id => ({ id, before: sourceCanvas.value?.[key]?.layers.find(layer => layer.id === id), after: proposal.value?.canvasData[key]?.layers.find(layer => layer.id === id) }))
})
const protectedLayers = computed(() => requestedScope.value ? sourceCanvas.value?.[requestedScope.value.formatKey]?.layers.filter(layer => !requestedScope.value!.layerIds.includes(layer.id)) || [] : [])
const snapshot = computed(() => JSON.stringify(getCanvasData()))
const stale = computed(() => !!proposal.value && (proposalProjectId.value !== props.projectId || proposalClientId.value !== clientId.value || sourceSnapshot.value !== snapshot.value || scopeChanged.value))
const applied = computed(() => !!appliedSnapshot.value && appliedSnapshot.value === snapshot.value && proposalProjectId.value === props.projectId && proposalClientId.value === clientId.value)
const canRequest = computed(() => !!prompt.value.trim() && !uploadingReference.value && !pending.value && !scopeProblem.value && props.projectId !== 'new' && state.project?.id === props.projectId)
const canAttach = computed(() => !pending.value && !uploadingReference.value && references.value.length < 6 && props.projectId !== 'new' && state.project?.id === props.projectId)
const formats = computed(() => (requestedScope.value ? [requestedScope.value.formatKey] : Object.keys(proposal.value?.canvasData || {})).flatMap((key) => {
  const format = resolveBannerFormat(key)
  if (!format) return []
  const label = ['Facebook', 'Instagram'].includes(format.platform)
    ? `${format.w}×${format.h} · ${format.w === format.h ? 'Square' : format.w > format.h ? 'Landscape' : format.h / format.w > 1.5 ? 'Story / Reel' : 'Portrait'}`
    : format.label
  return [{ value: key, label }]
}))
const previewContainer = ref<HTMLElement | null>(null)
const { width: previewWidth } = useElementSize(previewContainer)
const preview = computed(() => {
  const artboard = proposal.value?.canvasData[previewKey.value]
  const format = resolveBannerFormat(previewKey.value)
  if (!artboard || !format) return null
  const scale = Math.min((previewWidth.value || 280) / format.w, 320 / format.h, 1)
  return {
    format, scale,
    html: buildBannerHTML(previewKey.value, artboard.layers, {
      playback: artboard.playback,
      includeAnimations: !requestedScope.value, bgColor: artboard.bgColor || state.bgColor,
      customFonts: getExportCustomFonts(artboard.layers)
    })
  }
})

const beforePreview = computed(() => {
  const artboard = sourceCanvas.value?.[previewKey.value]
  if (!requestedScope.value || !artboard) return null
  return buildBannerHTML(previewKey.value, artboard.layers, { playback: artboard.playback, includeAnimations: false, bgColor: artboard.bgColor || state.bgColor, customFonts: getExportCustomFonts(artboard.layers) })
})

function storageKey(id: string) {
  return `banner-design-chat:v2:${encodeURIComponent(id)}:${encodeURIComponent(clientId.value || '__unassigned__')}`
}
function persist() {
  try {
    sessionStorage.setItem(storageKey(props.projectId), JSON.stringify({ messages: messages.value.slice(-20), brief: brief.value.slice(0, 4000), references: references.value }))
  } catch { /* Private browsing or a full session store must not block editing. */ }
}
watch([() => props.projectId, clientId], () => {
  requestVersion++
  controller?.abort()
  uploadVersion++
  uploadController?.abort()
  uploadingReference.value = false
  uploadingName.value = ''
  attachmentErrors.value = []
  referenceFiles.value = []
  references.value = []
  expandedReference.value = null
  pending.value = false
  proposal.value = null
  appliedSnapshot.value = ''
  prompt.value = ''
  error.value = ''
  allowLocked.value = false
  scoped.value = false
  scopeLayerIds.value = []
  requestedScope.value = null
  reviewedCopy.value = false
  sourceCanvas.value = null
  messages.value = []
  brief.value = ''
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey(props.projectId)) || 'null')
    if (Array.isArray(saved?.messages)) {
      messages.value = saved.messages.filter((m: Message) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
        .slice(-20).map((m: Message) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    }
    if (typeof saved?.brief === 'string') brief.value = saved.brief.slice(0, 4000)
    if (Array.isArray(saved?.references)) {
      for (const candidate of saved.references.slice(0, 6)) {
        const item = normalizeReference(candidate)
        if (!item || references.value.some(reference => reference.id === item.id)) continue
        if (item.kind === 'image' && references.value.filter(reference => reference.kind === 'image').length >= 3) continue
        if (item.kind === 'guide' && guideCharacters.value + (item.guideCharacterCount || 0) > 12000) continue
        references.value.push(item)
      }
    }
  } catch { /* Invalid history can be replaced by the next successful request. */ }
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => {
  mounted = false
  requestVersion++
  controller?.abort()
  uploadVersion++
  uploadController?.abort()
})

function normalizeReference(value: unknown): DesignReference | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<DesignReference>
  if (typeof item.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(item.id) || !['image', 'guide'].includes(item.kind || '') || typeof item.name !== 'string' || typeof item.description !== 'string') return null
  if (item.kind === 'guide' && (!Number.isInteger(item.guideCharacterCount) || item.guideCharacterCount! < 1 || item.guideCharacterCount! > 12000)) return null
  return {
    id: item.id, kind: item.kind!, name: item.name.slice(0, 200), description: item.description.slice(0, 4000),
    ...(typeof item.url === 'string' && /^https?:\/\//.test(item.url) ? { url: item.url.slice(0, 4000) } : {}),
    ...(item.kind === 'guide' ? { guideCharacterCount: item.guideCharacterCount } : {}),
    ...(typeof item.analysisModel === 'string' ? { analysisModel: item.analysisModel.slice(0, 200) } : {})
  }
}
async function uploadReferences(files: File[] | null) {
  if (!files?.length || !canAttach.value) return
  attachmentErrors.value = []
  if (references.value.length + files.length > 6) {
    attachmentErrors.value = ['Attach at most six references and guides in total.']
    referenceFiles.value = []
    return
  }
  const version = ++uploadVersion
  const projectId = props.projectId
  const contextClientId = clientId.value
  const current = () => version === uploadVersion && props.projectId === projectId && clientId.value === contextClientId
  uploadController = new AbortController()
  uploadingReference.value = true
  try {
    for (const file of files) {
      if (!current()) return
      uploadingName.value = file.name
      try {
        const extension = file.name.split('.').pop()?.toLowerCase()
        const isGuide = ['txt', 'md', 'markdown'].includes(extension || '')
        let characterCount: number | undefined
        if (isGuide) {
          if (file.size > 48000) throw new Error('Guides must total 12,000 text characters or fewer.')
          characterCount = (await file.text()).trim().length
          if (!current()) return
          if (!characterCount || guideCharacters.value + characterCount > 12000) throw new Error('Guides must contain text and total 12,000 characters or fewer.')
        } else {
          if (!['png', 'jpg', 'jpeg', 'webp'].includes(extension || '')) throw new Error('Use PNG, JPEG or WebP images, or TXT/Markdown guides. PDF is not supported.')
          if (file.size > 5 * 1024 * 1024) throw new Error('Reference images must be 5 MB or smaller.')
          if (references.value.filter(item => item.kind === 'image').length >= 3) throw new Error('Attach at most three reference images.')
        }
        const body = new FormData()
        body.append('projectId', projectId)
        body.append('file', file)
        const result = await $fetch<{ reference: DesignReference }>('/api/agency/banner-studio/ai/references', { method: 'POST', body, signal: uploadController.signal })
        if (!current()) return
        const item = normalizeReference({ ...result.reference, ...(isGuide ? { guideCharacterCount: result.reference.guideCharacterCount ?? characterCount } : {}) })
        if (!item) throw new Error('Reference analysis could not be confirmed. Please upload it again.')
        references.value.push(item)
        persist()
      } catch (cause: unknown) {
        if (!current()) return
        attachmentErrors.value.push(`${file.name}: ${apiErrorDescription(cause, 'Upload or analysis failed. Try again.')}`)
      }
    }
  } finally {
    if (current()) {
      uploadingReference.value = false
      uploadingName.value = ''
      referenceFiles.value = []
    }
  }
}
function removeReference(id: string) {
  if (pending.value || uploadingReference.value) return
  references.value = references.value.filter(item => item.id !== id)
  if (expandedReference.value === id) expandedReference.value = null
  persist()
}

async function requestProposal() {
  if (!canRequest.value) return
  const version = ++requestVersion
  const projectId = props.projectId
  const requestClientId = clientId.value
  const original = JSON.stringify(getCanvasData())
  const canvasData = !scoped.value && proposal.value && !stale.value && !applied.value ? proposal.value.canvasData : getCanvasData()
  const editScope = scoped.value ? JSON.parse(JSON.stringify(currentScope.value)) as BannerDesignScope : undefined
  const revision = state.project?.updatedAt
  const text = prompt.value.trim()
  const history = messages.value.slice(-12)
  controller = new AbortController()
  pending.value = true
  error.value = ''
  try {
    const result = await $fetch<Proposal>('/api/agency/banner-studio/ai/design-assist', {
      method: 'POST', signal: controller.signal,
      body: { projectId, prompt: text, brief: brief.value, history, canvasData, activeKey: state.activeKey, model: model.value, allowLocked: editScope ? false : allowLocked.value, ...(editScope ? { scope: editScope, sourceRevision: revision } : {}), referenceIds: references.value.map(item => item.id) }
    })
    if (version !== requestVersion || props.projectId !== projectId || clientId.value !== requestClientId) return
    if (editScope) {
      if (JSON.stringify(result.scope) !== JSON.stringify(editScope) || result.sourceRevision !== revision) throw new Error('Proposal scope or source revision could not be confirmed')
      result.inventory = assertScopedDesignTransition(canvasData, result.canvasData, editScope)
    }
    requestedScope.value = editScope || null
    requestedRevision.value = revision || ''
    reviewedCopy.value = false
    sourceCanvas.value = JSON.parse(original)
    fit.value = 'pending'
    fitError.value = ''
    proposal.value = result
    sourceSnapshot.value = original
    proposalProjectId.value = projectId
    proposalClientId.value = requestClientId
    appliedSnapshot.value = ''
    previewKey.value = editScope?.formatKey || (Object.hasOwn(result.canvasData, state.activeKey) ? state.activeKey : Object.keys(result.canvasData)[0] || '')
    replay.value++
    messages.value = [...messages.value, { role: 'user', content: text }, { role: 'assistant', content: result.reply.slice(0, 4000) }].slice(-20) as Message[]
    prompt.value = ''
    persist()
  } catch (cause: unknown) {
    if (version !== requestVersion) return
    const failure = cause as { data?: { statusMessage?: string } }
    error.value = failure.data?.statusMessage || (cause instanceof Error ? `Could not prepare a design. ${cause.message}` : 'Could not prepare a design. Your canvas is unchanged. Try again.')
  } finally {
    if (version === requestVersion) pending.value = false
  }
}
async function measurePreview(event: Event) {
  if (!requestedScope.value || !proposal.value || previewKey.value !== requestedScope.value.formatKey) return
  const expected = proposal.value
  const frame = event.target as HTMLIFrameElement
  fit.value = 'pending'
  reviewedCopy.value = false
  try {
    const board = expected.canvasData[requestedScope.value.formatKey]!
    const ids = new Set([...requestedScope.value.layerIds, ...(expected.inventory?.affectedLayerIds || [])])
    await assertScopedPreviewFits(frame, board.layers.filter(layer => ids.has(layer.id)))
    if (mounted && proposal.value === expected && frame.isConnected) fit.value = 'passed'
  } catch (cause) {
    if (mounted && proposal.value === expected && frame.isConnected) {
      fit.value = 'failed'
      fitError.value = cause instanceof Error ? cause.message : 'Preview text could not be measured.'
    }
  }
}
async function apply() {
  if (applying.value || !mounted || !proposal.value || stale.value || applied.value || pending.value || state.project?.id !== props.projectId) return
  if (requestedScope.value && (!reviewedCopy.value || fit.value !== 'passed' || previewKey.value !== requestedScope.value.formatKey)) return
  applying.value = true
  const version = requestVersion
  try {
    if (requestedScope.value) {
      const expected = proposal.value
      const source = sourceSnapshot.value
      const project = await $fetch<{ id: string, clientId: string | null, updatedAt: string }>(`/api/agency/banner-studio/projects/${encodeURIComponent(props.projectId)}`)
      if (!mounted || !props.open || version !== requestVersion || pending.value || !reviewedCopy.value || fit.value !== 'passed' || previewKey.value !== requestedScope.value?.formatKey || proposal.value !== expected || stale.value || source !== snapshot.value || project.id !== props.projectId || project.clientId !== proposalClientId.value || project.updatedAt !== requestedRevision.value) throw new Error('Saved project or edit scope changed; request a new proposal before applying')
      assertScopedDesignTransition(getCanvasData(), proposal.value.canvasData, requestedScope.value)
    }
    applyAssistantCanvas(proposal.value.canvasData)
    appliedSnapshot.value = JSON.stringify(getCanvasData())
  } catch (cause) {
    error.value = apiErrorDescription(cause, 'Proposal could not be applied; request a new preview.')
  } finally {
    applying.value = false
  }
}
function discard() {
  proposal.value = null
  appliedSnapshot.value = ''
}
function prepareSocial() {
  if (!applied.value || !proposal.value || pending.value) return
  emit('prepare-social', { caption: proposal.value.caption, suggestedSchedule: proposal.value.suggestedSchedule })
  emit('update:open', false)
}
function clearConversation() {
  messages.value = []
  references.value = []
  expandedReference.value = null
  brief.value = ''
  discard()
  persist()
}
const quickActions = [
  { label: 'Edit layout', prompt: 'Improve the headline hierarchy and spacing while preserving the existing artwork and brand.' },
  { label: 'Animate', prompt: 'Add a restrained, readable animation to this design using native layer motion.' },
  { label: 'Social variants', prompt: 'Create matching square, portrait and story formats using the existing artwork. Suggest a social caption for review.' }
]
</script>

<template>
  <USlideover
    :open="open"
    title="Create with AI"
    description="Propose, preview and refine your design."
    side="right"
    :ui="{ content: 'w-full sm:max-w-xl', body: 'min-h-0 overflow-y-auto' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="@container space-y-5">
        <p class="text-sm text-muted">
          Uses this project's client, brand and current artwork. Apply a proposal when you're ready; each application can be undone.
        </p>
        <UFormField label="Edit boundary" help="Keep a reviewed region separate from the rest of the artwork.">
          <UCheckbox v-model="scoped" label="Limit changes to a region" :disabled="pending" />
        </UFormField>
        <section v-if="scoped" aria-label="Scoped edit boundary" class="space-y-4 border-l-2 border-primary pl-4">
          <UFormField label="Editable layers" help="Everything outside this selection is protected, including its position and pixels.">
            <USelectMenu
              v-model="scopeLayerIds"
              :items="editableScopeLayers"
              value-key="value"
              multiple
              class="w-full"
              :disabled="pending"
            />
          </UFormField>
          <UButton
            label="Use selected canvas layer"
            variant="ghost"
            color="neutral"
            size="sm"
            :disabled="pending"
            @click="useSelectedLayer"
          />
          <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <UFormField v-for="field in (['x', 'y', 'w', 'h'] as const)" :key="field" :label="({ x: 'Region left', y: 'Region top', w: 'Region width', h: 'Region height' })[field]">
              <UInput
                v-model.number="scopeRegion[field]"
                type="number"
                :min="field === 'w' || field === 'h' ? 1 : 0"
                class="w-full"
                :disabled="pending"
              />
            </UFormField>
          </div>
          <UFormField label="Approved wording" help="One exact text block per line. Shorten noncommercial letter copy here for human review; facts, greeting, sign-off and locked copy stay exact.">
            <UTextarea
              v-model="approvedCopyText"
              class="w-full"
              :rows="5"
              :maxlength="12000"
              :disabled="pending"
              placeholder="PIZZA • DRINKS • TEST DRIVES"
            />
          </UFormField>
          <UAlert
            v-if="scopeProblem"
            title="Choose a safe edit boundary"
            :description="scopeProblem"
            color="warning"
          />
          <p class="text-xs text-muted">
            A flattened original needs reviewed extraction and clean-background repair first. Use owned approved imagery; any proposed lifestyle scene needs review and must not portray an invented showroom as the actual dealership. Keep launch dates separate from sale dates; no unapproved time or free claim.
          </p>
        </section>
        <UAlert
          v-if="projectId === 'new'"
          title="Save this project first"
          description="Save your project to use its client and artwork context."
          color="warning"
        />
        <UFormField label="Brief and context" help="Audience, offer, tone and anything the design must preserve.">
          <UTextarea
            v-model="brief"
            class="w-full"
            :rows="3"
            :maxlength="4000"
            :disabled="pending"
            placeholder="Introduce DriveAgent to independent dealerships…"
            @blur="persist"
          />
        </UFormField>
        <section aria-label="References and guides" class="space-y-3 rounded-lg border border-default p-3">
          <UFormField label="Reference images and design guides" help="Describe how to use each reference in your brief. Ready attachments are included in your next request.">
            <UFileUpload
              v-model="referenceFiles"
              multiple
              reset
              :preview="false"
              accept="image/png,image/jpeg,image/webp,.txt,.md,.markdown"
              label="Add images or guides"
              description="Up to 3 images · 5 MB each · TXT/Markdown guides"
              class="w-full"
              :disabled="!canAttach"
              @update:model-value="uploadReferences"
            />
          </UFormField>
          <p class="text-xs text-muted">
            {{ references.length }}/6 attachments · {{ guideCharacters.toLocaleString() }}/12,000 guide characters. PDF is not supported; upload a text/Markdown version or reference images of its pages.
          </p>
          <p
            v-if="uploadingReference"
            role="status"
            aria-live="polite"
            class="text-sm text-muted"
          >
            Uploading and preparing {{ uploadingName }}… Images are attached only after visual analysis succeeds.
          </p>
          <UAlert
            v-if="attachmentErrors.length"
            title="Some references were not attached"
            :description="attachmentErrors.join(' ')"
            color="error"
          />
          <article v-for="reference in references" :key="reference.id" class="space-y-2 rounded border border-default p-3">
            <div class="flex items-start gap-3">
              <img
                v-if="reference.kind === 'image' && reference.url"
                :src="reference.url"
                :alt="`Reference: ${reference.name}`"
                class="size-14 shrink-0 rounded bg-elevated object-contain"
                referrerpolicy="no-referrer"
              >
              <UIcon v-else name="i-lucide-file-text" class="size-6 shrink-0 text-muted" />
              <div class="min-w-0 flex-1">
                <p class="break-words text-sm font-medium">
                  {{ reference.name }}
                </p>
                <p class="text-xs text-muted">
                  {{ reference.kind === 'image' ? 'Visual analysis ready' : 'Guide text ready' }}<span v-if="reference.analysisModel"> · {{ reference.analysisModel }}</span>
                </p>
              </div>
              <UButton
                icon="i-lucide-x"
                :aria-label="`Remove ${reference.name}`"
                variant="ghost"
                color="neutral"
                size="xs"
                :disabled="pending || uploadingReference"
                @click="removeReference(reference.id)"
              />
            </div>
            <UButton
              :label="expandedReference === reference.id ? 'Hide reference details' : reference.kind === 'image' ? 'Review visual analysis' : 'Review guide excerpt'"
              variant="link"
              size="xs"
              :aria-expanded="expandedReference === reference.id"
              @click="() => { expandedReference = expandedReference === reference.id ? null : reference.id }"
            />
            <p v-if="expandedReference === reference.id" class="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs text-muted">
              {{ reference.description }}
            </p>
          </article>
        </section>
        <div
          v-if="messages.length"
          role="log"
          aria-label="Design conversation"
          aria-live="polite"
          class="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-default p-3"
        >
          <div v-for="(message, index) in messages" :key="index" class="text-sm">
            <p class="mb-1 font-medium">
              {{ message.role === 'user' ? 'You' : 'Design assistant' }}
            </p>
            <p class="whitespace-pre-wrap break-words text-muted">
              {{ message.content }}
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2" aria-label="Suggested design requests">
          <UButton
            v-for="action in quickActions"
            :key="action.label"
            :label="action.label"
            variant="outline"
            color="neutral"
            size="sm"
            :disabled="pending"
            @click="() => { prompt = action.prompt }"
          />
        </div>
        <UFormField label="What would you like to create or change?" help="Follow up to refine the preview, or apply it to your canvas. Cmd/Ctrl + Enter sends.">
          <UTextarea
            v-model="prompt"
            class="w-full"
            :rows="4"
            :maxlength="4000"
            :disabled="pending"
            placeholder="Make the headline clearer and bring the call to action in last…"
            @keydown.meta.enter.prevent="requestProposal"
            @keydown.ctrl.enter.prevent="requestProposal"
          />
        </UFormField>
        <UButton
          label="Advanced options"
          variant="ghost"
          color="neutral"
          size="sm"
          :aria-expanded="advanced"
          @click="() => { advanced = !advanced }"
        />
        <div v-if="advanced" class="grid grid-cols-1 gap-4 rounded-lg border border-default p-3">
          <UFormField label="Model preference" help="Auto chooses a configured model for your request. The model used appears with the proposal.">
            <USelect
              v-model="model"
              :items="[{ label: 'Auto', value: 'auto' }, { label: 'Fast', value: 'fast' }, { label: 'Quality', value: 'quality' }]"
              class="w-full"
              :disabled="pending"
            />
          </UFormField>
          <UFormField v-if="!scoped" label="Locked layers">
            <UCheckbox v-model="allowLocked" label="Allow this request to change locked layers" :disabled="pending" />
          </UFormField>
        </div>
        <UAlert
          v-if="error"
          title="Design request failed"
          :description="error"
          color="error"
        />
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Preview proposal"
            icon="i-lucide-wand-sparkles"
            :loading="pending"
            :disabled="!canRequest"
            @click="requestProposal"
          />
          <UButton
            label="Generate an image"
            icon="i-lucide-image"
            variant="ghost"
            color="neutral"
            :disabled="pending"
            @click="emit('update:open', false); emit('generate-image')"
          />
        </div>
        <section v-if="proposal" class="space-y-3 border-t border-default pt-4" aria-label="Proposed design">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="font-semibold">
              {{ applied ? 'Applied design' : 'Proposal preview' }}
            </h3>
            <UBadge
              :label="`Model: ${proposal.model}`"
              color="neutral"
              variant="subtle"
              class="max-w-full break-all"
            />
          </div>
          <div v-if="proposal.context" class="space-y-1 text-xs text-muted" aria-label="Included design context">
            <p v-if="proposal.context.brandKit">
              Brand kit included: {{ proposal.context.brandKit }}
            </p>
            <p v-if="proposal.context.clientStyleGuide">
              Client style guide included.
            </p>
            <p v-if="proposal.context.references.length">
              References included: {{ proposal.context.references.map(item => item.name).join(', ') }}
            </p>
          </div>
          <UFormField label="Preview format">
            <USelect v-model="previewKey" :items="formats" class="w-full" />
          </UFormField>
          <section v-if="requestedScope" aria-label="Affected and protected layers" class="space-y-2 text-sm">
            <p class="font-medium">
              Affected layers: {{ changedLayers.map(item => `${item.after?.name} (#${item.id})`).join(', ') }}
            </p>
            <article v-for="item in changedLayers" :key="item.id" class="border-b border-default py-2">
              <p>{{ item.after?.name }} · {{ item.before ? 'Edit' : 'Add' }}</p>
              <p v-if="item.before?.text !== item.after?.text" class="whitespace-pre-wrap text-muted">
                Before: {{ item.before?.text || 'No text' }}<br>After: {{ item.after?.text || 'No text' }}
              </p>
              <p class="text-xs text-muted">
                {{ item.before ? `${item.before.x}, ${item.before.y} · ${item.before.w}×${item.before.h}` : 'New layer' }} → {{ item.after?.x }}, {{ item.after?.y }} · {{ item.after?.w }}×{{ item.after?.h }}
              </p>
            </article>
            <details>
              <summary class="cursor-pointer">
                Protected layers unchanged ({{ protectedLayers.length }})
              </summary>
              <p v-for="layer in protectedLayers" :key="layer.id" class="whitespace-pre-wrap break-words py-1 text-xs text-muted">
                #{{ layer.id }} {{ layer.name }}{{ layer.text ? `: ${layer.text}` : '' }}
              </p>
            </details>
          </section>
          <p v-if="requestedScope" class="text-sm font-medium">
            Before
          </p>
          <div v-if="beforePreview && preview" class="flex w-full justify-center overflow-hidden rounded-lg bg-elevated">
            <div class="relative shrink-0" :style="{ width: `${preview.format.w * preview.scale}px`, height: `${preview.format.h * preview.scale}px` }">
              <iframe
                data-vue-devtools-ignore
                title="Design before scoped edit"
                :srcdoc="beforePreview"
                :width="preview.format.w"
                :height="preview.format.h"
                :sandbox="requestedScope ? 'allow-same-origin' : 'allow-scripts'"
                referrerpolicy="no-referrer"
                class="absolute left-0 top-0 origin-top-left border-0 pointer-events-none"
                :style="{ transform: `scale(${preview.scale})` }"
              />
            </div>
          </div>
          <p v-if="requestedScope" class="text-sm font-medium">
            After
          </p>
          <div ref="previewContainer" class="flex w-full justify-center overflow-hidden rounded-lg bg-elevated">
            <div v-if="preview" class="relative shrink-0" :style="{ width: `${preview.format.w * preview.scale}px`, height: `${preview.format.h * preview.scale}px` }">
              <iframe
                :key="`${previewKey}-${replay}`"
                data-vue-devtools-ignore
                :title="requestedScope ? 'Scoped design proposal' : 'Animated design proposal'"
                :srcdoc="preview.html"
                :width="preview.format.w"
                :height="preview.format.h"
                :sandbox="requestedScope ? 'allow-same-origin' : 'allow-scripts'"
                referrerpolicy="no-referrer"
                class="absolute left-0 top-0 origin-top-left border-0 pointer-events-none"
                :style="{ transform: `scale(${preview.scale})` }"
                @load="measurePreview"
              />
            </div>
          </div>
          <UButton
            label="Replay preview"
            icon="i-lucide-rotate-ccw"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="() => { replay++ }"
          />
          <UAlert
            v-if="stale && !applied"
            title="Canvas changed"
            description="Request a new proposal using your latest canvas before applying."
            color="warning"
          />
          <UAlert
            v-if="requestedScope && fit !== 'passed'"
            :title="fit === 'failed' ? 'Text needs more room' : 'Checking text fit'"
            :description="fitError || 'Checking that every proposed text block remains readable.'"
            :color="fit === 'failed' ? 'error' : 'info'"
          />
          <UFormField v-if="requestedScope" label="Human review">
            <UCheckbox v-model="reviewedCopy" label="I reviewed the wording, layout and proposed imagery; protected artwork is unchanged" :disabled="stale || applied || pending || fit !== 'passed'" />
          </UFormField>
          <div class="flex flex-wrap gap-2">
            <UButton :label="applied ? 'Applied' : 'Apply to canvas'" :disabled="stale || applied || pending || applying || (!!requestedScope && (!reviewedCopy || fit !== 'passed'))" @click="apply" />
            <UButton
              label="Discard preview"
              variant="outline"
              color="neutral"
              :disabled="pending"
              @click="discard"
            />
            <UButton
              label="Undo last canvas edit"
              icon="i-lucide-undo-2"
              variant="ghost"
              color="neutral"
              :disabled="!canUndo || pending"
              @click="undo"
            />
          </div>
          <div v-if="proposal.caption" class="text-sm">
            <p class="font-medium">
              Suggested caption
            </p>
            <p class="whitespace-pre-wrap text-muted">
              {{ proposal.caption }}
            </p>
          </div>
          <p v-if="proposal.suggestedSchedule" class="text-sm text-muted">
            Suggested timing: {{ proposal.suggestedSchedule }}
          </p>
          <UButton
            label="Prepare social export"
            icon="i-lucide-video"
            variant="soft"
            :disabled="!applied || pending"
            @click="prepareSocial"
          />
          <p class="text-xs text-muted">
            Apply first, then render MP4 and prepare a social draft for the usual review and scheduling.
          </p>
        </section>
        <UButton
          v-if="messages.length"
          label="Clear conversation"
          variant="ghost"
          color="neutral"
          size="sm"
          :disabled="pending || uploadingReference"
          @click="clearConversation"
        />
      </div>
    </template>
  </USlideover>
</template>
