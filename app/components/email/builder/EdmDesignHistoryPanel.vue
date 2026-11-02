<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { useEdmDesignRoundtrip } from '~~/app/composables/useEdmDesignRoundtrip'
import type { DesignHistoryList, DesignHistoryPreview } from '~~/shared/emailRendering/designHistory'
import type { EdmFlyhubDocument } from '~~/app/types/edm'

const props = defineProps<{ flow: ReturnType<typeof useEdmDesignRoundtrip>, blocked: boolean, saved: boolean }>()
const emit = defineEmits<{ restore: [revisionId: string] }>()
const history = ref<DesignHistoryList | null>(null)
const preview = ref<DesignHistoryPreview | null>(null)
const loading = ref(false)
const error = ref('')
let generation = 0
const draft = computed(() => props.flow.draft.value)
const previewDocument = computed(() => preview.value?.design?.blocks as EdmFlyhubDocument | undefined)
const ready = computed(
  () => props.saved && !props.blocked && !loading.value && !props.flow.busy.value && !props.flow.hasPending.value
)
async function load(more = false) {
  const current = draft.value
  if (!current) return
  const token = ++generation
  loading.value = true
  error.value = ''
  if (!more) {
    history.value = null
    preview.value = null
  }
  try {
    const result = await $fetch<DesignHistoryList>('/api/email/design/history', {
      method: 'POST',
      body: {
        version: 1,
        command: 'list-revisions',
        draftId: current.documentId,
        ...(more && history.value?.nextRevisionId ? { beforeRevisionId: history.value.nextRevisionId } : {})
      }
    })
    if (token !== generation) return
    if (result.currentRevisionId !== current.headRevisionId)
      throw new Error('The saved draft changed. Reload it before restoring history.')
    history.value
      = more && history.value ? { ...result, revisions: [...history.value.revisions, ...result.revisions] } : result
  } catch (cause) {
    if (token === generation)
      error.value = cause instanceof Error ? cause.message : 'History could not load. Retry to check current access.'
  } finally {
    if (token === generation) loading.value = false
  }
}
async function select(revisionId: string) {
  const current = draft.value
  if (!current || !ready.value) return
  const token = ++generation
  loading.value = true
  error.value = ''
  preview.value = null
  try {
    const result = await $fetch<DesignHistoryPreview>('/api/email/design/history', {
      method: 'POST',
      body: {
        version: 1,
        command: 'preview-revision',
        draftId: current.documentId,
        expectedRevisionId: current.headRevisionId,
        revisionId
      }
    })
    if (token === generation) preview.value = result
  } catch {
    if (token === generation)
      error.value = 'This revision could not be previewed under your current access. Reload history to continue.'
  } finally {
    if (token === generation) loading.value = false
  }
}
watch(
  () => draft.value?.headRevisionId,
  () => void load(),
  { immediate: true }
)
</script>

<template>
  <div class="@container flex min-h-0 flex-1 flex-col">
    <div class="flex-1 min-h-0 overflow-y-auto space-y-6 p-5">
      <p class="max-w-prose text-sm text-muted">
        Preview an earlier saved version before restoring it. Restoration creates a new saved version under today's
        access and design locks.
      </p>
      <UAlert
        v-if="!saved"
        title="Save local changes first"
        description="Your current edits stay in the composer. Save them before restoring a version."
        color="warning"
      />
      <UAlert
        v-if="error"
        :title="error"
        color="warning"
        :actions="[{ label: 'Reload history', onClick: () => load() }]"
      />
      <div class="space-y-2" aria-label="Saved versions">
        <UButton
          v-for="revision in history?.revisions || []"
          :key="revision.id"
          color="neutral"
          :variant="preview?.revisionId === revision.id ? 'soft' : 'outline'"
          class="w-full justify-between text-left"
          :disabled="!ready"
          @click="select(revision.id)"
        >
          <span class="min-w-0"><span class="block text-sm font-medium">{{ revision.subject || 'Untitled email' }}</span><span class="block text-xs text-muted">{{ new Date(revision.created_at).toLocaleString() }}</span></span>
          <UBadge
            :label="
              revision.id === draft?.headRevisionId ? 'Current' : revision.schema_version === 0 ? 'Original' : 'Saved'
            "
            color="neutral"
            variant="subtle"
          />
        </UButton>
        <UButton
          v-if="history?.nextRevisionId"
          label="Load earlier versions"
          variant="ghost"
          :loading="loading"
          @click="load(true)"
        />
        <p v-if="loading" class="text-sm text-muted">
          Loading saved versions…
        </p>
      </div>
      <section v-if="preview" class="space-y-4 border-t border-default pt-5" aria-label="Version preview">
        <h3 class="text-lg font-semibold tracking-tight">
          {{ preview.subject || 'Selected version' }}
        </h3>
        <p v-if="preview.previewText" class="text-sm text-muted">
          {{ preview.previewText }}
        </p>
        <iframe
          v-if="preview.previewHtml"
          :srcdoc="preview.previewHtml"
          sandbox=""
          referrerpolicy="no-referrer"
          title="Selected version preview"
          class="h-[520px] w-full rounded border border-default bg-white"
        />
        <EmailBuilderEdmDocumentThumbnail
          v-else-if="previewDocument"
          :document="previewDocument"
          :width="380"
          :max-height="560"
        />
        <UAlert
          v-if="!preview.restorable"
          title="This version cannot be restored"
          description="Current design locks, content policy or dependency access prevent restoring it. The current draft is kept."
          color="warning"
        />
        <p v-else class="text-sm text-muted">
          Block identities and selected module versions are preserved. Current content permissions and brand defaults
          remain in force.
        </p>
        <UButton
          label="Restore this version"
          icon="i-lucide-history"
          :disabled="!ready || !preview.restorable || preview.revisionId === draft?.headRevisionId"
          :loading="flow.busy.value"
          @click="emit('restore', preview.revisionId)"
        />
      </section>
    </div>
  </div>
</template>
