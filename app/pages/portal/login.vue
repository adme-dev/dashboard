<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const { requestMagicLink, isAuthenticated } = usePortalAuth()
const email = ref('')
const sentTo = ref('')
const error = ref('')
const loading = ref(false)

function portalRedirect() {
  const value = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  try {
    const decoded = decodeURIComponent(value)
    return /^\/portal(?:\/|$)/.test(decoded) && !decoded.includes('\\')
      ? decoded
      : '/portal'
  } catch {
    return '/portal'
  }
}

function errorMessage(caught: unknown) {
  if (caught && typeof caught === 'object' && 'data' in caught) {
    return (caught as { data?: { statusMessage?: string } }).data?.statusMessage
  }
  return undefined
}

watchEffect(() => {
  if (isAuthenticated.value) navigateTo(portalRedirect())
})

async function handleRequest() {
  error.value = ''
  if (!email.value.trim()) {
    error.value = 'Enter the email address your account manager invited.'
    return
  }

  loading.value = true
  try {
    await requestMagicLink(email.value, portalRedirect())
    sentTo.value = email.value.trim()
  } catch (caught: unknown) {
    error.value = errorMessage(caught) || 'A sign-in link could not be sent. Try again shortly.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e] flex flex-col">
    <nav class="h-[52px] border-b border-[#121317]/[0.04] bg-white/90 backdrop-blur-lg dark:border-white/[0.04] dark:bg-[#0a0b0e]/90">
      <div class="mx-auto flex h-full max-w-[1200px] items-center justify-between px-6">
        <NuxtLink to="/" class="flex items-center gap-2.5">
          <span class="flex size-7 items-center justify-center rounded-lg bg-[#121317] text-xs font-semibold text-white">XF</span>
          <span class="text-[15px] font-medium tracking-[-0.01em] text-[#121317] dark:text-white">XeroFlow</span>
        </NuxtLink>
        <NuxtLink to="/" class="flex items-center gap-2 text-sm text-[#45474D] transition-colors hover:text-[#121317] dark:text-white/60 dark:hover:text-white">
          <UIcon name="i-lucide-arrow-left" class="size-3.5" />
          Back
        </NuxtLink>
      </div>
    </nav>

    <main class="flex flex-1 items-center justify-center px-6 py-16">
      <div class="w-full max-w-[420px]">
        <div class="mb-9 text-center">
          <div class="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[#b7bfd9]/[0.09] dark:bg-white/[0.06]">
            <UIcon :name="sentTo ? 'i-lucide-mail-check' : 'i-lucide-building-2'" class="size-7 text-[#121317] dark:text-white" />
          </div>
          <p class="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[#45474D]/60 dark:text-white/40">
            Client workspace
          </p>
          <h1 class="text-[28px] font-[450] tracking-[-0.02em] text-[#121317] dark:text-white">
            {{ sentTo ? 'Check your inbox' : 'Sign in securely' }}
          </h1>
          <p class="mt-3 text-[15px] leading-6 text-[#45474D] dark:text-white/60">
            {{ sentTo
              ? `If an eligible portal account exists for ${sentTo}, a secure link is on its way.`
              : 'Enter your work email and we’ll send a one-time link to your client portal.' }}
          </p>
        </div>

        <div v-if="sentTo" class="space-y-4">
          <UAlert
            title="Link requested"
            description="The link expires in 15 minutes and can be used once. Check your spam folder if it does not arrive."
            color="success"
            icon="i-lucide-shield-check"
          />
          <UButton
            block
            size="xl"
            color="neutral"
            variant="outline"
            @click="sentTo = ''"
          >
            Use another email
          </UButton>
        </div>

        <form v-else class="space-y-4" @submit.prevent="handleRequest">
          <UAlert
            v-if="error"
            :title="error"
            color="error"
            icon="i-lucide-alert-circle"
          />

          <UFormField label="Email" name="email" help="Use the address associated with your client account.">
            <UInput
              v-model="email"
              type="email"
              autocomplete="email"
              placeholder="you@company.com"
              size="xl"
              class="w-full"
              :disabled="loading"
              autofocus
            />
          </UFormField>

          <UButton
            type="submit"
            block
            size="xl"
            color="neutral"
            icon="i-lucide-send"
            :loading="loading"
            :disabled="loading"
          >
            Email me a sign-in link
          </UButton>
        </form>

        <div class="my-8 flex items-center gap-4" aria-hidden="true">
          <div class="h-px flex-1 bg-[#121317]/[0.06] dark:bg-white/[0.06]" />
          <span class="text-[11px] uppercase tracking-[0.14em] text-[#45474D]/40 dark:text-white/30">Staff access</span>
          <div class="h-px flex-1 bg-[#121317]/[0.06] dark:bg-white/[0.06]" />
        </div>

        <NuxtLink
          to="/auth/login"
          class="group flex w-full items-center justify-between rounded-xl border border-[#121317]/[0.06] px-5 py-3.5 transition-all hover:border-[#121317]/15 dark:border-white/[0.06] dark:hover:border-white/15"
        >
          <span class="flex items-center gap-3">
            <span class="flex size-9 items-center justify-center rounded-lg bg-[#b7bfd9]/[0.09] dark:bg-white/[0.06]">
              <UIcon name="i-lucide-kanban" class="size-4.5 text-[#45474D] dark:text-white/60" />
            </span>
            <span class="text-left">
              <span class="block text-sm font-medium text-[#121317] dark:text-white">Agency staff</span>
              <span class="block text-xs text-[#45474D]/70 dark:text-white/40">Use the staff sign-in</span>
            </span>
          </span>
          <UIcon name="i-lucide-arrow-right" class="size-4 text-[#45474D]/40 transition-transform group-hover:translate-x-0.5 dark:text-white/30" />
        </NuxtLink>

        <p class="mt-9 text-center text-[13px] text-[#45474D]/60 dark:text-white/40">
          Need help?
          <NuxtLink to="/support" class="font-medium text-[#121317] hover:underline dark:text-white">
            Contact support
          </NuxtLink>
        </p>
      </div>
    </main>

    <footer class="border-t border-[#121317]/[0.04] py-6 text-center text-xs text-[#45474D]/40 dark:border-white/[0.04] dark:text-white/30">
      Single-use links · Secure client sessions
    </footer>
  </div>
</template>
