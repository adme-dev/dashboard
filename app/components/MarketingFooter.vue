<template>
  <footer class="pt-20 pb-10">
    <div class="max-w-[1200px] mx-auto px-6">
      <!-- Top row: brand name + link columns -->
      <div class="flex flex-col md:flex-row gap-12 md:gap-0 md:justify-between mb-20">
        <div>
          <h3
            class="text-[clamp(22px,3vw,32px)] font-[450] tracking-[-0.02em]"
            :class="dark ? 'text-white' : 'text-[#121317] dark:text-white'"
          >
            Experience XeroFlow
          </h3>
        </div>
        <div class="flex gap-20 md:gap-28">
          <div class="flex flex-col gap-3.5 text-[15px]">
            <NuxtLink to="/landing" :class="linkClass">Home</NuxtLink>
            <NuxtLink to="/features" :class="linkClass">Features</NuxtLink>
            <NuxtLink to="/pricing" :class="linkClass">Pricing</NuxtLink>
            <NuxtLink to="/resources" :class="linkClass">Resources</NuxtLink>
          </div>
          <div class="flex flex-col gap-3.5 text-[15px]">
            <NuxtLink to="/auth/login" :class="linkClass">Sign In</NuxtLink>
            <NuxtLink to="/portal/login" :class="linkClass">Client Portal</NuxtLink>
            <NuxtLink to="/privacy" :class="linkClass">Privacy</NuxtLink>
            <NuxtLink to="/terms" :class="linkClass">Terms</NuxtLink>
            <NuxtLink to="/support" :class="linkClass">Support</NuxtLink>
          </div>
        </div>
      </div>

      <!-- Giant wordmark -->
      <div class="overflow-hidden mb-10">
        <div
          class="text-[clamp(80px,18vw,220px)] font-[450] leading-[0.9] tracking-[-0.04em] select-none"
          :class="dark ? 'text-white' : 'text-[#121317] dark:text-white'"
        >
          XeroFlow
        </div>
      </div>

      <!-- Bottom bar -->
      <div
        class="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4"
        :class="dark ? 'border-t border-white/[0.06]' : 'border-t border-black/[0.06] dark:border-white/[0.06]'"
      >
        <div class="flex items-center gap-2.5">
          <div
            class="w-5 h-5 rounded flex items-center justify-center"
            :class="dark ? 'bg-white' : 'bg-[#121317] dark:bg-white'"
          >
            <span
              class="text-[8px] font-semibold"
              :class="dark ? 'text-[#0a0a0a]' : 'text-white dark:text-[#121317]'"
            >XF</span>
          </div>
          <span
            class="text-[13px]"
            :class="dark ? 'text-white/60' : 'text-[#45474D] dark:text-white/60'"
          >ADME Digital</span>
        </div>
        <div
          class="flex items-center gap-6 text-[13px]"
          :class="dark ? 'text-white/40' : 'text-[#45474D]/60 dark:text-white/40'"
        >
          <NuxtLink to="/about" :class="bottomLinkClass">About</NuxtLink>
          <NuxtLink to="/privacy" :class="bottomLinkClass">Privacy</NuxtLink>
          <NuxtLink to="/terms" :class="bottomLinkClass">Terms</NuxtLink>
          <span>&copy; {{ new Date().getFullYear() }}</span>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
const props = defineProps<{
  /** Force always-dark styling (for pages with dark backgrounds like landing/ai-training) */
  dark?: boolean
}>()

const linkClass = computed(() =>
  props.dark
    ? 'text-white/50 hover:text-white transition-colors'
    : 'text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors'
)

const bottomLinkClass = computed(() =>
  props.dark
    ? 'hover:text-white transition-colors'
    : 'hover:text-[#45474D] dark:hover:text-white transition-colors'
)
</script>
