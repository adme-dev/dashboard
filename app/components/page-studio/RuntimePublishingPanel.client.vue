<script setup lang="ts">
import { openPageStudioCandidatePreview } from '~~/app/utils/pageStudioCandidatePreview'
import type { PageStudioRuntimeState as RuntimeState } from '~~/shared/pageStudio/runtimeState'

/**
 * Instant publishing for runtime-delivery sites (Studio ADR-005): Save keeps a
 * private draft, an approved version is published explicitly, and earlier
 * versions can be restored without rebuilding. Mirrors the server contract:
 * nothing here changes the live site except the Publish and Restore actions.
 */
const props = defineProps<{ siteId: string, state: RuntimeState, productionHostname: string | null }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

const short = (digest?: string | null) => digest ? digest.slice(0, 8) : '—'
const when = (value?: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : ''

// Staging publishes to the site's existing staging hostname; production to its ready domain.
const hostname = computed(() => props.state.environment === 'production' ? (props.productionHostname ?? props.state.hostname) : props.state.hostname)
const live = computed(() => props.state.releases.find(release => release.active && release.hostname === hostname.value) ?? null)
const history = computed(() => props.state.releases.filter(release => release.hostname === hostname.value && !release.active))
const draftMatchesApproved = computed(() => Boolean(props.state.draft && props.state.approved && props.state.draft.digest === props.state.approved.digest))

const publishBlocker = computed(() => {
  if (!props.state.rendererConfigured) return 'Instant publishing is not configured for this environment yet.'
  if (!hostname.value) return props.state.environment === 'production' ? 'Connect a ready production domain first.' : 'This website has no staging hostname yet.'
  if (!props.state.approved) return 'Approve a saved version before publishing.'
  if (live.value?.versionId === props.state.approved.versionId) return 'The approved version is already live.'
  return ''
})

const stages = computed(() => [
  {
    key: 'draft',
    title: 'Saved draft',
    digest: props.state.draft?.digest,
    detail: props.state.draft ? `Saved ${when(props.state.draft.savedAt)}` : 'Nothing saved yet',
    note: draftMatchesApproved.value ? 'Matches the approved version' : props.state.draft ? 'Private until approved and published' : ''
  },
  {
    key: 'approved',
    title: 'Approved',
    digest: props.state.approved?.digest,
    detail: props.state.approved ? 'Ready to publish' : 'Waiting for review',
    note: ''
  },
  {
    key: 'live',
    title: 'Live',
    digest: live.value?.versionDigest,
    detail: live.value ? `Published ${when(live.value.publishedAt)}` : 'Not published',
    note: live.value ? live.value.hostname : ''
  }
])

const previewing = ref(false)
async function previewDraft() {
  previewing.value = true
  try {
    const result = await $fetch<{ hostname: string, session: { token: string, expiresAt: number } }>(
      `/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/runtime-preview`, { method: 'POST' })
    openPageStudioCandidatePreview(result.hostname, result.session)
  } catch (error) {
    toast.add({ title: 'Preview unavailable', description: errorMessage(error), color: 'error' })
  } finally {
    previewing.value = false
  }
}

const publishOpen = ref(false)
const publishConfirmed = ref(false)
const publishing = ref(false)
const publishKey = ref('')
function openPublish() {
  publishConfirmed.value = false
  publishKey.value = crypto.randomUUID()
  publishOpen.value = true
}
async function publish() {
  const approved = props.state.approved
  if (!approved || !hostname.value) return
  publishing.value = true
  try {
    await $fetch(`/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/runtime-releases/activate`, {
      method: 'POST',
      headers: { 'idempotency-key': publishKey.value },
      body: { environment: props.state.environment, expectedActiveReleaseId: live.value?.releaseId ?? null, hostname: hostname.value, versionId: approved.versionId }
    })
    publishOpen.value = false
    toast.add({ title: 'Published', description: `Version ${short(approved.digest)} is live on ${hostname.value}.`, color: 'success' })
    emit('changed')
  } catch (error) {
    toast.add({ title: 'Publish failed — the live site was not changed', description: errorMessage(error), color: 'error' })
  } finally {
    publishing.value = false
  }
}

const restoreTarget = ref<RuntimeState['releases'][number] | null>(null)
const restoreKey = ref('')
const restoring = ref(false)
const restoreOpen = computed({
  get: () => Boolean(restoreTarget.value),
  set: (open: boolean) => { if (!open) restoreTarget.value = null }
})
function openRestore(release: RuntimeState['releases'][number]) {
  restoreKey.value = crypto.randomUUID()
  restoreTarget.value = release
}
async function restore() {
  const target = restoreTarget.value
  if (!target || !live.value || !hostname.value) return
  restoring.value = true
  try {
    await $fetch(`/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/runtime-releases/rollback`, {
      method: 'POST',
      headers: { 'idempotency-key': restoreKey.value },
      body: { environment: props.state.environment, expectedActiveReleaseId: live.value.releaseId, hostname: hostname.value, targetReleaseId: target.releaseId }
    })
    restoreTarget.value = null
    toast.add({ title: 'Restored', description: `Version ${short(target.versionDigest)} is live again.`, color: 'success' })
    emit('changed')
  } catch (error) {
    toast.add({ title: 'Restore failed — the live site was not changed', description: errorMessage(error), color: 'error' })
  } finally {
    restoring.value = false
  }
}

function errorMessage(error: unknown) {
  const value = error as { data?: { statusMessage?: string, message?: string }, statusMessage?: string, message?: string }
  return value?.data?.statusMessage || value?.data?.message || value?.statusMessage || value?.message || 'Please try again.'
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="font-semibold text-highlighted">
            Instant publishing
          </h2>
          <p class="mt-1 max-w-2xl text-sm text-muted">
            Saving keeps a private draft. The live website changes only when you publish an approved version.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Preview draft"
            icon="i-lucide-eye"
            color="neutral"
            variant="outline"
            :loading="previewing"
            :disabled="!state.draft?.previewHostname"
            @click="previewDraft"
          />
          <UTooltip :text="publishBlocker" :disabled="!publishBlocker">
            <UButton
              label="Publish approved version"
              icon="i-lucide-rocket"
              :disabled="Boolean(publishBlocker)"
              @click="openPublish"
            />
          </UTooltip>
        </div>
      </div>
    </template>

    <ol class="grid grid-cols-1 gap-3 md:grid-cols-3" aria-label="Version status">
      <li
        v-for="(stage, index) in stages"
        :key="stage.key"
        class="relative rounded-md border border-default p-4"
        :class="stage.key === 'live' && stage.digest ? 'border-primary/60 bg-primary/5' : ''"
      >
        <UIcon
          v-if="index < stages.length - 1"
          name="i-lucide-chevron-right"
          class="absolute -right-3 top-1/2 z-10 hidden size-5 -translate-y-1/2 rounded-full bg-default text-dimmed md:block"
          aria-hidden="true"
        />
        <p class="text-sm text-muted">
          {{ stage.title }}
        </p>
        <p class="mt-1 font-mono text-lg font-semibold text-highlighted" :aria-label="`Version ${short(stage.digest)}`">
          {{ short(stage.digest) }}
        </p>
        <p class="mt-1 text-sm text-toned">
          {{ stage.detail }}
        </p>
        <p v-if="stage.note" class="mt-1 truncate text-xs text-muted">
          {{ stage.note }}
        </p>
      </li>
    </ol>

    <UAlert
      v-if="publishBlocker && state.approved"
      class="mt-4"
      :description="publishBlocker"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
    />

    <div v-if="history.length" class="mt-5">
      <h3 class="text-sm font-medium text-highlighted">
        Earlier versions on {{ hostname }}
      </h3>
      <ul class="mt-2 divide-y divide-default rounded-md border border-default">
        <li v-for="release in history" :key="release.releaseId" class="flex items-center justify-between gap-3 px-3 py-2">
          <div class="min-w-0">
            <p class="font-mono text-sm text-highlighted">
              {{ short(release.versionDigest) }}
            </p>
            <p class="text-xs text-muted">
              Published {{ when(release.publishedAt) }}
            </p>
          </div>
          <UButton
            label="Restore"
            icon="i-lucide-history"
            size="sm"
            color="neutral"
            variant="ghost"
            :disabled="!live"
            @click="openRestore(release)"
          />
        </li>
      </ul>
    </div>

    <UModal v-model:open="publishOpen" title="Publish approved version">
      <template #body>
        <div class="space-y-4">
          <dl class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt class="text-muted">
                Version
              </dt>
              <dd class="mt-1 font-mono font-semibold text-highlighted">
                {{ short(state.approved?.digest) }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                Website
              </dt>
              <dd class="mt-1 break-all font-medium text-highlighted">
                {{ hostname }}
              </dd>
            </div>
          </dl>
          <p class="text-sm text-muted">
            Visitors see this version immediately. The current live version stays available to restore.
          </p>
          <UCheckbox v-model="publishConfirmed" label="I have previewed this version" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="publishOpen = false"
          />
          <UButton
            label="Publish"
            icon="i-lucide-rocket"
            :loading="publishing"
            :disabled="!publishConfirmed"
            @click="publish"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="restoreOpen" title="Restore earlier version">
      <template #body>
        <p class="text-sm text-muted">
          Restore version <span class="font-mono font-semibold text-highlighted">{{ short(restoreTarget?.versionDigest) }}</span>
          on {{ hostname }}? The current version stays available to restore.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="restoreTarget = null"
          />
          <UButton
            label="Restore"
            icon="i-lucide-history"
            :loading="restoring"
            @click="restore"
          />
        </div>
      </template>
    </UModal>
  </UCard>
</template>
