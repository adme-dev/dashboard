<script setup lang="ts">
import { PageStudioStagingStateSchema, pageStudioStagingLink, type PageStudioStagingState, type PageStudioStagingUpdateSchema } from '~~/shared/pageStudio/staging'
import type { z } from 'zod'

const props = defineProps<{ siteId: string, audience: 'agency' | 'portal' }>()
const endpoint = computed(() => `/api/${props.audience}/page-studio/sites/${encodeURIComponent(props.siteId)}/staging`)
const { data, error, pending, refresh } = await useFetch<PageStudioStagingState>(endpoint)
const updating = ref(false)
const initialUnconfirmed = ref(false)
const initialRequests = new Set<string>()
let scopeRevision = 0
let mounted = false
const attempt = ref<z.infer<typeof PageStudioStagingUpdateSchema> | null>(null)
const toast = useToast()
const state = computed(() => {
  if (error.value) return null
  const parsed = PageStudioStagingStateSchema.safeParse(data.value)
  return parsed.success && parsed.data.siteId === props.siteId ? parsed.data : null
})
const link = computed(() => pageStudioStagingLink(state.value, props.siteId))
const busy = computed(() => updating.value || ['building', 'provisioning'].includes(state.value?.status ?? ''))
const changed = computed(() => state.value?.active && state.value.currentDigest !== state.value.active.digest)
const labels: Record<PageStudioStagingState['status'], string> = {
  not_published: 'Not deployed', provisioning: 'Preparing address', building: 'Updating staging', ready: 'Ready',
  update_failed: 'Update failed', failed: 'Deployment failed', suspended: 'Unavailable'
}
const deployedAt = computed(() => state.value?.active ? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(state.value.active.deployedAt)) : null)
let poll: ReturnType<typeof setInterval> | undefined
watch(() => state.value?.status, (status) => {
  if (poll) clearInterval(poll)
  poll = ['building', 'provisioning'].includes(status ?? '')
    ? setInterval(() => {
        if (!updating.value) void refresh()
      }, 5000)
    : undefined
}, { immediate: true })
watch(() => state.value?.active, (active) => {
  // A completed refresh is acknowledgement even when the POST response was
  // lost. Keep uncertain requests while the previous snapshot is still active.
  const requested = attempt.value
  if (requested && state.value?.status === 'ready' && active
    && active.id !== requested.expectedActiveId && active.digest === requested.digest) {
    attempt.value = null
  }
})
function invalidateRequest() {
  scopeRevision++
  attempt.value = null
  initialUnconfirmed.value = false
  updating.value = false
}
watch(endpoint, invalidateRequest, { flush: 'sync' })
watch(() => state.value?.canManage, (canManage) => {
  if (canManage === false) invalidateRequest()
}, { flush: 'sync' })
onMounted(() => {
  mounted = true
  watch([endpoint, state], () => {
    const current = state.value
    if (!current?.canManage || current.active || current.failure || current.status !== 'not_published' || updating.value) return
    // Reserve an empty site's address once, then request its first saved
    // checkpoint once. Later draft changes never trigger another deployment.
    const key = `${endpoint.value}:${current.currentDigest ? 'saved' : 'empty'}`
    if (initialRequests.has(key)) return
    initialRequests.add(key)
    void ensureInitial()
  }, { immediate: true })
})
onUnmounted(() => {
  mounted = false
  invalidateRequest()
  if (poll) clearInterval(poll)
})

async function ensureInitial() {
  if (!mounted || !state.value?.canManage || updating.value) return
  const revision = scopeRevision
  const requestedSite = props.siteId
  const url = endpoint.value
  updating.value = true
  initialUnconfirmed.value = true
  try {
    const response = PageStudioStagingStateSchema.parse(await $fetch(`${url}/ensure`, { method: 'POST', body: {} }))
    if (revision !== scopeRevision || !mounted) return
    if (response.siteId !== requestedSite) throw new Error('Staging response did not match this website')
    data.value = response
    initialUnconfirmed.value = false
  } catch (failure) {
    if (revision !== scopeRevision || !mounted) return
    const status = (failure as { statusCode?: number, status?: number })?.statusCode ?? (failure as { status?: number })?.status
    if (status === 429) {
      initialUnconfirmed.value = false
      toast.add({ title: 'Monthly build allowance reached', description: 'Staging and published website builds share your package allowance.', color: 'error' })
    } else {
      toast.add({ title: 'Initial staging could not be confirmed', description: 'Check the initial staging request before starting another update.', color: 'error' })
    }
  } finally {
    if (revision === scopeRevision) updating.value = false
  }
}

async function update() {
  if (initialUnconfirmed.value) {
    await ensureInitial()
    return
  }
  const current = state.value
  if (!current?.canManage || !current.currentDigest || updating.value || current.status === 'suspended') return
  const revision = scopeRevision
  const requestedSite = props.siteId
  const url = endpoint.value
  attempt.value ??= { digest: current.currentDigest, expectedActiveId: current.active?.id ?? null, idempotencyKey: crypto.randomUUID() }
  updating.value = true
  try {
    const response = PageStudioStagingStateSchema.parse(await $fetch(url, { method: 'POST', body: attempt.value }))
    if (revision !== scopeRevision || !mounted) return
    if (requestedSite !== props.siteId || response.siteId !== requestedSite) throw new Error('Staging response did not match this website')
    data.value = response
    if (!['provisioning', 'building'].includes(response.status)) attempt.value = null
    const ready = response.status === 'ready'
    toast.add({ title: ready ? 'Staging updated' : response.failure ? 'Staging update failed' : 'Staging update in progress',
      description: ready ? 'Your saved website is available at its staging address.' : response.failure ? 'The previous preview stays available when one exists. Retry the update.' : 'The status will refresh automatically.', color: ready ? 'success' : response.failure ? 'error' : 'info' })
  } catch (failure) {
    if (revision !== scopeRevision || !mounted) return
    const status = (failure as { statusCode?: number, status?: number })?.statusCode ?? (failure as { status?: number })?.status
    if (status === 429) {
      attempt.value = null
      toast.add({ title: 'Monthly build allowance reached', description: 'Staging and published website builds share your package allowance. Upgrade your package or wait for the next monthly allowance.', color: 'error' })
      return
    }
    if (status === 409) {
      attempt.value = null
      await refresh()
      if (revision !== scopeRevision || !mounted) return
    }
    toast.add({ title: 'Staging update could not be confirmed', description: 'Refresh the status or retry to check the saved request.', color: 'error' })
  } finally {
    if (revision === scopeRevision) updating.value = false
  }
}
</script>

<template>
  <UCard class="min-w-0">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="font-semibold text-highlighted">
            Website staging
          </h2>
          <p class="mt-1 text-sm text-muted">
            Preview your saved website. No custom domain required.
          </p>
        </div>
        <UBadge v-if="state" :color="state.status === 'ready' ? 'success' : 'neutral'" variant="subtle">
          {{ labels[state.status] }}
        </UBadge>
      </div>
    </template>
    <div class="space-y-4" aria-live="polite">
      <UAlert
        v-if="!state && !pending"
        title="Staging status unavailable"
        description="Refresh to check this website's staging deployment."
        color="error"
      />
      <p v-else-if="!state" class="text-sm text-muted">
        Loading staging status…
      </p>
      <template v-else>
        <p class="break-all rounded-lg border border-default bg-elevated p-3 font-mono text-sm text-highlighted">
          {{ state.hostname }}
        </p>
        <p class="text-sm text-muted">
          {{ deployedAt ? `Saved snapshot deployed ${deployedAt}.` : state.currentDigest ? 'Your first saved preview is prepared automatically. Use Update staging for later changes.' : 'Save a page to prepare the first preview at this address.' }}
          Unsaved editor changes are excluded. Form submissions are disabled on staging.
        </p>
        <UAlert
          v-if="changed"
          title="Saved changes available"
          description="Update staging to preview the latest saved website."
          color="info"
        />
        <UAlert
          v-if="state.failure"
          title="Staging needs another attempt"
          :description="state.active ? 'The previous snapshot is still available. Retry to deploy your saved changes.' : 'The snapshot is not ready. Retry the update or contact your agency team.'"
          color="warning"
        />
        <p v-if="!state.canManage" class="text-sm text-muted">
          Read-only access. An editor can update this preview.
        </p>
      </template>
    </div>
    <template #footer>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="state?.canManage"
          :label="initialUnconfirmed ? 'Check initial staging' : 'Update staging'"
          icon="i-lucide-cloud-upload"
          :loading="updating"
          :disabled="busy || (!state.currentDigest && !initialUnconfirmed) || state.status === 'suspended'"
          @click="update"
        />
        <UButton
          v-if="link"
          label="Open staging"
          icon="i-lucide-external-link"
          :to="link"
          target="_blank"
          rel="noopener noreferrer"
          color="neutral"
          variant="outline"
        />
        <UButton
          label="Refresh status"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          :loading="pending"
          :disabled="updating"
          @click="refresh()"
        />
      </div>
    </template>
  </UCard>
</template>
