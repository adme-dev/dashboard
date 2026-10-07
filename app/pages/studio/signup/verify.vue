<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Verify your email — Page Studio' })
const token = ref('')
const ready = ref(false)
const busy = ref(false)
const error = ref('')
onMounted(() => {
  const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || ''
  // Clear the URL before any further navigation; never persist the bearer token.
  window.history.replaceState(window.history.state, '', window.location.pathname)
  token.value = /^[A-Za-z0-9_-]{64}$/.test(value) ? value : ''
  ready.value = true
})
async function verify() {
  if (!token.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/portal/page-studio/customer/verify', { method: 'POST', body: { token: token.value } })
    token.value = ''
    await navigateTo('/studio/onboarding', { replace: true })
  } catch {
    error.value = 'This link may have expired or already been used. Request a new link, or try again if your connection dropped.'
  } finally { busy.value = false }
}
</script>

<template>
  <StudioCustomerShell title="One more step." description="Confirm your email to continue to your Page Studio account.">
    <div class="space-y-5">
      <UAlert
        v-if="error"
        color="error"
        title="Could not verify your link"
        :description="error"
        role="alert"
      />
      <UAlert
        v-else-if="ready && !token"
        color="warning"
        title="Open the link from your email"
        description="This page needs your secure email link. If you refreshed the page, request another link below."
      />
      <UButton
        v-if="token"
        label="Verify email and continue"
        icon="i-lucide-arrow-right"
        trailing
        size="lg"
        block
        :loading="busy"
        @click="verify"
      />
      <UButton
        to="/studio/signup"
        label="Request a new link"
        color="neutral"
        variant="outline"
        block
        :disabled="busy"
      />
    </div>
  </StudioCustomerShell>
</template>
