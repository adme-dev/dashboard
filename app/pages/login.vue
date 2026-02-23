<template>
  <div class="min-h-screen bg-white">
    <!-- Navigation -->
    <nav class="border-b border-black/10">
      <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 bg-[#13B5EA] rounded flex items-center justify-center text-white font-bold text-sm">X</div>
          <span class="font-semibold text-black">XeroFlow</span>
        </div>
        <div class="flex items-center gap-3">
          <NuxtLink to="/auth/login" class="px-4 py-2 text-sm font-medium text-black/70 hover:text-black transition-colors">
            Sign In
          </NuxtLink>
          <button class="px-4 py-2 bg-[#13B5EA] text-white text-sm font-medium rounded hover:bg-[#0E8BBA] transition-colors">
            Get Started
          </button>
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <div class="max-w-6xl mx-auto px-6 py-24">
      <div class="max-w-2xl mx-auto text-center mb-16">
        <h1 class="text-4xl md:text-5xl font-normal text-black mb-4">
          Welcome back
        </h1>
        <p class="text-lg text-black/60">
          Choose your workspace to continue
        </p>
      </div>

      <!-- Login Options Grid -->
      <div class="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        <!-- XeroFlow Option -->
        <div 
          class="group border border-black/20 rounded-lg overflow-hidden cursor-pointer hover:border-[#13B5EA] transition-all duration-300"
          @click="selectSystem('xeroflow')"
        >
          <div class="h-2 bg-[#13B5EA]"></div>
          <div class="p-8">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-12 h-12 bg-[#13B5EA]/10 rounded flex items-center justify-center">
                <UIcon name="i-lucide-calculator" class="w-6 h-6 text-[#13B5EA]" />
              </div>
              <div>
                <h2 class="text-xl font-semibold text-black">XeroFlow</h2>
                <p class="text-sm text-black/50">Accounting & Bookkeeping</p>
              </div>
            </div>
            <p class="text-black/60 mb-6 text-sm leading-relaxed">
              For accountants and bookkeepers managing Xero implementations and client onboarding.
            </p>
            <div class="flex flex-wrap gap-2 mb-6">
              <span class="px-2 py-1 bg-black/5 text-black/60 text-xs rounded">Accountants</span>
              <span class="px-2 py-1 bg-black/5 text-black/60 text-xs rounded">Bookkeepers</span>
              <span class="px-2 py-1 bg-black/5 text-black/60 text-xs rounded">Advisors</span>
            </div>
            <button class="w-full py-3 border border-black text-black font-medium rounded hover:bg-black hover:text-white transition-colors flex items-center justify-center gap-2">
              Continue
              <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Agency Option -->
        <div 
          class="group border border-black/20 rounded-lg overflow-hidden cursor-pointer hover:border-black transition-all duration-300"
          @click="selectSystem('agency')"
        >
          <div class="h-2 bg-black"></div>
          <div class="p-8">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-12 h-12 bg-black/5 rounded flex items-center justify-center">
                <UIcon name="i-lucide-kanban" class="w-6 h-6 text-black" />
              </div>
              <div>
                <h2 class="text-xl font-semibold text-black">Agency Operations</h2>
                <p class="text-sm text-black/50">Project Management</p>
              </div>
            </div>
            <p class="text-black/60 mb-6 text-sm leading-relaxed">
              For agency teams managing projects, tasks, workflows, and client deliverables.
            </p>
            <div class="flex flex-wrap gap-2 mb-6">
              <span class="px-2 py-1 bg-black/5 text-black/60 text-xs rounded">Project Managers</span>
              <span class="px-2 py-1 bg-black/5 text-black/60 text-xs rounded">Teams</span>
              <span class="px-2 py-1 bg-black/5 text-black/60 text-xs rounded">Admins</span>
            </div>
            <button class="w-full py-3 border border-black text-black font-medium rounded hover:bg-black hover:text-white transition-colors flex items-center justify-center gap-2">
              Continue
              <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <!-- Help Section -->
      <div class="mt-16 text-center">
        <div class="inline-flex items-center gap-2 px-4 py-3 border border-black/20 rounded-lg">
          <UIcon name="i-lucide-help-circle" class="w-5 h-5 text-black/40" />
          <span class="text-sm text-black/60">
            Not sure which one? <a href="#" class="text-[#13B5EA] hover:underline font-medium">Contact support</a>
          </span>
        </div>
      </div>

      <!-- Session Expired Alert -->
      <div v-if="sessionExpired" class="mt-8 max-w-md mx-auto">
        <div class="flex items-start gap-3 p-4 border border-black/20 rounded-lg bg-[#FFF8F5]">
          <UIcon name="i-lucide-alert-triangle" class="w-5 h-5 text-[#FF4D00] flex-shrink-0 mt-0.5" />
          <div>
            <h3 class="font-medium text-black mb-1">Session Expired</h3>
            <p class="text-sm text-black/60">Your session has expired. Please sign in again to continue.</p>
          </div>
        </div>
      </div>

      <!-- Redirect Info -->
      <div v-if="redirectPath && redirectPath !== '/'" class="mt-6 text-center">
        <span class="inline-block px-3 py-1.5 bg-black/5 text-black/50 text-xs rounded">
          Redirecting to {{ redirectPath }} after login
        </span>
      </div>
    </div>

    <!-- Footer -->
    <footer class="border-t border-black/10 mt-24">
      <div class="max-w-6xl mx-auto px-6 py-8">
        <div class="flex flex-col md:flex-row items-center justify-between gap-4">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 bg-[#13B5EA] rounded flex items-center justify-center text-white font-bold text-xs">X</div>
            <span class="text-sm font-medium text-black/60">XeroFlow</span>
          </div>
          <div class="flex items-center gap-6">
            <a href="#" class="text-sm text-black/40 hover:text-black/60 transition-colors">Privacy</a>
            <a href="#" class="text-sm text-black/40 hover:text-black/60 transition-colors">Terms</a>
            <a href="#" class="text-sm text-black/40 hover:text-black/60 transition-colors">Support</a>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

// Page meta - public route
definePageMeta({
  layout: false,
  public: true
})

// Route
const route = useRoute()

// Computed
const sessionExpired = computed(() => route.query.expired === 'true')
const redirectPath = computed(() => route.query.redirect as string || '/')

// Methods
function selectSystem(system: 'xeroflow' | 'agency') {
  if (system === 'xeroflow') {
    navigateTo({
      path: '/auth/xeroflow',
      query: { 
        redirect: redirectPath.value !== '/' ? redirectPath.value : '/dashboard',
        system: 'xeroflow'
      }
    })
  } else {
    navigateTo({
      path: '/auth/login',
      query: { 
        redirect: redirectPath.value !== '/' ? redirectPath.value : '/agency',
        system: 'agency'
      }
    })
  }
}
</script>
