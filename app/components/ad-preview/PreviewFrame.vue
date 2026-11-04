<script setup lang="ts">
defineProps<{
  type: 'phone' | 'desktop'
  label?: string
  insetChrome?: boolean
}>()
</script>

<template>
  <!-- Phone Frame -->
  <div v-if="type === 'phone'" class="inline-flex flex-col items-center">
    <div v-if="label" class="text-xs text-[#888] mb-2 font-medium">
      {{ label }}
    </div>
    <!-- Contextual phone: hardware occupies its own space around the creative. -->
    <div v-if="insetChrome" data-testid="contextual-phone" class="relative w-[280px] rounded-[38px] border border-[#45454b] bg-[#1a1a1e] p-[7px] shadow-2xl">
      <div class="absolute -left-[3px] top-24 h-8 w-0.5 rounded-l bg-[#45454b]" aria-hidden="true" />
      <div class="absolute -right-[3px] top-28 h-12 w-0.5 rounded-r bg-[#45454b]" aria-hidden="true" />
      <div class="overflow-hidden rounded-[31px] bg-[#111114] text-white">
        <div data-testid="phone-status" class="relative flex h-7 items-center justify-between px-5 text-[8px] font-semibold" aria-hidden="true">
          <span>9:41</span>
          <div class="absolute left-1/2 top-1.5 h-4 w-[72px] -translate-x-1/2 rounded-full bg-black" />
          <div class="flex items-center gap-1">
            <UIcon name="i-lucide-signal" class="size-2.5" />
            <UIcon name="i-lucide-wifi" class="size-2.5" />
            <UIcon name="i-lucide-battery-full" class="size-3" />
          </div>
        </div>
        <slot />
        <div data-testid="phone-home" class="flex h-4 items-center justify-center" aria-hidden="true">
          <div class="h-0.5 w-20 rounded-full bg-white/70" />
        </div>
      </div>
    </div>
    <div v-else class="relative bg-[#1a1a1e] rounded-[2.5rem] p-2 shadow-2xl border border-[#3a3a3f]" style="width: 280px;">
      <!-- Notch -->
      <div class="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-[#1a1a1e] rounded-b-2xl z-10 flex items-center justify-center">
        <div class="w-12 h-3 bg-[#0a0a0c] rounded-full" />
      </div>
      <!-- Status bar -->
      <div class="absolute top-2 left-8 right-8 h-5 flex items-center justify-between text-[9px] text-[#999] z-10 px-1">
        <span>9:41</span>
        <div class="flex items-center gap-1">
          <UIcon name="i-lucide-signal" class="w-2.5 h-2.5" />
          <UIcon name="i-lucide-wifi" class="w-2.5 h-2.5" />
          <UIcon name="i-lucide-battery-full" class="w-2.5 h-2.5" />
        </div>
      </div>
      <!-- Screen content -->
      <div class="rounded-[2rem] overflow-hidden bg-black" style="aspect-ratio: 9/16;">
        <slot />
      </div>
      <!-- Home indicator -->
      <div class="mt-1.5 mx-auto w-28 h-1 bg-[#555] rounded-full" />
    </div>
  </div>

  <!-- Desktop Frame -->
  <div v-else class="inline-flex flex-col items-center">
    <div v-if="label" class="text-xs text-[#888] mb-2 font-medium">
      {{ label }}
    </div>
    <div class="bg-[#1a1a1e] rounded-lg shadow-2xl border border-[#3a3a3f] overflow-hidden" style="width: 420px;">
      <!-- Browser chrome -->
      <div class="h-8 bg-[#2a2a2e] flex items-center px-3 gap-2 border-b border-[#3a3a3f]">
        <div class="flex gap-1.5">
          <div class="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <div class="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <div class="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div class="flex-1 h-5 bg-[#1a1a1e] rounded text-[9px] text-[#666] flex items-center px-2">
          <UIcon name="i-lucide-lock" class="w-2.5 h-2.5 mr-1" />
          example.com
        </div>
      </div>
      <!-- Content -->
      <div class="bg-[#0a0a0c]">
        <slot />
      </div>
    </div>
  </div>
</template>
