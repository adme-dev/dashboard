<script setup lang="ts">
import { computed } from 'vue'
import type { StoryboardShot, CopyRevision, AssetBinding } from '~~/shared/video/storyboard'
import type { PinnedReference } from '~~/shared/video/storyboardReferences'

const props = withDefaults(
  defineProps<{
    shot: StoryboardShot
    copy: CopyRevision
    fps: number
    disabled?: boolean
    references?: PinnedReference[]
  }>(),
  { disabled: false, references: () => [] }
)
const emit = defineEmits<{ update: [patch: Partial<StoryboardShot>] }>()
const referenceRoles: StoryboardShot['referenceRoles'] = ['product', 'presenter', 'location', 'style']
const sources = computed(() => [
  { label: 'Select existing media', value: '__unresolved__' },
  ...props.references
    .filter(r => r.sourceKind === 'video_asset' || r.sourceKind === 'source_asset')
    .map(r => ({ label: `${r.role}: ${r.assetId} (${r.decision})`, value: r.assetId }))
])
function update(patch: Partial<StoryboardShot>) {
  if (!props.disabled) emit('update', patch)
}
function duration(value: string | number) {
  const n = Number(value)
  if (Number.isInteger(n) && n > 0) update({ durationFrames: n })
}
function bind(value: string) {
  const source = props.references.find(r => r.assetId === value)
  update({
    visual: source
      ? {
          status: 'bound',
          sourceKind: source.sourceKind,
          assetId: source.assetId,
          contentHash: source.contentHash
        }
      : { status: 'unresolved', reason: 'not_selected' }
  })
}

type CueLane = 'audioCues' | 'captionCues' | 'overlayCues'
function assetOptions(kind: 'audio_asset' | 'banner_project') {
  return [
    { label: 'Select existing source', value: '__unresolved__' },
    ...props.references
      .filter(r => r.sourceKind === kind)
      .map(r => ({ label: `${r.role}: ${r.assetId} (${r.decision})`, value: r.assetId }))
  ]
}
function binding(id: string): AssetBinding {
  const source = props.references.find(r => r.assetId === id)
  return source
    ? {
        status: 'bound',
        sourceKind: source.sourceKind,
        assetId: source.assetId,
        contentHash: source.contentHash
      }
    : { status: 'unresolved', reason: 'not_selected' }
}
function cueUpdate(lane: CueLane, index: number, patch: Record<string, unknown>) {
  update({ [lane]: props.shot[lane].map((cue, i) => (i === index ? { ...cue, ...patch } : cue)) })
}
function cueFrame(
  lane: CueLane,
  index: number,
  field: 'startFrame' | 'durationFrames',
  value: string | number
) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < (field === 'startFrame' ? 0 : 1)) return
  cueUpdate(lane, index, { [field]: n, ...(lane !== 'overlayCues' ? { timing: 'proposed' } : {}) })
}
function addCue(lane: CueLane) {
  const common = {
    id: `cue_${crypto.randomUUID()}`,
    startFrame: 0,
    durationFrames: props.shot.durationFrames
  }
  if (lane === 'audioCues')
    update({
      audioCues: [
        ...props.shot.audioCues,
        {
          ...common,
          kind: 'voiceover',
          required: true,
          timing: 'proposed',
          asset: { status: 'unresolved', reason: 'not_selected' }
        }
      ]
    })
  if (lane === 'captionCues' && props.copy.scriptSegments[0])
    update({
      captionCues: [
        ...props.shot.captionCues,
        { ...common, spokenSegmentId: props.copy.scriptSegments[0].id, timing: 'proposed' }
      ]
    })
  if (lane === 'overlayCues' && props.copy.cues[0])
    update({
      overlayCues: [
        ...props.shot.overlayCues,
        {
          ...common,
          copyCueId: props.copy.cues[0].id,
          asset: { status: 'unresolved', reason: 'not_selected' }
        }
      ]
    })
}
function removeCue(lane: CueLane, index: number) {
  update({ [lane]: props.shot[lane].filter((_, i) => i !== index) })
}
function sourceFrame(field: 'sourceInFrames' | 'sourceOutFrames', value: string | number) {
  if (props.shot.visual.status !== 'bound') return
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) return
  update({
    visual: {
      ...props.shot.visual,
      sourceInFrames: props.shot.visual.sourceInFrames ?? 0,
      sourceOutFrames: props.shot.visual.sourceOutFrames ?? props.shot.durationFrames,
      [field]: n
    }
  })
}
</script>

<template>
  <section class="@container min-w-0 space-y-4" aria-label="Shot inspector">
    <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
      <UFormField label="Shot purpose">
        <UInput
          :model-value="shot.purpose"
          :disabled="disabled"
          class="w-full"
          @update:model-value="update({ purpose: String($event) })"
        />
      </UFormField>
      <UFormField
        label="Duration in frames"
        :description="`${(shot.durationFrames / fps).toFixed(2)} seconds at ${fps} fps`"
      >
        <UInput
          type="number"
          :min="1"
          :step="1"
          :model-value="shot.durationFrames"
          :disabled="disabled"
          class="w-full"
          @update:model-value="duration"
        />
      </UFormField>
      <UFormField label="Visual direction" class="@lg:col-span-2">
        <UTextarea
          :model-value="shot.visualDirection"
          :disabled="disabled"
          class="w-full"
          @update:model-value="update({ visualDirection: String($event) })"
        />
      </UFormField>
      <UFormField label="Spoken script segments">
        <USelect
          multiple
          :model-value="shot.spokenSegmentIds"
          :items="copy.scriptSegments.map((s) => ({ label: s.text, value: s.id }))"
          :disabled="disabled"
          class="w-full"
          @update:model-value="update({ spokenSegmentIds: $event })"
        />
      </UFormField>
      <UFormField label="On-screen copy cues">
        <USelect
          multiple
          :model-value="shot.copyCueIds"
          :items="copy.cues.map((c) => ({ label: c.text, value: c.id }))"
          :disabled="disabled"
          class="w-full"
          @update:model-value="update({ copyCueIds: $event })"
        />
      </UFormField>
      <UFormField label="Existing visual source" class="@lg:col-span-2">
        <USelect
          :model-value="shot.visual.status === 'bound' ? shot.visual.assetId : '__unresolved__'"
          :items="sources"
          :disabled="disabled"
          class="w-full"
          @update:model-value="bind(String($event))"
        />
      </UFormField>
    </div>
    <UAlert
      v-if="shot.visual.status !== 'bound'"
      color="warning"
      title="Missing media"
      description="Select an existing project reference. Readiness checks measured duration and usage approval before applying."
    />
    <div v-if="shot.visual.status === 'bound'" class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
      <UFormField label="Source in frame">
        <UInput
          type="number"
          :min="0"
          :step="1"
          :model-value="shot.visual.sourceInFrames ?? 0"
          :disabled="disabled"
          class="w-full"
          @update:model-value="sourceFrame('sourceInFrames', $event)"
        />
      </UFormField>
      <UFormField label="Source out frame">
        <UInput
          type="number"
          :min="1"
          :step="1"
          :model-value="shot.visual.sourceOutFrames ?? shot.durationFrames"
          :disabled="disabled"
          class="w-full"
          @update:model-value="sourceFrame('sourceOutFrames', $event)"
        />
      </UFormField>
    </div>
    <UFormField label="Reference roles">
      <USelect
        multiple
        :items="
          referenceRoles.map((value) => ({ label: value, value }))
        "
        :model-value="shot.referenceRoles"
        :disabled="disabled"
        class="w-full"
        @update:model-value="update({ referenceRoles: $event })"
      />
    </UFormField>
    <p class="text-xs text-muted break-words">
      Reference roles: {{ shot.referenceRoles.join(', ') || 'None assigned' }}
    </p>
    <div class="space-y-3 border-t border-default pt-3">
      <h4 class="text-sm font-medium">
        Exact copy
      </h4>
      <p class="text-xs text-muted">
        {{
          copy.approval
            ? 'Approved copy is locked. Copy changes require a new revision and human approval.'
            : 'Copy requires human approval before application.'
        }}
      </p>
      <div
        v-for="segment in copy.scriptSegments.filter((s) => shot.spokenSegmentIds.includes(s.id))"
        :key="segment.id"
      >
        <p class="text-xs text-muted">
          Spoken script
        </p>
        <p class="whitespace-pre-wrap break-words text-sm">
          {{ segment.text }}
        </p>
      </div>
      <div v-for="cue in copy.cues.filter((c) => shot.copyCueIds.includes(c.id))" :key="cue.id">
        <p class="text-xs text-muted">
          {{ cue.required ? 'Required on-screen copy' : 'On-screen copy' }}
        </p>
        <p class="whitespace-pre-wrap break-words text-sm">
          {{ cue.text }}
        </p>
      </div>
      <p v-if="!shot.spokenSegmentIds.length && !shot.copyCueIds.length" class="text-sm text-muted">
        No copy assigned to this shot.
      </p>
    </div>

    <section class="space-y-3 border-t border-default pt-3" aria-label="Audio cues">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h4 class="text-sm font-medium">
          Audio cues
        </h4>
        <UButton
          variant="outline"
          :disabled="disabled || shot.audioCues.length >= 64"
          @click="addCue('audioCues')"
        >
          Add audio cue
        </UButton>
      </div>
      <div
        v-for="(cue, index) in shot.audioCues"
        :key="cue.id"
        class="grid grid-cols-1 gap-4 rounded-lg border border-default p-3 @lg:grid-cols-2"
      >
        <UFormField label="Audio type">
          <USelect
            :items="['voiceover', 'music', 'sfx'].map((value) => ({ label: value, value }))"
            :model-value="cue.kind"
            :disabled="disabled"
            class="w-full"
            @update:model-value="
              cueUpdate('audioCues', index, { kind: $event, timing: 'proposed' })
            "
          />
        </UFormField>
        <UFormField label="Existing audio">
          <USelect
            :items="assetOptions('audio_asset')"
            :model-value="cue.asset.status === 'bound' ? cue.asset.assetId : '__unresolved__'"
            :disabled="disabled"
            class="w-full"
            @update:model-value="
              cueUpdate('audioCues', index, { asset: binding(String($event)), timing: 'proposed' })
            "
          />
        </UFormField>
        <UFormField label="Start frame">
          <UInput
            type="number"
            :min="0"
            :step="1"
            :model-value="cue.startFrame"
            :disabled="disabled"
            class="w-full"
            @update:model-value="cueFrame('audioCues', index, 'startFrame', $event)"
          />
        </UFormField>
        <UFormField label="Duration frames">
          <UInput
            type="number"
            :min="1"
            :step="1"
            :model-value="cue.durationFrames"
            :disabled="disabled"
            class="w-full"
            @update:model-value="cueFrame('audioCues', index, 'durationFrames', $event)"
          />
        </UFormField>
        <UCheckbox
          :model-value="cue.required"
          :disabled="disabled"
          label="Required audio"
          @update:model-value="cueUpdate('audioCues', index, { required: $event })"
        />
        <UCheckbox
          :model-value="cue.timing === 'reviewed'"
          :disabled="disabled || cue.asset.status !== 'bound'"
          label="I reviewed this audio timing"
          @update:model-value="
            cueUpdate('audioCues', index, { timing: $event ? 'reviewed' : 'proposed' })
          "
        />
        <UButton
          v-if="!cue.required && cue.asset.status !== 'omitted'"
          variant="outline"
          :disabled="disabled"
          @click="
            cueUpdate('audioCues', index, {
              asset: { status: 'omitted', reason: 'Explicitly omitted by editor' },
              timing: 'proposed'
            })
          "
        >
          Omit optional audio
        </UButton>
        <p v-if="cue.asset.status === 'omitted'" class="text-xs text-muted">
          Explicitly omitted: {{ cue.asset.reason }}
        </p>
        <UButton
          color="error"
          variant="ghost"
          :disabled="disabled"
          @click="removeCue('audioCues', index)"
        >
          Remove audio cue
        </UButton>
      </div>
    </section>
    <section class="space-y-3 border-t border-default pt-3" aria-label="Caption cues">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h4 class="text-sm font-medium">
          Caption cues
        </h4>
        <UButton
          variant="outline"
          :disabled="disabled || !copy.scriptSegments.length || shot.captionCues.length >= 256"
          @click="addCue('captionCues')"
        >
          Add caption cue
        </UButton>
      </div>
      <div
        v-for="(cue, index) in shot.captionCues"
        :key="cue.id"
        class="grid grid-cols-1 gap-4 rounded-lg border border-default p-3 @lg:grid-cols-2"
      >
        <UFormField label="Exact script segment" class="@lg:col-span-2">
          <USelect
            :model-value="cue.spokenSegmentId"
            :items="copy.scriptSegments.map((s) => ({ label: s.text, value: s.id }))"
            :disabled="disabled"
            class="w-full"
            @update:model-value="
              cueUpdate('captionCues', index, { spokenSegmentId: $event, timing: 'proposed' })
            "
          />
        </UFormField>
        <UFormField label="Start frame">
          <UInput
            type="number"
            :min="0"
            :step="1"
            :model-value="cue.startFrame"
            :disabled="disabled"
            class="w-full"
            @update:model-value="cueFrame('captionCues', index, 'startFrame', $event)"
          />
        </UFormField>
        <UFormField label="Duration frames">
          <UInput
            type="number"
            :min="1"
            :step="1"
            :model-value="cue.durationFrames"
            :disabled="disabled"
            class="w-full"
            @update:model-value="cueFrame('captionCues', index, 'durationFrames', $event)"
          />
        </UFormField>
        <UCheckbox
          :model-value="cue.timing === 'reviewed'"
          :disabled="disabled"
          label="I reviewed caption alignment"
          @update:model-value="
            cueUpdate('captionCues', index, { timing: $event ? 'reviewed' : 'proposed' })
          "
        />
        <UButton
          color="error"
          variant="ghost"
          :disabled="disabled"
          @click="removeCue('captionCues', index)"
        >
          Remove caption cue
        </UButton>
      </div>
    </section>
    <section class="space-y-3 border-t border-default pt-3" aria-label="Overlay cues">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h4 class="text-sm font-medium">
          Overlay cues
        </h4>
        <UButton
          variant="outline"
          :disabled="disabled || !copy.cues.length || shot.overlayCues.length >= 256"
          @click="addCue('overlayCues')"
        >
          Add overlay cue
        </UButton>
      </div>
      <div
        v-for="(cue, index) in shot.overlayCues"
        :key="cue.id"
        class="grid grid-cols-1 gap-4 rounded-lg border border-default p-3 @lg:grid-cols-2"
      >
        <UFormField label="Exact on-screen copy">
          <USelect
            :model-value="cue.copyCueId"
            :items="copy.cues.map((c) => ({ label: c.text, value: c.id }))"
            :disabled="disabled"
            class="w-full"
            @update:model-value="cueUpdate('overlayCues', index, { copyCueId: $event })"
          />
        </UFormField>
        <UFormField label="Existing Banner overlay">
          <USelect
            :items="assetOptions('banner_project')"
            :model-value="cue.asset.status === 'bound' ? cue.asset.assetId : '__unresolved__'"
            :disabled="disabled"
            class="w-full"
            @update:model-value="
              cueUpdate('overlayCues', index, { asset: binding(String($event)) })
            "
          />
        </UFormField>
        <UFormField label="Start frame">
          <UInput
            type="number"
            :min="0"
            :step="1"
            :model-value="cue.startFrame"
            :disabled="disabled"
            class="w-full"
            @update:model-value="cueFrame('overlayCues', index, 'startFrame', $event)"
          />
        </UFormField>
        <UFormField label="Duration frames">
          <UInput
            type="number"
            :min="1"
            :step="1"
            :model-value="cue.durationFrames"
            :disabled="disabled"
            class="w-full"
            @update:model-value="cueFrame('overlayCues', index, 'durationFrames', $event)"
          />
        </UFormField>
        <UButton
          color="error"
          variant="ghost"
          :disabled="disabled"
          @click="removeCue('overlayCues', index)"
        >
          Remove overlay cue
        </UButton>
      </div>
    </section>
    <p class="text-xs text-muted">
      {{ shot.audioCues.length }} audio cues · {{ shot.captionCues.length }} caption cues ·
      {{ shot.overlayCues.length }} overlays
    </p>
  </section>
</template>
