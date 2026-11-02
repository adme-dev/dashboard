<!-- app/components/email/review/CampaignSettings.vue -->
<!-- M06 per-campaign link settings: UTM values appended to every tracked link
     and the opt-in hosted web version. Both are part of the approved content
     fingerprint, so saving a change returns a reviewed campaign to draft. -->
<script setup lang="ts">
import { classifyReviewError, describeReviewError } from '~~/app/utils/emailReviewClient'

const props = defineProps<{
  campaignId: string
  /** Only draft campaigns are editable; frozen sends keep their settings. */
  editable: boolean
}>()
const emit = defineEmits<{ saved: [] }>()

type UtmKey = 'source' | 'medium' | 'campaign' | 'term' | 'content'
interface CampaignWorkflowFields {
  utm_settings?: Partial<Record<UtmKey, string>> | null
  web_version_enabled?: boolean
  review_required?: boolean
}

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string, body?: unknown }) => Promise<T>

const FIELDS: Array<{ key: UtmKey, label: string, placeholder: string, help?: string }> = [
  { key: 'source', label: 'Source', placeholder: 'email', help: 'utm_source' },
  { key: 'medium', label: 'Medium', placeholder: 'email', help: 'utm_medium' },
  { key: 'campaign', label: 'Campaign name', placeholder: 'Defaults to the campaign ID', help: 'utm_campaign' },
  { key: 'term', label: 'Term', placeholder: 'Optional', help: 'utm_term' },
  { key: 'content', label: 'Content', placeholder: 'Optional', help: 'utm_content' }
]
const UTM_VALUE = /^[A-Za-z0-9 ._+-]{0,100}$/

const loading = ref(false)
const saving = ref(false)
const loadError = ref<string | null>(null)
const webVersion = ref(false)
const utm = reactive<Record<UtmKey, string>>({ source: '', medium: '', campaign: '', term: '', content: '' })
const saved = ref('')

function snapshot(): string {
  return JSON.stringify({ webVersion: webVersion.value, utm: { ...utm } })
}

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const { campaign } = await apiFetch<{ campaign: CampaignWorkflowFields }>(`/api/email/campaigns/${props.campaignId}`)
    webVersion.value = campaign.web_version_enabled === true
    for (const field of FIELDS) utm[field.key] = campaign.utm_settings?.[field.key] ?? ''
    saved.value = snapshot()
  } catch {
    loadError.value = 'Could not load link settings.'
  } finally {
    loading.value = false
  }
}
watch(() => props.campaignId, () => void load(), { immediate: true })

const invalid = computed(() => FIELDS.filter(field => !UTM_VALUE.test(utm[field.key].trim())).map(field => field.key))
const dirty = computed(() => snapshot() !== saved.value)

async function save() {
  if (!props.editable || invalid.value.length || !dirty.value) return
  saving.value = true
  try {
    const settings = Object.fromEntries(FIELDS.map(field => [field.key, utm[field.key].trim() || null]))
    await apiFetch(`/api/email/campaigns/${props.campaignId}`, {
      method: 'PATCH',
      body: { utm_settings: settings, web_version_enabled: webVersion.value }
    })
    saved.value = snapshot()
    toast.add({ title: 'Link settings saved', description: 'Any earlier approval no longer covers this campaign.', color: 'success' })
    emit('saved')
  } catch (error) {
    const { code } = classifyReviewError(error)
    toast.add({
      title: 'Could not save link settings',
      description: code === 'invalid_utm_settings'
        ? 'UTM values may only use letters, numbers, spaces and . _ + -'
        : describeReviewError(code, 'The campaign may have been scheduled or changed. Reload and try again.'),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="loading" class="text-sm text-muted">
      Loading link settings…
    </p>
    <UAlert
      v-else-if="loadError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="loadError"
    />

    <form v-else class="space-y-6" @submit.prevent="save">
      <UAlert
        v-if="!editable"
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock"
        description="This campaign has left draft. Its links and web version are frozen with the approved content."
      />

      <section class="space-y-3">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h3 class="text-sm font-semibold">
              Hosted web version
            </h3>
            <p class="text-sm text-muted">
              Adds a signed “view in browser” page for this exact approved version. Place
              <code class="rounded bg-elevated px-1 text-default" v-text="'{{web_version_url}}'" />
              in a link to use it. The page shows no subscriber names or addresses.
            </p>
          </div>
          <USwitch v-model="webVersion" :disabled="!editable" aria-label="Enable hosted web version" />
        </div>
      </section>

      <section class="space-y-3">
        <div>
          <h3 class="text-sm font-semibold">
            UTM parameters
          </h3>
          <p class="text-sm text-muted">
            Added to every tracked link. Parameters already written into a link are kept as authored.
          </p>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <UFormField
            v-for="field in FIELDS"
            :key="field.key"
            :label="field.label"
            :help="field.help"
            :error="invalid.includes(field.key) ? 'Letters, numbers, spaces and . _ + - only' : undefined"
          >
            <UInput
              v-model="utm[field.key]"
              :placeholder="field.placeholder"
              :maxlength="100"
              :disabled="!editable"
              class="w-full"
            />
          </UFormField>
        </div>
      </section>

      <div v-if="editable" class="flex items-center justify-end gap-3">
        <span v-if="dirty" class="text-xs text-muted">Saving returns a reviewed campaign to draft.</span>
        <UButton
          type="submit"
          label="Save link settings"
          :loading="saving"
          :disabled="!dirty || invalid.length > 0"
        />
      </div>
    </form>
  </div>
</template>
