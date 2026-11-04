<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { StoryboardPlan, StoryboardShot, ReadinessFinding } from '~~/shared/video/storyboard'
import type {
  StoryboardReferenceSet,
  ReferenceSetWrite
} from '~~/shared/video/storyboardReferences'
import { listStoryboardRecipes } from '~~/shared/video/storyboardRecipes'
import type { StoryboardDraft, StoryboardCandidate } from '~~/app/composables/useVideoStoryboard'
import type { StoryboardExample } from '~~/app/utils/video/storyboardExamples'
import type { VideoStudioAsset } from '~~/app/utils/video/videoStudioAssets'
import VideoStudioShotInspector from './VideoStudioShotInspector.vue'

const props = withDefaults(
  defineProps<{
    draft: StoryboardDraft
    plan?: StoryboardPlan | null
    candidate?: StoryboardCandidate | null
    referenceSet?: StoryboardReferenceSet | null
    findings?: ReadinessFinding[]
    enabled?: boolean
    pending?: boolean
    error?: string | null
    timelineNonEmpty?: boolean
    diverged?: boolean
    canApply?: boolean
    fps?: number
    pendingOperation?: string | null
    selectedAsset?: VideoStudioAsset | null
    examples?: StoryboardExample[]
    examplePreview?: StoryboardExample | null
  }>(),
  {
    plan: null,
    candidate: null,
    referenceSet: null,
    findings: () => [],
    enabled: true,
    pending: false,
    error: null,
    timelineNonEmpty: false,
    diverged: false,
    canApply: false,
    fps: 30,
    pendingOperation: null,
    selectedAsset: null,
    examples: () => [],
    examplePreview: null
  }
)
const emit = defineEmits<{
  'update:draft': [draft: StoryboardDraft]
  'request-plan': [method: 'manual' | 'ai']
  'accept-candidate': [approveCopy: boolean]
  'save-references': [references: ReferenceSetWrite['references']]
  'resolve': []
  'apply': [replaceConfirmed: boolean]
  'recover': []
  'retry': []
  'refresh': []
  'preview-example': [exampleId: string]
  'prefill-example': []
}>()
const recipes = listStoryboardRecipes()
const formats = [
  { label: 'Portrait 9:16', value: 'reels_9x16' },
  { label: 'Square 1:1', value: 'square_1x1' },
  { label: 'Landscape 16:9', value: 'youtube_16x9' }
]
const locked = computed(() => props.pending || !props.enabled || !!props.pendingOperation)
const selected = ref<string | null>(null)
const replaceOpen = ref(false)
const approveCopy = ref(false)
const role = ref<'product' | 'presenter' | 'location' | 'style'>('product')
const evidence = ref('')
const announcement = ref('')
const root = ref<HTMLElement>()
const frameRate = computed(() => props.plan?.fps || props.candidate?.plan.fps || props.fps)
const total = computed(() => props.draft.shots.reduce((sum, shot) => sum + shot.durationFrames, 0))
const selectedShot = computed(() => props.draft.shots.find(s => s.id === selected.value))
const applyAllowed = computed(
  () =>
    !locked.value
    && props.canApply
    && !!props.plan
    && !props.candidate
    && !props.findings.some(f => f.severity === 'blocker')
)
const copyForInspector = computed(
  () =>
    ({
      ...props.draft.copy,
      approval:
        props.plan
        && JSON.stringify(props.draft.copy)
        === JSON.stringify({
          scriptSegments: props.plan.copy.scriptSegments,
          cues: props.plan.copy.cues
        })
          ? props.plan.copy.approval
          : null
    }) as StoryboardPlan['copy']
)
const diffSummary = computed(() => {
  const diff = props.candidate?.diff || {}
  const count = (key: string) => (Array.isArray(diff[key]) ? diff[key].length : 0)
  return [
    `${count('added')} shots added, ${count('removed')} removed, ${count('changed')} changed.`,
    ...(diff.orderChanged ? ['Shot order changes.'] : []),
    ...(diff.copyChanged ? ['Exact copy changes; review every character below.'] : []),
    ...(diff.referenceSetChanged ? ['Project references change.'] : []),
    ...(diff.settingsChanged ? ['Output or planning settings change.'] : [])
  ].join(' ')
})
watch(
  () => props.candidate?.id,
  () => {
    approveCopy.value = false
  }
)
watch(
  () => props.plan?.revision,
  () => {
    replaceOpen.value = false
  }
)
function update(patch: Partial<StoryboardDraft>) {
  if (locked.value) return
  const next = { ...props.draft, ...patch }
  if (next.recipe)
    next.recipe = {
      ...next.recipe,
      values: {
        ...next.recipe.values,
        targetFormat: next.targetFormat,
        durationSeconds: next.durationSeconds
      }
    }
  emit('update:draft', next)
}
function chooseRecipe(id: string) {
  const recipe = recipes.find(r => r.id === id)
  update(
    recipe
      ? {
          recipe: { id: recipe.id, version: recipe.version, values: { ...recipe.defaults } },
          brief: recipe.brief,
          targetFormat: recipe.targetFormat,
          durationSeconds: recipe.defaults.durationSeconds
        }
      : { recipe: undefined }
  )
}
function editShot(id: string, patch: Partial<StoryboardShot>) {
  update({ shots: props.draft.shots.map(s => (s.id === id ? { ...s, ...patch } : s)) })
}
async function move(index: number, delta: number) {
  if (locked.value || index + delta < 0 || index + delta >= props.draft.shots.length) return
  const shots = [...props.draft.shots]
  const shot = shots.splice(index, 1)[0]!
  shots.splice(index + delta, 0, shot)
  update({ shots })
  announcement.value = `Moved ${shot.purpose} to shot ${index + delta + 1}`
  await nextTick()
  root.value?.querySelector<HTMLElement>(`[data-shot-id="${shot.id}"]`)?.focus()
}
function keyMove(event: KeyboardEvent, index: number) {
  if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault()
  void move(index, event.key === 'ArrowUp' ? -1 : 1)
}
function addShot() {
  if (props.draft.shots.length >= 24) return
  update({
    shots: [
      ...props.draft.shots,
      {
        id: crypto.randomUUID(),
        purpose: `Shot ${props.draft.shots.length + 1}`,
        durationFrames: frameRate.value * 5,
        visualDirection: '',
        referenceRoles: [],
        spokenSegmentIds: [],
        copyCueIds: [],
        visual: { status: 'unresolved', reason: 'not_selected' },
        audioCues: [],
        captionCues: [],
        overlayCues: []
      }
    ]
  })
}
function editCopy(kind: 'scriptSegments' | 'cues', index: number, text: string) {
  update({
    copy: {
      ...props.draft.copy,
      [kind]: props.draft.copy[kind].map((c, i) => (i === index ? { ...c, text } : c))
    }
  })
}
function addCopy(kind: 'scriptSegments' | 'cues') {
  const item = {
    id: `${kind === 'cues' ? 'cue' : 'segment'}_${crypto.randomUUID()}`,
    text: '',
    ...(kind === 'cues' ? { required: true } : {})
  }
  update({ copy: { ...props.draft.copy, [kind]: [...props.draft.copy[kind], item] } })
}
function removeCopy(kind: 'scriptSegments' | 'cues', id: string) {
  update({
    copy: { ...props.draft.copy, [kind]: props.draft.copy[kind].filter(c => c.id !== id) },
    shots: props.draft.shots.map(shot =>
      kind === 'scriptSegments'
        ? {
            ...shot,
            spokenSegmentIds: shot.spokenSegmentIds.filter(value => value !== id),
            captionCues: shot.captionCues.filter(cue => cue.spokenSegmentId !== id)
          }
        : {
            ...shot,
            copyCueIds: shot.copyCueIds.filter(value => value !== id),
            overlayCues: shot.overlayCues.filter(cue => cue.copyCueId !== id)
          }
    )
  })
}
function references() {
  return (props.referenceSet?.references || []).map(r => ({
    role: r.role,
    sourceKind: r.sourceKind,
    assetId: r.assetId,
    expectedContentHash: r.contentHash,
    decision: r.decision,
    evidence: r.approval?.evidence || ''
  }))
}
const selectedSourceKind = computed(() =>
  props.selectedAsset?.type === 'video'
    ? 'video_asset'
    : props.selectedAsset?.type === 'audio'
      ? 'audio_asset'
      : props.selectedAsset?.type === 'overlay'
        ? 'banner_project'
        : null
)
function addReference() {
  if (locked.value || !props.selectedAsset || !selectedSourceKind.value) return
  const refs = references()
  // Overlay library IDs include a format; references pin the owning Banner project.
  const assetId = selectedSourceKind.value === 'banner_project'
    ? props.selectedAsset.rawId.split(':')[0]!
    : props.selectedAsset.rawId
  if (
    refs.some(
      r =>
        r.role === role.value
        && r.assetId === assetId
        && r.sourceKind === selectedSourceKind.value
    )
  )
    return
  emit('save-references', [
    ...refs,
    {
      role: role.value,
      sourceKind: selectedSourceKind.value,
      assetId,
      expectedContentHash: null,
      decision: 'unreviewed',
      evidence: ''
    }
  ])
}
function approveReference(index: number) {
  if (locked.value || !evidence.value.trim()) return
  const refs = references()
  refs[index] = { ...refs[index]!, decision: 'approved', evidence: evidence.value }
  emit('save-references', refs)
}
function requestApply() {
  if (!applyAllowed.value) return
  if (props.timelineNonEmpty) replaceOpen.value = true
  else emit('apply', false)
}
function confirmApply() {
  if (!applyAllowed.value) return
  replaceOpen.value = false
  emit('apply', true)
}
</script>

<template>
  <section
    ref="root"
    class="@container flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    aria-label="Storyboard workbench"
  >
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-default pb-3">
      <div>
        <h3 class="font-semibold">
          Storyboard
        </h3>
        <p class="text-xs text-muted">
          Plan the sequence, review exact copy, then assemble existing media.
        </p>
      </div>
      <UBadge color="neutral" variant="subtle">
        {{ draft.shots.length }} shots · {{ (total / frameRate).toFixed(2) }}s
      </UBadge>
    </header>
    <div class="min-h-0 flex-1 space-y-5 overflow-y-auto py-4 pr-1">
      <UAlert
        v-if="!enabled"
        title="Storyboard actions are unavailable"
        description="Saved plans and application recovery remain available."
        color="neutral"
      />
      <UAlert
        v-if="pending"
        title="Working on storyboard"
        description="Wait for the current action to finish. Your cut is preserved until application succeeds."
        color="neutral"
      />
      <UAlert
        v-if="error"
        title="Storyboard action needs attention"
        :description="error"
        color="error"
      />
      <UAlert
        v-if="pendingOperation"
        title="Application status is unresolved"
        description="Recover the receipt or retry the same application. Editing stays paused until the result is known."
        color="warning"
      />
      <UButton
        v-if="pendingOperation"
        variant="outline"
        :disabled="pending"
        @click="emit('retry')"
      >
        Retry same application
      </UButton>
      <UButton
        v-if="error && !pendingOperation"
        variant="outline"
        :disabled="pending"
        @click="emit('refresh')"
      >
        Refresh saved plan, keep draft
      </UButton>
      <UButton
        v-if="pendingOperation"
        variant="outline"
        :disabled="pending"
        @click="emit('recover')"
      >
        Recover application
      </UButton>
      <UAlert
        v-if="diverged"
        color="warning"
        title="The timeline has changed"
        description="Your manual edit is preserved. Applying this storyboard again replaces the full cut after confirmation."
      />
      <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <UFormField label="Recipe">
          <USelect
            :items="[
              { label: 'Manual plan', value: '__manual__' },
              ...recipes.map((r) => ({ label: r.label, value: r.id }))
            ]"
            :model-value="draft.recipe?.id || '__manual__'"
            :disabled="locked"
            class="w-full"
            @update:model-value="chooseRecipe(String($event))"
          />
        </UFormField>
        <UFormField label="Output format">
          <USelect
            :items="formats"
            :model-value="draft.targetFormat"
            :disabled="locked"
            class="w-full"
            @update:model-value="
              update({ targetFormat: $event as StoryboardDraft['targetFormat'] })
            "
          />
        </UFormField>
        <UFormField label="Target duration in seconds">
          <UInput
            type="number"
            :min="1"
            :max="120"
            :step="1"
            :model-value="draft.durationSeconds"
            :disabled="locked"
            class="w-full"
            @update:model-value="update({ durationSeconds: Number($event) })"
          />
        </UFormField>
        <UFormField label="Planning input">
          <USelect
            :items="[
              { label: 'Brief and copy', value: 'idea' },
              { label: 'Exact script', value: 'approved_script' }
            ]"
            :model-value="draft.inputMode"
            :disabled="locked"
            class="w-full"
            @update:model-value="update({ inputMode: $event as StoryboardDraft['inputMode'] })"
          />
        </UFormField>
        <UFormField label="Brief" class="@lg:col-span-2">
          <UTextarea
            :model-value="draft.brief"
            :disabled="locked"
            class="w-full"
            :rows="3"
            placeholder="Describe the sequence using existing project media."
            @update:model-value="update({ brief: String($event) })"
          />
        </UFormField>
      </div>
      <div v-if="examples.length" class="space-y-2">
        <h4 class="text-sm font-medium">
          Start with a sample
        </h4>
        <p class="text-xs text-muted">
          Sample copy is unapproved. Examples prefill a local draft only.
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="example in examples"
            :key="example.id"
            variant="outline"
            :disabled="locked"
            @click="emit('preview-example', example.id)"
          >
            {{ example.label }}
          </UButton>
        </div>
        <div v-if="examplePreview" class="space-y-2 rounded-lg border border-default p-3">
          <h5 class="text-sm font-medium">
            Preview sample changes: {{ examplePreview.label }}
          </h5>
          <p class="whitespace-pre-wrap break-words text-sm">
            {{ examplePreview.brief }}
          </p>
          <p class="text-xs text-muted">
            Recipe revision {{ examplePreview.recipeVersion }} · Evaluation
            {{ examplePreview.evaluationRevision }} · {{ examplePreview.status }} ·
            {{ examplePreview.durationSeconds }}s
          </p>
          <UButton :disabled="locked" @click="emit('prefill-example')">
            Use sample in draft
          </UButton>
        </div>
      </div>
      <section class="space-y-3 border-t border-default pt-4" aria-label="Copy draft">
        <h4 class="text-sm font-medium">
          Exact script and on-screen copy
        </h4>
        <p class="text-xs text-muted">
          Edits stay in this draft until a new revision is reviewed. Saved approved copy remains
          unchanged.
        </p>
        <UFormField
          v-for="(segment, index) in draft.copy.scriptSegments"
          :key="segment.id"
          :label="`Script segment ${index + 1}`"
        >
          <UTextarea
            :model-value="segment.text"
            :disabled="locked"
            class="w-full"
            @update:model-value="editCopy('scriptSegments', index, String($event))"
          /><UButton
            variant="ghost"
            color="error"
            :disabled="locked"
            @click="removeCopy('scriptSegments', segment.id)"
          >
            Remove script segment
          </UButton>
        </UFormField>
        <UFormField
          v-for="(cue, index) in draft.copy.cues"
          :key="cue.id"
          :label="`Required on-screen copy ${index + 1}`"
        >
          <UTextarea
            :model-value="cue.text"
            :disabled="locked"
            class="w-full"
            @update:model-value="editCopy('cues', index, String($event))"
          /><UButton
            variant="ghost"
            color="error"
            :disabled="locked"
            @click="removeCopy('cues', cue.id)"
          >
            Remove copy cue
          </UButton>
        </UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton variant="outline" :disabled="locked" @click="addCopy('scriptSegments')">
            Add script segment
          </UButton><UButton variant="outline" :disabled="locked" @click="addCopy('cues')">
            Add required copy
          </UButton>
        </div>
      </section>
      <section class="space-y-3 border-t border-default pt-4" aria-label="Project references">
        <h4 class="text-sm font-medium">
          Project references
        </h4>
        <p class="text-xs text-muted">
          Select media in the library, assign its role, then review usage against its pinned
          identity.
        </p>
        <UFormField label="Reference role">
          <USelect
            v-model="role"
            :items="
              ['product', 'presenter', 'location', 'style'].map((value) => ({
                label: value,
                value
              }))
            "
            :disabled="locked"
            class="w-full"
          />
        </UFormField>
        <p class="text-sm break-words">
          {{ selectedAsset?.title || 'No library asset selected' }}
        </p>
        <UButton variant="outline" :disabled="locked || !selectedSourceKind" @click="addReference">
          Add selected reference
        </UButton>
        <UFormField v-if="referenceSet?.references.length" label="Usage approval evidence">
          <UTextarea
            v-model="evidence"
            :disabled="locked"
            class="w-full"
            placeholder="Record the rights and project usage you reviewed."
          />
        </UFormField>
        <div
          v-for="(reference, index) in referenceSet?.references || []"
          :key="`${reference.role}:${reference.assetId}`"
          class="space-y-2 border-l-2 border-default pl-3"
        >
          <p class="break-words text-xs">
            {{ reference.role }} · {{ reference.assetId }} · {{ reference.decision }}
          </p>
          <UButton
            v-if="reference.decision !== 'approved'"
            variant="outline"
            :disabled="locked || !evidence.trim()"
            @click="approveReference(index)"
          >
            Approve reviewed usage
          </UButton>
          <UButton
            color="error"
            variant="ghost"
            :disabled="locked"
            @click="
              emit(
                'save-references',
                references().filter((_, i) => i !== index)
              )
            "
          >
            Remove reference
          </UButton>
        </div>
      </section>
      <section class="space-y-2 border-t border-default pt-4" aria-label="Shot sequence">
        <div class="flex items-center justify-between gap-2">
          <h4 class="text-sm font-medium">
            Shot sequence
          </h4>
          <UButton
            variant="outline"
            :disabled="locked || draft.shots.length >= 24"
            @click="addShot"
          >
            Add shot
          </UButton>
        </div>
        <p v-if="!draft.shots.length" class="text-sm text-muted">
          Add a shot for a manual plan, or create a proposed sequence from your brief.
        </p>
        <p class="text-xs text-muted">
          Use move buttons or Alt + ↑ / ↓ on a focused shot to reorder.
        </p>
        <article
          v-for="(shot, index) in draft.shots"
          :key="shot.id"
          :data-shot-id="shot.id"
          tabindex="0"
          class="min-w-0 space-y-3 rounded-lg border border-default p-3 focus-visible:outline-2 focus-visible:outline-primary"
          :aria-label="`Shot ${index + 1}: ${shot.purpose}`"
          @keydown="keyMove($event, index)"
        >
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <h5 class="break-words text-sm font-medium">
                {{ index + 1 }}. {{ shot.purpose }}
              </h5>
              <p class="text-xs text-muted">
                {{ shot.durationFrames }} frames ·
                {{ (shot.durationFrames / frameRate).toFixed(2) }}s ·
                {{
                  shot.visual.status === 'bound'
                    ? 'Media selected; readiness check required'
                    : 'Missing media'
                }}
              </p>
            </div>
            <div class="flex flex-wrap gap-1">
              <UButton
                size="xs"
                variant="ghost"
                :aria-label="`Move shot ${index + 1} up`"
                :disabled="locked || index === 0"
                @click="move(index, -1)"
              >
                Move up
              </UButton><UButton
                size="xs"
                variant="ghost"
                :aria-label="`Move shot ${index + 1} down`"
                :disabled="locked || index === draft.shots.length - 1"
                @click="move(index, 1)"
              >
                Move down
              </UButton><UButton
                size="xs"
                variant="outline"
                @click="selected = selected === shot.id ? null : shot.id"
              >
                {{ selected === shot.id ? 'Close details' : 'Edit shot' }}
              </UButton><UButton
                size="xs"
                variant="ghost"
                color="error"
                :disabled="locked"
                @click="update({ shots: draft.shots.filter((s) => s.id !== shot.id) })"
              >
                Remove
              </UButton>
            </div>
          </div>
          <p
            v-for="cue in draft.copy.cues.filter((c) => shot.copyCueIds.includes(c.id))"
            :key="cue.id"
            class="whitespace-pre-wrap break-words text-sm"
          >
            {{ cue.text }}
          </p>
          <VideoStudioShotInspector
            v-if="selectedShot?.id === shot.id"
            :shot="shot"
            :copy="copyForInspector"
            :fps="frameRate"
            :disabled="locked"
            :references="referenceSet?.references"
            @update="editShot(shot.id, $event)"
          />
        </article>
      </section>
      <div class="flex flex-wrap gap-2">
        <UButton :disabled="locked" @click="emit('request-plan', 'manual')">
          Review manual plan
        </UButton><UButton
          variant="outline"
          :disabled="locked || !draft.brief.trim()"
          @click="emit('request-plan', 'ai')"
        >
          Propose shot plan
        </UButton>
      </div>
      <p class="text-xs text-muted">
        Planning proposes structure using existing media. It does not generate video, images, voice
        or music.
      </p>
      <section
        v-if="candidate"
        class="space-y-3 rounded-lg border border-primary/40 p-3"
        aria-label="Revision review"
      >
        <h4 class="font-medium">
          Review proposed revision
        </h4>
        <p class="text-sm text-muted">
          {{ plan?.shots.length || 0 }} saved shots → {{ candidate.plan.shots.length }} proposed
          shots. Accepting saves a revision; your timeline stays unchanged.
        </p>
        <p class="text-sm text-muted">
          {{ diffSummary }}
        </p>
        <div
          v-for="(shot, index) in candidate.plan.shots"
          :key="shot.id"
          class="border-t border-default pt-2"
        >
          <p class="text-sm">
            {{ index + 1 }}. {{ shot.purpose }} · {{ shot.durationFrames }} frames
          </p>
          <p class="whitespace-pre-wrap break-words text-xs text-muted">
            {{ shot.visualDirection }}
          </p>
        </div>
        <p
          v-for="segment in candidate.plan.copy.scriptSegments"
          :key="segment.id"
          class="whitespace-pre-wrap break-words text-sm"
        >
          {{ segment.text }}
        </p>
        <p
          v-for="cue in candidate.plan.copy.cues"
          :key="cue.id"
          class="whitespace-pre-wrap break-words text-sm"
        >
          {{ cue.text }}
        </p>
        <UCheckbox
          v-model="approveCopy"
          :disabled="locked"
          label="I reviewed and approve the exact script and on-screen copy in this revision"
        />
        <UButton :disabled="locked" @click="emit('accept-candidate', approveCopy)">
          Accept revision
        </UButton>
      </section>
      <div v-if="findings.length" class="space-y-2" aria-label="Readiness findings">
        <UAlert
          v-for="(finding, index) in findings"
          :key="`${finding.code}:${index}`"
          :color="finding.severity === 'blocker' ? 'error' : 'warning'"
          :title="finding.severity === 'blocker' ? 'Needs attention' : 'Review'"
          :description="finding.message"
        />
      </div>
      <p v-if="plan" class="text-xs text-muted">
        Saved copy: {{ plan.copy.approval ? 'Human approved' : 'Awaiting human approval' }}. Format:
        {{ formats.find((f) => f.value === plan?.targetFormat)?.label || plan.targetFormat }}.
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          variant="outline"
          :disabled="locked || !plan || !!candidate"
          @click="emit('resolve')"
        >
          Check readiness
        </UButton><UButton :disabled="!applyAllowed" @click="requestApply">
          Apply storyboard
        </UButton>
      </div>
    </div>
    <p class="sr-only" aria-live="polite">
      {{ announcement }}
    </p>
    <UModal
      v-model:open="replaceOpen"
      title="Replace the current cut?"
      description="Review the storyboard replacement before applying."
    >
      <template #content>
        <div class="space-y-4 p-5">
          <h3 class="text-lg font-semibold">
            Replace the current cut?
          </h3>
          <p class="text-sm">
            This replaces every timeline track with {{ plan?.shots.length }} storyboard shots. The
            current cut is saved as a recovery checkpoint. Application is one undo step.
          </p>
          <p class="text-sm text-muted">
            {{ plan ? (plan.durationFrames / plan.fps).toFixed(2) : '0' }} seconds ·
            {{ formats.find((f) => f.value === plan?.targetFormat)?.label }}
          </p>
          <div class="flex flex-wrap justify-end gap-2">
            <UButton variant="outline" :disabled="pending" @click="replaceOpen = false">
              Keep current cut
            </UButton><UButton :disabled="!applyAllowed" @click="confirmApply">
              Replace full cut
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
