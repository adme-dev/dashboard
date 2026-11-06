<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdjustedEditAcceptance, AdjustedEditSnapshot } from '~~/app/composables/useVideoAdjustedEditReview'

const props = defineProps<{
  snapshot: AdjustedEditSnapshot | null
  clips: Array<{ value: string, label: string }>
  pending: boolean
  error: string | null
  uncertain?: boolean
}>()
const emit = defineEmits<{ refresh: [], retry: [], accept: [input: AdjustedEditAcceptance] }>()
const accepted = ref(false)
const reviseCopy = ref(false)
const copyApproved = ref(false)
const copyDraft = ref<NonNullable<AdjustedEditSnapshot['copy']> | null>(null)
const referenceApprovals = ref<Record<string, { approved: boolean, evidence: string }>>({})
const mappings = ref<Record<string, string>>({})
watch(() => props.snapshot, () => {
  accepted.value = false
  mappings.value = {}
  reviseCopy.value = false
  copyApproved.value = false
  copyDraft.value = props.snapshot?.copy ? JSON.parse(JSON.stringify(props.snapshot.copy)) : null
  referenceApprovals.value = {}
}, { immediate: true })
watch([mappings, reviseCopy, copyDraft, referenceApprovals], () => {
  accepted.value = false
}, { deep: true })
const changes = computed(() => props.snapshot?.changes ?? [])
watch(copyDraft, () => {
  copyApproved.value = false
}, { deep: true })
const pendingReferences = computed(() => props.snapshot?.references?.filter(item => item.decision !== 'approved') ?? [])
const copyValid = computed(() => !reviseCopy.value || (copyApproved.value && copyDraft.value && [...copyDraft.value.scriptSegments, ...copyDraft.value.cues].every(item => Boolean(item.text.trim()))))
const referencesValid = computed(() => Object.values(referenceApprovals.value).every(item => !item.approved || Boolean(item.evidence.trim())))
const canAccept = computed(() => Boolean(props.snapshot?.obligations) && (!props.snapshot?.review || props.uncertain) && accepted.value && !props.pending && copyValid.value && referencesValid.value)
function submit() {
  if (!canAccept.value) return
  if (props.uncertain) {
    emit('retry')
    return
  }
  emit('accept', {
    obligationMappings: Object.entries(mappings.value).filter(([, id]) => id !== '__retain__' && props.clips.some(clip => clip.value === id)).map(([clipId, replacementClipId]) => ({ clipId, replacementClipId })),
    ...(reviseCopy.value && copyDraft.value ? { copyApproval: { expectedCopyHash: copyDraft.value.contentHash, scriptSegments: copyDraft.value.scriptSegments, cues: copyDraft.value.cues } } : {}),
    ...(pendingReferences.value.some(item => referenceApprovals.value[`${item.sourceKind}:${item.assetId}`]?.approved) ? { referenceApproval: pendingReferences.value.filter(item => referenceApprovals.value[`${item.sourceKind}:${item.assetId}`]?.approved).map(item => ({ sourceKind: item.sourceKind, assetId: item.assetId, expectedContentHash: item.contentHash, evidence: referenceApprovals.value[`${item.sourceKind}:${item.assetId}`]!.evidence.trim() })) } : {})
  })
}
function clipLabel(id: string) {
  return props.clips.find(clip => clip.value === id)?.label ?? `Removed clip (${id})`
}
</script>

<template>
  <section aria-label="Adjusted edit review" class="@container min-w-0 space-y-4 rounded-md border border-default p-3">
    <div>
      <h3 class="text-sm font-semibold text-highlighted">
        Review adjusted edit
      </h3>
      <p class="mt-1 text-sm text-muted">
        Check changed clips and required copy before rendering. Your manual edits stay in place.
      </p>
    </div>
    <UButton
      color="neutral"
      variant="soft"
      :loading="pending"
      :disabled="pending"
      @click="emit('refresh')"
    >
      {{ snapshot ? 'Refresh review' : 'Check current edit' }}
    </UButton>
    <UAlert
      v-if="error"
      color="error"
      title="Review not confirmed"
      :description="error"
    />
    <UAlert
      v-if="uncertain"
      color="warning"
      title="Checking a previous acceptance"
      description="Refresh to check saved status, or retry the same acceptance. Changed selections are not submitted during recovery."
    />
    <template v-if="snapshot">
      <UAlert
        v-for="(finding, index) in snapshot.findings"
        :key="`${finding.code}-${index}`"
        :color="finding.severity === 'blocker' ? 'error' : 'warning'"
        :title="finding.message"
      />

      <p v-if="!snapshot.obligations" class="text-sm text-muted">
        This edit has no storyboard obligations.
      </p>
      <UAlert
        v-else-if="snapshot.review && !uncertain"
        color="success"
        title="Adjusted edit reviewed"
        description="This saved revision has been reviewed. Render checks still verify current media and required copy."
      />
      <template v-else>
        <p class="text-xs text-muted">
          Saved revision {{ snapshot.editRevision }} · {{ changes.length }} affected {{ changes.length === 1 ? 'clip' : 'clips' }}
        </p>
        <div class="max-h-80 min-h-0 space-y-4 overflow-y-auto">
          <article v-for="change in changes" :key="change.clipId" class="space-y-2 border-b border-default pb-3">
            <p class="break-words text-sm font-medium text-highlighted">
              {{ clipLabel(change.clipId) }}
            </p>
            <p class="text-xs text-muted">
              Changed: {{ change.reasons.join(', ') }}
            </p>
            <p v-for="cue in snapshot.obligations?.cues.filter(cue => cue.clipId === change.clipId)" :key="cue.cueId" class="whitespace-pre-wrap break-words text-sm">
              {{ cue.text }}
            </p>
            <UFormField label="Required source or cue mapping" description="Keep its current clip or explicitly choose a replacement.">
              <USelect
                :model-value="mappings[change.clipId] ?? '__retain__'"
                :items="[{ value: '__retain__', label: 'Keep current mapping' }, ...clips]"
                class="w-full"
                :disabled="pending || uncertain"
                @update:model-value="mappings[change.clipId] = String($event)"
              />
            </UFormField>
          </article>
          <p v-if="!changes.length" class="text-sm text-muted">
            No changed clip mappings. Review current eligibility and copy findings below.
          </p>
        </div>
        <div v-for="reference in pendingReferences" :key="`${reference.sourceKind}:${reference.assetId}`" class="space-y-3 border-t border-default pt-3">
          <p class="break-words text-sm font-medium">
            Reference needs approval: {{ reference.assetId }}
          </p>
          <p class="break-words text-xs text-muted">
            Used by {{ reference.clipIds.map(clipLabel).join(', ') }}
          </p>
          <UFormField label="Usage approval evidence" description="Record why this source is cleared for this edit.">
            <UTextarea
              class="w-full"
              :model-value="referenceApprovals[`${reference.sourceKind}:${reference.assetId}`]?.evidence ?? ''"
              :disabled="pending || uncertain"
              @update:model-value="referenceApprovals[`${reference.sourceKind}:${reference.assetId}`] = { approved: false, evidence: String($event) }"
            />
          </UFormField>
          <UCheckbox
            :model-value="referenceApprovals[`${reference.sourceKind}:${reference.assetId}`]?.approved ?? false"
            label="I approve this source for the current edit."
            :disabled="pending || uncertain || !referenceApprovals[`${reference.sourceKind}:${reference.assetId}`]?.evidence.trim()"
            @update:model-value="referenceApprovals[`${reference.sourceKind}:${reference.assetId}`] = { evidence: referenceApprovals[`${reference.sourceKind}:${reference.assetId}`]?.evidence ?? '', approved: Boolean($event) }"
          />
        </div>
        <UCheckbox
          v-if="snapshot.copy"
          v-model="reviseCopy"
          label="Revise required copy for this edit"
          :disabled="pending || uncertain"
        />
        <div v-if="reviseCopy && copyDraft" class="space-y-4 border-t border-default pt-3">
          <p class="text-sm text-muted">
            Match the wording already in your timeline. Acceptance records a new human-approved copy revision; it does not change timeline clips.
          </p>
          <UFormField v-for="segment in copyDraft.scriptSegments" :key="segment.id" :label="`Spoken copy: ${segment.id}`">
            <UTextarea v-model="segment.text" class="w-full" :disabled="pending || uncertain" />
          </UFormField>
          <div v-for="cue in copyDraft.cues" :key="cue.id" class="space-y-2">
            <UFormField :label="`On-screen copy: ${cue.id}`">
              <UTextarea v-model="cue.text" class="w-full" :disabled="pending || uncertain" />
            </UFormField>
            <UCheckbox v-model="cue.required" label="Required in this edit" :disabled="pending || uncertain" />
          </div>
          <UCheckbox v-model="copyApproved" label="I approve this exact revised wording and its required-copy settings." :disabled="pending || uncertain" />
        </div>
        <UCheckbox v-model="accepted" label="I reviewed the affected clips, timing, layout and required copy." :disabled="pending" />
        <UButton :disabled="!canAccept" :loading="pending" @click="submit">
          {{ uncertain ? 'Retry same acceptance' : 'Accept adjusted edit' }}
        </UButton>
        <p class="text-xs text-muted">
          Invalid or missing required content must be corrected before review can succeed.
        </p>
      </template>
    </template>
  </section>
</template>
