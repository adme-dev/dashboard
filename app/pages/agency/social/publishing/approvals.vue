<script setup lang="ts">
import { useSocialPublishing } from '~/composables/useSocialPublishing'
import { useSocialPublishingClient } from '~/composables/useSocialPublishingClient'
import type { SocialPost } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const api = useSocialPublishing()
const toast = useToast()

const { clientId } = useSocialPublishingClient()

const pending = ref<SocialPost[]>([])
const loading = ref(false)
const rejectTarget = ref<SocialPost | null>(null)
const rejectReason = ref('')

async function load() {
  loading.value = true
  try { pending.value = await api.getApprovals(clientId.value ?? undefined) } finally { loading.value = false }
}
watch(clientId, load, { immediate: true })

async function approve(p: SocialPost) {
  try { await api.approve(p.id); toast.add({ title: 'Approved', color: 'success' }); await load() }
  catch (e: any) { toast.add({ title: 'Approve failed', description: e?.data?.statusMessage, color: 'error' }) }
}
async function confirmReject() {
  if (!rejectTarget.value) return
  try {
    await api.reject(rejectTarget.value.id, rejectReason.value)
    toast.add({ title: 'Sent back for changes', color: 'success' })
    rejectTarget.value = null; rejectReason.value = ''
    await load()
  } catch (e: any) { toast.add({ title: 'Reject failed', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <SocialPublishingShell
    title="Approvals"
    subtitle="Posts awaiting sign-off before they schedule or publish."
  >
    <div v-if="loading" class="text-sm text-muted">Loading…</div>
    <div v-else-if="!pending.length" class="rounded-lg border border-default p-10 text-center text-muted">
      <UIcon name="i-lucide-check-circle-2" class="size-8 mx-auto mb-2 opacity-50" />
      Nothing awaiting approval.
    </div>

    <div v-else class="space-y-3">
      <div v-for="p in pending" :key="p.id" class="rounded-lg border border-default p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap gap-1 mb-2">
              <UBadge v-for="pl in p.platforms" :key="pl" color="neutral" variant="subtle">{{ pl }}</UBadge>
            </div>
            <p class="text-sm whitespace-pre-wrap line-clamp-4">{{ p.content || '(no copy)' }}</p>
            <p class="text-xs text-muted mt-2">
              Requested {{ p.approval_requested_at ? new Date(p.approval_requested_at).toLocaleString() : '' }}
            </p>
          </div>
          <div class="flex flex-col gap-2 shrink-0">
            <UButton color="success" icon="i-lucide-check" size="sm" @click="approve(p)">Approve</UButton>
            <UButton color="error" variant="subtle" icon="i-lucide-x" size="sm" @click="rejectTarget = p">Reject</UButton>
            <UButton :to="{ path: '/agency/social/publishing/compose', query: { edit: p.id } }" variant="ghost" size="sm" icon="i-lucide-pencil">Edit</UButton>
          </div>
        </div>
      </div>
    </div>

    <UModal :open="!!rejectTarget" @update:open="(v) => { if (!v) rejectTarget = null }">
      <template #content>
        <div class="p-5 space-y-4">
          <h3 class="font-semibold">Request changes</h3>
          <UFormField label="Reason" help="Shared with the requester.">
            <UTextarea v-model="rejectReason" :rows="4" placeholder="What needs to change?" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="rejectTarget = null">Cancel</UButton>
            <UButton color="error" @click="confirmReject">Send back</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </SocialPublishingShell>
</template>
