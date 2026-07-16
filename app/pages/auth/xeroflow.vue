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
          <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#13B5EA]/10 mb-6">
            <UIcon name="i-lucide-calculator" class="w-7 h-7 text-[#13B5EA]" />
          </div>
          <h1 class="text-[28px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-2">
            Sign in to XeroFlow
          </h1>
          <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
            Access your Xero implementations and client dashboards
          </p>
        </div>

        <!-- Xero OAuth Button -->
        <div v-if="!linkSent">
          <button
            class="w-full py-3 px-4 bg-[#13B5EA] text-white text-[15px] font-medium rounded-full hover:bg-[#0E8BBA] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
            :disabled="connecting"
            @click="connectXero"
          >
            <svg v-if="connecting" class="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {{ connecting ? 'Connecting...' : 'Sign in with Xero' }}
          </button>

          <!-- Divider -->
          <div class="relative my-8">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-[#121317]/[0.06] dark:border-white/[0.06]" />
            </div>
            <div class="relative flex justify-center">
              <span class="bg-white dark:bg-[#0a0b0e] px-4 text-[12px] text-[#45474D]/50 dark:text-white/30 uppercase tracking-wider">or use email</span>
            </div>
          </div>

          <!-- Auth error (e.g. Sign in with Xero didn't match a team member) -->
          <div
            v-if="authError"
            class="mb-6 p-4 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10"
          >
            <p class="text-[13px] text-red-700 dark:text-red-400 leading-relaxed">{{ authError }}</p>
          </div>

          <!-- Magic Link Form -->
          <form @submit.prevent="requestMagicLink" class="space-y-4">
            <div>
              <label class="block text-[13px] font-medium text-[#121317] dark:text-white mb-2">Email address</label>
              <input
                v-model="email"
                type="email"
                placeholder="you@accountingfirm.com"
                class="w-full px-4 py-3 rounded-xl border border-[#121317]/10 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[15px] text-[#121317] dark:text-white placeholder:text-[#45474D]/50 dark:placeholder:text-white/30 focus:outline-none focus:border-[#121317]/30 dark:focus:border-white/20 focus:ring-2 focus:ring-[#121317]/5 dark:focus:ring-white/10 transition-all"
                :disabled="loading"
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

          <p class="mt-6 text-center text-[13px] text-[#45474D]/70 dark:text-white/40">
            We'll send you a secure link to sign in instantly.
          </p>
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
            <a :href="devLink" class="text-[13px] text-[#13B5EA] hover:underline break-all">{{ devLink }}</a>
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
        <div class="relative my-8" v-if="!linkSent">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-[#121317]/[0.06] dark:border-white/[0.06]" />
          </div>
        </div>

        <!-- Agency Operations Link -->
        <NuxtLink
          v-if="!linkSent"
          to="/auth/login"
          class="flex items-center justify-between w-full px-5 py-3.5 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#b7bfd9]/[0.03] dark:hover:bg-white/[0.02] transition-all group"
        >
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-[#b7bfd9]/[0.09] dark:bg-white/[0.06] flex items-center justify-center">
              <UIcon name="i-lucide-kanban" class="w-4.5 h-4.5 text-[#45474D] dark:text-white/60" />
            </div>
            <div class="text-left">
              <div class="text-[14px] font-medium text-[#121317] dark:text-white">Agency Operations</div>
              <div class="text-[12px] text-[#45474D]/70 dark:text-white/40">Project management & workflows</div>
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
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown }
) => Promise<T>

const email = ref('')
const loading = ref(false)
const connecting = ref(false)
const linkSent = ref(false)
const devLink = ref('')

const isValidEmail = computed(() => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)
})

const authError = computed(() => {
  if (route.query.error === 'xero-not-recognised') {
    return "That Xero account isn't linked to a XeroFlow team member. Sign in with a magic link below, or ask an admin to add your email."
  }
  return null
})

async function connectXero() {
  connecting.value = true
  try {
    const redirect = route.query.redirect as string || '/xeroflow'
    window.location.href = `/api/xero/login?redirect=${encodeURIComponent(redirect)}`
  } catch (error) {
    console.error('Xero connection failed:', error)
    connecting.value = false
  }
}

async function requestMagicLink() {
  if (!isValidEmail.value) return

  loading.value = true

  try {
    const response = await apiFetch<{ success: boolean; devLink?: string }>('/api/auth/magic-link/request', {
      method: 'POST',
      body: {
        email: email.value,
        system: 'xeroflow'
      }
    })

    if (response.success) {
      linkSent.value = true
      if (response.devLink) {
        devLink.value = response.devLink
      }
    }
  } catch (error: any) {
    console.error('Failed to request magic link:', error)
    linkSent.value = true
  } finally {
    loading.value = false
  }
}
</script>
