<script setup lang="ts">
import { useSocialPublishing } from '~/composables/useSocialPublishing'
import { useSocialComposer } from '~/composables/useSocialComposer'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const route = useRoute()
const toast = useToast()
const api = useSocialPublishing()
const { state, reset, loadFromPost, resolved, toBody } = useSocialComposer()

// /api/agency/clients returns a BARE array — unwrap defensively (a {clients} access silently empties it).
const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<any[]>(() => {
  const d = clientsData.value as any
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>((route.query.client as string) || null)
const pageName = computed(() => clients.value.find(c => c.id === clientId.value)?.name || '')

const saving = ref(false)

onMounted(async () => {
  reset()
  const editId = route.query.edit as string | undefined
  if (editId) {
    try {
      const post = await api.getPost(editId)
      loadFromPost(post)
      clientId.value = post.client_id
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
      const creatives = await $fetch<{ id: string; url: string }[]>('/api/agency/banner-studio/published/with-projects')
      const match = creatives.find(c => c.id === creativeId)
      if (match) {
        if (!state.value.mediaUrls.includes(match.url)) state.value.mediaUrls.push(match.url)
        state.value.creativeId = match.id
      }
    } catch { /* non-fatal — composer still opens */ }
  }
})

function guard(): string | null {
  if (!clientId.value) { toast.add({ title: 'Pick a client first', color: 'warning' }); return null }
  if (!state.value.platforms.length) { toast.add({ title: 'Select at least one network', color: 'warning' }); return null }
  return clientId.value
}

async function upsert(extra: Record<string, any> = {}): Promise<string | null> {
  const cid = guard()
  if (!cid) return null
  const body = { ...toBody(cid), ...extra }
  const row = state.value.id
    ? await api.updatePost(state.value.id, body)
    : await api.createPost(body)
  state.value.id = row.id
  return row.id
}

async function saveDraft() {
  saving.value = true
  try {
    const id = await upsert({ status: 'draft' })
    if (id) toast.add({ title: 'Draft saved', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

async function requestApproval() {
  saving.value = true
  try {
    const id = await upsert({ status: 'draft' })
    if (id) { await api.requestApproval(id); toast.add({ title: 'Sent for approval', color: 'success' }) }
  } catch (e: any) {
    toast.add({ title: 'Could not request approval', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

async function primaryAction() {
  saving.value = true
  try {
    if (state.value.scheduleMode === 'now') {
      const id = await upsert({ status: 'draft' })
      if (!id) return
      await api.publishNow(id)
      toast.add({ title: 'Published', color: 'success' })
    } else if (state.value.scheduleMode === 'schedule') {
      if (!state.value.scheduledAt) { toast.add({ title: 'Pick a date to schedule', color: 'warning' }); return }
      const id = await upsert({ status: 'scheduled' })
      if (id) toast.add({ title: 'Scheduled', color: 'success' })
    } else {
      const id = await upsert({ status: 'draft' })
      if (id) toast.add({ title: 'Added — arrange timing in the Queue', color: 'success' })
    }
  } catch (e: any) {
    toast.add({ title: 'Action failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

const primaryLabel = computed(() => ({
  now: 'Save & publish now',
  schedule: 'Schedule post',
  queue: 'Add to queue',
}[state.value.scheduleMode]))
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Compose</h1>
        <p class="text-sm text-muted mt-0.5">Author one post, tailor it per network, and schedule across channels.</p>
      </div>
      <USelectMenu
        v-model="clientId"
        :items="clientOptions"
        value-key="value"
        label-key="label"
        placeholder="Select client"
        icon="i-lucide-building-2"
        class="w-60"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-8">
      <!-- Authoring -->
      <div>
        <SocialPublishingPostComposer />

        <div class="mt-8 flex flex-wrap items-center gap-3 border-t border-default pt-5">
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
  </div>
</template>
