<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <!-- Hero -->
    <section class="relative bg-[#0a0b0e] pt-[52px]">
      <MarketingHeroBackground theme="client-portal" />
      <div class="relative max-w-[1200px] mx-auto px-6 pt-32 pb-16 md:pt-44 md:pb-24 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/[0.12] mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-rose-400" />
          <span class="text-[13px] text-rose-400 font-medium">Client Portal</span>
        </div>
        <h1 class="text-[clamp(36px,6vw,64px)] font-[450] text-white leading-[1.1] tracking-[-0.03em] mb-6 max-w-[800px] mx-auto">
          A dedicated space<br class="hidden sm:block">for your clients
        </h1>
        <p class="text-lg md:text-xl text-white/50 max-w-[560px] mx-auto leading-relaxed">
          Project visibility, approval workflows, invoices, and a creative gallery — all behind a secure, client-scoped login.
        </p>
      </div>
    </section>

    <!-- Auth Section -->
    <section class="pb-20 md:pb-28">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
          <!-- Left: Description -->
          <div>
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/15 flex items-center justify-center">
                <UIcon name="i-lucide-shield" class="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Separate, secure auth</h2>
            </div>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Clients authenticate through their own cookie-based session system, completely isolated from your internal staff login. No JWTs, no shared tokens.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Every API query is automatically scoped to the authenticated client's data. There is no parameter to override, no way to see another client's projects.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Staff access portal management through the agency dashboard using JWT auth. Clients use cookie auth at <code class="text-[13px] px-1.5 py-0.5 bg-[#121317]/[0.04] dark:bg-white/[0.06] rounded">/portal</code>. Two systems, zero overlap.
            </p>
          </div>

          <!-- Right: Feature list -->
          <div class="space-y-4">
            <div
              v-for="item in authFeatures"
              :key="item.title"
              class="flex items-start gap-4 p-5 rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] group hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors"
            >
              <div class="w-10 h-10 rounded-xl bg-white dark:bg-white/[0.06] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-none shrink-0 mt-0.5">
                <UIcon :name="item.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
              </div>
              <div>
                <h3 class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">{{ item.title }}</h3>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ item.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Pages Section -->
    <section class="py-20 md:py-28 bg-[#fafbfc] dark:bg-white/[0.02]">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-14">
          <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
            11 pages, purpose-built
          </h2>
          <p class="text-[16px] text-[#45474D] dark:text-white/60 max-w-[500px] mx-auto leading-relaxed">
            Every page is designed for a specific client need — no feature bloat, no confusion.
          </p>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <div
            v-for="page in portalPages"
            :key="page.title"
            class="rounded-2xl bg-white dark:bg-white/[0.03] p-5 flex flex-col items-center text-center gap-3 border border-[#121317]/[0.04] dark:border-white/[0.06] hover:border-[#121317]/[0.08] dark:hover:border-white/[0.10] hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all"
          >
            <div class="w-11 h-11 rounded-xl flex items-center justify-center" :class="page.bgClass">
              <UIcon :name="page.icon" class="w-5 h-5" :class="page.iconClass" />
            </div>
            <span class="text-[14px] font-medium text-[#121317] dark:text-white">{{ page.title }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Approval Workflow Section -->
    <section class="py-20 md:py-28">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
          <!-- Left: Description -->
          <div>
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center">
                <UIcon name="i-lucide-check-circle" class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Approval workflows</h2>
            </div>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Upload deliverables for client review — creative assets, copy decks, campaign strategies. Clients can approve, request revisions, or leave comments directly in the portal.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              Every action is tracked with timestamps and user attribution. No more email chains, no lost feedback, no ambiguous sign-offs.
            </p>
          </div>

          <!-- Right: Feature details -->
          <div class="space-y-4">
            <div
              v-for="item in approvalFeatures"
              :key="item.title"
              class="flex items-start gap-4 p-5 rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] group hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors"
            >
              <div class="w-10 h-10 rounded-xl bg-white dark:bg-white/[0.06] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-none shrink-0 mt-0.5">
                <UIcon :name="item.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
              </div>
              <div>
                <h3 class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">{{ item.title }}</h3>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ item.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Permissions Section -->
    <section class="py-20 md:py-28 bg-[#fafbfc] dark:bg-white/[0.02]">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="max-w-[640px] mx-auto text-center mb-14">
          <div class="flex items-center justify-center gap-3 mb-6">
            <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/15 flex items-center justify-center">
              <UIcon name="i-lucide-key-round" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
            Fine-grained permissions
          </h2>
          <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
            Control exactly what each client can see and do. Permissions are checked on every API call and enforced at the UI level — nav items are hidden when access is denied.
          </p>
        </div>

        <div class="grid sm:grid-cols-3 gap-5 max-w-[800px] mx-auto">
          <div
            v-for="perm in permissions"
            :key="perm.key"
            class="rounded-2xl bg-white dark:bg-white/[0.03] p-6 border border-[#121317]/[0.04] dark:border-white/[0.06] text-center"
          >
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4" :class="perm.badgeBg">
              <UIcon :name="perm.icon" class="w-3.5 h-3.5" :class="perm.badgeColor" />
              <span class="text-[13px] font-medium" :class="perm.badgeColor">{{ perm.key }}</span>
            </div>
            <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ perm.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Dark CTA -->
    <section class="py-10 md:py-16">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="rounded-[2rem] bg-[#0a0b0e] py-24 md:py-32 text-center px-6">
          <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-4">
            Give your clients a<br class="hidden sm:block">premium experience
          </h2>
          <p class="text-[16px] text-white/50 max-w-[440px] mx-auto leading-relaxed mb-10">
            A branded portal that makes your agency look polished — and keeps clients in the loop without the email back-and-forth.
          </p>
          <NuxtLink
            to="/auth/login"
            class="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#121317] text-[17.5px] font-medium rounded-full hover:bg-white/90 transition-colors"
          >
            Get Started
          </NuxtLink>
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

const authFeatures = [
  {
    title: 'Dedicated login',
    icon: 'i-lucide-log-in',
    description: 'Clients sign in at /portal/login with their own credentials. Completely separate from staff auth.'
  },
  {
    title: 'Cookie sessions',
    icon: 'i-lucide-cookie',
    description: 'HttpOnly cookie-based authentication. No tokens in localStorage, no XSS attack surface.'
  },
  {
    title: 'Permission gating',
    icon: 'i-lucide-shield-check',
    description: 'Every page and API endpoint checks canViewInvoices, canApproveWork, canAddComments before rendering.'
  },
  {
    title: 'Auto-scoped queries',
    icon: 'i-lucide-database',
    description: 'All database queries filter by the authenticated client ID. No clientId parameter needed — it is implicit.'
  }
]

const portalPages = [
  { title: 'Dashboard', icon: 'i-lucide-layout-dashboard', bgClass: 'bg-blue-50 dark:bg-blue-500/15', iconClass: 'text-blue-600 dark:text-blue-400' },
  { title: 'Projects List', icon: 'i-lucide-folder-open', bgClass: 'bg-violet-50 dark:bg-violet-500/15', iconClass: 'text-violet-600 dark:text-violet-400' },
  { title: 'Project Detail', icon: 'i-lucide-file-text', bgClass: 'bg-violet-50 dark:bg-violet-500/15', iconClass: 'text-violet-600 dark:text-violet-400' },
  { title: 'Approvals List', icon: 'i-lucide-list-checks', bgClass: 'bg-emerald-50 dark:bg-emerald-500/15', iconClass: 'text-emerald-600 dark:text-emerald-400' },
  { title: 'Approval Detail', icon: 'i-lucide-file-check', bgClass: 'bg-emerald-50 dark:bg-emerald-500/15', iconClass: 'text-emerald-600 dark:text-emerald-400' },
  { title: 'Approval Respond', icon: 'i-lucide-message-square-reply', bgClass: 'bg-emerald-50 dark:bg-emerald-500/15', iconClass: 'text-emerald-600 dark:text-emerald-400' },
  { title: 'Invoices', icon: 'i-lucide-receipt', bgClass: 'bg-amber-50 dark:bg-amber-500/15', iconClass: 'text-amber-600 dark:text-amber-400' },
  { title: 'Gallery', icon: 'i-lucide-image', bgClass: 'bg-rose-50 dark:bg-rose-500/15', iconClass: 'text-rose-600 dark:text-rose-400' },
  { title: 'Notifications', icon: 'i-lucide-bell', bgClass: 'bg-sky-50 dark:bg-sky-500/15', iconClass: 'text-sky-600 dark:text-sky-400' },
  { title: 'Settings', icon: 'i-lucide-settings', bgClass: 'bg-[#b7bfd9]/[0.09] dark:bg-white/[0.06]', iconClass: 'text-[#45474D] dark:text-white/60' },
  { title: 'Accept Invite', icon: 'i-lucide-mail-open', bgClass: 'bg-pink-50 dark:bg-pink-500/15', iconClass: 'text-pink-600 dark:text-pink-400' }
]

const approvalFeatures = [
  {
    title: 'Upload deliverables',
    icon: 'i-lucide-upload',
    description: 'Attach files, creative assets, or documents to an approval step for client review.'
  },
  {
    title: 'Approve or revise',
    icon: 'i-lucide-thumbs-up',
    description: 'Clients can approve the work, request revisions with specific feedback, or leave inline comments.'
  },
  {
    title: 'Full audit trail',
    icon: 'i-lucide-history',
    description: 'Every approval, revision, and comment is timestamped and attributed. Complete accountability.'
  },
  {
    title: 'Status tracking',
    icon: 'i-lucide-activity',
    description: 'See which approvals are pending, in review, approved, or need changes — at a glance.'
  }
]

const permissions = [
  {
    key: 'canViewInvoices',
    icon: 'i-lucide-receipt',
    description: 'Controls whether the client can see their billing history and download invoices.',
    badgeBg: 'bg-amber-50 dark:bg-amber-500/15',
    badgeColor: 'text-amber-700 dark:text-amber-400'
  },
  {
    key: 'canApproveWork',
    icon: 'i-lucide-check-circle',
    description: 'Determines if the client can submit approval responses — approve, revise, or comment.',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-500/15',
    badgeColor: 'text-emerald-700 dark:text-emerald-400'
  },
  {
    key: 'canAddComments',
    icon: 'i-lucide-message-square',
    description: 'Allows the client to leave comments on projects and deliverables.',
    badgeBg: 'bg-blue-50 dark:bg-blue-500/15',
    badgeColor: 'text-blue-700 dark:text-blue-400'
  }
]
</script>
