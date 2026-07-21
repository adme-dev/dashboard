<template>
  <section class="relative overflow-hidden bg-[#0a0b0e] px-6 pb-20 pt-[116px] md:pb-28 md:pt-[140px]">
    <MarketingHeroBackground theme="ai" />
    <div class="relative mx-auto grid max-w-[1200px] items-center gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-20">
      <div>
        <div class="mb-7 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3.5 py-1.5">
          <span class="size-1.5 rounded-full bg-amber-300" />
          <span class="text-[13px] font-medium text-amber-200">Governed AI assistants</span>
        </div>
        <h1 class="max-w-[680px] text-[clamp(40px,6vw,70px)] font-[450] leading-[1.03] tracking-[-0.04em] text-white">
          AI assistants for every person. Specialists for every department.
        </h1>
        <p class="mt-6 max-w-[600px] text-[17px] leading-relaxed text-white/55 md:text-[19px]">
          One assistant adapts to each person’s role, permissions and departments. Focused specialists bring deeper context to paid media, publishing, finance and operational decisions.
        </p>
        <div class="mt-9 flex flex-col gap-3 sm:flex-row">
          <a
            href="#specialists"
            class="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] font-medium text-[#121317] transition-colors hover:bg-white/90"
          >
            Meet the specialists
            <UIcon name="i-lucide-arrow-down" class="size-4" />
          </a>
          <a
            href="#governance"
            class="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-white/[0.09]"
          >
            See the guardrails
          </a>
        </div>
      </div>

      <figure class="relative" aria-labelledby="assistant-preview-caption">
        <div class="absolute -inset-10 rounded-full bg-amber-300/[0.08] blur-3xl" />
        <div class="relative overflow-hidden rounded-[28px] border border-white/[0.1] bg-[#111319]/95 p-4 shadow-[0_30px_100px_-40px_rgba(0,0,0,0.9)] sm:p-5">
          <div class="flex items-center border-b border-white/[0.07] pb-4">
            <span class="flex size-10 items-center justify-center rounded-xl bg-amber-300/10">
              <UIcon name="i-lucide-sparkles" class="size-5 text-amber-200" />
            </span>
            <div class="ml-3">
              <p class="text-[13px] font-medium text-white">
                Your assistant
              </p>
              <p class="text-[11px] text-white/35">
                Composed for your role and access
              </p>
            </div>
            <span class="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300">
              <span class="size-1.5 rounded-full bg-emerald-300" />
              Ready
            </span>
          </div>

          <div class="py-5">
            <div class="ml-auto max-w-[82%] rounded-2xl rounded-tr-sm bg-white/[0.08] px-4 py-3 text-[12px] leading-relaxed text-white/75">
              Which client accounts need attention before tomorrow’s stand-up?
            </div>
            <div class="mt-3 max-w-[92%] rounded-2xl rounded-tl-sm border border-amber-300/10 bg-amber-300/[0.05] px-4 py-3">
              <p class="text-[12px] leading-relaxed text-white/70">
                Three accounts need review. I checked spend pacing, publishing commitments and finance signals within your allowed clients.
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <span
                  v-for="assistant in activeAssistants"
                  :key="assistant.label"
                  class="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[10px] text-white/55"
                >
                  <UIcon :name="assistant.icon" class="size-3 text-amber-200" />
                  {{ assistant.label }}
                </span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2 border-t border-white/[0.07] pt-4 text-center">
            <div v-for="signal in trustSignals" :key="signal.label" class="rounded-xl bg-white/[0.035] px-2 py-3">
              <UIcon :name="signal.icon" class="mx-auto size-4 text-white/45" />
              <p class="mt-1.5 text-[10px] text-white/40">
                {{ signal.label }}
              </p>
            </div>
          </div>
        </div>
        <figcaption id="assistant-preview-caption" class="sr-only">
          A personal XeroFlow assistant consulting permission-scoped department specialists.
        </figcaption>
      </figure>
    </div>
  </section>
</template>

<script setup lang="ts">
const activeAssistants = [
  { label: 'Spend', icon: 'i-lucide-gauge' },
  { label: 'Publishing', icon: 'i-lucide-calendar-days' },
  { label: 'Finance', icon: 'i-lucide-landmark' },
  { label: 'Traffic', icon: 'i-lucide-route' }
]

const trustSignals = [
  { label: 'Live context', icon: 'i-lucide-database' },
  { label: 'Role scoped', icon: 'i-lucide-shield-check' },
  { label: 'Auditable', icon: 'i-lucide-clipboard-check' }
]
</script>
