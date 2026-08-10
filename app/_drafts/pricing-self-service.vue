<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="pricing" />

    <!-- Hero -->
    <section class="relative bg-[#0a0b0e] pt-[52px]">
      <MarketingHeroBackground theme="pricing" />
      <div class="relative max-w-[1200px] mx-auto px-6 pt-32 pb-12 md:pt-44 md:pb-20 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span class="text-[13px] text-white/60 font-medium">Simple, transparent pricing</span>
        </div>
        <h1 class="text-[clamp(36px,6vw,64px)] font-[450] text-white leading-[1.1] tracking-[-0.03em] mb-6 max-w-[800px] mx-auto">
          Choose the plan that<br class="hidden sm:block">fits your agency
        </h1>
        <p class="text-lg md:text-xl text-white/50 max-w-[600px] mx-auto leading-relaxed">
          Start free for 14 days. No credit card required. Scale as your team grows.
        </p>
      </div>
    </section>

    <!-- Pricing Tiers -->
    <section class="pb-20 md:pb-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid md:grid-cols-3 gap-6 items-start">
          <!-- Starter Plan -->
          <div class="rounded-3xl border border-[#121317]/10 dark:border-white/[0.06] p-8 md:p-10 flex flex-col h-full">
            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[12px] font-medium tracking-wide w-fit mb-6">
              Free forever
            </div>
            <h3 class="text-[28px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-2">Starter</h3>
            <div class="flex items-baseline gap-1 mb-2">
              <span class="text-[48px] font-[450] text-[#121317] dark:text-white tracking-[-0.03em]">$0</span>
              <span class="text-[16px] text-[#45474D] dark:text-white/60">/month</span>
            </div>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 mb-8 leading-relaxed">For freelancers and small teams getting started.</p>

            <NuxtLink
              to="/auth/login"
              class="inline-flex items-center justify-center gap-2 px-6 py-3 border border-[#121317]/15 dark:border-white/15 text-[#121317] dark:text-white text-[15px] font-medium rounded-full hover:bg-[#121317]/[0.04] dark:hover:bg-white/[0.06] transition-colors mb-8"
            >
              Get Started
            </NuxtLink>

            <div class="flex flex-col gap-3">
              <div v-for="feature in starterFeatures" :key="feature" class="flex items-center gap-3">
                <div class="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span class="text-[14px] text-[#121317] dark:text-white">{{ feature }}</span>
              </div>
            </div>
          </div>

          <!-- Agency Plan (Highlighted) -->
          <div class="rounded-3xl border-2 border-[#121317] dark:border-white/20 p-8 md:p-10 flex flex-col h-full md:scale-[1.02] shadow-xl dark:shadow-white/[0.03] relative">
            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[12px] font-medium tracking-wide w-fit mb-6">
              Most Popular
            </div>
            <h3 class="text-[28px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-2">Agency</h3>
            <div class="flex items-baseline gap-1 mb-2">
              <span class="text-[48px] font-[450] text-[#121317] dark:text-white tracking-[-0.03em]">$29</span>
              <span class="text-[16px] text-[#45474D] dark:text-white/60">/user/month</span>
            </div>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 mb-8 leading-relaxed">Everything your agency needs to run at full speed.</p>

            <NuxtLink
              to="/auth/login"
              class="inline-flex items-center justify-center gap-2 w-full px-6 py-3 bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[15px] font-medium rounded-full hover:bg-[#2a2b30] dark:hover:bg-white/90 transition-colors mb-8"
            >
              Start Free Trial
            </NuxtLink>

            <div class="flex flex-col gap-3">
              <div v-for="feature in agencyFeatures" :key="feature" class="flex items-center gap-3">
                <div class="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span class="text-[14px] text-[#121317] dark:text-white">{{ feature }}</span>
              </div>
            </div>
          </div>

          <!-- Enterprise Plan -->
          <div class="rounded-3xl border border-[#121317]/10 dark:border-white/[0.06] p-8 md:p-10 flex flex-col h-full">
            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#b7bfd9]/10 dark:bg-white/[0.06] text-[#45474D] dark:text-white/60 text-[12px] font-medium tracking-wide w-fit mb-6">
              Custom
            </div>
            <h3 class="text-[28px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-2">Enterprise</h3>
            <div class="flex items-baseline gap-1 mb-2">
              <span class="text-[48px] font-[450] text-[#121317] dark:text-white tracking-[-0.03em]">Custom</span>
            </div>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 mb-8 leading-relaxed">For agencies with 50+ seats needing dedicated support.</p>

            <a
              href="mailto:sales@xeroflow.agency"
              class="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#b7bfd9]/10 dark:bg-white/[0.06] text-[#121317] dark:text-white text-[15px] font-medium rounded-full hover:bg-[#b7bfd9]/20 dark:hover:bg-white/10 transition-colors mb-8"
            >
              Contact Sales
            </a>

            <div class="flex flex-col gap-3">
              <div v-for="feature in enterpriseFeatures" :key="feature" class="flex items-center gap-3">
                <div class="w-5 h-5 rounded-full bg-[#b7bfd9]/10 dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-[#45474D] dark:text-white/40" />
                </div>
                <span class="text-[14px] text-[#121317] dark:text-white">{{ feature }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Feature Comparison Table -->
    <section class="py-20 md:py-32 bg-[#f4f5f7] dark:bg-[#121317]">
      <div class="max-w-[1200px] mx-auto px-6">
        <h2 class="text-[clamp(28px,4vw,40px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4 text-center">
          Compare plans in detail
        </h2>
        <p class="text-[16px] text-[#45474D] dark:text-white/60 text-center mb-12 max-w-[500px] mx-auto">
          Every feature, side by side. Find exactly what your agency needs.
        </p>

        <div class="overflow-x-auto rounded-2xl border border-[#121317]/10 dark:border-white/[0.06] bg-white dark:bg-white/[0.03]">
          <table class="comparison-table w-full text-left min-w-[700px]">
            <thead>
              <tr class="border-b border-[#121317]/10 dark:border-white/[0.06]">
                <th class="px-6 py-4 text-[14px] font-medium text-[#45474D] dark:text-white/60 w-[40%] bg-white dark:bg-transparent">Feature</th>
                <th class="px-6 py-4 text-[14px] font-medium text-[#45474D] dark:text-white/60 text-center w-[20%] bg-white dark:bg-transparent">Starter</th>
                <th class="px-6 py-4 text-[14px] font-medium text-[#121317] dark:text-white text-center w-[20%] bg-[#121317]/[0.02] dark:bg-white/[0.03]">
                  <div class="flex flex-col items-center gap-1">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[10px] font-medium">Popular</span>
                    <span>Agency</span>
                  </div>
                </th>
                <th class="px-6 py-4 text-[14px] font-medium text-[#45474D] dark:text-white/60 text-center w-[20%] bg-white dark:bg-transparent">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="category in comparisonData" :key="category.name">
                <!-- Category Header -->
                <tr>
                  <td colspan="4" class="px-6 py-3 bg-[#121317] dark:bg-white/10 text-white text-[13px] font-medium tracking-wide">
                    {{ category.name }}
                  </td>
                </tr>
                <!-- Feature Rows -->
                <tr
                  v-for="(row, rowIndex) in category.features"
                  :key="row.name"
                  :class="rowIndex % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-[#f4f5f7]/50 dark:bg-white/[0.02]'"
                  class="border-b border-[#121317]/[0.04] dark:border-white/[0.04] last:border-b-0"
                >
                  <td class="px-6 py-3.5 text-[14px] text-[#121317] dark:text-white" :class="rowIndex % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-[#f4f5f7]/50 dark:bg-white/[0.02]'">{{ row.name }}</td>
                  <td class="px-6 py-3.5 text-center" :class="rowIndex % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-[#f4f5f7]/50 dark:bg-white/[0.02]'">
                    <span v-if="row.starter === true" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-500/10"><UIcon name="i-lucide-check" class="w-3 h-3 text-emerald-600 dark:text-emerald-400" /></span>
                    <span v-else-if="row.starter === false" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06]"><UIcon name="i-lucide-minus" class="w-3 h-3 text-[#45474D]/40 dark:text-white/20" /></span>
                    <span v-else class="text-[13px] text-[#121317] dark:text-white font-medium">{{ row.starter }}</span>
                  </td>
                  <td class="px-6 py-3.5 text-center" :class="rowIndex % 2 === 0 ? 'bg-[#121317]/[0.02] dark:bg-white/[0.03]' : 'bg-[#121317]/[0.04] dark:bg-white/[0.05]'">
                    <span v-if="row.agency === true" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-500/10"><UIcon name="i-lucide-check" class="w-3 h-3 text-emerald-600 dark:text-emerald-400" /></span>
                    <span v-else-if="row.agency === false" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06]"><UIcon name="i-lucide-minus" class="w-3 h-3 text-[#45474D]/40 dark:text-white/20" /></span>
                    <span v-else class="text-[13px] text-[#121317] dark:text-white font-medium">{{ row.agency }}</span>
                  </td>
                  <td class="px-6 py-3.5 text-center" :class="rowIndex % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-[#f4f5f7]/50 dark:bg-white/[0.02]'">
                    <span v-if="row.enterprise === true" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-500/10"><UIcon name="i-lucide-check" class="w-3 h-3 text-emerald-600 dark:text-emerald-400" /></span>
                    <span v-else-if="row.enterprise === false" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06]"><UIcon name="i-lucide-minus" class="w-3 h-3 text-[#45474D]/40 dark:text-white/20" /></span>
                    <span v-else class="text-[13px] text-[#121317] dark:text-white font-medium">{{ row.enterprise }}</span>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Trusted By Section -->
    <section class="py-16 md:py-20">
      <div class="max-w-[1200px] mx-auto px-6 text-center">
        <p class="text-[13px] text-[#45474D]/60 dark:text-white/40 font-medium tracking-wide uppercase mb-8">Trusted by agencies worldwide</p>
        <div class="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          <span v-for="agency in trustedAgencies" :key="agency" class="text-[18px] font-[450] text-[#121317]/20 dark:text-white/20 tracking-[-0.01em] select-none">
            {{ agency }}
          </span>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section class="py-20 md:py-32 bg-[#f4f5f7] dark:bg-[#121317]">
      <div class="max-w-[700px] mx-auto px-6">
        <h2 class="text-[clamp(28px,4vw,40px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-12 text-center">
          Frequently asked
        </h2>
        <div class="flex flex-col gap-4">
          <div
            v-for="faq in faqs"
            :key="faq.q"
            class="rounded-2xl bg-white dark:bg-white/[0.03] p-6 cursor-pointer group"
            @click="faq.open = !faq.open"
          >
            <div class="flex items-center justify-between gap-4">
              <h3 class="text-[16px] font-medium text-[#121317] dark:text-white">{{ faq.q }}</h3>
              <UIcon
                :name="faq.open ? 'i-lucide-minus' : 'i-lucide-plus'"
                class="w-4 h-4 text-[#45474D] dark:text-white/40 flex-shrink-0 transition-transform"
              />
            </div>
            <p v-if="faq.open" class="mt-3 text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">{{ faq.a }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Dark CTA Section -->
    <section class="py-10 md:py-16">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="rounded-[2rem] bg-[#0a0b0e] py-20 md:py-28 text-center px-6">
          <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mx-auto mb-6">
            <span class="text-white text-xs font-semibold">XF</span>
          </div>
          <h2 class="text-[clamp(24px,4vw,40px)] font-[450] text-white tracking-[-0.02em] mb-4">
            Start your 14-day free trial
          </h2>
          <p class="text-[16px] text-white/50 mb-8 max-w-[440px] mx-auto">No credit card required. Full Agency features. Your whole team can join.</p>
          <NuxtLink to="/auth/login" class="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#121317] text-[16px] font-medium rounded-full hover:bg-white/90 transition-colors">
            Get Started Free
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <MarketingFooter />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

useSeoMeta({
  title: 'Pricing — XeroFlow',
  description: 'Simple, transparent pricing for your agency. Start free, scale to Agency or Enterprise. Boards, chat, Xero integration, AI insights, and client portal.',
  ogTitle: 'Pricing — XeroFlow',
  ogDescription: 'Simple, transparent pricing for your agency. Start free, scale to Agency or Enterprise. Boards, chat, Xero integration, AI insights, and client portal.',
})

// ---- Plan features ----

const starterFeatures = [
  'Up to 3 boards',
  '5 team members',
  'Basic column types',
  'Table & Kanban views',
  '1GB file storage',
  'Community support',
]

const agencyFeatures = [
  'Unlimited boards & views',
  '20+ column types',
  'All 5 view types',
  'Real-time chat & channels',
  'Xero integration',
  'Meta & Google Ads tracking',
  'EOM invoice generation',
  'Client portal (unlimited clients)',
  'AI chat & anomaly detection',
  'Controlled CRM assist (off by default)',
  'Time tracking & timesheets',
  'Email automations',
  '50GB R2 file storage',
  'Priority email support',
]

const enterpriseFeatures = [
  'Everything in Agency',
  'SSO / SAML authentication',
  'Dedicated account manager',
  'Custom SLAs (99.9% uptime)',
  'Priority phone support',
  'Custom integrations',
  'Advanced audit logging',
  'On-boarding & training',
  'Unlimited file storage',
  'Custom branding',
]

// ---- Comparison table data ----

interface ComparisonRow {
  name: string
  starter: string | boolean
  agency: string | boolean
  enterprise: string | boolean
}

interface ComparisonCategory {
  name: string
  features: ComparisonRow[]
}

const comparisonData: ComparisonCategory[] = [
  {
    name: 'Work Management',
    features: [
      { name: 'Boards', starter: '3', agency: 'Unlimited', enterprise: 'Unlimited' },
      { name: 'Column types', starter: 'Basic (5)', agency: 'All 20+', enterprise: 'All 20+ + Custom' },
      { name: 'Views', starter: 'Table, Kanban', agency: 'All 5', enterprise: 'All 5' },
      { name: 'Groups & subtasks', starter: true, agency: true, enterprise: true },
      { name: 'Templates', starter: false, agency: true, enterprise: 'Custom templates' },
      { name: 'Real-time collaboration', starter: false, agency: true, enterprise: true },
    ],
  },
  {
    name: 'Financial Operations',
    features: [
      { name: 'Xero integration', starter: false, agency: true, enterprise: true },
      { name: 'EOM invoice engine', starter: false, agency: true, enterprise: true },
      { name: 'Meta Ads tracking', starter: false, agency: true, enterprise: true },
      { name: 'Google Ads tracking', starter: false, agency: true, enterprise: true },
      { name: 'P&L dashboards', starter: false, agency: true, enterprise: true },
      { name: 'Budget management', starter: false, agency: true, enterprise: 'Advanced' },
    ],
  },
  {
    name: 'Communication',
    features: [
      { name: 'Real-time chat', starter: false, agency: true, enterprise: true },
      { name: 'Channels & threads', starter: false, agency: true, enterprise: true },
      { name: 'File sharing', starter: 'Basic', agency: 'Full', enterprise: 'Full' },
      { name: 'Email automations', starter: false, agency: true, enterprise: true },
      { name: 'Board-linked channels', starter: false, agency: true, enterprise: true },
    ],
  },
  {
    name: 'AI & Intelligence',
    features: [
      { name: 'AI chat assistant', starter: false, agency: true, enterprise: true },
      { name: 'Anomaly detection', starter: false, agency: '8 analyzers', enterprise: '8 analyzers + custom' },
      { name: 'Controlled CRM agency-assistant retrieval (off by default)', starter: false, agency: false, enterprise: 'Approval required' },
      { name: 'Intent classification', starter: false, agency: true, enterprise: true },
      { name: 'LoRA adapters', starter: false, agency: false, enterprise: true },
    ],
  },
  {
    name: 'Client Portal',
    features: [
      { name: 'Client access', starter: false, agency: 'Unlimited', enterprise: 'Unlimited' },
      { name: 'Approvals', starter: false, agency: true, enterprise: true },
      { name: 'Invoice viewing', starter: false, agency: true, enterprise: true },
      { name: 'Creative gallery', starter: false, agency: true, enterprise: '+ custom branding' },
    ],
  },
  {
    name: 'Time & Capacity',
    features: [
      { name: 'Time tracking', starter: 'Basic', agency: 'Full', enterprise: 'Full' },
      { name: 'Weekly timesheets', starter: false, agency: true, enterprise: true },
      { name: 'Manager approvals', starter: false, agency: true, enterprise: true },
      { name: 'Utilization reports', starter: false, agency: false, enterprise: true },
    ],
  },
  {
    name: 'Support & Security',
    features: [
      { name: 'Support', starter: 'Community', agency: 'Priority email', enterprise: 'Dedicated manager' },
      { name: 'SSO / SAML', starter: false, agency: false, enterprise: true },
      { name: 'Audit logging', starter: 'Basic', agency: 'Standard', enterprise: 'Advanced' },
      { name: 'Data encryption', starter: true, agency: true, enterprise: true },
      { name: 'SLA', starter: false, agency: false, enterprise: '99.9% uptime' },
      { name: 'File storage', starter: '1GB', agency: '50GB', enterprise: 'Unlimited' },
    ],
  },
]

// ---- Trusted agencies ----

const trustedAgencies = [
  'Catalyst Digital',
  'Bloom Agency',
  'Pixel & Co',
  'Ember Media',
  'Northline Creative',
  'Blue Heron Studios',
]

// ---- FAQ ----

const faqs = reactive([
  { q: 'Is there a free trial?', a: 'Yes -- every new account gets 14 days of full Agency plan access. No credit card required. Your entire team can join.', open: false },
  { q: 'What happens after my trial ends?', a: 'Your workspace stays active with Starter plan features. No data is lost. Upgrade anytime to restore full access.', open: false },
  { q: 'Can I switch plans mid-cycle?', a: 'Yes. Upgrades take effect immediately with prorated billing. Downgrades apply at the next billing cycle.', open: false },
  { q: 'Is there a discount for annual billing?', a: 'Yes -- save 20% with annual billing. Contact us for annual Enterprise pricing.', open: false },
  { q: 'What\'s included in the free trial?', a: 'Full Agency plan features for 14 days. No credit card required. Your entire team can join.', open: false },
  { q: 'What payment methods do you accept?', a: 'We accept all major credit cards. Enterprise plans can pay via invoice.', open: false },
  { q: 'Is my data secure?', a: 'XeroFlow runs on Cloudflare\'s global network with encryption at rest and in transit. We never sell your data.', open: false },
  { q: 'Do clients count as seats?', a: 'No. Client portal users are free and unlimited. Only agency staff members count toward your seat total.', open: false },
  { q: 'Can I import from Monday.com?', a: 'Yes -- we support board imports from Monday.com including columns, groups, and item data.', open: false },
  { q: 'How do I cancel?', a: 'You can cancel anytime from your billing settings. Your workspace reverts to the Starter plan at the end of the billing cycle -- no data is deleted.', open: false },
])
</script>

<style scoped>
.comparison-table th:first-child,
.comparison-table td:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
}
</style>
