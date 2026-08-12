<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const { verifyMagicLink, fetchUser } = usePortalAuth()
const token = ref('')
const ready = ref(false)
const loading = ref(false)
const completing = ref(false)
const error = ref('')

onMounted(() => {
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  token.value = fragment.get('token') || ''
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  ready.value = true
})

function errorMessage(caught: unknown) {
  if (caught && typeof caught === 'object' && 'data' in caught) {
    return (caught as { data?: { statusMessage?: string } }).data?.statusMessage
  }
  return undefined
}

async function handleVerify() {
  if (!token.value) return
  error.value = ''
  loading.value = true

  try {
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/portal'
    const result = await verifyMagicLink(token.value, redirect)
    completing.value = true
    token.value = ''
    await fetchUser()
    await navigateTo(result.redirect)
  } catch (caught: unknown) {
    completing.value = false
    token.value = ''
    error.value = errorMessage(caught) || 'This sign-in link is invalid or has expired.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e] flex items-center justify-center px-6 py-16">
    <main class="w-full max-w-[420px] text-center">
      <div class="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[#b7bfd9]/[0.09] dark:bg-white/[0.06]">
        <UIcon name="i-lucide-shield-check" class="size-7 text-[#121317] dark:text-white" />
      </div>
      <p class="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[#45474D]/60 dark:text-white/40">
        Email verified
      </p>
      <h1 class="text-[28px] font-[450] tracking-[-0.02em] text-[#121317] dark:text-white">
        Continue to your portal
      </h1>
      <p class="mx-auto mt-3 max-w-sm text-[15px] leading-6 text-[#45474D] dark:text-white/60">
        Confirm this browser to finish signing in. This protects your link from automated email scanners.
      </p>

      <div class="mt-8 space-y-4 text-left">
        <div
          v-if="!ready || completing"
          role="status"
          aria-live="polite"
          class="flex items-center justify-center gap-2 py-4 text-sm text-muted"
        >
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-[#45474D]/50 dark:text-white/40" />
          <span v-if="completing">Signing you in…</span>
          <span v-else class="sr-only">Checking sign-in link</span>
        </div>

        <UAlert
          v-else-if="error || !token"
          :title="error || 'Sign-in link unavailable'"
          description="Request a new secure link from the client portal login page."
          color="error"
          icon="i-lucide-link-2-off"
        />

        <UButton
          v-else
          block
          size="xl"
          color="neutral"
          icon="i-lucide-arrow-right"
          trailing
          :loading="loading"
          :disabled="loading"
          @click="handleVerify"
        >
          Continue to portal
        </UButton>

        <UButton
          v-if="!completing"
          to="/portal/login"
          block
          variant="ghost"
          color="neutral"
        >
          Request another link
        </UButton>
      </div>
    </main>
  </div>
</template>
