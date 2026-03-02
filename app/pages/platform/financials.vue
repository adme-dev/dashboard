<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e] overflow-x-hidden">
    <MarketingNav active="features" />

    <!-- Hero Section -->
    <section class="relative bg-[#0a0b0e] pt-[52px]">
      <MarketingHeroBackground theme="financials" />
      <div class="relative max-w-[1200px] mx-auto px-6 pt-32 pb-20 md:pt-44 md:pb-28 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/[0.12] mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span class="text-[13px] text-emerald-400 font-medium">Financial Operations</span>
        </div>

        <h1 class="text-[clamp(36px,6vw,72px)] font-[450] text-white leading-[1.1] tracking-[-0.03em] mb-6 max-w-[800px] mx-auto">
          Your agency finances,<br class="hidden sm:block">unified
        </h1>

        <p class="text-lg md:text-xl text-white/50 max-w-[560px] mx-auto mb-10 leading-relaxed">
          Two-way Xero integration, automated end-of-month invoicing, real-time P&amp;L dashboards, and budget management with full audit trails.
        </p>

        <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
          <NuxtLink
            to="/auth/login"
            class="inline-flex items-center gap-2.5 px-6 py-3 bg-white text-[#121317] text-[17.5px] font-medium rounded-full hover:bg-white/90 transition-colors"
          >
            Get Started
          </NuxtLink>
          <button
            class="inline-flex items-center gap-2 px-6 py-3 bg-white/10 text-white text-[17.5px] font-medium rounded-full hover:bg-white/20 transition-colors"
            @click="document.getElementById('xero-integration')?.scrollIntoView({ behavior: 'smooth' })"
          >
            See how it works
          </button>
        </div>
      </div>
    </section>

    <!-- Xero Integration Section -->
    <section id="xero-integration" class="py-20 md:py-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="flex flex-col gap-12 md:flex-row md:items-center">
          <!-- Left: Text -->
          <div class="flex-1">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#13B5EA]/[0.08] mb-6">
              <UIcon name="i-lucide-link" class="w-3.5 h-3.5 text-[#13B5EA]" />
              <span class="text-[13px] text-[#13B5EA] font-medium">Xero Connected</span>
            </div>
            <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-5">
              Two-way Xero sync,<br class="hidden sm:block">zero manual entry
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[480px] mb-8">
              Invoices, expenses, contacts, and your full chart of accounts stay perfectly in sync between XeroFlow and Xero. Changes flow both directions automatically, so your books are always up to date.
            </p>
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.06]">
                <div class="w-8 h-8 rounded-lg bg-[#13B5EA]/10 flex items-center justify-center">
                  <UIcon name="i-lucide-calculator" class="w-4 h-4 text-[#13B5EA]" />
                </div>
                <span class="text-[14px] font-medium text-[#121317] dark:text-white">Xero</span>
              </div>
              <div class="flex items-center gap-1.5">
                <div class="w-6 h-[2px] bg-emerald-400 rounded-full" />
                <UIcon name="i-lucide-arrows-right-left" class="w-4 h-4 text-emerald-500" />
                <div class="w-6 h-[2px] bg-emerald-400 rounded-full" />
              </div>
              <div class="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.06]">
                <div class="w-8 h-8 rounded-lg bg-[#121317]/[0.06] dark:bg-white/[0.06] flex items-center justify-center">
                  <span class="text-[10px] font-semibold text-[#121317] dark:text-white">XF</span>
                </div>
                <span class="text-[14px] font-medium text-[#121317] dark:text-white">XeroFlow</span>
              </div>
            </div>
          </div>

          <!-- Right: Feature list -->
          <div class="flex-1">
            <div class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-8 flex flex-col gap-5">
              <div v-for="item in xeroFeatures" :key="item.label" class="flex items-start gap-4">
                <div class="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <UIcon name="i-lucide-check" class="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div>
                  <div class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">{{ item.label }}</div>
                  <div class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">{{ item.description }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- EOM Engine Section -->
    <section class="py-20 md:py-32 bg-[#f4f5f7]/50 dark:bg-white/[0.02]">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-16">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121317]/[0.04] mb-6">
            <UIcon name="i-lucide-calendar-check" class="w-3.5 h-3.5 text-[#45474D]" />
            <span class="text-[13px] text-[#45474D] dark:text-white/60 font-medium">End-of-Month Engine</span>
          </div>
          <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-5 max-w-[600px] mx-auto">
            End-of-month,<br class="hidden sm:block">automated
          </h2>
          <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[560px] mx-auto">
            Configure line items per client, calculate tax automatically, generate invoices in bulk, and upload directly to Xero. Archives stored in R2 for compliance.
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div v-for="card in eomCards" :key="card.title" class="rounded-2xl bg-white dark:bg-white/[0.03] p-6 flex flex-col gap-4 border border-[#121317]/[0.04] dark:border-white/[0.06] hover:border-emerald-200/60 transition-colors">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center" :class="card.iconBg">
              <UIcon :name="card.icon" class="w-5 h-5" :class="card.iconColor" />
            </div>
            <div>
              <div class="text-[16px] font-medium text-[#121317] dark:text-white mb-1.5">{{ card.title }}</div>
              <div class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">{{ card.description }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- P&L Dashboard Section -->
    <section class="py-20 md:py-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="flex flex-col gap-12 md:flex-row md:items-center">
          <!-- Left: Text -->
          <div class="flex-1">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/[0.08] mb-6">
              <UIcon name="i-lucide-trending-up" class="w-3.5 h-3.5 text-emerald-600" />
              <span class="text-[13px] text-emerald-700 font-medium">Live P&amp;L</span>
            </div>
            <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-5">
              Profit & loss,<br class="hidden sm:block">per client, in real time
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[480px]">
              See revenue, expenses, and profit margin per client and across your entire agency. Sourced directly from Xero with live sync, so numbers are always current.
            </p>
          </div>

          <!-- Right: Stat cards -->
          <div class="flex-1">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-6 flex flex-col">
                <div class="text-[13px] text-[#45474D] dark:text-white/60 mb-2">Revenue</div>
                <div class="text-[28px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-1">$84K</div>
                <div class="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full bg-emerald-500/10">
                  <UIcon name="i-lucide-trending-up" class="w-3 h-3 text-emerald-600" />
                  <span class="text-[12px] font-medium text-emerald-600">+12%</span>
                </div>
              </div>
              <div class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-6 flex flex-col">
                <div class="text-[13px] text-[#45474D] dark:text-white/60 mb-2">Expenses</div>
                <div class="text-[28px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-1">$32K</div>
                <div class="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full bg-blue-500/10">
                  <UIcon name="i-lucide-trending-down" class="w-3 h-3 text-blue-600" />
                  <span class="text-[12px] font-medium text-blue-600">-3%</span>
                </div>
              </div>
              <div class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-6 flex flex-col">
                <div class="text-[13px] text-[#45474D] dark:text-white/60 mb-2">Profit</div>
                <div class="text-[28px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-1">$52K</div>
                <div class="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full bg-emerald-500/10">
                  <UIcon name="i-lucide-trending-up" class="w-3 h-3 text-emerald-600" />
                  <span class="text-[12px] font-medium text-emerald-600">+18%</span>
                </div>
              </div>
            </div>

            <!-- Mini chart -->
            <div class="mt-5 rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5">
              <div class="flex items-center justify-between mb-4">
                <span class="text-[13px] font-medium text-[#121317] dark:text-white">Monthly Revenue</span>
                <span class="text-[12px] text-[#45474D] dark:text-white/60">Last 12 months</span>
              </div>
              <div class="flex items-end gap-2 h-[80px]">
                <div
                  v-for="(h, i) in chartBars"
                  :key="i"
                  class="flex-1 rounded-t transition-colors"
                  :class="i === chartBars.length - 1 ? 'bg-emerald-500' : 'bg-emerald-500/30'"
                  :style="{ height: h + '%' }"
                />
              </div>
              <div class="flex justify-between mt-2">
                <span class="text-[11px] text-[#45474D]/50">Mar</span>
                <span class="text-[11px] text-[#45474D]/50">Jun</span>
                <span class="text-[11px] text-[#45474D]/50">Sep</span>
                <span class="text-[11px] text-[#45474D]/50">Feb</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Budget Management Section -->
    <section class="py-20 md:py-32 bg-[#f4f5f7]/50 dark:bg-white/[0.02]">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-16">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121317]/[0.04] mb-6">
            <UIcon name="i-lucide-shield-check" class="w-3.5 h-3.5 text-[#45474D]" />
            <span class="text-[13px] text-[#45474D] font-medium">Budget Control</span>
          </div>
          <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-5 max-w-[600px] mx-auto">
            Budgets that keep<br class="hidden sm:block">your agency profitable
          </h2>
          <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[560px] mx-auto">
            Set monthly budgets per client and campaign. Get alerts when spend is pacing ahead, and keep a full audit trail of every change.
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div v-for="card in budgetCards" :key="card.title" class="rounded-2xl bg-white dark:bg-white/[0.03] p-6 flex flex-col gap-4 border border-[#121317]/[0.04] dark:border-white/[0.06] hover:border-emerald-200/60 transition-colors">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center" :class="card.iconBg">
              <UIcon :name="card.icon" class="w-5 h-5" :class="card.iconColor" />
            </div>
            <div>
              <div class="text-[16px] font-medium text-[#121317] dark:text-white mb-1.5">{{ card.title }}</div>
              <div class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">{{ card.description }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Dark CTA Section -->
    <section class="py-10 md:py-16">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="relative rounded-[2rem] bg-[#0a0b0e] overflow-hidden py-24 md:py-36">
          <!-- Ambient glow -->
          <div class="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
            <div class="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-emerald-500/[0.06] blur-[120px]" />
            <div class="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full bg-emerald-400/[0.04] blur-[100px]" />
          </div>

          <!-- Content -->
          <div class="relative text-center px-6">
            <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mx-auto mb-8">
              <span class="text-white text-xs font-semibold tracking-tight">XF</span>
            </div>
            <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-10 max-w-[600px] mx-auto">
              Take control of your<br class="hidden sm:block">agency finances
            </h2>
            <NuxtLink
              to="/auth/login"
              class="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#121317] text-[17.5px] font-medium rounded-full hover:bg-white/90 transition-colors"
            >
              Get Started
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="pt-20 pb-10">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="flex flex-col md:flex-row gap-12 md:gap-0 md:justify-between mb-20">
          <div>
            <h3 class="text-[clamp(22px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Experience XeroFlow</h3>
          </div>
          <div class="flex gap-20 md:gap-28">
            <div class="flex flex-col gap-3.5 text-[15px]">
              <NuxtLink to="/auth/login" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Sign In</NuxtLink>
              <NuxtLink to="/auth/xeroflow" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">XeroFlow</NuxtLink>
              <NuxtLink to="/portal/login" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Client Portal</NuxtLink>
              <NuxtLink to="/features" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Features</NuxtLink>
            </div>
            <div class="flex flex-col gap-3.5 text-[15px]">
              <NuxtLink to="/privacy" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Privacy</NuxtLink>
              <NuxtLink to="/terms" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Terms</NuxtLink>
              <NuxtLink to="/support" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Support</NuxtLink>
            </div>
          </div>
        </div>
        <div class="overflow-hidden mb-10">
          <div class="text-[clamp(80px,18vw,220px)] font-[450] text-[#121317] dark:text-white leading-[0.9] tracking-[-0.04em] select-none">XeroFlow</div>
        </div>
        <div class="pt-6 border-t border-black/[0.06] dark:border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="flex items-center gap-2.5">
            <div class="w-5 h-5 bg-[#121317] dark:bg-white rounded flex items-center justify-center">
              <span class="text-white dark:text-[#121317] text-[8px] font-semibold">XF</span>
            </div>
            <span class="text-[13px] text-[#45474D] dark:text-white/50">ADME Digital</span>
          </div>
          <div class="flex items-center gap-6 text-[13px] text-[#45474D]/60 dark:text-white/40">
            <NuxtLink to="/about" class="hover:text-[#45474D] dark:hover:text-white/60 transition-colors">About</NuxtLink>
            <NuxtLink to="/privacy" class="hover:text-[#45474D] dark:hover:text-white/60 transition-colors">Privacy</NuxtLink>
            <NuxtLink to="/terms" class="hover:text-[#45474D] dark:hover:text-white/60 transition-colors">Terms</NuxtLink>
            <span>&copy; {{ new Date().getFullYear() }}</span>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

const xeroFeatures = [
  {
    label: 'Invoices',
    description: 'Create, send, and reconcile invoices. Status syncs instantly between both platforms.'
  },
  {
    label: 'Expenses',
    description: 'Track operational costs and billable expenses per client with automatic categorisation.'
  },
  {
    label: 'Contacts',
    description: 'Client and supplier contacts stay in sync. Updates in one place reflect everywhere.'
  },
  {
    label: 'Chart of Accounts',
    description: 'Full chart of accounts pulled from Xero, used for accurate revenue and cost allocation.'
  }
]

const eomCards = [
  {
    title: 'Line Item Config',
    description: 'Define recurring line items per client with custom descriptions, quantities, and unit prices.',
    icon: 'i-lucide-list-ordered',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-600'
  },
  {
    title: 'Tax Calculation',
    description: 'Automatic GST/VAT calculation based on your Xero tax rates. Multi-currency supported.',
    icon: 'i-lucide-percent',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-600'
  },
  {
    title: 'Xero Upload',
    description: 'One-click bulk upload of generated invoices directly into Xero as approved drafts.',
    icon: 'i-lucide-upload-cloud',
    iconBg: 'bg-violet-500/10',
    iconColor: 'text-violet-600'
  },
  {
    title: 'Archive to R2',
    description: 'Every generated invoice is archived to Cloudflare R2 for audit compliance and retrieval.',
    icon: 'i-lucide-archive',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-600'
  }
]

const budgetCards = [
  {
    title: 'Budget Alerts',
    description: 'Get notified when spend reaches 80% or exceeds the monthly budget for any client or campaign.',
    icon: 'i-lucide-bell-ring',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-600'
  },
  {
    title: 'Audit Trails',
    description: 'Every budget change, approval, and override is logged with timestamps and user attribution.',
    icon: 'i-lucide-file-search',
    iconBg: 'bg-violet-500/10',
    iconColor: 'text-violet-600'
  },
  {
    title: 'Spend Pacing',
    description: 'Visual pacing indicators show daily run rate vs. remaining budget across Meta and Google Ads.',
    icon: 'i-lucide-gauge',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-600'
  }
]

const chartBars = [40, 55, 48, 62, 50, 68, 58, 72, 65, 78, 70, 90]
</script>
