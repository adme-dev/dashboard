<script setup lang="ts">
import { writeSignupIntake } from '~/utils/pageStudioSignupIntake'
import type { CustomerSetup } from '~~/shared/pageStudio/customerSignup'
import { CustomerSignInRequest } from '~~/shared/pageStudio/customerSignup'

definePageMeta({ layout: false, colorMode: 'light' })
useHead({ title: 'Create your Page Studio account' })
const api = '/api/portal/page-studio/customer'
const { data: config, status, refresh } = await useFetch<{ enabled: boolean }>(`${api}/config`)
const step = ref(1)
const accountFormOpen = ref(false)
const businessType = ref('')
const goals = ref<CustomerSetup['goals']>([])
const mode = ref<'signup' | 'signin'>('signup')
const name = ref('')
const email = ref('')
const acceptedTerms = ref(false)
const sent = ref(false)
const busy = ref(false)
const error = ref('')
onMounted(async () => {
  if (config.value?.enabled) {
    try {
      await $fetch(`${api}/me`)
      await navigateTo('/studio/onboarding')
    } catch {
      /* Signed-out visitors remain here. */
    }
  }
})
function changeMode() {
  mode.value = mode.value === 'signup' ? 'signin' : 'signup'
  sent.value = false
  step.value = mode.value === 'signin' ? 3 : 1
  accountFormOpen.value = mode.value === 'signin'
  error.value = ''
}
async function submit() {
  if (busy.value) return
  error.value = ''
  if (mode.value === 'signup' && step.value < 3) {
    if (step.value === 1 && !businessType.value) {
      error.value = 'Choose a topic to continue.'
      return
    }
    if (step.value === 2 && !goals.value.length) {
      error.value = 'Choose at least one website goal.'
      return
    }
    step.value += 1
    return
  }
  const input = CustomerSignInRequest.safeParse({ mode: mode.value, email: email.value, ...(mode.value === 'signup' ? { name: name.value, acceptedTerms: acceptedTerms.value } : {}) })
  if (!input.success) {
    error.value = 'Enter your details and, when creating an account, agree to the terms.'
    return
  }
  busy.value = true
  try {
    await $fetch(`${api}/request`, { method: 'POST', body: input.data })
    if (mode.value === 'signup') {
      try {
        writeSignupIntake(window.localStorage, input.data.email, { businessType: businessType.value, goals: goals.value })
      } catch { /* Storage is optional. */ }
    }
    sent.value = true
  } catch (e: unknown) {
    error.value = (e as { statusCode?: number })?.statusCode === 429
      ? 'Too many requests. Please wait 15 minutes before trying again.'
      : 'We could not request your link. Please try again shortly.'
  } finally { busy.value = false }
}
</script>

<template>
  <StudioEntryShell
    :step="mode === 'signup' && !sent ? step : undefined"
    :steps="3"
    :title="sent ? 'Check your inbox' : mode === 'signin' ? 'Continue to Page Studio.' : step === 1 ? 'What’s your site about?' : step === 2 ? 'What do you want to do with your website?' : 'Create your account.'"
    :description="sent ? `If ${email.trim()} is eligible, a secure sign-in link is on its way.` : mode === 'signin' ? 'Sign in with your email to return to your workspace.' : step === 1 ? 'Choose a topic so we can get to know your business.' : step === 2 ? 'Tell us what you have in mind. Choose all that apply.' : 'Save your choices and start your Page Studio workspace.'"
  >
    <template #header>
      <UButton
        :label="mode === 'signup' ? 'Sign in' : 'Create account'"
        color="neutral"
        variant="link"
        :disabled="busy"
        @click="changeMode"
      />
    </template>
    <UAlert
      v-if="!config?.enabled"
      color="neutral"
      title="Customer signup is not open yet"
      description="If your website team has invited you, use your invitation sign-in below."
    />
    <UButton
      v-if="status === 'error'"
      class="mt-4"
      label="Try again"
      color="neutral"
      variant="outline"
      @click="refresh()"
    />
    <div v-if="config?.enabled && sent" class="space-y-5" role="status">
      <UAlert
        color="success"
        icon="i-lucide-mail-check"
        title="Link requested"
        description="Your link works once and expires in 15 minutes. Check your spam folder too. Open the link in this browser to keep your website choices."
      />
      <UButton
        label="Request another link"
        color="neutral"
        variant="outline"
        block
        :loading="busy"
        @click="submit"
      />
      <UButton
        label="Change email address"
        color="neutral"
        variant="ghost"
        block
        :disabled="busy"
        @click="sent = false"
      />
    </div>
    <form
      v-else-if="config?.enabled"
      id="studio-signup-form"
      class="space-y-6"
      :class="{ 'xl:flex xl:h-full xl:min-h-0 xl:flex-col': mode === 'signup' && step === 1 }"
      @submit.prevent="submit"
    >
      <StudioTopicPicker v-if="mode === 'signup' && step === 1" v-model="businessType" />
      <StudioGoalPicker v-else-if="mode === 'signup' && step === 2" v-model="goals" />
      <template v-else-if="mode === 'signup' && !accountFormOpen">
        <p class="text-sm text-muted">
          {{ businessType }} · {{ goals.length }} website {{ goals.length === 1 ? 'goal' : 'goals' }} selected
        </p>
        <UButton
          label="Continue with email"
          icon="i-lucide-mail"
          color="neutral"
          variant="outline"
          size="xl"
          class="min-h-14 rounded-none justify-center"
          block
          @click="accountFormOpen = true"
        />
        <p class="text-sm leading-6 text-muted">
          We’ll email you a secure sign-in link. No password to remember.
        </p>
      </template>
      <template v-else>
        <UFormField v-if="mode === 'signup'" label="Your name" required>
          <UInput
            v-model="name"
            autocomplete="name"
            :maxlength="100"
            size="xl"
            color="neutral"
            variant="soft"
            class="w-full"
            :disabled="busy"
            required
          />
        </UFormField>
        <UFormField label="Email address" help="We’ll email you a secure link. No password to remember." required>
          <UInput
            v-model="email"
            type="email"
            autocomplete="email"
            :maxlength="254"
            placeholder="you@company.com"
            size="xl"
            color="neutral"
            variant="soft"
            class="w-full"
            :disabled="busy"
            required
          />
        </UFormField>
        <UFormField v-if="mode === 'signup'" label="Account terms" required>
          <UCheckbox v-model="acceptedTerms" :disabled="busy" required>
            <template #label>
              I agree to the <NuxtLink to="/terms" target="_blank" class="text-primary underline">Terms of Service</NuxtLink> and have read the <NuxtLink to="/privacy" target="_blank" class="text-primary underline">Privacy Policy</NuxtLink>.
            </template>
          </UCheckbox>
        </UFormField>
      </template>
      <UAlert
        v-if="error"
        color="error"
        title="Please try again"
        :description="error"
        role="alert"
      />
    </form>
    <UAlert
      v-if="sent && error"
      class="mt-4"
      color="error"
      title="Please try again"
      :description="error"
      role="alert"
    />
    <p v-if="!config?.enabled || step === 3 || mode === 'signin'" class="mt-8 text-sm leading-6 text-muted">
      Invited by your website team? <NuxtLink to="/studio" class="text-primary underline">Use your invitation sign-in.</NuxtLink>
    </p>
    <template v-if="config?.enabled && !sent" #footer>
      <UButton
        v-if="mode === 'signup' && step > 1"
        label="Back"
        color="neutral"
        variant="ghost"
        :disabled="busy"
        @click="step -= 1; error = ''"
      />
      <p v-else class="text-sm text-muted">
        Your website, one step at a time.
      </p>
      <UButton
        v-if="mode === 'signin' || step < 3 || accountFormOpen"
        form="studio-signup-form"
        type="submit"
        :label="mode === 'signup' && step < 3 ? 'Next' : 'Email me a sign-in link'"
        color="neutral"
        size="xl"
        class="ml-auto min-h-13 rounded-none px-7"
        :loading="busy"
      />
    </template>
  </StudioEntryShell>
</template>
