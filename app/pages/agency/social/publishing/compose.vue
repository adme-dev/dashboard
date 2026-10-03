<script setup lang="ts">
import { useSocialPublishing } from '~/composables/useSocialPublishing'
import { useSocialPublishingClient } from '~/composables/useSocialPublishingClient'
import { isApprovedComposerUnchanged, missingAccountPlatforms, useSocialComposer } from '~/composables/useSocialComposer'
import type { SocialAccount } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const route = useRoute()
const toast = useToast()
const api = useSocialPublishing()
const { state, reset, loadFromPost, resolved, toBody } = useSocialComposer()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown> }
) => Promise<T>

const { clientId, clients, selectClient } = useSocialPublishingClient()
const pageName = computed(() => clients.value.find(c => c.id === clientId.value)?.name || '')
const accounts = ref<SocialAccount[]>([])
const accountsLoading = ref(false)
const captionNeedsReview = computed(() => state.value.metadata.captionGenerationFailed === true && !state.value.content.trim())
const missingPlatforms = computed(() => missingAccountPlatforms(state.value.platforms, state.value.accountIds, accounts.value))

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
  if (!clientId.value) {
    accounts.value = []
    return
  }
  accountsLoading.value = true
  try {
    accounts.value = await api.listAccounts(clientId.value)
  } finally {
    accountsLoading.value = false
  }
}

watch(clientId, loadAccounts, { immediate: true })

onMounted(async () => {
  reset()
  const editId = route.query.edit as string | undefined
  if (editId) {
    try {
      const post = await api.getPost(editId)
      await selectClient(post.client_id)
      // Let child client-change resets run before hydrating the saved campaign.
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
  // Deep-link from Banner Studio: ?creative=<bannerPublishedId> prefills the media + creativeId.
  const creativeId = route.query.creative as string | undefined
  if (creativeId) {
    try {
      const creatives = await apiFetch<{ id: string; url: string }[]>('/api/agency/banner-studio/published/with-projects')
      const match = creatives.find(c => c.id === creativeId)
      if (match) {
        if (!state.value.mediaUrls.includes(match.url)) state.value.mediaUrls.push(match.url)
        state.value.creativeId = match.id
      }
    } catch { /* non-fatal — composer still opens */ }
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
  if (!state.value.platforms.length) { toast.add({ title: 'Select at least one network', color: 'warning' }); return null }
  if (requireAccounts && captionNeedsReview.value) {
    toast.add({ title: 'Add your caption before approval', color: 'warning' })
    return null
  }
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
  queue: 'Save for queue'
}[state.value.scheduleMode]))
</script>

<template>
  <SocialPublishingShell
    title="Compose"
    subtitle="Prepare your content, check the preview, then send it for approval."
  >
    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
      <!-- Authoring -->
      <div class="min-w-0">
        <ClientOnly>
          <SocialPublishingPostComposer
            :client-id="clientId"
            :accounts="accounts"
            :accounts-loading="accountsLoading"
          />
          <template #fallback>
            <div role="status" aria-label="Loading post editor" class="space-y-5">
              <USkeleton class="h-64 rounded-xl motion-reduce:animate-none" />
              <USkeleton class="h-96 rounded-xl motion-reduce:animate-none" />
              <USkeleton class="h-40 rounded-xl motion-reduce:animate-none" />
            </div>
          </template>
        </ClientOnly>
      </div>

      <!-- Preview -->
      <aside class="min-w-0 lg:sticky lg:top-0 self-start lg:max-h-[calc(100svh-3rem)] lg:overflow-y-auto">
        <h2 class="text-base font-semibold mb-1">
          Post preview
        </h2>
        <p class="text-sm text-muted mb-4">
          Check the copy and media for each selected network.
        </p>
        <SocialPublishingPlatformPreviewPane
          :platforms="state.platforms"
          :page-name="pageName"
          :resolve="resolved"
        />
      </aside>
    </div>
    <div class="sticky bottom-0 z-10 mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-default bg-default/95 p-4 backdrop-blur">
      <UBadge color="neutral" variant="subtle" class="capitalize mr-auto">
        {{ persistedStatus?.replace(/_/g, ' ') || 'Unsaved draft' }}
      </UBadge>
      <UButton
        :loading="saving"
        color="neutral"
        variant="subtle"
        icon="i-lucide-save"
        @click="saveDraft"
      >
        Save draft
      </UButton>
      <UButton
        v-if="canPublishSavedPost"
        :loading="saving"
        :disabled="!canPublishSavedPost"
        icon="i-lucide-send"
        @click="publishApprovedPost"
      >
        Publish approved post
      </UButton>
      <UButton
        v-else
        :loading="saving"
        color="primary"
        icon="i-lucide-check"
        @click="primaryAction"
      >
        {{ primaryLabel }}
      </UButton>
    </div>
    <p v-if="persistedStatus === 'approved' && !canPublishSavedPost" class="mt-3 text-sm text-muted">
      Your edits need approval before publishing. Save and request approval again.
    </p>
    <p v-if="missingPlatforms.length" class="mt-3 text-sm text-muted">
      Save your draft at any time. Select accounts for {{ missingPlatforms.map(p => platformLabel[p] || p).join(', ') }} before approval or scheduling.
    </p>
  </SocialPublishingShell>
</template>
