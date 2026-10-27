<script setup lang="ts">
import { useSocialPublishing } from '~/composables/useSocialPublishing'
import { useSocialPublishingClient } from '~/composables/useSocialPublishingClient'
import { isApprovedComposerUnchanged, missingAccountPlatforms, useSocialComposer } from '~/composables/useSocialComposer'
import type { SocialAccount } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const api = useSocialPublishing()
const { state, reset, loadFromPost, resolved, toBody } = useSocialComposer()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown> }
) => Promise<T>

// /api/agency/clients returns a BARE array — unwrap defensively (a {clients} access silently empties it).
const clientsData = ref<any>([])
clientsData.value = await apiFetch('/api/agency/clients', { query: { limit: 200 } }).catch(() => [])
const clients = computed<any[]>(() => {
  const d = clientsData.value as any
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const { clientId } = useSocialPublishingClient()
const pageName = computed(() => clients.value.find(c => c.id === clientId.value)?.name || '')
const accounts = ref<SocialAccount[]>([])
const accountsLoading = ref(false)
const accountsError = ref(false)
const accountsClientId = ref<string | null>(null)
const accountsResolved = computed(() => Boolean(clientId.value)
  && accountsClientId.value === clientId.value && !accountsLoading.value && !accountsError.value)
let accountRequest = 0
const bannerSuggestedSchedule = computed(() => typeof state.value.metadata.bannerSuggestedSchedule === 'string' ? state.value.metadata.bannerSuggestedSchedule : '')

const saving = ref(false)
const persistedStatus = ref<string | null>(null)
const approvedBody = ref<string | null>(null)
const canPublishSavedPost = computed(() => isApprovedComposerUnchanged(
  state.value, clientId.value ?? '', persistedStatus.value, approvedBody.value))

const platformLabel: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  'google-business': 'Google Business',
}

async function loadAccounts() {
  const requestedClient = clientId.value
  const request = ++accountRequest
  accountsClientId.value = null
  accountsError.value = false
  if (!requestedClient) {
    accounts.value = []
    accountsLoading.value = false
    return
  }
  accountsLoading.value = true
  try {
    const result = await api.listAccounts(requestedClient)
    if (request !== accountRequest || clientId.value !== requestedClient) return
    accounts.value = result
    accountsClientId.value = requestedClient
  } catch {
    if (request === accountRequest && clientId.value === requestedClient) accountsError.value = true
  } finally {
    if (request === accountRequest) accountsLoading.value = false
  }
}

watch(clientId, loadAccounts, { immediate: true })

onMounted(async () => {
  reset()
  const editId = route.query.edit as string | undefined
  if (editId) {
    try {
      const post = await api.getPost(editId)
      await router.replace({ query: { ...route.query, client: post.client_id } })
      await nextTick()
      loadFromPost(post)
      persistedStatus.value = post.status
      approvedBody.value = JSON.stringify(toBody(post.client_id))
    } catch {
      toast.add({ title: 'Could not load post', color: 'error' })
    }
  }
  if (route.query.date) {
    state.value.scheduleMode = 'schedule'
    state.value.scheduledAt = new Date(route.query.date as string).toISOString()
  }
  // Legacy web-ad links cannot be attached as photos or video.
  if (route.query.creative) {
    toast.add({ title: 'Export this banner as media first', description: 'In Banner Studio, export MP4 and choose Create social draft, or upload a PNG/JPG here.', color: 'warning' })
  }

  // Deep-link from Auto Feed: ?prefill=<base64 JSON {clientId, caption, imageUrl, link}>
  const prefillRaw = route.query.prefill as string | undefined
  if (prefillRaw) {
    try {
      const prefill = JSON.parse(decodeURIComponent(escape(atob(prefillRaw))))
      if (prefill.clientId) clientId.value = prefill.clientId
      if (prefill.caption && !state.value.content) state.value.content = prefill.caption
      if (typeof prefill.link === 'string' && !state.value.linkUrl) state.value.linkUrl = prefill.link
      if (prefill.imageUrl && !state.value.mediaUrls.includes(prefill.imageUrl)) {
        state.value.mediaUrls.push(prefill.imageUrl)
      }
    } catch { /* non-fatal — composer still opens */ }
  }
})

function guard(requireAccounts = true): string | null {
  if (!clientId.value) { toast.add({ title: 'Pick a client first', color: 'warning' }); return null }
  if (!accountsResolved.value) {
    toast.add({ title: 'Publishing accounts are not ready', description: 'Wait for account discovery or retry before saving.', color: 'warning' })
    return null
  }
  if (!state.value.platforms.length) { toast.add({ title: 'Select at least one network', color: 'warning' }); return null }
  const missing = missingAccountPlatforms(state.value.platforms, state.value.accountIds, accounts.value)
  if (requireAccounts && missing.length) {
    toast.add({
      title: 'Select publishing accounts',
      description: missing.map(platform => platformLabel[platform] || platform).join(', '),
      color: 'warning',
    })
    return null
  }
  return clientId.value
}

async function upsert(extra: Record<string, unknown> = {}, requireAccounts = true): Promise<string | null> {
  const cid = guard(requireAccounts)
  if (!cid) return null
  const body = { ...toBody(cid), ...extra }
  const row = state.value.id
    ? await api.updatePost(state.value.id, body)
    : await api.createPost(body)
  state.value.id = row.id
  persistedStatus.value = row.status
  approvedBody.value = row.status === 'approved' ? JSON.stringify(toBody(cid)) : null
  return row.id
}

async function publishApprovedPost() {
  if (!state.value.id || !canPublishSavedPost.value) return
  saving.value = true
  try {
    // Publish the saved, approved payload. Saving edits here would reset approval.
    const result = await api.publishNow(state.value.id) as { status: string, platformResults?: Record<string, { error?: string }> }
    persistedStatus.value = result.status
    const errors = Object.values(result.platformResults ?? {}).flatMap(target => target.error ? [target.error] : [])
    toast.add({
      title: result.status === 'published' ? 'Published' : result.status === 'partially_published' ? 'Partially published' : 'Publishing failed',
      description: errors.join('; ') || undefined,
      color: result.status === 'published' ? 'success' : result.status === 'partially_published' ? 'warning' : 'error'
    })
  } catch (error: unknown) {
    const failure = error as { data?: { statusMessage?: string } }
    toast.add({ title: 'Could not publish', description: failure?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

async function saveDraft() {
  saving.value = true
  try {
    const id = await upsert({}, false)
    if (id) toast.add({ title: 'Draft saved', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

async function requestApproval() {
  saving.value = true
  try {
    const id = await upsert()
    if (id) { await api.requestApproval(id); toast.add({ title: 'Sent for approval', color: 'success' }) }
  } catch (e: any) {
    toast.add({ title: 'Could not request approval', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

async function primaryAction() {
  saving.value = true
  try {
    if (state.value.scheduleMode === 'now') {
      const id = await upsert()
      if (!id) return
      await api.requestApproval(id)
      toast.add({ title: 'Sent for approval', color: 'success' })
    } else if (state.value.scheduleMode === 'schedule') {
      if (!state.value.scheduledAt) { toast.add({ title: 'Pick a date to schedule', color: 'warning' }); return }
      const id = await upsert()
      if (id) {
        await api.requestApproval(id)
        toast.add({ title: 'Scheduled draft sent for approval', color: 'success' })
      }
    } else {
      const id = await upsert()
      if (id) toast.add({ title: 'Added — arrange timing in the Queue', color: 'success' })
    }
  } catch (e: any) {
    toast.add({ title: 'Action failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

const primaryLabel = computed(() => ({
  now: 'Send for approval',
  schedule: 'Schedule for approval',
  queue: 'Add to queue',
}[state.value.scheduleMode]))
</script>

<template>
  <SocialPublishingShell
    title="Compose"
    subtitle="Author one post, tailor it per network, and schedule across channels."
  >
    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-8">
      <!-- Authoring -->
      <div>
        <UAlert
          v-if="bannerSuggestedSchedule"
          class="mb-5"
          title="Suggested posting time"
          :description="`${bannerSuggestedSchedule}. Choose the exact date, time and timezone in Timing below before requesting approval.`"
          color="info"
          variant="subtle"
        />
        <div v-if="accountsError" class="mb-5 space-y-2" role="alert">
          <UAlert
            title="Could not load publishing accounts"
            description="Your saved targets are preserved. Retry before changing destinations or saving."
            color="error"
            variant="subtle"
          />
          <UButton
            color="neutral"
            variant="outline"
            label="Retry accounts"
            @click="loadAccounts"
          />
        </div>
        <SocialPublishingPostComposer
          :client-id="clientId"
          :accounts="accounts"
          :accounts-loading="accountsLoading"
          :accounts-resolved="accountsResolved"
        />

        <div class="mt-8 flex flex-wrap items-center gap-3 border-t border-default pt-5">
          <UButton
            v-if="persistedStatus === 'approved'"
            :loading="saving"
            :disabled="!canPublishSavedPost"
            icon="i-lucide-send"
            @click="publishApprovedPost"
          >
            Publish approved post
          </UButton>
          <UButton :loading="saving" color="primary" icon="i-lucide-check" @click="primaryAction">
            {{ primaryLabel }}
          </UButton>
          <UButton :loading="saving" color="neutral" variant="subtle" icon="i-lucide-save" @click="saveDraft">
            Save draft
          </UButton>
          <UButton :loading="saving" color="neutral" variant="ghost" icon="i-lucide-send-horizontal" @click="requestApproval">
            Request approval
          </UButton>
        </div>
        <p v-if="persistedStatus === 'approved' && !canPublishSavedPost" class="mt-3 text-sm text-muted">
          Your edits need approval before publishing. Save and request approval again.
        </p>
      </div>

      <!-- Preview -->
      <aside class="lg:sticky lg:top-6 self-start">
        <h2 class="text-xs font-medium uppercase tracking-wide text-muted mb-3">Live preview</h2>
        <SocialPublishingPlatformPreviewPane
          :platforms="state.platforms"
          :page-name="pageName"
          :resolve="resolved"
        />
      </aside>
    </div>
  </SocialPublishingShell>
</template>
