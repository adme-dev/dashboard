<template>
  <div class="min-h-screen overflow-x-hidden bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <main>
      <MarketingAiAssistantsHero />
      <MarketingAiAssistantSpecialists />
      <MarketingAiAssistantGovernance />

      <section class="px-6 py-10 md:py-16">
        <div class="mx-auto max-w-[1200px] overflow-hidden rounded-[2rem] bg-[#0a0b0e] px-6 py-20 text-center md:py-28">
          <p class="mb-4 text-[13px] font-medium uppercase tracking-[0.16em] text-amber-300">
            Start with governed assistance
          </p>
          <h2 class="mx-auto max-w-[720px] text-[clamp(30px,5vw,52px)] font-[450] leading-[1.08] tracking-[-0.03em] text-white">
            Give every person more capacity without giving AI unchecked authority
          </h2>
          <p class="mx-auto mt-5 max-w-[560px] text-[16px] leading-relaxed text-white/50 md:text-[18px]">
            Ask, analyse and draft across the work your agency already runs in XeroFlow. People review the result and stay responsible for every consequential action.
          </p>
          <div class="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <NuxtLink
              to="/auth/login"
              class="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-[15px] font-medium text-[#121317] transition-colors hover:bg-white/90"
            >
              Sign in to XeroFlow
              <UIcon name="i-lucide-arrow-right" class="size-4" />
            </NuxtLink>
            <NuxtLink
              to="/platform/ai"
              class="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-7 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-white/[0.09]"
            >
              Explore the full AI platform
            </NuxtLink>
            <NuxtLink
              to="/features/ai-connectors"
              class="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-7 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-white/[0.09]"
            >
              Connect your AI tools
            </NuxtLink>
          </div>
        </div>
      </section>
    </main>

    <MarketingFooter />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

useSeoMeta({
  title: 'AI Assistants for Agencies — XeroFlow',
  description: 'Give every person a governed AI assistant and every department focused specialist support for paid media, publishing, finance and operations — grounded in live XeroFlow context.',
  ogTitle: 'AI Assistants for Every Person and Department — XeroFlow',
  ogDescription: 'Personal assistance, department specialists, live agency context and human-controlled actions in one governed platform.',
  ogType: 'website',
  ogUrl: 'https://xeroflow.io/ai-assistants',
  twitterCard: 'summary_large_image'
})

useHead({
  link: [
    { rel: 'canonical', href: 'https://xeroflow.io/ai-assistants' }
  ]
})
</script>
