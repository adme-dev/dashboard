<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav />

    <!-- Hero -->
    <section class="relative bg-[#0a0b0e] pt-[52px]">
      <MarketingHeroBackground theme="about" />
      <div class="relative max-w-[1200px] mx-auto px-6 pt-32 md:pt-44 pb-16 md:pb-24 text-center">
        <h1 class="text-[clamp(36px,6vw,56px)] font-[450] text-white leading-[1.1] tracking-[-0.03em] mb-6 max-w-[700px] mx-auto">
          Built for agencies<br class="hidden sm:block">that move fast
        </h1>
        <p class="text-lg md:text-xl text-white/50 max-w-[560px] mx-auto leading-relaxed">
          XeroFlow is the operations platform for digital marketing agencies who want everything in one place.
        </p>
      </div>
    </section>

    <!-- Story -->
    <section class="pb-20 md:pb-32">
      <div class="max-w-[720px] mx-auto px-6">
        <div class="flex flex-col gap-12">
          <div>
            <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-6">Our Story</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              XeroFlow was born from the daily reality of running a digital marketing agency. Too many tools, too many tabs, too many things slipping through the cracks. We needed a single platform that handled project management, client communication, financial operations, and reporting — without the complexity of enterprise software.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              So we built it. XeroFlow brings together work management, Xero-integrated invoicing, real-time team chat, ad spend tracking, AI insights, and a client portal — all designed for how agencies actually work.
            </p>
          </div>

          <div>
            <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-6">What We Believe</h2>
            <div class="grid sm:grid-cols-2 gap-6">
              <div v-for="belief in beliefs" :key="belief.title" class="flex flex-col gap-2">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-xl flex items-center justify-center" :class="belief.bg">
                    <UIcon :name="belief.icon" class="w-4.5 h-4.5" :class="belief.color" />
                  </div>
                  <h3 class="text-[16px] font-medium text-[#121317] dark:text-white">{{ belief.title }}</h3>
                </div>
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">{{ belief.description }}</p>
              </div>
            </div>
          </div>

          <div>
            <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-6">Built With Purpose</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              XeroFlow wasn't born in a lab. It was built from a decade of real client work — late-night campaign launches, messy spreadsheets that should have been dashboards, and the hard-won instinct for what actually matters when you're managing a dozen accounts at once.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Every feature comes from experience, not speculation. We've worked with brands across retail, property, hospitality, health, and professional services — in Australia and internationally. That breadth shaped a platform that's flexible enough for any agency workflow, but opinionated enough to keep things fast and focused.
            </p>
          </div>

          <div class="pt-8 border-t border-[#121317]/[0.06] dark:border-white/[0.06]">
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              XeroFlow is built and operated by
              <span class="text-[#121317] dark:text-white font-medium">ADME Digital</span>,
              a digital marketing agency based in Melbourne, Australia.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <MarketingFooter />
  </div>
</template>

<script setup>
definePageMeta({ layout: false })

useSeoMeta({
  title: 'About — XeroFlow',
  description: 'XeroFlow is built by ADME Digital to give agencies a single platform for work management, financials, communication, and AI insights.',
  ogTitle: 'About — XeroFlow',
  ogDescription: 'XeroFlow is built by ADME Digital to give agencies a single platform for work management, financials, communication, and AI insights.',
})

const beliefs = [
  {
    title: 'One platform',
    description: 'Agencies shouldn\'t need 10 SaaS subscriptions. Everything should live in one place.',
    icon: 'i-lucide-layers',
    bg: 'bg-indigo-50 dark:bg-indigo-500/10',
    color: 'text-indigo-600 dark:text-indigo-400'
  },
  {
    title: 'Speed matters',
    description: 'Every click counts. Fast interfaces and real-time data keep teams moving.',
    icon: 'i-lucide-zap',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    color: 'text-amber-600 dark:text-amber-400'
  },
  {
    title: 'Transparency',
    description: 'Clients deserve visibility. Teams deserve clarity. Data should be accessible.',
    icon: 'i-lucide-eye',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    color: 'text-emerald-600 dark:text-emerald-400'
  },
  {
    title: 'AI-assisted',
    description: 'Smart recommendations and automation where it matters, not AI for the sake of it.',
    icon: 'i-lucide-sparkles',
    bg: 'bg-violet-50 dark:bg-violet-500/10',
    color: 'text-violet-600 dark:text-violet-400'
  }
]

</script>
