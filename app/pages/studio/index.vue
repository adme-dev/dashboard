<script setup lang="ts">
import { normalizePortalRedirect } from '~~/shared/portalRedirect'

definePageMeta({ layout: false, colorMode: 'light' })
useHead({ title: 'Page Studio — Your website workspace' })
const route = useRoute()
const { requestMagicLink, fetchUser } = usePortalAuth()
const email = ref('')
const sentTo = ref('')
const loading = ref(false)
const error = ref('')
const destination = computed(() => {
  const value = normalizePortalRedirect(route.query.redirect)
  return value.startsWith('/studio/sites') ? value : '/studio/sites'
})
onMounted(async () => {
  if (await fetchUser()) await navigateTo(destination.value)
})
async function signIn() {
  if (loading.value) return
  error.value = ''
  loading.value = true
  try {
    await requestMagicLink(email.value.trim(), destination.value)
    sentTo.value = email.value.trim()
  } catch {
    error.value = 'We could not send a sign-in link. Try again shortly or contact your website team.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <StudioEntryShell
    home-to="/studio"
    :title="sentTo ? 'Check your inbox' : 'Continue to Page Studio.'"
    :description="sentTo ? `If ${sentTo} has an eligible account, a secure sign-in link is on its way.` : 'Your website, ready for your next idea. Sign in to return to your workspace.'"
  >
    <div v-if="sentTo" class="space-y-5" role="status">
      <UAlert
        color="success"
        title="Link requested"
        description="Your link expires in 15 minutes. Check your spam folder if it does not arrive."
        icon="i-lucide-mail-check"
      />
      <UButton
        label="Use another email"
        block
        color="neutral"
        variant="outline"
        size="xl"
        class="min-h-14 rounded-none justify-center"
        @click="sentTo = ''"
      />
    </div>
    <form v-else id="studio-invitation-signin" class="space-y-6" @submit.prevent="signIn">
      <UFormField label="Email address" help="Use the email address your website team invited. We’ll send you a secure sign-in link." required>
        <UInput
          v-model="email"
          type="email"
          autocomplete="email"
          placeholder="you@company.com"
          size="xl"
          color="neutral"
          variant="soft"
          class="w-full"
          required
          :disabled="loading"
        />
      </UFormField>
      <UAlert
        v-if="error"
        color="error"
        title="Sign-in link unavailable"
        :description="error"
        role="alert"
      />
      <p class="text-sm leading-6 text-muted">
        New here? Ask your website team to invite you and assign your website.
      </p>
    </form>
    <template v-if="!sentTo" #footer>
      <p class="text-sm text-muted">Your website, one step at a time.</p>
      <UButton
        form="studio-invitation-signin"
        type="submit"
        label="Email me a sign-in link"
        color="neutral"
        size="xl"
        class="ml-auto min-h-13 rounded-none px-7"
        :loading="loading"
        :disabled="!email.trim()"
      />
    </template>
  </StudioEntryShell>
</template>
