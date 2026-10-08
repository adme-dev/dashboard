<script setup lang="ts">
import type { CustomerSetup } from '~~/shared/pageStudio/customerSignup'

definePageMeta({ layout: false, colorMode: 'light' })
useHead({ title: 'Set up your workspace — Page Studio' })
const api = '/api/portal/page-studio/customer'
const draft = reactive<CustomerSetup>({ businessName: '', businessType: '', timezone: 'UTC', goals: [] })
const revision = ref(0)
const workspaceId = ref<string | null>(null)
const step = ref(1)
const topics = ['Photography', 'Design', 'Education', 'Consulting', 'Art', 'Health and wellness', 'Marketing', 'Technology', 'Retail', 'Food and hospitality', 'Trades and construction', 'Professional services', 'Community organisation']
const topicSearch = ref('')
const visibleTopics = computed(() => topics.filter(topic => topic.toLowerCase().includes(topicSearch.value.trim().toLowerCase())))
const customTopic = computed(() => topicSearch.value.trim().slice(0, 100))
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
    if (step.value < 3) step.value += 1
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
    :step="workspaceId ? undefined : step"
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
      @submit.prevent="advance"
    >
      <fieldset class="space-y-6" :disabled="busy || conflict">
        <template v-if="step === 1">
          <UFormField label="Website topic" :ui="{ label: 'sr-only' }" required>
            <UInput
              v-model="topicSearch"
              icon="i-lucide-search"
              placeholder="Search for your site topic"
              :maxlength="100"
              size="xl"
              color="neutral"
              variant="soft"
              class="w-full"
              aria-label="Search for your site topic"
            />
          </UFormField>
          <div class="border-t border-default">
            <p class="px-5 pt-5 pb-2 text-xs text-muted">
              {{ topicSearch ? 'Matching topics' : 'Popular topics' }}
            </p>
            <div class="max-h-72 overflow-y-auto pb-3">
              <UButton
                v-for="topic in visibleTopics"
                :key="topic"
                :label="topic"
                color="neutral"
                :variant="draft.businessType === topic ? 'soft' : 'ghost'"
                :trailing-icon="draft.businessType === topic ? 'i-lucide-check' : undefined"
                :aria-pressed="draft.businessType === topic"
                class="flex w-full justify-between rounded-none px-5 py-2.5 text-left text-base font-normal"
                :disabled="busy || conflict"
                @click="draft.businessType = topic"
              />
              <UButton
                v-if="customTopic && !topics.some(topic => topic.toLowerCase() === customTopic.toLowerCase())"
                :label="`Use “${customTopic}”`"
                color="neutral"
                variant="ghost"
                class="w-full justify-start rounded-none px-5 py-3 text-left"
                :disabled="busy || conflict"
                @click="draft.businessType = customTopic"
              />
            </div>
          </div>
          <p v-if="draft.businessType" class="flex items-center gap-2 text-sm text-highlighted" role="status">
            <UIcon name="i-lucide-check" class="size-4" />{{ draft.businessType }}
          </p>
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
          <UFormField label="Website goals" help="Choose all that apply. These do not activate paid features." required>
            <UCheckboxGroup
              v-model="draft.goals"
              :items="goals"
              color="neutral"
              class="mt-5"
              :ui="{ fieldset: 'gap-6' }"
            />
          </UFormField>
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
          @click="step -= 1; error = ''"
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
        :label="step < 3 ? 'Next' : 'Create my workspace'"
        color="neutral"
        size="xl"
        class="ml-auto min-h-13 rounded-none px-8"
        :loading="busy"
        :disabled="conflict"
      />
    </template>
  </StudioEntryShell>
</template>
