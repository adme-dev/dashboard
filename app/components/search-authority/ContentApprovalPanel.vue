<script setup lang="ts">
import { idempotencyKey } from '~~/app/utils/idempotencyKey'

const props = defineProps<{
  clientId: string
  assetId: string
  versionId: string | null
  status: string
  busy?: boolean
}>()

const emit = defineEmits<{
  refreshed: []
  edit: []
  publish: []
}>()

const toast = useToast()
const decisionOpen = ref(false)
const decision = ref<'approved' | 'rejected'>('approved')
const rationale = ref('')
const localBusy = ref(false)
const canPublish = computed(() => props.status === 'approved')

function message(error: unknown): string {
  const candidate = error as { data?: { statusMessage?: string }, message?: string }
  return candidate?.data?.statusMessage || candidate?.message || 'The content action could not be completed.'
}

async function submitForReview() {
  if (!props.versionId) return
  localBusy.value = true
  try {
    await $fetch(`/api/agency/search-authority/content/${props.assetId}/submit`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey('search-authority-decision') },
      body: { clientId: props.clientId, versionId: props.versionId }
    })
    toast.add({ title: 'Submitted for review', color: 'success' })
    emit('refreshed')
  } catch (error: unknown) {
    toast.add({ title: 'Submission failed', description: message(error), color: 'error' })
  } finally {
    localBusy.value = false
  }
}

function openDecision(next: 'approved' | 'rejected') {
  decision.value = next
  rationale.value = ''
  decisionOpen.value = true
}

function closeDecision() {
  decisionOpen.value = false
}

async function saveDecision() {
  if (!props.versionId || rationale.value.trim().length < 5) return
  localBusy.value = true
  try {
    await $fetch(`/api/agency/search-authority/content/${props.assetId}/${decision.value === 'approved' ? 'approve' : 'reject'}`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey('search-authority-decision') },
      body: {
        clientId: props.clientId,
        versionId: props.versionId,
        rationale: rationale.value.trim()
      }
    })
    decisionOpen.value = false
    toast.add({
      title: decision.value === 'approved' ? 'Version approved' : 'Changes requested',
      color: decision.value === 'approved' ? 'success' : 'warning'
    })
    emit('refreshed')
  } catch (error: unknown) {
    toast.add({ title: 'Decision failed', description: message(error), color: 'error' })
  } finally {
    localBusy.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <UAlert
      v-if="status === 'published'"
      title="Guide is live"
      description="This immutable version is the active public publication. Create a new version for any change."
      icon="i-lucide-globe-2"
      color="success"
      variant="subtle"
    />
    <UAlert
      v-else-if="!canPublish"
      title="Publication locked"
      description="Publish is enabled only after explicit approval of the current immutable version."
      icon="i-lucide-lock-keyhole"
      color="neutral"
      variant="subtle"
    />

    <div class="flex flex-wrap gap-2">
      <UButton
        v-if="status === 'draft' || status === 'rejected'"
        label="Submit for review"
        icon="i-lucide-send"
        :loading="localBusy || busy"
        :disabled="!versionId"
        @click="submitForReview"
      />
      <template v-if="status === 'in_review'">
        <UButton
          label="Approve version"
          icon="i-lucide-circle-check"
          color="success"
          :disabled="localBusy || busy"
          @click="openDecision('approved')"
        />
        <UButton
          label="Request changes"
          icon="i-lucide-message-square-warning"
          color="warning"
          variant="soft"
          :disabled="localBusy || busy"
          @click="openDecision('rejected')"
        />
      </template>
      <UButton
        v-if="status === 'approved' || status === 'published'"
        label="Create a new version"
        icon="i-lucide-copy-plus"
        color="neutral"
        variant="soft"
        @click="emit('edit')"
      />
      <UButton
        label="Publish guide"
        icon="i-lucide-globe-2"
        :disabled="!canPublish || localBusy || busy"
        @click="emit('publish')"
      />
    </div>

    <UModal v-model:open="decisionOpen" :title="decision === 'approved' ? 'Approve this version' : 'Request changes'">
      <template #body>
        <div class="space-y-4 p-1">
          <UAlert
            :title="decision === 'approved' ? 'This exact version becomes publishable' : 'The author must create a new version'"
            :description="decision === 'approved' ? 'Later edits create a separate version and require approval again.' : 'Submitted content is never edited in place.'"
            color="neutral"
            variant="subtle"
          />
          <UFormField label="Decision rationale" required>
            <UTextarea
              v-model="rationale"
              class="w-full"
              :rows="4"
              placeholder="Record why this version is safe to publish or what needs to change."
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="closeDecision"
          />
          <UButton
            :label="decision === 'approved' ? 'Approve version' : 'Request changes'"
            :color="decision === 'approved' ? 'success' : 'warning'"
            :loading="localBusy"
            :disabled="rationale.trim().length < 5"
            @click="saveDecision"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
