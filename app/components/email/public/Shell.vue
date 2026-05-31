<script setup lang="ts">
// Shared chrome for the public (unauthenticated) email-marketing pages —
// unsubscribe / subscribe / confirm. Always-dark per the marketing-page rules
// (bg-[#0a0b0e], white text, no dark: variants needed). Editorial-minimal:
// mono eyebrow, masked grid texture, a soft accent glow, centered narrow column.
defineProps<{ eyebrow?: string }>()
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0b0e] px-5 py-16 text-white">
    <!-- accent glow -->
    <div
      class="pointer-events-none absolute inset-0"
      style="background: radial-gradient(58% 48% at 50% -4%, rgba(16,185,129,0.13), transparent 68%);"
    />
    <!-- masked grid texture -->
    <div
      class="pointer-events-none absolute inset-0 opacity-[0.05]"
      style="
        background-image:
          linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px);
        background-size: 56px 56px;
        -webkit-mask-image: radial-gradient(68% 56% at 50% 26%, black, transparent 76%);
        mask-image: radial-gradient(68% 56% at 50% 26%, black, transparent 76%);
      "
    />

    <div class="relative w-full max-w-md">
      <!-- wordmark -->
      <div class="mb-7 flex items-center gap-2.5">
        <span class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-[13px] font-black text-[#0a0b0e]">X</span>
        <span class="text-[13px] font-semibold tracking-tight text-white/90">XeroFlow</span>
      </div>

      <p
        v-if="eyebrow"
        class="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-emerald-400/70"
      >
        {{ eyebrow }}
      </p>

      <div class="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-7 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.85)] backdrop-blur-sm sm:p-8">
        <slot />
      </div>

      <p class="mt-6 text-center text-[12px] text-white/30">
        XeroFlow Agency · Email preferences
      </p>
    </div>
  </div>
</template>
