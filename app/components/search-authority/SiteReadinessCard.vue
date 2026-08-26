<script setup lang="ts">
import { idempotencyKey } from '~~/app/utils/idempotencyKey'
import { computed, ref, watch } from 'vue'

interface ClientOption {
  id: string
  name: string
}

interface SearchAuthoritySite {
  id: string
  clientId: string
  clientName?: string
  canonicalHostname: string
  contentHostname: string | null
  status: string
  publicId?: string
  publishingMode?: 'subdomain' | 'same_host'
}

interface VerifyResult {
  ok: boolean
  status: number | null
  reason: string | null
  rewriteTarget: string
  checkedAt: string
}

const props = defineProps<{
  clients: ClientOption[]
  sites: SearchAuthoritySite[]
  loading: boolean
}>()

const emit = defineEmits<{
  configured: [site: SearchAuthoritySite]
}>()

const toast = useToast()
const selectedClientId = ref<string | null>(null)
const canonicalHostname = ref('')
const contentHostname = ref('')
const publishingMode = ref<'subdomain' | 'same_host'>('subdomain')
const saving = ref(false)
const verifying = ref(false)
const verifyResult = ref<VerifyResult | null>(null)
const publishingModeOptions = [
  { label: 'Client subdomain (default) — e.g. learn.client.com.au', value: 'subdomain' },
  { label: 'Same host — client.com.au/guides via a rewrite on their website', value: 'same_host' }
]
const rewritePlatform = ref<'nextjs' | 'netlify'>('nextjs')
const rewritePlatformOptions = [
  { label: 'Next.js / Vercel (next.config.js) — e.g. Dealer Studio', value: 'nextjs' },
  { label: 'Netlify (netlify.toml) — e.g. iMotor', value: 'netlify' }
]
const rewriteSnippet = computed(() => {
  const publicId = selectedSite.value?.publicId
  if (!publicId) return ''
  const base = `https://publish.xeroflowpages.com/s/${publicId}/guides`
  if (rewritePlatform.value === 'netlify') {
    return `[[redirects]]
  from = "/guides"
  to = "${base}"
  status = 200
  force = true

[[redirects]]
  from = "/guides/*"
  to = "${base}/:splat"
  status = 200
  force = true`
  }
  return `async rewrites() {
  return [
    { source: '/guides', destination: '${base}' },
    { source: '/guides/:path*', destination: '${base}/:path*' }
  ]
}`
})

const clientOptions = computed(() => props.clients.map(client => ({
  label: client.name,
  value: client.id
})))
const selectedSite = computed(() => props.sites.find(
  site => site.clientId === selectedClientId.value
))
const canConfigure = computed(() => (
  Boolean(selectedClientId.value)
  && Boolean(canonicalHostname.value.trim())
  && !saving.value
))

watch(selectedClientId, () => {
  canonicalHostname.value = selectedSite.value?.canonicalHostname || ''
  contentHostname.value = selectedSite.value?.contentHostname || ''
  publishingMode.value = selectedSite.value?.publishingMode || 'subdomain'
  verifyResult.value = null
})

async function verifySameHost() {
  if (!selectedSite.value || !selectedClientId.value) return
  verifying.value = true
  try {
    const query = new URLSearchParams({ clientId: selectedClientId.value, siteId: selectedSite.value.id })
    verifyResult.value = await $fetch<VerifyResult>(`/api/agency/search-authority/sites/verify?${query}`)
  } catch (error: unknown) {
    toast.add({ title: 'Verification failed', description: errorMessage(error), color: 'error' })
  } finally {
    verifying.value = false
  }
}

async function copyRewrite() {
  if (!rewriteSnippet.value) return
  await navigator.clipboard.writeText(rewriteSnippet.value)
  toast.add({ title: 'Rewrite snippet copied', color: 'success' })
}

function errorMessage(error: unknown): string {
  const candidate = error as {
    data?: { statusMessage?: string }
    statusMessage?: string
    message?: string
  } | null
  return candidate?.data?.statusMessage
    || candidate?.statusMessage
    || candidate?.message
    || 'The site could not be configured'
}

async function configureSite() {
  if (!canConfigure.value || !selectedClientId.value) return
  saving.value = true

  try {
    const response = await $fetch<{ site: SearchAuthoritySite }>(
      '/api/agency/search-authority/sites',
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey('search-authority-site') },
        body: {
          clientId: selectedClientId.value,
          canonicalHostname: canonicalHostname.value.trim(),
          contentHostname: publishingMode.value === 'same_host' ? null : (contentHostname.value.trim() || null),
          publishingMode: publishingMode.value
        }
      }
    )
    emit('configured', response.site)
    canonicalHostname.value = response.site.canonicalHostname
    contentHostname.value = response.site.contentHostname || ''
    publishingMode.value = response.site.publishingMode || 'subdomain'
    toast.add({
      title: 'Site ready',
      description: 'Search Authority access is ready for Search Console connection.',
      color: 'success'
    })
  } catch (error: unknown) {
    toast.add({
      title: 'Site setup failed',
      description: errorMessage(error),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-start justify-between gap-4">
        <div class="flex min-w-0 items-start gap-3">
          <div class="rounded-lg bg-primary/10 p-2 text-primary">
            <UIcon name="i-lucide-globe-2" class="size-5" />
          </div>
          <div>
            <h2 class="font-semibold text-highlighted">
              Site readiness
            </h2>
            <p class="mt-1 text-sm text-muted">
              Define the public website roots XeroFlow is allowed to assess.
            </p>
          </div>
        </div>
        <UBadge
          v-if="selectedSite"
          label="Configured"
          color="success"
          variant="subtle"
        />
      </div>
    </template>

    <div v-if="loading" class="space-y-4" aria-label="Loading site readiness">
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-10 w-full" />
    </div>

    <UAlert
      v-else-if="clients.length === 0"
      title="No accessible clients"
      description="You need access to an active agency client before configuring Search Authority."
      icon="i-lucide-building-2"
      color="neutral"
      variant="subtle"
    />

    <form v-else class="@container space-y-5" @submit.prevent="configureSite">
      <UAlert
        title="Pilot activation"
        description="Saving this form starts a cancellable trial entitlement for the selected client. It does not publish or modify the client website."
        icon="i-lucide-flask-conical"
        color="primary"
        variant="subtle"
      />

      <div class="grid grid-cols-1 gap-4">
        <UFormField
          label="Client"
          help="Choose the dealership or client this evidence workspace belongs to."
          required
        >
          <USelectMenu
            v-model="selectedClientId"
            :items="clientOptions"
            value-key="value"
            placeholder="Choose a client"
            class="w-full"
            data-testid="search-authority-client"
          />
        </UFormField>

        <UFormField
          label="Canonical website hostname"
          help="The public root domain Search Console and technical checks should treat as canonical."
          required
        >
          <UInput
            v-model="canonicalHostname"
            class="w-full"
            placeholder="www.client-domain.com.au"
            autocomplete="url"
            data-testid="search-authority-canonical-hostname"
          />
        </UFormField>

        <UFormField
          label="Publishing mode"
          help="Subdomain needs one DNS record from the client. Same host needs a /guides rewrite inside their website platform."
        >
          <USelect
            v-model="publishingMode"
            :items="publishingModeOptions"
            value-key="value"
            class="w-full"
            data-testid="search-authority-publishing-mode"
          />
        </UFormField>

        <UFormField
          v-if="publishingMode === 'subdomain'"
          label="XeroFlow content hostname"
          help="Optional. Add the separate XeroFlow-owned hostname if publishing will run beside the dealer CMS."
        >
          <UInput
            v-model="contentHostname"
            class="w-full"
            placeholder="content.client-domain.com.au"
            autocomplete="url"
            data-testid="search-authority-content-hostname"
          />
        </UFormField>

        <div
          v-if="publishingMode === 'same_host' && selectedSite?.publicId"
          class="rounded-lg border border-default bg-elevated p-4"
          data-testid="search-authority-same-host-panel"
        >
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 class="text-sm font-medium text-highlighted">
                Rewrite for the client's website
              </h3>
              <p class="mt-1 text-xs text-muted">
                Their developer adds this proxy rewrite to the website platform. Guides are then served at
                <code>https://{{ canonicalHostname || 'www.client.com.au' }}/guides/…</code> and indexed there.
              </p>
            </div>
            <UButton
              label="Copy rewrite"
              icon="i-lucide-copy"
              color="neutral"
              variant="soft"
              @click="copyRewrite"
            />
          </div>
          <UFormField label="Website platform" class="mt-3">
            <USelect
              v-model="rewritePlatform"
              :items="rewritePlatformOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <pre class="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-default p-3 text-xs text-highlighted"><code>{{ rewriteSnippet }}</code></pre>
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <UButton
              label="Verify rewrite"
              icon="i-lucide-radar"
              color="neutral"
              variant="outline"
              :loading="verifying"
              @click="verifySameHost"
            />
            <UBadge
              v-if="verifyResult"
              :label="verifyResult.ok ? 'Publisher reachable on the client host' : (verifyResult.reason || 'Not verified')"
              :color="verifyResult.ok ? 'success' : 'warning'"
              variant="subtle"
            />
          </div>
        </div>
      </div>

      <div class="flex justify-end">
        <UButton
          type="submit"
          :label="selectedSite ? 'Update site' : 'Configure site'"
          icon="i-lucide-check"
          :loading="saving"
          :disabled="!canConfigure"
          data-testid="configure-search-authority-site"
        />
      </div>
    </form>
  </UCard>
</template>
