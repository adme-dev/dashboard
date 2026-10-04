<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import type { ArtboardState } from '~/types/banner-studio'
import { resolveBannerFormat } from '~/utils/banner-constants'
import { buildBannerHTML } from '~/utils/banner-html-builder'

type Canvas = Record<string, ArtboardState>
type Message = { role: 'user' | 'assistant', content: string }
type Proposal = { reply: string, model: string, canvasData: Canvas, caption?: string, suggestedSchedule?: string }
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
const model = ref<'auto' | 'fast' | 'quality'>('auto')
const allowLocked = ref(false)
const advanced = ref(false)
const pending = ref(false)
const error = ref('')
const proposal = ref<Proposal | null>(null)
const sourceSnapshot = ref('')
const appliedSnapshot = ref('')
const proposalProjectId = ref('')
const previewKey = ref('')
const replay = ref(0)
let requestVersion = 0
let controller: AbortController | undefined
const snapshot = computed(() => JSON.stringify(getCanvasData()))
const stale = computed(() => !!proposal.value && (proposalProjectId.value !== props.projectId || sourceSnapshot.value !== snapshot.value))
const applied = computed(() => !!appliedSnapshot.value && appliedSnapshot.value === snapshot.value && proposalProjectId.value === props.projectId)
const canRequest = computed(() => !!prompt.value.trim() && !pending.value && props.projectId !== 'new' && state.project?.id === props.projectId)
const formats = computed(() => Object.keys(proposal.value?.canvasData || {}).flatMap((key) => {
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
      includeAnimations: true, bgColor: artboard.bgColor || state.bgColor,
      customFonts: getExportCustomFonts(artboard.layers)
    })
  }
})

function storageKey(id: string) {
  return `banner-design-chat:v1:${id}`
}
function persist() {
  try {
    sessionStorage.setItem(storageKey(props.projectId), JSON.stringify({ messages: messages.value.slice(-20), brief: brief.value.slice(0, 4000) }))
  } catch { /* Private browsing or a full session store must not block editing. */ }
}
watch(() => props.projectId, () => {
  requestVersion++
  controller?.abort()
  pending.value = false
  proposal.value = null
  appliedSnapshot.value = ''
  prompt.value = ''
  error.value = ''
  allowLocked.value = false
  messages.value = []
  brief.value = ''
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey(props.projectId)) || 'null')
    if (Array.isArray(saved?.messages)) {
      messages.value = saved.messages.filter((m: Message) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
        .slice(-20).map((m: Message) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    }
    if (typeof saved?.brief === 'string') brief.value = saved.brief.slice(0, 4000)
  } catch { /* Invalid history can be replaced by the next successful request. */ }
}, { immediate: true })
onBeforeUnmount(() => {
  requestVersion++
  controller?.abort()
})

async function requestProposal() {
  if (!canRequest.value) return
  const version = ++requestVersion
  const projectId = props.projectId
  const original = JSON.stringify(getCanvasData())
  const canvasData = proposal.value && !stale.value && !applied.value ? proposal.value.canvasData : getCanvasData()
  const text = prompt.value.trim()
  const history = messages.value.slice(-12)
  controller = new AbortController()
  pending.value = true
  error.value = ''
  try {
    const result = await $fetch<Proposal>('/api/agency/banner-studio/ai/design-assist', {
      method: 'POST', signal: controller.signal,
      body: { projectId, prompt: text, brief: brief.value, history, canvasData, activeKey: state.activeKey, model: model.value, allowLocked: allowLocked.value }
    })
    if (version !== requestVersion || props.projectId !== projectId) return
    proposal.value = result
    sourceSnapshot.value = original
    proposalProjectId.value = projectId
    appliedSnapshot.value = ''
    previewKey.value = Object.hasOwn(result.canvasData, state.activeKey) ? state.activeKey : Object.keys(result.canvasData)[0] || ''
    replay.value++
    messages.value = [...messages.value, { role: 'user', content: text }, { role: 'assistant', content: result.reply.slice(0, 4000) }].slice(-20) as Message[]
    prompt.value = ''
    persist()
  } catch (cause: unknown) {
    if (version !== requestVersion) return
    const failure = cause as { data?: { statusMessage?: string } }
    error.value = failure.data?.statusMessage || 'Could not prepare a design. Your canvas is unchanged. Try again.'
  } finally {
    if (version === requestVersion) pending.value = false
  }
}
function apply() {
  if (!proposal.value || stale.value || applied.value || pending.value || state.project?.id !== props.projectId) return
  applyAssistantCanvas(proposal.value.canvasData)
  appliedSnapshot.value = JSON.stringify(getCanvasData())
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
            @click="prompt = action.prompt"
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
          @click="advanced = !advanced"
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
          <UFormField label="Locked layers">
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
          <UFormField label="Preview format">
            <USelect v-model="previewKey" :items="formats" class="w-full" />
          </UFormField>
          <div ref="previewContainer" class="flex w-full justify-center overflow-hidden rounded-lg bg-elevated">
            <div v-if="preview" class="relative shrink-0" :style="{ width: `${preview.format.w * preview.scale}px`, height: `${preview.format.h * preview.scale}px` }">
              <iframe
                :key="`${previewKey}-${replay}`"
                title="Animated design proposal"
                :srcdoc="preview.html"
                :width="preview.format.w"
                :height="preview.format.h"
                sandbox="allow-scripts"
                referrerpolicy="no-referrer"
                class="absolute left-0 top-0 origin-top-left border-0 pointer-events-none"
                :style="{ transform: `scale(${preview.scale})` }"
              />
            </div>
          </div>
          <UButton
            label="Replay preview"
            icon="i-lucide-rotate-ccw"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="replay++"
          />
          <UAlert
            v-if="stale && !applied"
            title="Canvas changed"
            description="Request a new proposal using your latest canvas before applying."
            color="warning"
          />
          <div class="flex flex-wrap gap-2">
            <UButton :label="applied ? 'Applied' : 'Apply to canvas'" :disabled="stale || applied || pending" @click="apply" />
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
          :disabled="pending"
          @click="clearConversation"
        />
      </div>
    </template>
  </USlideover>
</template>
