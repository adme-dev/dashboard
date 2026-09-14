<script setup lang="ts">
import {
  PageStudioEmailSettingsSchema,
  type PageStudioEmailSettings,
  type PageStudioEmailState
} from '~~/shared/pageStudio/emailConfiguration'

const props = defineProps<{ audience: 'agency' | 'portal', siteId: string }>()
const endpoint = computed(
  () =>
    `/api/${props.audience}/page-studio/sites/${encodeURIComponent(props.siteId)}/email`
)
const { data, pending, error, refresh }
  = await useFetch<PageStudioEmailState>(endpoint)
const toast = useToast()
const empty = (): PageStudioEmailSettings => ({
  senderName: '',
  fromAddress: '',
  replyTo: '',
  notificationRecipient: '',
  inboundAddress: '',
  forwardingDestination: ''
})
const draft = reactive(empty())
const revision = ref(0)
const baseline = ref(JSON.stringify(empty()))
const saving = ref(false)
const reloadOpen = ref(false)
const requiresReload = ref(false)
const saveError = ref('')
const errors = ref<Record<string, string>>({})
const loaded = ref(false)
const canEdit = computed(
  () =>
    data.value?.siteId === props.siteId
    && data.value?.canEdit === true
    && !error.value
)
const dirty = computed(() => JSON.stringify(draft) !== baseline.value)
const disabled = computed(
  () => !canEdit.value || saving.value || pending.value || requiresReload.value
)
let active = true
onUnmounted(() => {
  active = false
})

function load(value: PageStudioEmailState | null | undefined) {
  if (!value || value.siteId !== props.siteId) return
  Object.assign(draft, value.settings ?? empty())
  revision.value = value.revision
  baseline.value = JSON.stringify(draft)
  errors.value = {}
  requiresReload.value = false
  saveError.value = ''
  loaded.value = true
}
watch(
  data,
  (value) => {
    if (!loaded.value) load(value)
  },
  { immediate: true }
)
async function reload() {
  reloadOpen.value = false
  await refresh()
  if (!error.value) load(data.value)
}
function requestReload() {
  if (dirty.value) reloadOpen.value = true
  else void reload()
}
async function save() {
  if (disabled.value || !dirty.value) return
  const parsed = PageStudioEmailSettingsSchema.safeParse(draft)
  errors.value = {}
  if (!parsed.success) {
    for (const issue of parsed.error.issues)
      errors.value[String(issue.path[0])] = issue.message
    return
  }
  saving.value = true
  saveError.value = ''
  const target = endpoint.value
  try {
    const result = await $fetch<PageStudioEmailState>(target, {
      method: 'PUT',
      body: { expectedRevision: revision.value, settings: parsed.data }
    })
    if (!active || target !== endpoint.value) return
    if (
      result.siteId !== props.siteId
      || result.environment !== data.value?.environment
      || result.revision !== revision.value + 1
    )
      throw new Error('Unverified save response')
    data.value = result
    load(result)
    toast.add({
      title: 'Email preferences saved',
      description: 'Sending and forwarding still require provider setup.',
      color: 'success'
    })
  } catch (failure) {
    if (!active || target !== endpoint.value) return
    const status
      = (failure as { statusCode?: number, status?: number }).statusCode
        ?? (failure as { status?: number }).status
    requiresReload.value = true
    saveError.value
      = status === 409
        ? 'Another session changed these settings. Your edits are kept here. Reload the saved settings before editing again.'
        : status === 403 || status === 404
          ? 'Website access has changed. Your edits have not been confirmed. Reload to check your access.'
          : 'The save could not be confirmed. Your edits are kept here. Reload to check the saved revision before trying again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <UButton
          :to="`/${audience}/page-studio`"
          label="Websites"
          icon="i-lucide-arrow-left"
          variant="link"
          color="neutral"
          class="mb-3 px-0"
        />
        <h1 class="text-2xl font-semibold text-highlighted">
          Website email
        </h1>
        <p class="mt-2 max-w-2xl text-sm text-muted">
          Choose the identity and inboxes you want this website to use. Your
          agency can use these preferences to complete email setup.
        </p>
      </div>
      <UBadge v-if="data" color="neutral" variant="subtle">
        {{
          data.environment === "staging"
            ? "Staging preferences"
            : "Production preferences"
        }}
      </UBadge>
    </div>
    <UAlert
      v-if="error"
      color="error"
      title="Email settings unavailable"
      description="Your website access or email setup could not be verified. Try loading the settings again."
    />
    <UAlert
      v-else-if="pending && !loaded"
      color="neutral"
      title="Loading email settings"
    />
    <template v-if="loaded && !error">
      <UAlert
        color="warning"
        icon="i-lucide-mail-warning"
        title="Email delivery is not connected"
        :description="data?.readiness.message"
      />
      <UAlert
        v-if="!canEdit"
        color="neutral"
        title="Read-only access"
        description="An agency editor or a business administrator or manager with website editing access can update these preferences."
      />
      <UAlert
        v-if="saveError"
        color="error"
        title="Check the saved revision"
        :description="saveError"
      />
      <UCard>
        <template #header>
          <h2 class="font-semibold text-highlighted">
            Sender identity
          </h2>
          <p class="mt-1 text-sm text-muted">
            Use your business identity. Saving an address does not verify
            permission to send from its domain.
          </p>
        </template>
        <div class="@container">
          <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <UFormField
              label="Sender name"
              name="senderName"
              :error="errors.senderName"
              help="The business name customers should recognise."
            >
              <UInput
                v-model="draft.senderName"
                class="w-full"
                :disabled="disabled"
                :maxlength="120"
                autocomplete="organization"
              />
            </UFormField>
            <UFormField
              label="Sender address"
              name="fromAddress"
              :error="errors.fromAddress"
              help="The address you want customers to see as the sender."
            >
              <UInput
                v-model="draft.fromAddress"
                type="email"
                class="w-full"
                :disabled="disabled"
                :maxlength="254"
                autocomplete="off"
              />
            </UFormField>
            <UFormField
              label="Reply-to address"
              name="replyTo"
              :error="errors.replyTo"
              help="An existing inbox where your team can receive replies."
            >
              <UInput
                v-model="draft.replyTo"
                type="email"
                class="w-full"
                :disabled="disabled"
                :maxlength="254"
                autocomplete="off"
              />
            </UFormField>
            <UFormField
              label="Team notification inbox"
              name="notificationRecipient"
              :error="errors.notificationRecipient"
              help="Where your team wants future website notifications to arrive."
            >
              <UInput
                v-model="draft.notificationRecipient"
                type="email"
                class="w-full"
                :disabled="disabled"
                :maxlength="254"
                autocomplete="off"
              />
            </UFormField>
          </div>
        </div>
      </UCard>
      <UCard>
        <template #header>
          <h2 class="font-semibold text-highlighted">
            Incoming forwarding preferences
            <span class="font-normal text-muted">· Optional</span>
          </h2>
          <p class="mt-1 text-sm text-muted">
            Forwarding receives mail at one address and passes it to an existing
            inbox. It does not create a mailbox or enable outbound sending.
          </p>
        </template>
        <div class="@container">
          <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <UFormField
              label="Incoming address"
              name="inboundAddress"
              :error="errors.inboundAddress"
              help="The address you would like to receive mail at."
            >
              <UInput
                v-model="draft.inboundAddress"
                type="email"
                class="w-full"
                :disabled="disabled"
                :maxlength="254"
                autocomplete="off"
              />
            </UFormField>
            <UFormField
              label="Forwarding destination"
              name="forwardingDestination"
              :error="errors.forwardingDestination"
              help="The existing inbox that should receive forwarded mail."
            >
              <UInput
                v-model="draft.forwardingDestination"
                type="email"
                class="w-full"
                :disabled="disabled"
                :maxlength="254"
                autocomplete="off"
              />
            </UFormField>
          </div>
        </div>
        <template #footer>
          <p class="text-sm text-muted">
            Keep your current mail provider and DNS records in place. Your
            agency must review existing mail service, verify the domain and
            destination, and connect delivery before these preferences can take
            effect.
          </p>
        </template>
      </UCard>
    </template>
    <div
      class="flex flex-wrap items-center justify-between gap-3 border-t border-default py-4"
    >
      <span
        v-if="loaded"
        class="text-sm text-muted"
      >Revision {{ revision
      }}<span v-if="dirty"> · Unsaved changes</span></span>
      <div class="flex flex-wrap gap-2">
        <UButton
          label="Reload saved settings"
          color="neutral"
          variant="outline"
          :disabled="saving || pending"
          @click="requestReload"
        />
        <UButton
          v-if="loaded && canEdit"
          label="Save preferences"
          icon="i-lucide-save"
          :loading="saving"
          :disabled="disabled || !dirty"
          @click="save"
        />
      </div>
    </div>
    <UModal
      v-model:open="reloadOpen"
      title="Reload saved settings?"
      description="This replaces the edits shown here with the latest saved revision. Copy any changes you want to keep first."
    >
      <template #body>
        <p class="text-sm text-muted">
          No email will be sent and no DNS records will be changed.
        </p>
      </template>
      <template #footer>
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Keep my edits"
            color="neutral"
            variant="outline"
            @click="reloadOpen = false"
          />
          <UButton label="Reload and replace edits" @click="reload" />
        </div>
      </template>
    </UModal>
  </div>
</template>
