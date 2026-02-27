<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e] flex flex-col">
    <!-- Fixed Navigation -->
    <nav class="fixed top-0 left-0 right-0 z-50 backdrop-blur-lg bg-white/85 dark:bg-[#0a0b0e]/85">
      <div class="max-w-[1200px] mx-auto px-6 h-[52px] flex items-center justify-between">
        <NuxtLink to="/" class="flex items-center gap-2.5">
          <div class="w-7 h-7 bg-[#121317] rounded-lg flex items-center justify-center">
            <span class="text-white text-xs font-semibold tracking-tight">XF</span>
          </div>
          <span class="text-[15px] font-medium text-[#121317] dark:text-white tracking-[-0.01em]">XeroFlow</span>
        </NuxtLink>
      </div>
    </nav>

    <!-- Main Content -->
    <div class="flex-1 flex items-center justify-center pt-[52px] px-6 py-16">
      <div class="w-full max-w-[400px]">
        <!-- Verifying State -->
        <div v-if="status === 'verifying'" class="text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 mb-6">
            <svg class="animate-spin w-10 h-10 text-[#121317] dark:text-white" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" />
              <path class="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <h1 class="text-[28px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-2">
            Signing you in...
          </h1>
          <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
            Verifying your magic link
          </p>
        </div>

        <!-- Success State -->
        <div v-else-if="status === 'success'" class="text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-500/10 mb-6">
            <UIcon name="i-lucide-check" class="w-8 h-8 text-emerald-600" />
          </div>
          <h1 class="text-[28px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-2">
            Welcome back!
          </h1>
          <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
            Redirecting you to the dashboard...
          </p>
          <NuxtLink
            to="/agency"
            class="inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[15px] font-medium rounded-full hover:bg-[#2a2b30] dark:hover:bg-white/90 transition-colors"
          >
            Go to Dashboard
          </NuxtLink>
        </div>

        <!-- Error State -->
        <div v-else-if="status === 'error'" class="text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 dark:bg-red-500/10 mb-6">
            <UIcon name="i-lucide-x" class="w-8 h-8 text-red-500" />
          </div>
          <h1 class="text-[28px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-2">
            Link expired or invalid
          </h1>
          <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-2">
            This magic link has expired or has already been used.
          </p>
          <p v-if="errorMessage" class="text-[14px] text-red-500 mb-8">{{ errorMessage }}</p>
          <p v-else class="mb-8" />
          <NuxtLink
            to="/auth/login"
            class="inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[15px] font-medium rounded-full hover:bg-[#2a2b30] dark:hover:bg-white/90 transition-colors"
          >
            Request a New Link
          </NuxtLink>
        </div>

        <!-- No Token State -->
        <div v-else class="text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-500/10 mb-6">
            <UIcon name="i-lucide-alert-triangle" class="w-8 h-8 text-amber-500" />
          </div>
          <h1 class="text-[28px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-2">
            Invalid Link
          </h1>
          <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-8">
            This link appears to be incomplete or malformed.
          </p>
          <NuxtLink
            to="/auth/login"
            class="inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[15px] font-medium rounded-full hover:bg-[#2a2b30] dark:hover:bg-white/90 transition-colors"
          >
            Go to Sign In
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="py-6 border-t border-[#121317]/[0.04] dark:border-white/[0.04]">
      <div class="max-w-[1200px] mx-auto px-6 flex items-center justify-center">
        <span class="text-[12px] text-[#45474D]/40 dark:text-white/30">Secure magic link authentication</span>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

const route = useRoute()
const status = ref<'verifying' | 'success' | 'error' | 'no-token'>('no-token')
const errorMessage = ref('')

onMounted(async () => {
  const token = route.query.token as string
  if (!token) {
    status.value = 'no-token'
    return
  }

  status.value = 'verifying'

  try {
    const response = await $fetch('/api/auth/magic-link/verify', {
      method: 'GET',
      params: { token },
      credentials: 'include'
    }) as any

    if (response.success) {
      status.value = 'success'

      // Auto-redirect after brief success message
      setTimeout(() => {
        navigateTo('/agency')
      }, 1500)
    } else {
      status.value = 'error'
      errorMessage.value = 'Verification failed'
    }
  } catch (error: any) {
    console.error('[Magic Link] Verification error:', error)
    status.value = 'error'
    errorMessage.value = error.data?.statusMessage || error.message || 'Something went wrong'
  }
})
</script>
