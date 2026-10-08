<script setup lang="ts">
import { CustomerSignInRequest } from '~~/shared/pageStudio/customerSignup'

definePageMeta({ layout: false, colorMode: 'light' })
useHead({ title: 'Create your Page Studio account' })
const api = '/api/portal/page-studio/customer'
const { data: config, status, refresh } = await useFetch<{ enabled: boolean }>(`${api}/config`)
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
  error.value = ''
}
async function submit() {
  if (busy.value) return
  error.value = ''
  const input = CustomerSignInRequest.safeParse({ mode: mode.value, email: email.value, ...(mode.value === 'signup' ? { name: name.value, acceptedTerms: acceptedTerms.value } : {}) })
  if (!input.success) {
    error.value = 'Enter your details and, when creating an account, agree to the terms.'
    return
  }
  busy.value = true
  try {
    await $fetch(`${api}/request`, { method: 'POST', body: input.data })
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
    :title="sent ? 'Check your inbox' : mode === 'signup' ? 'Your website starts here.' : 'Continue to Page Studio.'"
    :description="sent ? `If ${email.trim()} is eligible, a secure sign-in link is on its way.` : mode === 'signin' ? 'Sign in with your email to return to your workspace.' : 'Start with your account. Then tell us a little about your business.'"
  >
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
        description="Your link works once and expires in 15 minutes. Check your spam folder too."
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
      @submit.prevent="submit"
    >
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
      <UAlert
        v-if="error"
        color="error"
        title="Please try again"
        :description="error"
        role="alert"
      />
      <UButton
        :label="mode === 'signup' ? 'Already registered? Sign in' : 'New here? Create an account'"
        color="neutral"
        variant="link"
        block
        :disabled="busy"
        @click="changeMode"
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
    <p class="mt-8 text-sm leading-6 text-muted">
      Invited by your website team? <NuxtLink to="/studio" class="text-primary underline">Use your invitation sign-in.</NuxtLink>
    </p>
    <template v-if="config?.enabled && !sent" #footer>
      <p class="text-sm text-muted">
        A little about you. Then your website.
      </p>
      <UButton
        form="studio-signup-form"
        type="submit"
        :label="mode === 'signup' ? 'Continue' : 'Email me a sign-in link'"
        color="neutral"
        size="xl"
        class="ml-auto min-h-13 rounded-none px-7"
        :loading="busy"
      />
    </template>
  </StudioEntryShell>
</template>
