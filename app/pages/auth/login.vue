<template>
  <div class="min-h-screen bg-white">
    <!-- Navigation -->
    <nav class="border-b border-black/10">
      <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <NuxtLink to="/login" class="flex items-center gap-2">
          <div class="w-8 h-8 bg-black rounded flex items-center justify-center text-white font-bold text-sm">A</div>
          <span class="font-semibold text-black">Agency Operations</span>
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
        <div class="inline-flex items-center justify-center w-16 h-16 bg-black/5 rounded-lg mb-6">
          <UIcon name="i-lucide-kanban" class="w-8 h-8 text-black" />
        </div>
        <h1 class="text-2xl font-semibold text-black mb-2">
          Sign in to Agency
        </h1>
        <p class="text-black/60">
          Access your projects, tasks, and team workflows
        </p>
      </div>

      <!-- Sign In Card -->
      <div class="border border-black/20 rounded-lg overflow-hidden" v-if="!linkSent">
        <div class="h-1 bg-black"></div>
        <div class="p-8">
          <form @submit.prevent="requestMagicLink">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-black mb-2">Email Address</label>
                <input
                  v-model="email"
                  type="email"
                  placeholder="you@company.com"
                  class="w-full px-4 py-3 border border-black/20 rounded-lg focus:outline-none focus:border-black transition-colors text-black placeholder:text-black/40"
                  :disabled="loading"
                  autofocus
                />
              </div>

              <button
                type="submit"
                class="w-full py-3 px-4 bg-black text-white font-medium rounded hover:bg-black/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="loading || !isValidEmail"
              >
                {{ loading ? 'Sending...' : 'Send Magic Link' }}
              </button>
            </div>
          </form>

          <p class="mt-6 text-center text-sm text-black/50">
            We'll send you a secure link to sign in instantly. No password needed.
          </p>

          <!-- Dev Mode Notice -->
          <div v-if="devLink" class="mt-6 p-4 bg-[#F5F5F5] rounded-lg">
            <p class="text-xs text-black/50 mb-2">Development mode:</p>
            <a :href="devLink" class="text-sm text-black hover:underline break-all">{{ devLink }}</a>
          </div>
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
            <a :href="devLink" class="text-sm text-black hover:underline break-all">{{ devLink }}</a>
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
          Need help? <a href="#" class="text-black hover:underline font-medium">Contact support</a>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <footer class="border-t border-black/10 mt-auto">
      <div class="max-w-6xl mx-auto px-6 py-6">
        <div class="flex flex-col md:flex-row items-center justify-center gap-4 text-sm text-black/40">
          <span>Protected by secure magic link authentication</span>
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
const linkSent = ref(false)
const devLink = ref('')

// Computed
const isValidEmail = computed(() => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)
})

// Methods
async function requestMagicLink() {
  if (!isValidEmail.value) return

  loading.value = true

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
    // Still show success to prevent email enumeration
    linkSent.value = true
  } finally {
    loading.value = false
  }
}
</script>
