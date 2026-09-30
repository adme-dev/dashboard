<script setup lang="ts">
import type { CustomerSetup } from '~~/shared/pageStudio/customerSignup'

definePageMeta({ layout: false })
useHead({ title: 'Set up your workspace — Page Studio' })
const api = '/api/portal/page-studio/customer'
const draft = reactive<CustomerSetup>({ businessName: '', businessType: '', timezone: 'UTC', goals: [] })
const revision = ref(0)
const workspaceId = ref<string | null>(null)
const step = ref(1)
const ready = ref(false)
const busy = ref(false)
const error = ref('')
const conflict = ref(false)
const saved = ref(false)
const saveOnSignOut = computed(() => ready.value && !workspaceId.value && !conflict.value && !error.value)
const signOutLabel = computed(() => saveOnSignOut.value ? 'Save and sign out' : ready.value && !workspaceId.value ? 'Sign out without saving' : 'Sign out')
const timezones = Intl.supportedValuesOf('timeZone')
if (!timezones.includes('UTC')) timezones.unshift('UTC')
const goals: { value: CustomerSetup['goals'][number], label: string, description: string }[] = [
  { value: 'enquiries', label: 'Receive enquiries', description: 'Let visitors contact your business.' },
  { value: 'blog', label: 'Publish stories and updates', description: 'Share articles, news and expertise.' },
  { value: 'gallery', label: 'Showcase your work', description: 'Bring projects and images together.' },
  { value: 'bookings', label: 'Take bookings', description: 'Help visitors arrange a time with you.' },
  { value: 'sales', label: 'Sell products or services', description: 'Make it easier for customers to buy.' }
]
watch(draft, () => {
  saved.value = false
})
async function load() {
  error.value = ''
  busy.value = true
  try {
    const result = await $fetch<{ draft: CustomerSetup, revision: number, workspaceId: string | null }>(`${api}/setup`)
    Object.assign(draft, result.draft)
    if (!result.revision) {
      const local = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (timezones.includes(local)) draft.timezone = local
    }
    revision.value = result.revision
    workspaceId.value = result.workspaceId
    conflict.value = false
    ready.value = true
    if (workspaceId.value) await navigateTo('/studio/dashboard', { replace: true })
  } catch (e: unknown) {
    if ((e as { statusCode?: number })?.statusCode === 401) await navigateTo('/studio/signup', { replace: true })
    else error.value = 'We could not load your saved setup. Please try again.'
  } finally { busy.value = false }
}
onMounted(load)
function showError(e: unknown) {
  conflict.value = (e as { statusCode?: number })?.statusCode === 409
  error.value = conflict.value ? 'Your setup changed in another tab. Load the saved version before continuing. This will replace the answers shown here.' : 'Your changes could not be saved. They are still here; please try again.'
  if ((e as { statusCode?: number })?.statusCode === 401) error.value = 'Your session has expired. Open sign-in in another tab, then return here to save your answers.'
}
async function save() {
  const result = await $fetch<{ revision: number }>(`${api}/setup`, { method: 'PUT', body: { expectedRevision: revision.value, draft } })
  revision.value = result.revision
  saved.value = true
}
async function advance() {
  if (busy.value || conflict.value) return
  error.value = ''
  if (!draft.businessName.trim() || !draft.businessType.trim()) {
    error.value = 'Add your business name and type to continue.'
    return
  }
  if (step.value === 2 && !draft.goals.length) {
    error.value = 'Choose at least one website goal.'
    return
  }
  busy.value = true
  try {
    await save()
    if (step.value === 1) step.value = 2
    else {
      workspaceId.value = (await $fetch<{ workspaceId: string }>(`${api}/complete`, { method: 'POST', body: { expectedRevision: revision.value } })).workspaceId
      await navigateTo('/studio/dashboard', { replace: true })
    }
  } catch (e) {
    showError(e)
  } finally {
    busy.value = false
  }
}
async function saveForLater() {
  if (busy.value || conflict.value) return
  busy.value = true
  error.value = ''
  try {
    await save()
  } catch (e) {
    showError(e)
  } finally {
    busy.value = false
  }
}
async function signOut() {
  if (busy.value) return
  const shouldSave = saveOnSignOut.value
  busy.value = true
  error.value = ''
  try {
    if (shouldSave) await save()
    await $fetch(`${api}/logout`, { method: 'POST', body: {} })
    await navigateTo('/studio/signup')
  } catch (e) {
    showError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <StudioCustomerShell :title="workspaceId ? 'Your workspace is prepared.' : step === 1 ? 'Tell us about your business.' : 'What should your website do?'" :description="workspaceId ? 'Your business details and website goals are saved. Website creation is the next stage.' : 'Save your progress at any time and return using your email sign-in link.'">
    <template #header>
      <UButton
        :label="signOutLabel"
        color="neutral"
        variant="ghost"
        :disabled="busy"
        @click="signOut"
      />
    </template>
    <template #eyebrow>
      <p v-if="!workspaceId" class="mb-3 text-sm font-medium text-primary">
        Step {{ step }} of 2 · Business setup
      </p>
    </template>
    <UAlert
      v-if="error"
      class="mb-5"
      color="error"
      title="Setup needs attention"
      :description="error"
      role="alert"
    />
    <UButton
      v-if="conflict || (!ready && !busy)"
      class="mb-5"
      label="Load saved setup"
      color="neutral"
      variant="outline"
      @click="load"
    />
    <p v-if="!ready && busy" role="status" class="text-muted">
      Loading your setup…
    </p>
    <UCard v-if="workspaceId">
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-check-check" class="mt-1 size-6 shrink-0 text-success" /><div>
          <h2 class="font-semibold text-highlighted">
            {{ draft.businessName }}
          </h2><p class="mt-1 text-sm text-muted">
            {{ draft.businessType }} · {{ draft.timezone }}
          </p>
        </div>
      </div>
      <p class="mt-5 text-sm leading-6 text-muted">
        You’re ready for the next stage. Open your website overview to continue your setup.
      </p>
      <UButton class="mt-4" to="/studio/dashboard" label="Go to website overview" />
    </UCard>
    <form v-else-if="ready" class="space-y-6" @submit.prevent="advance">
      <fieldset class="space-y-5" :disabled="busy || conflict">
        <template v-if="step === 1">
          <UFormField label="Business or organisation name" required>
            <UInput
              v-model="draft.businessName"
              autocomplete="organization"
              :maxlength="160"
              placeholder="e.g. Alex Flowers"
              class="w-full"
              size="lg"
              required
            />
          </UFormField>
          <UFormField label="What kind of business is it?" help="A few words will do, such as florist, accounting firm or community group." required>
            <UInput
              v-model="draft.businessType"
              :maxlength="100"
              placeholder="e.g. Florist"
              class="w-full"
              size="lg"
              required
            />
          </UFormField>
          <UFormField label="Business timezone" help="Used for schedules and reporting." required>
            <USelectMenu
              v-model="draft.timezone"
              :items="timezones"
              class="w-full"
              size="lg"
            />
          </UFormField>
        </template>
        <template v-else>
          <UCard>
            <p class="font-medium text-highlighted">
              {{ draft.businessName }}
            </p><p class="mt-1 text-sm text-muted">
              {{ draft.businessType }} · {{ draft.timezone }}
            </p>
          </UCard>
          <UFormField label="Website goals" help="Choose all that apply. These guide your setup; they do not activate paid features." required>
            <UCheckboxGroup
              v-model="draft.goals"
              :items="goals"
              class="mt-3"
              :ui="{ fieldset: 'gap-4' }"
            />
          </UFormField>
        </template>
      </fieldset>
      <p v-if="saved" class="text-sm text-success" role="status">
        Progress saved. You can safely return later.
      </p>
      <div class="space-y-3 border-t border-default pt-5">
        <UButton
          type="submit"
          :label="step === 1 ? 'Save and continue' : 'Create my workspace'"
          size="lg"
          block
          :loading="busy"
          :disabled="conflict"
        />
        <div class="flex flex-wrap justify-between gap-3">
          <UButton
            v-if="step === 2"
            label="Back to business details"
            color="neutral"
            variant="ghost"
            :disabled="busy"
            @click="step = 1"
          />
          <UButton
            label="Save for later"
            color="neutral"
            variant="ghost"
            :disabled="busy || conflict"
            @click="saveForLater"
          />
        </div>
      </div>
      <NuxtLink
        v-if="error && !conflict"
        to="/studio/signup"
        target="_blank"
        class="block text-sm text-primary underline"
      >Open sign-in in another tab</NuxtLink>
    </form>
  </StudioCustomerShell>
</template>
