<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { openPageStudioCandidatePreview } from '~~/app/utils/pageStudioCandidatePreview'
import type { PageStudioLaunchState } from '~~/shared/pageStudio/launchReadiness'

const props = defineProps<{ siteId: string, audience?: 'portal' | 'customer' }>()
// Account adapters are fixed for a mounted panel. Remount when changing account
// type so a retained fetch/credential can never cross authentication surfaces.
const audience = props.audience ?? 'portal'
const api = audience === 'customer' ? '/api/portal/page-studio/customer' : '/api/portal/page-studio'
const { data, error, status, refresh } = await useFetch<PageStudioLaunchState>(
  () => `${api}/sites/${encodeURIComponent(props.siteId)}/launch-state`
)
const state = computed(() => (props.audience ?? 'portal') === audience && !error.value && data.value?.siteId === props.siteId ? data.value : null)

interface CandidateResponse {
  build: {
    buildId: string
    versionDigest: string
    manifestDigest: string
    scope: { siteId: string }
    astro: { context: { identity: { environment: string, source: { kind: string, versionId: string, checkpoint: { id: string, digest: string } } } } }
  }
  preview: { hostname: string, release: { buildId: string, versionDigest: string, manifestDigest: string, scope: { siteId: string } } }
  session: { token: string, expiresAt: number }
}
const preparing = ref(false)
const prepared = ref<CandidateResponse | null>(null)
const previewError = ref('')
const previewPin = computed(() => {
  const value = state.value
  return value?.candidateReview === true && value.canManagePublication === true && value.deliveryMode === 'static'
    && value.content.status === 'ready' && value.content.requiresSealedFeatures === false && value.plan?.status === 'ready'
    && value.approvedVersionId && value.checkpointId && value.digest
    ? JSON.stringify([value.siteId, value.approvedVersionId, value.checkpointId, value.digest])
    : null
})
let revision = 0
let requestKey: string | null = null
function invalidatePreview() {
  revision++
  prepared.value = null
  requestKey = null
  previewError.value = ''
}
watch(previewPin, invalidatePreview, { flush: 'sync' })
onBeforeUnmount(invalidatePreview)

async function preparePreview() {
  if (!previewPin.value || preparing.value) return
  const pin = previewPin.value
  const captured = { siteId: props.siteId, versionId: state.value!.approvedVersionId!, checkpointId: state.value!.checkpointId!, digest: state.value!.digest! }
  const attempt = revision
  const stillCurrent = () => revision === attempt && previewPin.value === pin
  requestKey ??= crypto.randomUUID()
  const key = requestKey
  preparing.value = true
  prepared.value = null
  previewError.value = ''
  try {
    await refresh()
    if (!stillCurrent()) return
    const response = await $fetch<CandidateResponse>(`${api}/sites/${encodeURIComponent(captured.siteId)}/versions/${encodeURIComponent(captured.versionId)}/candidate`, {
      method: 'POST', headers: { 'idempotency-key': key }, body: { environment: 'production' }
    })
    if (!stillCurrent()) return
    const build = response?.build, release = response?.preview?.release, identity = build?.astro?.context?.identity, source = identity?.source
    if (!build?.buildId || !build.manifestDigest || build.scope?.siteId !== captured.siteId || build.versionDigest !== captured.digest
      || identity?.environment !== 'production' || source?.kind !== 'approved-version' || source.versionId !== captured.versionId
      || source.checkpoint?.id !== captured.checkpointId || source.checkpoint.digest !== captured.digest
      || release?.buildId !== build.buildId || release.manifestDigest !== build.manifestDigest || release.versionDigest !== captured.digest
      || release.scope?.siteId !== captured.siteId || !response.preview.hostname || !response.session?.token
      || !Number.isFinite(response.session.expiresAt) || response.session.expiresAt <= Date.now() / 1000) throw new Error('Invalid candidate')
    await refresh()
    if (stillCurrent()) prepared.value = response
  } catch {
    if (stillCurrent()) previewError.value = 'The approved preview could not be prepared. Refresh your status and try again.'
  } finally {
    preparing.value = false
  }
}
function openPreview() {
  if (!previewPin.value || !prepared.value) return
  try {
    openPageStudioCandidatePreview(prepared.value.preview.hostname, prepared.value.session)
  } catch (failure) {
    prepared.value = null
    previewError.value = failure instanceof Error ? failure.message : 'Prepare the preview again.'
  }
}
</script>

<template>
  <section class="space-y-5 border-b border-default pb-8" aria-label="Website launch status">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-xl font-medium tracking-tight text-highlighted">
          Your website launch
        </h2>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">
          {{ audience === 'customer' ? 'Check your saved content, approval and recorded publication.' : 'Check your saved content and publication before connecting your domain below.' }}
        </p>
      </div>
      <UButton
        label="Refresh status"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        :loading="status === 'pending'"
        @click="refresh()"
      />
    </header>
    <UAlert
      v-if="error || (!state && status !== 'pending')"
      color="warning"
      title="Launch status unavailable"
      description="Refresh to check your current access and website status. Your live website has not been changed."
    />
    <div
      v-else-if="!state"
      aria-label="Loading launch status"
      aria-busy="true"
      class="space-y-3"
    >
      <USkeleton class="h-14 w-full" /><USkeleton class="h-14 w-full" />
    </div>
    <template v-else>
      <dl class="divide-y divide-default border-t border-default">
        <div class="grid gap-2 py-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt class="font-medium text-highlighted">
            Saved website
          </dt>
          <dd class="text-sm leading-6 text-muted">
            {{ state.content.status === 'ready' ? `${state.content.publicPages} visitor pages saved` : state.content.status === 'required' ? 'Save at least one visitor page in Page Studio.' : 'Saved content could not be checked. Refresh to try again.' }}
          </dd>
        </div>
        <div class="grid gap-2 py-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt class="font-medium text-highlighted">
            Approval
          </dt>
          <dd class="text-sm leading-6 text-muted">
            {{ state.content.status === 'unavailable' ? 'Approval could not be checked. Refresh to try again.' : state.approvedVersionId ? 'Current version approved' : 'The current saved version still needs review and approval.' }}
          </dd>
        </div>
        <div class="grid gap-2 py-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt class="font-medium text-highlighted">
            Publication
          </dt>
          <dd class="space-y-2 text-sm leading-6 text-muted">
            <template v-if="state.activeReleases.length">
              <p v-for="release in state.activeReleases" :key="release.id + release.hostname" class="break-all">
                <UBadge
                  label="Publication recorded"
                  color="success"
                  variant="subtle"
                  class="mr-2"
                />
                {{ release.hostname }}
              </p>
              <p>A publication is recorded for these domains. {{ audience === 'customer' ? 'Domain and HTTPS readiness must also be verified before launch.' : 'Check domain and HTTPS readiness below.' }} Saved changes may still need publishing.</p>
            </template>
            <p v-else>
              No publication recorded. Approval and domain verification do not publish the website.
            </p>
          </dd>
        </div>
        <div v-if="audience === 'customer'" class="grid gap-2 py-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt class="font-medium text-highlighted">
            Publishing access
          </dt>
          <dd class="text-sm leading-6 text-muted">
            {{ state.canManagePublication ? 'Your account can prepare an approved website for publishing.' : 'A current publishing plan and owner or manager access are required. Contact support if you need access.' }}
          </dd>
        </div>
      </dl>
      <div v-if="previewPin" class="space-y-3 rounded-lg border border-default bg-elevated p-4">
        <h3 class="font-medium text-highlighted">
          Review your approved website
        </h3>
        <p class="max-w-2xl text-sm leading-6 text-muted">
          Prepare a private preview of the approved version. Preview access lasts five minutes. Your live website stays unchanged.
        </p>
        <div class="flex flex-wrap gap-3">
          <UButton
            label="Prepare approved preview"
            icon="i-lucide-eye"
            :loading="preparing"
            :disabled="preparing || status === 'pending'"
            @click="preparePreview"
          />
          <UButton
            v-if="prepared"
            label="Open approved preview"
            icon="i-lucide-external-link"
            color="neutral"
            variant="outline"
            :disabled="status === 'pending'"
            @click="openPreview"
          />
        </div>
        <p v-if="preparing" role="status" class="text-sm text-muted">
          Preparing your website preview. This can take a moment.
        </p>
        <p v-else-if="prepared" role="status" class="text-sm text-muted">
          Your approved preview is ready to open in a new tab.
        </p>
        <UAlert
          v-if="previewError"
          color="warning"
          title="Preview unavailable"
          :description="previewError"
        />
      </div>
      <p v-if="state.content.publicForms" class="text-sm leading-6 text-muted">
        Your saved pages include enquiry forms. Confirm a test enquiry and notification delivery before launch.
      </p>
    </template>
  </section>
</template>
