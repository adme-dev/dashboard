<template>
  <div class="min-h-screen bg-[#0a0b0e]">
    <MarketingStarsBackground fullscreen :count="2000" />
    <div class="relative z-[1]">
      <MarketingNav active="pricing" />

      <!-- Hero -->
      <section class="relative pt-[52px]">
        <div class="relative max-w-[1200px] mx-auto px-6 pt-32 pb-12 md:pt-44 md:pb-20 text-center">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] mb-8">
            <div class="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span class="text-[13px] text-white/60 font-medium">Enterprise &middot; Annual partnership</span>
          </div>
          <h1 class="text-[clamp(36px,6vw,64px)] font-[450] text-white leading-[1.1] tracking-[-0.03em] mb-6 max-w-[800px] mx-auto">
            Priced to how<br class="hidden sm:block"> your agency runs
          </h1>
          <p class="text-lg md:text-xl text-white/50 max-w-[620px] mx-auto leading-relaxed">
            XeroFlow is deployed for your agency with guided onboarding — not a self-serve checkout. Tell us how you work and we'll shape the engagement to fit.
          </p>
        </div>
      </section>

      <!-- Engagement panel -->
      <section class="pb-16 md:pb-24 pt-16 md:pt-20">
        <div class="max-w-[1200px] mx-auto px-6">
          <div class="rounded-[2rem] border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-8 md:p-14 grid md:grid-cols-[1.1fr_1fr] gap-10 md:gap-16">
            <div>
              <p class="text-[13px] text-white/40 font-medium tracking-wide uppercase mb-4">
                XeroFlow Enterprise
              </p>
              <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-white tracking-[-0.02em] leading-[1.15] mb-5">
                One engagement.<br>The whole platform.
              </h2>
              <p class="text-[16px] text-white/60 leading-relaxed mb-8 max-w-[440px]">
                Every XeroFlow agreement is an annual partnership covering your entire team and the modules you need — boards, finance, ad spend, client portal and AI. No per-seat tiers, and no feature gates you discover later.
              </p>
              <div class="flex flex-wrap items-center gap-3">
                <NuxtLink
                  to="/contact"
                  class="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#121317] text-[15px] font-medium rounded-full hover:bg-white/90 transition-colors"
                >
                  Talk to us
                  <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
                </NuxtLink>
                <NuxtLink
                  to="/features"
                  class="inline-flex items-center gap-2 px-7 py-3.5 border border-white/15 text-white text-[15px] font-medium rounded-full hover:bg-white/[0.06] transition-colors"
                >
                  Explore the platform
                </NuxtLink>
              </div>
            </div>
            <div class="md:border-l md:border-white/[0.06] md:pl-16">
              <p class="text-[14px] font-medium text-white mb-5">
                Included in every engagement
              </p>
              <div class="flex flex-col gap-4">
                <div v-for="item in included" :key="item" class="flex items-start gap-3">
                  <div class="w-5 h-5 mt-0.5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <UIcon name="i-lucide-check" class="w-3 h-3 text-emerald-400" />
                  </div>
                  <span class="text-[15px] text-white leading-snug">{{ item }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- How pricing works -->
      <section class="pb-20 md:pb-28">
        <div class="max-w-[1200px] mx-auto px-6">
          <div class="grid md:grid-cols-3 md:divide-x divide-white/[0.06] border-y border-white/[0.06]">
            <div v-for="part in pricingParts" :key="part.title" class="py-10 md:px-10 first:md:pl-0 last:md:pr-0">
              <h3 class="text-[17px] font-medium text-white mb-2.5">
                {{ part.title }}
              </h3>
              <p class="text-[14.5px] text-white/55 leading-relaxed">
                {{ part.body }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Modules -->
      <section class="py-20 md:py-28">
        <div class="max-w-[1200px] mx-auto px-6">
          <h2 class="text-[clamp(28px,4vw,40px)] font-[450] text-white tracking-[-0.02em] mb-4 text-center">
            Everything an agency runs on
          </h2>
          <p class="text-[16px] text-white/60 text-center mb-14 max-w-[520px] mx-auto">
            Your engagement is scoped to the modules you'll actually use — and can grow as you do.
          </p>
          <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div
              v-for="mod in modules"
              :key="mod.name"
              class="rounded-2xl bg-white/[0.03] backdrop-blur-sm border border-white/[0.05] p-6"
            >
              <div class="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center mb-4">
                <UIcon :name="mod.icon" class="w-4.5 h-4.5 text-white/80" />
              </div>
              <h3 class="text-[15.5px] font-medium text-white mb-1.5">
                {{ mod.name }}
              </h3>
              <p class="text-[14px] text-white/55 leading-relaxed">
                {{ mod.blurb }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Onboarding sequence -->
      <section class="py-20 md:py-28">
        <div class="max-w-[1200px] mx-auto px-6">
          <h2 class="text-[clamp(28px,4vw,40px)] font-[450] text-white tracking-[-0.02em] mb-4 text-center">
            From first call to fully running
          </h2>
          <p class="text-[16px] text-white/60 text-center mb-14 max-w-[480px] mx-auto">
            Four steps, no pressure. Most agencies know whether XeroFlow fits by step two.
          </p>
          <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div v-for="(step, i) in onboardingSteps" :key="step.title">
              <p class="text-[13px] font-medium text-white/30 tracking-wide mb-3">
                {{ String(i + 1).padStart(2, '0') }}
              </p>
              <h3 class="text-[16px] font-medium text-white mb-2">
                {{ step.title }}
              </h3>
              <p class="text-[14px] text-white/55 leading-relaxed">
                {{ step.body }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- FAQ -->
      <section class="py-20 md:py-28">
        <div class="max-w-[700px] mx-auto px-6">
          <h2 class="text-[clamp(28px,4vw,40px)] font-[450] text-white tracking-[-0.02em] mb-12 text-center">
            Frequently asked
          </h2>
          <div class="flex flex-col gap-4">
            <div
              v-for="faq in faqs"
              :key="faq.q"
              class="rounded-2xl bg-white/[0.03] backdrop-blur-sm"
            >
              <button
                type="button"
                class="w-full flex items-center justify-between gap-4 p-6 text-left cursor-pointer"
                :aria-expanded="faq.open"
                @click="faq.open = !faq.open"
              >
                <h3 class="text-[16px] font-medium text-white">
                  {{ faq.q }}
                </h3>
                <UIcon
                  :name="faq.open ? 'i-lucide-minus' : 'i-lucide-plus'"
                  class="w-4 h-4 text-white/40 flex-shrink-0"
                />
              </button>
              <p v-if="faq.open" class="px-6 pb-6 -mt-2 text-[14px] text-white/60 leading-relaxed">
                {{ faq.a }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Dark CTA -->
      <section class="py-10 md:py-16">
        <div class="max-w-[1200px] mx-auto px-6">
          <div class="rounded-[2rem] bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] py-20 md:py-28 text-center px-6">
            <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mx-auto mb-6">
              <span class="text-white text-xs font-semibold">XF</span>
            </div>
            <h2 class="text-[clamp(24px,4vw,40px)] font-[450] text-white tracking-[-0.02em] mb-4">
              Tell us how your agency runs
            </h2>
            <p class="text-[16px] text-white/50 mb-8 max-w-[440px] mx-auto">
              A short conversation is the fastest way to see whether XeroFlow fits. A real person replies within one business day.
            </p>
            <NuxtLink to="/contact" class="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#121317] text-[16px] font-medium rounded-full hover:bg-white/90 transition-colors">
              Talk to us
              <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
            </NuxtLink>
          </div>
        </div>
      </section>

      <!-- Footer -->
      <MarketingFooter dark />
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

useSeoMeta({
  title: 'Pricing — XeroFlow',
  description: 'XeroFlow is priced per agency: one annual platform fee plus scoped implementation. Sales-assisted onboarding for the whole platform — boards, finance, ad spend, client portal and AI.',
  ogTitle: 'Pricing — XeroFlow',
  ogDescription: 'XeroFlow is priced per agency: one annual platform fee plus scoped implementation. Sales-assisted onboarding for the whole platform — boards, finance, ad spend, client portal and AI.'
})

// ---- Engagement panel ----

const included = [
  'Full platform access for your whole team',
  'Guided onboarding, data imports and training',
  'Unlimited client portal users',
  'Direct support from the team that builds XeroFlow',
  'A named contact — not a ticket queue'
]

const pricingParts = [
  {
    title: 'Annual platform fee',
    body: 'One agreed annual figure for your whole team. No per-seat arithmetic and no surprise overages.'
  },
  {
    title: 'Implementation & onboarding',
    body: 'A scoped, one-time fee covering workspace setup, data imports and training your team.'
  },
  {
    title: 'Modules that fit',
    body: 'Start with the modules you\'ll actually run. Add more as your operation grows — the engagement grows with you.'
  }
]

// ---- Modules ----

const modules = [
  { name: 'Work management', icon: 'i-lucide-kanban', blurb: 'Boards with 20+ column types, Kanban, timeline, calendar and workload views.' },
  { name: 'Finance operations', icon: 'i-lucide-receipt', blurb: 'Live Xero sync, P&L, cashflow forecasting and end-of-month invoice generation.' },
  { name: 'Ad spend tracking', icon: 'i-lucide-trending-up', blurb: 'Meta and Google Ads connections with daily spend, budgets and pacing alerts.' },
  { name: 'Lead capture & routing', icon: 'i-lucide-inbox', blurb: 'Webhooks, form routing and a real-time lead inbox with rules and hand-offs.' },
  { name: 'Client portal', icon: 'i-lucide-users', blurb: 'Client logins for approvals, proofs, invoices and creative galleries.' },
  { name: 'AI assistant', icon: 'i-lucide-sparkles', blurb: 'Chat over your agency\'s live data, anomaly detection and recommendations.' },
  { name: 'Time & capacity', icon: 'i-lucide-clock', blurb: 'Time tracking, weekly timesheets and manager approvals.' },
  { name: 'Email & campaigns', icon: 'i-lucide-mail', blurb: 'Campaign builder, templates, automations and transactional email.' },
  { name: 'Team chat', icon: 'i-lucide-message-circle', blurb: 'Real-time channels and threads, linked to the boards where work happens.' }
]

// ---- Onboarding steps ----

const onboardingSteps = [
  { title: 'Conversation', body: 'A short call about how your agency runs — clients, billing, channels and team.' },
  { title: 'Walkthrough', body: 'A live tour of XeroFlow scoped to the modules you\'d actually use.' },
  { title: 'Proposal', body: 'A written engagement: platform fee, implementation scope and timeline.' },
  { title: 'Guided onboarding', body: 'We set up your workspace, import your data and train your team.' }
]

// ---- FAQ ----

const faqs = reactive([
  { q: 'How is pricing structured?', a: 'An annual platform fee for your whole team, plus a one-time implementation fee scoped to your onboarding. Both are put in writing after a walkthrough — no metered seats, no usage surprises.', open: false },
  { q: 'Is there a free trial?', a: 'No self-serve trial. Instead we run a live walkthrough scoped to your agency, and structure onboarding so you see the platform working with your own data early. It\'s a better test than an empty trial workspace.', open: false },
  { q: 'Do clients count as users?', a: 'No. Client portal access is included — pricing is based on your team, not how many clients you serve.', open: false },
  { q: 'Can we start with just a few modules?', a: 'Yes. Most agencies start with work management and finance operations, then add ad spend, the client portal and AI when ready. The engagement is scoped to what you\'ll actually run.', open: false },
  { q: 'Can you import from Monday.com?', a: 'Yes — boards, groups, columns and items migrate over, and Xero connects directly. We handle imports with you during onboarding.', open: false },
  { q: 'Where does our data live?', a: 'XeroFlow runs on Cloudflare\'s global network, encrypted in transit and at rest. Your data is never used to train models for other customers, and it is never sold.', open: false },
  { q: 'How do we get started?', a: 'Send us a note through the contact page. A real person replies within one business day.', open: false }
])
</script>
