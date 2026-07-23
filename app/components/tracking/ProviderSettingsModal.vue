<script setup lang="ts">
interface ProviderSettingsSite {
  id: string
  client_id: string
  name: string
  provider_tracking?: {
    podium: {
      interactions: boolean
      confirmedLeads: boolean
      organizationUid?: string | null
      locationUids?: string[]
    }
    xtime: {
      interactions: boolean
      confirmedLeads: boolean
    }
  }
}

interface PodiumEndpoint {
  id: string
  urlToken?: string
  path: string
  rotatedAt?: string | null
  secretGraceUntil?: string | null
}

interface PodiumStatusResponse {
  configured: boolean
  endpoint: PodiumEndpoint | null
}

interface PodiumCredentialResponse {
  endpoint: PodiumEndpoint
  webhookSecret: string | null
}

const props = defineProps<{ site: ProviderSettingsSite | null }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })
const toast = useToast()
const requestUrl = useRequestURL()
const apiFetch = $fetch as unknown as <T = unknown>(
  request: string,
  options?: { method?: 'POST' | 'PATCH', body?: unknown }
) => Promise<T>

const form = reactive({
  podiumInteractions: true,
  podiumConfirmedLeads: false,
  podiumOrganizationUid: '',
  podiumLocationUids: [] as string[],
  xtimeInteractions: true,
  xtimeConfirmedLeads: false
})
const endpointStatus = ref<PodiumStatusResponse>({ configured: false, endpoint: null })
const loadingStatus = ref(false)
const saving = ref(false)
const credentialAction = ref(false)
const rotateArmed = ref(false)
const oneTimeSecret = ref<string | null>(null)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const identityReady = computed(() => (
  UUID_RE.test(form.podiumOrganizationUid.trim())
  && form.podiumLocationUids.length > 0
  && form.podiumLocationUids.every(uid => UUID_RE.test(uid.trim()))
))
const endpointUrl = computed(() => endpointStatus.value.endpoint
  ? `${requestUrl.origin}${endpointStatus.value.endpoint.path}`
  : '')

function errorMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined
  return (error as Error & { data?: { statusMessage?: string } }).data?.statusMessage || error.message
}

function resetForm() {
  const settings = props.site?.provider_tracking
  form.podiumInteractions = settings?.podium.interactions ?? true
  form.podiumConfirmedLeads = settings?.podium.confirmedLeads ?? false
  form.podiumOrganizationUid = settings?.podium.organizationUid ?? ''
  form.podiumLocationUids = [...(settings?.podium.locationUids ?? [])]
  form.xtimeInteractions = settings?.xtime.interactions ?? true
  form.xtimeConfirmedLeads = settings?.xtime.confirmedLeads ?? false
  oneTimeSecret.value = null
  rotateArmed.value = false
}

async function loadEndpointStatus() {
  if (!props.site) return
  loadingStatus.value = true
  try {
    endpointStatus.value = await apiFetch<PodiumStatusResponse>(
      `/api/leads/endpoints/podium/${props.site.client_id}`
    )
  } catch (error: unknown) {
    endpointStatus.value = { configured: false, endpoint: null }
    toast.add({
      title: 'Could not load Podium connection',
      description: errorMessage(error),
      color: 'error'
    })
  } finally {
    loadingStatus.value = false
  }
}

watch([open, () => props.site?.id], async ([isOpen]) => {
  if (!isOpen || !props.site) {
    oneTimeSecret.value = null
    return
  }
  resetForm()
  await loadEndpointStatus()
}, { immediate: true })

async function connectPodium() {
  if (!props.site || credentialAction.value) return
  credentialAction.value = true
  try {
    const result = await apiFetch<PodiumCredentialResponse>('/api/leads/endpoints/podium', {
      method: 'POST',
      body: {
        client_id: props.site.client_id,
        reason: `${props.site.name} Podium confirmed webchat lead ingestion`
      }
    })
    oneTimeSecret.value = result.webhookSecret
    await loadEndpointStatus()
    toast.add({
      title: result.webhookSecret ? 'Podium webhook created' : 'Podium webhook already connected',
      color: 'success'
    })
  } catch (error: unknown) {
    toast.add({ title: 'Could not connect Podium', description: errorMessage(error), color: 'error' })
  } finally {
    credentialAction.value = false
  }
}

async function rotateSecret() {
  if (!props.site || credentialAction.value) return
  if (!rotateArmed.value) {
    rotateArmed.value = true
    return
  }
  credentialAction.value = true
  try {
    const result = await apiFetch<PodiumCredentialResponse>(
      `/api/leads/endpoints/podium/${props.site.client_id}/rotate`,
      { method: 'POST' }
    )
    oneTimeSecret.value = result.webhookSecret
    rotateArmed.value = false
    await loadEndpointStatus()
    toast.add({ title: 'Podium secret rotated', color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'Could not rotate Podium secret', description: errorMessage(error), color: 'error' })
  } finally {
    credentialAction.value = false
  }
}

async function copyValue(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.add({ title: `${label} copied`, color: 'success' })
  } catch {
    toast.add({ title: 'Copy failed', color: 'error' })
  }
}

async function save() {
  if (!props.site || saving.value) return
  if (form.podiumConfirmedLeads && !endpointStatus.value.configured) {
    toast.add({ title: 'Connect the Podium webhook before enabling confirmed leads', color: 'warning' })
    return
  }
  if (form.podiumConfirmedLeads && !identityReady.value) {
    toast.add({ title: 'Add a valid Podium organization and at least one location UID', color: 'warning' })
    return
  }

  saving.value = true
  try {
    await apiFetch(`/api/agency/tracking/${props.site.id}`, {
      method: 'PATCH',
      body: {
        providerTracking: {
          podium: {
            interactions: form.podiumInteractions,
            confirmedLeads: form.podiumConfirmedLeads,
            organizationUid: form.podiumOrganizationUid.trim() || null,
            locationUids: form.podiumLocationUids.map(uid => uid.trim()).filter(Boolean)
          },
          xtime: {
            interactions: form.xtimeInteractions,
            confirmedLeads: form.xtimeConfirmedLeads
          }
        }
      }
    })
    toast.add({ title: 'Provider settings saved', color: 'success' })
    open.value = false
    emit('saved')
  } catch (error: unknown) {
    toast.add({ title: 'Could not save provider settings', description: errorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="`Provider tracking — ${site?.name || ''}`">
    <template #body>
      <div class="space-y-5">
        <p class="text-sm text-muted">
          Interaction tracking uses the universal Zero Flow tag. Confirmed leads require a signed provider connection for this dealer.
        </p>

        <section class="border border-default rounded-lg p-4 space-y-4" aria-labelledby="podium-provider-title">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 id="podium-provider-title" class="font-medium">
                Podium
              </h2>
              <p class="text-xs text-muted mt-1">
                Widget activity and confirmed webchat leads are controlled independently.
              </p>
            </div>
            <UBadge
              :color="endpointStatus.configured ? 'success' : 'neutral'"
              variant="soft"
              :label="loadingStatus ? 'Checking…' : endpointStatus.configured ? 'Webhook connected' : 'Not connected'"
            />
          </div>

          <UCheckbox v-model="form.podiumInteractions" label="Track widget interactions" />

          <div v-if="endpointStatus.configured" class="space-y-3 rounded-md bg-muted/40 p-3">
            <UFormField label="Webhook URL" class="w-full">
              <div class="flex gap-2">
                <UInput :model-value="endpointUrl" readonly class="flex-1 font-mono text-xs" />
                <UButton
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-copy"
                  aria-label="Copy Podium webhook URL"
                  @click="copyValue(endpointUrl, 'Webhook URL')"
                />
              </div>
            </UFormField>
            <div class="flex justify-end">
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-refresh-cw"
                :label="rotateArmed ? 'Confirm rotation' : 'Rotate secret'"
                :loading="credentialAction"
                @click="rotateSecret"
              />
            </div>
          </div>
          <UButton
            v-else
            color="neutral"
            variant="soft"
            icon="i-lucide-plug"
            label="Connect Podium webhook"
            :loading="credentialAction || loadingStatus"
            @click="connectPodium"
          />

          <div v-if="oneTimeSecret" class="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-3" role="status">
            <div>
              <p class="text-sm font-medium">
                Webhook signing secret · Shown once
              </p>
              <p class="text-xs text-muted mt-1">
                Copy this into Podium now. Zero Flow will not display it again.
              </p>
            </div>
            <div class="flex gap-2">
              <UInput :model-value="oneTimeSecret" readonly class="flex-1 font-mono text-xs" />
              <UButton
                color="neutral"
                variant="soft"
                icon="i-lucide-copy"
                aria-label="Copy Podium webhook signing secret"
                @click="copyValue(oneTimeSecret, 'Signing secret')"
              />
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Podium organization UID" required>
              <UInput
                v-model="form.podiumOrganizationUid"
                placeholder="00000000-0000-0000-0000-000000000000"
                class="w-full font-mono text-xs"
              />
            </UFormField>
            <UFormField label="Allowed Podium location UIDs" required>
              <UInputTags
                v-model="form.podiumLocationUids"
                placeholder="Add location UID and press Enter"
                class="w-full"
              />
            </UFormField>
          </div>
          <UCheckbox
            v-model="form.podiumConfirmedLeads"
            label="Accept confirmed webchat leads"
            :disabled="!endpointStatus.configured || !identityReady"
          />
        </section>

        <section class="border border-default rounded-lg p-4 space-y-3" aria-labelledby="xtime-provider-title">
          <div>
            <h2 id="xtime-provider-title" class="font-medium">
              Xtime
            </h2>
            <p class="text-xs text-muted mt-1">
              Interaction tracking works from the website tag. Confirmed appointments requires an Xtime partner feed.
            </p>
          </div>
          <UCheckbox v-model="form.xtimeInteractions" label="Track scheduler interactions" />
          <UCheckbox v-model="form.xtimeConfirmedLeads" label="Accept confirmed appointments" />
        </section>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="close"
        />
        <UButton
          color="primary"
          label="Save settings"
          :loading="saving"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
