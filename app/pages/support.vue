<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav />

    <!-- Hero -->
    <section class="relative bg-[#0a0b0e] pt-[52px]">
      <MarketingHeroBackground theme="support" />
      <div class="relative max-w-[1200px] mx-auto px-6 pt-32 md:pt-44 pb-16 md:pb-24 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-teal-400" />
          <span class="text-[13px] text-white/60 font-medium">We're here to help</span>
        </div>
        <h1 class="text-[clamp(36px,6vw,56px)] font-[450] text-white leading-[1.1] tracking-[-0.03em] mb-6 max-w-[700px] mx-auto">
          Support Centre
        </h1>
        <p class="text-lg md:text-xl text-white/50 max-w-[520px] mx-auto leading-relaxed">
          Get help with XeroFlow. Find answers, contact our team, or browse common topics.
        </p>
      </div>
    </section>

    <!-- Support Options -->
    <section class="pb-20 md:pb-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <!-- Contact Cards -->
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-20">
          <div
            v-for="option in contactOptions"
            :key="option.title"
            class="rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-6 flex flex-col gap-4 hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all cursor-pointer group"
          >
            <div class="w-11 h-11 rounded-xl flex items-center justify-center" :class="option.bg">
              <UIcon :name="option.icon" class="w-5 h-5" :class="option.color" />
            </div>
            <div>
              <h3 class="text-[16px] font-medium text-[#121317] dark:text-white mb-1.5">
                {{ option.title }}
              </h3>
              <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">
                {{ option.description }}
              </p>
            </div>
            <div class="mt-auto pt-2">
              <NuxtLink
                v-if="option.to"
                :to="option.to"
                class="text-[14px] text-[#121317] dark:text-white font-medium group-hover:underline underline-offset-2"
              >
                {{ option.action }}
              </NuxtLink>
              <a
                v-else
                :href="option.href"
                class="text-[14px] text-[#121317] dark:text-white font-medium group-hover:underline underline-offset-2"
              >
                {{ option.action }}
              </a>
            </div>
          </div>
        </div>

        <!-- FAQ -->
        <div>
          <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-8">
            Frequently Asked Questions
          </h2>
          <div class="flex flex-col divide-y divide-[#121317]/[0.06] dark:divide-white/[0.06]">
            <div v-for="faq in faqs" :key="faq.q" class="py-6">
              <h3 class="text-[16px] font-medium text-[#121317] dark:text-white mb-2">
                {{ faq.q }}
              </h3>
              <p class="text-[14.5px] text-[#45474D] dark:text-white/60 leading-relaxed">
                {{ faq.a }}
                <template v-if="faq.policyLink">
                  <NuxtLink to="/privacy" class="underline underline-offset-2 text-[#121317] dark:text-white/80">Privacy Policy</NuxtLink>.
                </template>
              </p>
            </div>
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
  title: 'Support — XeroFlow',
  description: 'Get help with XeroFlow. Contact our support team via email or browse documentation and resources.',
  ogTitle: 'Support — XeroFlow',
  ogDescription: 'Get help with XeroFlow. Contact our support team via email or browse documentation and resources.'
})

const contactOptions = [
  {
    title: 'Email Support',
    description: 'Send us a message and we\'ll get back to you within 24 hours on business days.',
    action: 'support@xeroflow.io',
    href: 'mailto:support@xeroflow.io',
    icon: 'i-lucide-mail',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    color: 'text-blue-600 dark:text-blue-400'
  },
  {
    title: 'In-App Chat',
    description: 'Logged-in users can reach our team directly through the Activity Hub chat widget.',
    action: 'Open XeroFlow',
    to: '/auth/login',
    icon: 'i-lucide-message-circle',
    bg: 'bg-violet-50 dark:bg-violet-500/10',
    color: 'text-violet-600 dark:text-violet-400'
  },
  {
    title: 'Documentation',
    description: 'Browse our resource library for guides, walkthroughs, and best practices.',
    action: 'View Resources',
    to: '/resources',
    icon: 'i-lucide-book-open',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    color: 'text-emerald-600 dark:text-emerald-400'
  }
]

const faqs = [
  {
    q: 'How do I connect my Xero account?',
    a: 'Navigate to the Financials section and click "Connect Xero". You\'ll be redirected to authorise the connection. Once connected, XeroFlow can generate invoices and sync financial data automatically.'
  },
  {
    q: 'Can I invite my clients to the platform?',
    a: 'Yes. Go to Clients, select a client, and use the "Invite to Portal" option. Each contact gets a separate login with per-user controls for projects, invoices, approvals, campaign analytics, comments, and requests. Their client-scoped workspace can also bring together CRM and leads, shared files, meetings, measurement, and social workflows.'
  },
  {
    q: 'How does ad spend syncing work?',
    a: 'Connect your Meta and Google Ads accounts via the Ad Spend section. XeroFlow syncs daily spend data, campaign performance, and budget utilisation automatically. Data is used for EOM invoice generation.'
  },
  {
    q: 'Is my data secure?',
    a: 'XeroFlow runs on Cloudflare\'s global network with encrypted data at rest and in transit. Authentication uses secure tokens, and all API endpoints require authorisation. See our',
    policyLink: true
  },
  {
    q: 'How do I export my data?',
    a: 'Most sections support CSV or PDF export. For board data, use the export button in the board toolbar. For financial reports, use the download options in the EOM dashboard. Contact support for full data exports.'
  },
  {
    q: 'What browsers are supported?',
    a: 'XeroFlow works best in the latest versions of Chrome, Firefox, Safari, and Edge. We recommend Chrome for the optimal experience, especially for real-time features like chat and board collaboration.'
  }
]
</script>
