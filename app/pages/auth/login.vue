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
          <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#121317] dark:bg-white mb-6">
            <span class="text-white dark:text-[#0a0b0e] text-lg font-bold tracking-tight">XF</span>
          </div>
          <h1 class="text-[28px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-2">
            Sign in to XeroFlow
          </h1>
          <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
            Access your projects, tasks, and team workflows
          </p>
        </div>

        <!-- Sign In Form -->
        <div v-if="!linkSent">
          <form @submit.prevent="requestMagicLink" class="space-y-4">
            <div>
              <label class="block text-[13px] font-medium text-[#121317] dark:text-white mb-2">Email address</label>
              <input
                v-model="email"
                type="email"
                placeholder="you@company.com"
                class="w-full px-4 py-3 rounded-xl border border-[#121317]/10 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[15px] text-[#121317] dark:text-white placeholder:text-[#45474D]/50 dark:placeholder:text-white/30 focus:outline-none focus:border-[#121317]/30 dark:focus:border-white/20 focus:ring-2 focus:ring-[#121317]/5 dark:focus:ring-white/10 transition-all"
                :disabled="loading"
                autofocus
              />
            </div>

            <button
              type="submit"
              class="w-full py-3 px-4 bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[15px] font-medium rounded-full hover:bg-[#2a2b30] dark:hover:bg-white/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              :disabled="loading || !isValidEmail"
            >
              <svg v-if="loading" class="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {{ loading ? 'Sending...' : 'Send Magic Link' }}
            </button>
          </form>

          <!-- Error message -->
          <div v-if="errorMsg" class="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
            <p class="text-[13px] text-red-600 dark:text-red-400">{{ errorMsg }}</p>
          </div>

          <p class="mt-6 text-center text-[13px] text-[#45474D]/70 dark:text-white/40">
            We'll send you a secure link to sign in instantly — no password needed.
          </p>

          <!-- Dev Mode Notice -->
          <div v-if="devLink" class="mt-6 p-4 rounded-xl bg-[#b7bfd9]/[0.06] dark:bg-white/[0.04] border border-[#121317]/5 dark:border-white/5">
            <p class="text-[11px] text-[#45474D]/60 dark:text-white/40 uppercase tracking-wide font-medium mb-2">Dev mode</p>
            <a :href="devLink" class="text-[13px] text-[#121317] dark:text-white hover:underline break-all">{{ devLink }}</a>
          </div>
        </div>

        <!-- Link Sent State -->
        <div v-else class="text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-500/10 mb-6">
            <UIcon name="i-lucide-mail-check" class="w-8 h-8 text-emerald-600" />
          </div>
          <h2 class="text-xl font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">Check your email</h2>
          <p class="text-[15px] text-[#45474D] dark:text-white/60 mb-8 leading-relaxed">
            We've sent a magic link to <strong class="text-[#121317] dark:text-white">{{ email }}</strong>
          </p>

          <!-- Dev Mode Link -->
          <div v-if="devLink" class="mb-8 p-4 rounded-xl bg-[#b7bfd9]/[0.06] dark:bg-white/[0.04] border border-[#121317]/5 dark:border-white/5 text-left">
            <p class="text-[11px] text-[#45474D]/60 dark:text-white/40 uppercase tracking-wide font-medium mb-2">Dev mode</p>
            <a :href="devLink" class="text-[13px] text-[#121317] dark:text-white hover:underline break-all">{{ devLink }}</a>
          </div>

          <div class="flex flex-col gap-3">
            <button
              class="w-full py-3 px-4 bg-[#b7bfd9]/10 dark:bg-white/[0.06] text-[#121317] dark:text-white text-[15px] font-medium rounded-full hover:bg-[#b7bfd9]/20 dark:hover:bg-white/10 transition-colors"
              @click="linkSent = false"
            >
              Use a different email
            </button>
            <button
              class="py-2.5 text-[13px] text-[#45474D] dark:text-white/60 hover:text-[#121317] dark:hover:text-white transition-colors"
              :disabled="loading"
              @click="requestMagicLink"
            >
              Resend magic link
            </button>
          </div>
        </div>

        <!-- Divider -->
        <div class="relative my-8">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-[#121317]/[0.06] dark:border-white/[0.06]" />
          </div>
          <div class="relative flex justify-center">
            <span class="bg-white dark:bg-[#0a0b0e] px-4 text-[12px] text-[#45474D]/50 dark:text-white/30 uppercase tracking-wider">or</span>
          </div>
        </div>

        <!-- Other login options -->
        <div class="space-y-3">
          <NuxtLink
            to="/auth/xeroflow"
            class="flex items-center justify-between w-full px-5 py-3.5 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#b7bfd9]/[0.03] dark:hover:bg-white/[0.02] transition-all group"
          >
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-lg bg-[#13B5EA]/10 flex items-center justify-center">
                <UIcon name="i-lucide-calculator" class="w-4.5 h-4.5 text-[#13B5EA]" />
              </div>
              <div class="text-left">
                <div class="text-[14px] font-medium text-[#121317] dark:text-white">XeroFlow</div>
                <div class="text-[12px] text-[#45474D]/70 dark:text-white/40">Accounting & bookkeeping</div>
              </div>
            </div>
            <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#45474D] dark:group-hover:text-white/60 transition-colors" />
          </NuxtLink>

          <NuxtLink
            to="/portal/login"
            class="flex items-center justify-between w-full px-5 py-3.5 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#b7bfd9]/[0.03] dark:hover:bg-white/[0.02] transition-all group"
          >
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-lg bg-[#b7bfd9]/[0.09] dark:bg-white/[0.06] flex items-center justify-center">
                <UIcon name="i-lucide-briefcase" class="w-4.5 h-4.5 text-[#45474D] dark:text-white/60" />
              </div>
              <div class="text-left">
                <div class="text-[14px] font-medium text-[#121317] dark:text-white">Client Portal</div>
                <div class="text-[12px] text-[#45474D]/70 dark:text-white/40">View projects & approvals</div>
              </div>
            </div>
            <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#45474D] dark:group-hover:text-white/60 transition-colors" />
          </NuxtLink>
        </div>

        <!-- Dev Login (development only) -->
        <div v-if="isDev" class="mt-6">
          <div class="relative mb-4">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-dashed border-amber-400/40" />
            </div>
            <div class="relative flex justify-center">
              <span class="bg-white dark:bg-[#0a0b0e] px-3 text-[11px] text-amber-500 uppercase tracking-wider font-medium">dev mode</span>
            </div>
          </div>
          <button
            class="w-full py-3 px-4 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[14px] font-medium rounded-full hover:bg-amber-500/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            :disabled="devLoading"
            @click="devLogin"
          >
            <UIcon name="i-lucide-zap" class="w-4 h-4" />
            {{ devLoading ? 'Logging in...' : 'Quick Dev Login (auto-admin)' }}
          </button>
        </div>

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
        <span class="text-[12px] text-[#45474D]/40 dark:text-white/30">Protected by secure magic link authentication</span>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

const email = ref('')
const loading = ref(false)
const linkSent = ref(false)
const devLink = ref('')
const devLoading = ref(false)
const errorMsg = ref('')
const isDev = import.meta.dev
const toast = useToast()

const isValidEmail = computed(() => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)
})

async function requestMagicLink() {
  if (!isValidEmail.value) return

  loading.value = true
  errorMsg.value = ''

  try {
    const response = await $fetch('/api/auth/magic-link/request', {
      method: 'POST',
      body: { email: email.value }
    })

    if (response.success) {
      linkSent.value = true
      if (response.devLink) {
        devLink.value = response.devLink
      }
    }
  } catch (error: any) {
    console.error('Failed to request magic link:', error)
    const msg = error.data?.statusMessage || error.message || 'Something went wrong'
    // Show error for service issues (502/503), hide for others (security)
    const status = error.statusCode || error.data?.statusCode
    if (status === 502 || status === 503) {
      errorMsg.value = msg
      toast.add({ title: 'Email service error', description: msg, color: 'error' })
    } else {
      // Still show success to prevent email enumeration
      linkSent.value = true
    }
  } finally {
    loading.value = false
  }
}

async function devLogin() {
  devLoading.value = true
  try {
    await $fetch('/api/auth/dev-login', { credentials: 'include' })
    navigateTo('/agency')
  } catch (error: any) {
    console.error('Dev login failed:', error)
    devLoading.value = false
  }
}
</script>
