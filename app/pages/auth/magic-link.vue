<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <!-- Navigation -->
    <nav class="border-b border-black/10 dark:border-white/10">
      <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <NuxtLink to="/" class="flex items-center gap-2">
          <div class="w-8 h-8 bg-[#13B5EA] rounded flex items-center justify-center text-white font-bold text-sm">X</div>
          <span class="font-semibold text-black dark:text-white">XeroFlow</span>
        </NuxtLink>
      </div>
    </nav>

    <!-- Main Content -->
    <div class="max-w-lg mx-auto px-6 py-12">
      <!-- Debug Panel -->
      <div class="mb-8 p-4 border border-black/20 dark:border-white/15 rounded-lg bg-gray-50 dark:bg-white/[0.03]">
        <div class="flex items-center justify-between mb-2">
          <p class="font-semibold text-sm">Debug Info:</p>
          <button 
            @click="testCookies"
            class="px-3 py-1.5 bg-black dark:bg-white dark:text-[#121317] text-white text-xs rounded hover:bg-black/80 dark:hover:bg-white/90"
          >
            Test API
          </button>
        </div>
        <pre class="text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-60 overflow-y-auto">{{ debugInfo }}</pre>
      </div>

      <!-- Loading State -->
      <div v-if="status === 'verifying'" class="text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 border-2 border-black/10 border-t-[#13B5EA] rounded-full animate-spin mb-6"></div>
        <h1 class="text-2xl font-semibold text-black dark:text-white mb-2">Signing you in...</h1>
        <p class="text-black/60 dark:text-white/50">Verifying your magic link</p>
      </div>

      <!-- Success State -->
      <div v-else-if="status === 'success'" class="text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-[#7DD3A8]/10 dark:bg-emerald-500/10 rounded-full mb-6">
          <UIcon name="i-lucide-check" class="w-8 h-8 text-[#7DD3A8]" />
        </div>
        <h1 class="text-2xl font-semibold text-black dark:text-white mb-2">Welcome back!</h1>
        <p class="text-black/60 dark:text-white/50 mb-6">Login successful!</p>
        
        <div class="flex flex-col gap-3">
          <button
            @click="goToAgency"
            class="w-full py-3 px-4 bg-black dark:bg-white dark:text-[#121317] text-white font-medium rounded hover:bg-black/80 dark:hover:bg-white/90 transition-colors"
          >
            Go to Agency Dashboard
          </button>
        </div>
        
        <p class="mt-4 text-sm text-black/50 dark:text-white/40">
          If you still get redirected, check the debug info above.
        </p>
      </div>

      <!-- Error State -->
      <div v-else-if="status === 'error'" class="text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-[#FF6B6B]/10 dark:bg-red-500/10 rounded-full mb-6">
          <UIcon name="i-lucide-x" class="w-8 h-8 text-[#FF6B6B]" />
        </div>
        <h1 class="text-2xl font-semibold text-black dark:text-white mb-2">Link expired or invalid</h1>
        <p class="text-black/60 dark:text-white/50 mb-4">This magic link has expired or already been used.</p>
        <p v-if="errorMessage" class="text-sm text-[#FF6B6B] mb-6">{{ errorMessage }}</p>
        <NuxtLink
          to="/auth/login"
          class="inline-flex items-center gap-2 px-6 py-3 bg-black dark:bg-white dark:text-[#121317] text-white font-medium rounded hover:bg-black/80 dark:hover:bg-white/90 transition-colors"
        >
          Request New Link
        </NuxtLink>
      </div>

      <!-- No Token State -->
      <div v-else class="text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-[#F4B942]/10 dark:bg-amber-500/10 rounded-full mb-6">
          <UIcon name="i-lucide-alert-triangle" class="w-8 h-8 text-[#F4B942]" />
        </div>
        <h1 class="text-2xl font-semibold text-black dark:text-white mb-2">Invalid Link</h1>
        <p class="text-black/60 dark:text-white/50 mb-8">This link appears to be incomplete.</p>
        <NuxtLink
          to="/"
          class="inline-flex items-center gap-2 px-6 py-3 border border-black dark:border-white text-black dark:text-white font-medium rounded hover:bg-black dark:hover:bg-white hover:text-white dark:hover:text-[#121317] transition-colors"
        >
          Go to Login
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

definePageMeta({
  layout: false,
  public: true
})

const status = ref<'verifying' | 'success' | 'error' | 'no-token'>('no-token')
const debugInfo = ref('Initializing...')
const errorMessage = ref('')
const route = useRoute()

function getCookieInfo() {
  const cookies = document.cookie
  return {
    all: cookies || 'NONE',
    hasAuthToken: cookies.includes('auth_token'),
    hasAuthStatus: cookies.includes('auth_status'),
    hasClientToken: cookies.includes('auth_token_client')
  }
}

function updateDebug(label: string, extra?: any) {
  const info = getCookieInfo()
  const lines = [
    `--- ${label} ---`,
    `Time: ${new Date().toLocaleTimeString()}`,
    `Cookies: ${info.all.substring(0, 200)}${info.all.length > 200 ? '...' : ''}`,
    `Has auth_token: ${info.hasAuthToken}`,
    `Has auth_status: ${info.hasAuthStatus}`,
    `Has auth_token_client: ${info.hasClientToken}`,
  ]
  if (extra) {
    lines.push(`Extra: ${JSON.stringify(extra, null, 2)}`)
  }
  debugInfo.value = lines.join('\n')
}

async function testCookies() {
  try {
    debugInfo.value += '\n\nTesting API...'
    const result = await $fetch('/api/test/cookies', {
      credentials: 'include'
    })
    updateDebug('API Test', result)
  } catch (e: any) {
    debugInfo.value += `\nAPI Error: ${e.message}`
  }
}

function goToAgency() {
  const info = getCookieInfo()
  
  // If we have client token but not httpOnly, set it manually
  if (info.hasClientToken && !info.hasAuthToken) {
    // Get the client token
    const match = document.cookie.match(/auth_token_client=([^;]+)/)
    if (match) {
      // Set as auth_token as well
      document.cookie = `auth_token=${match[1]}; path=/; max-age=${60*60*24*7}`
      debugInfo.value += '\nManually set auth_token from client token'
    }
  }
  
  localStorage.setItem('auth_fallback', 'true')
  window.location.href = '/agency'
}

onMounted(async () => {
  updateDebug('Page Load')
  
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

    updateDebug('After Verify', { success: response.success, user: response.user })

    if (response.success) {
      status.value = 'success'
      
      // Store token from response
      if (response.token) {
        localStorage.setItem('auth_token_backup', response.token)
        localStorage.setItem('auth_fallback', 'true')
        localStorage.setItem('user_id', response.user.id)
      }
      
      // Try to set cookie manually if missing
      setTimeout(() => {
        const info = getCookieInfo()
        if (!info.hasAuthToken && response.token) {
          document.cookie = `auth_token=${response.token}; path=/; max-age=${60*60*24*7}`
          updateDebug('Manual Cookie Set')
        }
      }, 100)
    } else {
      status.value = 'error'
      errorMessage.value = 'Verification failed'
    }
  } catch (error: any) {
    console.error('[Magic Link] Error:', error)
    status.value = 'error'
    errorMessage.value = error.message || 'Unknown error'
    updateDebug('Error', { message: error.message })
  }
})
</script>
