<template>
  <div class="min-h-screen bg-white">
    <!-- Navigation -->
    <nav class="border-b border-black/10">
      <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <NuxtLink to="/login" class="flex items-center gap-2">
          <div class="w-8 h-8 bg-[#13B5EA] rounded flex items-center justify-center text-white font-bold text-sm">X</div>
          <span class="font-semibold text-black">XeroFlow</span>
        </NuxtLink>
        <NuxtLink to="/login" class="flex items-center gap-2 text-sm text-black/60 hover:text-black transition-colors">
          <UIcon name="i-lucide-arrow-left" class="w-4 h-4" />
          Back to options
        </NuxtLink>
      </div>
    </nav>

    <!-- Main Content -->
    <div class="max-w-md mx-auto px-6 py-16">
      <!-- Header -->
      <div class="text-center mb-10">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-[#13B5EA]/10 rounded-lg mb-6">
          <UIcon name="i-lucide-calculator" class="w-8 h-8 text-[#13B5EA]" />
        </div>
        <h1 class="text-2xl font-semibold text-black mb-2">
          Sign in to XeroFlow
        </h1>
        <p class="text-black/60">
          Access your Xero implementations and client dashboards
        </p>
      </div>

      <!-- Sign In Card -->
      <div class="border border-black/20 rounded-lg overflow-hidden" v-if="!linkSent">
        <div class="h-1 bg-[#13B5EA]"></div>
        <div class="p-8">
          <!-- Xero OAuth -->
          <button
            class="w-full py-3 px-4 bg-[#13B5EA] text-white font-medium rounded flex items-center justify-center gap-3 hover:bg-[#0E8BBA] transition-colors mb-6"
            :disabled="connecting"
            @click="connectXero"
          >
            <UIcon name="i-simple-icons-xero" class="w-5 h-5" />
            {{ connecting ? 'Connecting...' : 'Sign in with Xero' }}
          </button>

          <div class="relative mb-6">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-black/10"></div>
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="px-2 bg-white text-black/40">or</span>
            </div>
          </div>

          <!-- Magic Link Form -->
          <form @submit.prevent="requestMagicLink">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-black mb-2">Email Address</label>
                <input
                  v-model="email"
                  type="email"
                  placeholder="you@accountingfirm.com"
                  class="w-full px-4 py-3 border border-black/20 rounded-lg focus:outline-none focus:border-[#13B5EA] transition-colors text-black placeholder:text-black/40"
                  :disabled="loading"
                />
              </div>

              <button
                type="submit"
                class="w-full py-3 px-4 border border-black text-black font-medium rounded hover:bg-black hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="loading || !isValidEmail"
              >
                {{ loading ? 'Sending...' : 'Send Magic Link' }}
              </button>
            </div>
          </form>

          <p class="mt-6 text-center text-sm text-black/50">
            We'll send you a secure link to sign in instantly
          </p>
        </div>
      </div>

      <!-- Link Sent State -->
      <div class="border border-black/20 rounded-lg overflow-hidden" v-else>
        <div class="h-1 bg-[#7DD3A8]"></div>
        <div class="p-8 text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 bg-[#7DD3A8]/10 rounded-full mb-6">
            <UIcon name="i-lucide-mail-check" class="w-8 h-8 text-[#7DD3A8]" />
          </div>
          <h2 class="text-xl font-semibold text-black mb-2">Check your email</h2>
          <p class="text-black/60 mb-6">
            We've sent a magic link to <strong class="text-black">{{ email }}</strong>. Click the link to sign in instantly.
          </p>

          <!-- Dev Mode Link -->
          <div v-if="devLink" class="mb-6 p-4 bg-[#F5F5F5] rounded-lg text-left">
            <p class="text-xs text-black/50 mb-2">Development mode:</p>
            <a :href="devLink" class="text-sm text-[#13B5EA] hover:underline break-all">{{ devLink }}</a>
          </div>

          <div class="flex flex-col gap-3">
            <button
              class="py-2.5 px-4 border border-black/20 text-black font-medium rounded hover:bg-black/5 transition-colors"
              @click="linkSent = false"
            >
              Use a different email
            </button>
            <button
              class="py-2.5 px-4 text-sm text-black/60 hover:text-black transition-colors"
              :disabled="loading"
              @click="requestMagicLink"
            >
              Resend magic link
            </button>
          </div>
        </div>
      </div>

      <!-- Help -->
      <div class="mt-8 text-center">
        <p class="text-sm text-black/50">
          Need help? <a href="#" class="text-[#13B5EA] hover:underline">Contact support</a>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <footer class="border-t border-black/10 mt-auto">
      <div class="max-w-6xl mx-auto px-6 py-6">
        <div class="flex flex-col md:flex-row items-center justify-center gap-4 text-sm text-black/40">
          <span>Secure magic link authentication</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

// Page meta
definePageMeta({
  layout: false,
  public: true
})

// State
const email = ref('')
const loading = ref(false)
const connecting = ref(false)
const linkSent = ref(false)
const devLink = ref('')

// Route
const route = useRoute()

// Computed
const isValidEmail = computed(() => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)
})

// Methods
async function connectXero() {
  connecting.value = true
  try {
    const redirect = route.query.redirect as string || '/dashboard'
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
    const response = await $fetch('/api/auth/magic-link/request', {
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
