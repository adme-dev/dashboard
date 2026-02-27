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
        <NuxtLink
          to="/"
          class="inline-flex items-center gap-2 px-4 py-1.5 text-[14.5px] text-[#45474D] dark:text-white/60 hover:text-[#121317] dark:hover:text-white rounded-full transition-colors"
        >
          <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
          Back
        </NuxtLink>
      </div>
    </nav>

    <!-- Main Content -->
    <div class="flex-1 flex items-center justify-center pt-[52px] px-6 py-16">
      <div class="w-full max-w-[400px]">
        <!-- Header -->
        <div class="text-center mb-10">
          <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#b7bfd9]/[0.09] dark:bg-white/[0.06] mb-6">
            <UIcon name="i-lucide-building-2" class="w-7 h-7 text-[#121317] dark:text-white" />
          </div>
          <h1 class="text-[28px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-2">
            Client Portal
          </h1>
          <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
            Sign in to view your projects and approvals
          </p>
        </div>

        <!-- Login Form -->
        <form @submit.prevent="handleLogin" class="space-y-4">
          <div
            v-if="error"
            class="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20"
          >
            <UIcon name="i-lucide-alert-circle" class="w-4.5 h-4.5 text-red-500 flex-shrink-0 mt-0.5" />
            <div class="flex-1 flex items-center justify-between">
              <span class="text-[13px] text-red-700 dark:text-red-400">{{ error }}</span>
              <button class="text-red-400 hover:text-red-600" @click="error = ''">
                <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div>
            <label class="block text-[13px] font-medium text-[#121317] dark:text-white mb-2">Email</label>
            <input
              v-model="email"
              type="email"
              placeholder="you@company.com"
              class="w-full px-4 py-3 rounded-xl border border-[#121317]/10 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[15px] text-[#121317] dark:text-white placeholder:text-[#45474D]/50 dark:placeholder:text-white/30 focus:outline-none focus:border-[#121317]/30 dark:focus:border-white/20 focus:ring-2 focus:ring-[#121317]/5 dark:focus:ring-white/10 transition-all"
              :disabled="loading"
              autofocus
            />
          </div>

          <div>
            <label class="block text-[13px] font-medium text-[#121317] dark:text-white mb-2">Password</label>
            <input
              v-model="password"
              type="password"
              placeholder="Enter your password"
              class="w-full px-4 py-3 rounded-xl border border-[#121317]/10 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[15px] text-[#121317] dark:text-white placeholder:text-[#45474D]/50 dark:placeholder:text-white/30 focus:outline-none focus:border-[#121317]/30 dark:focus:border-white/20 focus:ring-2 focus:ring-[#121317]/5 dark:focus:ring-white/10 transition-all"
              :disabled="loading"
            />
          </div>

          <button
            type="submit"
            class="w-full py-3 px-4 bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[15px] font-medium rounded-full hover:bg-[#2a2b30] dark:hover:bg-white/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            :disabled="loading"
          >
            <svg v-if="loading" class="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {{ loading ? 'Signing in...' : 'Sign in' }}
          </button>
        </form>

        <!-- Divider -->
        <div class="relative my-8">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-[#121317]/[0.06] dark:border-white/[0.06]" />
          </div>
          <div class="relative flex justify-center">
            <span class="bg-white dark:bg-[#0a0b0e] px-4 text-[12px] text-[#45474D]/50 dark:text-white/30 uppercase tracking-wider">or</span>
          </div>
        </div>

        <!-- Agency Staff Link -->
        <NuxtLink
          to="/auth/login"
          class="flex items-center justify-between w-full px-5 py-3.5 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#b7bfd9]/[0.03] dark:hover:bg-white/[0.02] transition-all group"
        >
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-[#b7bfd9]/[0.09] dark:bg-white/[0.06] flex items-center justify-center">
              <UIcon name="i-lucide-kanban" class="w-4.5 h-4.5 text-[#45474D] dark:text-white/60" />
            </div>
            <div class="text-left">
              <div class="text-[14px] font-medium text-[#121317] dark:text-white">Agency Staff</div>
              <div class="text-[12px] text-[#45474D]/70 dark:text-white/40">Sign in with magic link</div>
            </div>
          </div>
          <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#45474D] dark:group-hover:text-white/60 transition-colors" />
        </NuxtLink>

        <!-- Help -->
        <div class="mt-10 text-center">
          <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">
            Need help? <a href="#" class="text-[#121317] dark:text-white hover:underline font-medium">Contact support</a>
          </p>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="py-6 border-t border-[#121317]/[0.04] dark:border-white/[0.04]">
      <div class="max-w-[1200px] mx-auto px-6 flex items-center justify-center">
        <span class="text-[12px] text-[#45474D]/40 dark:text-white/30">Secure client portal</span>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const { login, isAuthenticated } = usePortalAuth()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

watchEffect(() => {
  if (isAuthenticated.value) {
    const redirect = route.query.redirect as string
    navigateTo(redirect ? decodeURIComponent(redirect) : '/portal')
  }
})

async function handleLogin() {
  error.value = ''
  if (!email.value || !password.value) {
    error.value = 'Please enter email and password'
    return
  }

  loading.value = true
  try {
    await login(email.value, password.value)
    const redirect = route.query.redirect as string
    await navigateTo(redirect ? decodeURIComponent(redirect) : '/portal')
  } catch (e: any) {
    error.value = e.data?.statusMessage || e.message || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>
