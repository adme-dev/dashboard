<script setup lang="ts">
import { SIGNUP_INTAKE_KEY, readSignupIntake, clearSignupIntake } from '~/utils/pageStudioSignupIntake'
import type { CustomerSetup } from '~~/shared/pageStudio/customerSignup'

definePageMeta({ layout: false, colorMode: 'light' })
useHead({ title: 'Set up your workspace — Page Studio' })
const api = '/api/portal/page-studio/customer'
const draft = reactive<CustomerSetup>({ businessName: '', businessType: '', timezone: 'UTC', goals: [] })
const revision = ref(0)
const workspaceId = ref<string | null>(null)
const step = ref(1)
const hasIntake = ref(false)
const intakePending = ref(false)
const titles = ['What’s your site about?', 'Tell us about your business.', 'What should your website do?']
const descriptions = ['Start with a topic. We’ll use it to understand your business.', 'Give your workspace a name and choose your local timezone.', 'Choose what matters to your business. You can build on this later.']
const ready = ref(false)
const busy = ref(false)
const error = ref('')
const conflict = ref(false)
const saved = ref(false)
const saveOnSignOut = computed(() => ready.value && !workspaceId.value && !conflict.value && !error.value)
const signOutLabel = computed(() => saveOnSignOut.value ? 'Save and sign out' : ready.value && !workspaceId.value ? 'Sign out without saving' : 'Sign out')
const timezones = Intl.supportedValuesOf('timeZone')
if (!timezones.includes('UTC')) timezones.unshift('UTC')
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
    hasIntake.value = false
    intakePending.value = false
    ready.value = true
    // Only a fresh verified account may adopt matching browser choices.
    if (!result.revision && !result.workspaceId) {
      try {
        if (window.localStorage.getItem(SIGNUP_INTAKE_KEY)) {
          const user = await $fetch<{ email: string }>(`${api}/me`)
          const choices = readSignupIntake(window.localStorage, user.email)
          if (choices) {
            Object.assign(draft, choices)
            hasIntake.value = true
            intakePending.value = true
            step.value = 2
          }
        }
      } catch { /* Existing saved setup and blocked storage remain usable. */ }
    }
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
  if (intakePending.value) {
    try {
      clearSignupIntake(window.localStorage)
    } catch { /* Storage may be blocked. */ }
    intakePending.value = false
  }
}
async function advance() {
  if (busy.value || conflict.value) return
  error.value = ''
  if (!draft.businessType.trim()) {
    error.value = 'Choose a topic or add your own to continue.'
    return
  }
  if (step.value >= 2 && !draft.businessName.trim()) {
    error.value = 'Add your business name to continue.'
    return
  }
  if (step.value === 3 && !draft.goals.length) {
    error.value = 'Choose at least one website goal.'
    return
  }
  busy.value = true
  try {
    await save()
    if (step.value < 3 && !(hasIntake.value && step.value === 2)) step.value += 1
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
  <StudioEntryShell
    :title="workspaceId ? 'Your workspace is prepared.' : titles[step - 1]"
    :description="workspaceId ? 'Your business details and website goals are saved.' : descriptions[step - 1]"
    :step="workspaceId || hasIntake ? undefined : step"
    :steps="3"
  >
    <template #header>
      <UButton
        :label="signOutLabel"
        color="neutral"
        variant="link"
        :disabled="busy"
        @click="signOut"
      />
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
    <div v-if="workspaceId" class="space-y-5">
      <UIcon name="i-lucide-check" class="size-8 text-highlighted" />
      <h2 class="text-xl font-medium text-highlighted">
        {{ draft.businessName }}
      </h2>
      <p class="text-muted">
        {{ draft.businessType }}
      </p>
      <UButton
        to="/studio/dashboard"
        label="Go to website overview"
        color="neutral"
        size="xl"
        class="rounded-none"
      />
    </div>
    <form
      v-else-if="ready"
      id="studio-setup-form"
      class="space-y-6"
      :class="{ 'xl:flex xl:h-full xl:min-h-0 xl:flex-col': step === 1 }"
      @submit.prevent="advance"
    >
      <fieldset class="space-y-6" :class="{ 'xl:flex xl:min-h-0 xl:flex-1 xl:flex-col': step === 1 }" :disabled="busy || conflict">
        <template v-if="step === 1">
          <StudioTopicPicker v-model="draft.businessType" :disabled="busy || conflict" />
        </template>
        <template v-else-if="step === 2">
          <UFormField label="Business or organisation name" required>
            <UInput
              v-model="draft.businessName"
              autocomplete="organization"
              :maxlength="160"
              placeholder="e.g. Alex Flowers"
              class="w-full"
              size="xl"
              color="neutral"
              variant="soft"
              required
            />
          </UFormField>
          <UFormField label="Business timezone" help="Used for schedules and reporting." required>
            <USelectMenu
              v-model="draft.timezone"
              :items="timezones"
              class="w-full"
              size="xl"
              color="neutral"
              variant="soft"
            />
          </UFormField>
          <p class="text-sm text-muted">
            Website topic: {{ draft.businessType }}
          </p>
        </template>
        <template v-else>
          <StudioGoalPicker v-model="draft.goals" :disabled="busy || conflict" />
        </template>
      </fieldset>
      <p v-if="saved" class="text-sm text-muted" role="status">
        Progress saved. You can safely return later.
      </p>
      <NuxtLink
        v-if="error && !conflict"
        to="/studio/signup"
        target="_blank"
        class="block text-sm text-highlighted underline"
      >Open sign-in in another tab</NuxtLink>
    </form>
    <template v-if="ready && !workspaceId" #footer>
      <div class="flex items-center gap-2">
        <UButton
          v-if="step > 1"
          label="Back"
          color="neutral"
          variant="ghost"
          :disabled="busy"
          @click="step -= 1; hasIntake = false; error = ''"
        />
        <UButton
          label="Save for later"
          color="neutral"
          variant="link"
          :disabled="busy || conflict"
          @click="saveForLater"
        />
      </div>
      <UButton
        form="studio-setup-form"
        type="submit"
        :label="step < 3 && !hasIntake ? 'Next' : 'Create my workspace'"
        color="neutral"
        size="xl"
        class="ml-auto min-h-13 rounded-none px-8"
        :loading="busy"
        :disabled="conflict"
      />
    </template>
  </StudioEntryShell>
</template>
