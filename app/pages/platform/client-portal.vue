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
          A complete workspace<br class="hidden sm:block">for every client relationship
        </h1>
        <p class="text-lg md:text-xl text-white/50 max-w-[560px] mx-auto leading-relaxed">
          CRM and leads, campaign measurement, jobs, briefs, approvals, meetings, shared content, social reporting, and billing — all behind a secure, client-scoped login.
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

    <!-- Pages Section (Bento Grid) -->
    <section class="py-20 md:py-28 bg-[#fafbfc] dark:bg-white/[0.02]">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-14">
          <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
            A complete client workspace
          </h2>
          <p class="text-[16px] text-[#45474D] dark:text-white/60 max-w-[500px] mx-auto leading-relaxed">
            From relationship management and campaign outcomes to delivery, review, and billing — each view is scoped to the client and their permissions.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <!-- Dashboard — featured, full width -->
          <div class="md:col-span-2 rounded-3xl bento-gradient-portal-dash overflow-hidden p-6 md:p-8 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div class="flex flex-col md:flex-row md:items-center gap-6">
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-3">
                  <div class="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center">
                    <UIcon name="i-lucide-layout-dashboard" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span class="text-[17px] font-medium text-[#121317] dark:text-white">Dashboard</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed max-w-[400px]">
                  The client's home base — active projects, pending approvals, recent notifications, and their assigned team members.
                </p>
              </div>
              <!-- Mini mockup: stat cards + avatars -->
              <div class="flex gap-3 items-end">
                <div class="rounded-xl bg-white/60 dark:bg-white/[0.06] px-3 py-2.5 shadow-sm dark:shadow-none">
                  <div class="text-[8px] text-[#45474D]/50 dark:text-white/40 mb-0.5">Active</div>
                  <div class="text-[16px] font-semibold text-[#121317] dark:text-white">5</div>
                </div>
                <div class="rounded-xl bg-white/60 dark:bg-white/[0.06] px-3 py-2.5 shadow-sm dark:shadow-none">
                  <div class="text-[8px] text-[#45474D]/50 dark:text-white/40 mb-0.5">Pending</div>
                  <div class="text-[16px] font-semibold text-amber-600 dark:text-amber-400">3</div>
                </div>
                <div class="rounded-xl bg-white/60 dark:bg-white/[0.06] px-3 py-2.5 shadow-sm dark:shadow-none">
                  <div class="text-[8px] text-[#45474D]/50 dark:text-white/40 mb-0.5">Approved</div>
                  <div class="text-[16px] font-semibold text-emerald-600 dark:text-emerald-400">12</div>
                </div>
                <div class="flex -space-x-2 ml-2">
                  <div class="w-7 h-7 rounded-full bg-violet-200 dark:bg-violet-500/30 border-2 border-white dark:border-[#0a0b0e]" />
                  <div class="w-7 h-7 rounded-full bg-rose-200 dark:bg-rose-500/30 border-2 border-white dark:border-[#0a0b0e]" />
                  <div class="w-7 h-7 rounded-full bg-blue-200 dark:bg-blue-500/30 border-2 border-white dark:border-[#0a0b0e]" />
                </div>
              </div>
            </div>
          </div>

          <!-- Projects -->
          <div class="rounded-3xl bento-gradient-portal-projects overflow-hidden p-6 md:p-8 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-500/15 flex items-center justify-center">
                <UIcon name="i-lucide-folder-open" class="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <span class="text-[15px] font-medium text-[#121317] dark:text-white">Projects</span>
            </div>
            <div class="space-y-2">
              <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/50 dark:bg-white/[0.05]">
                <UIcon name="i-lucide-folder-open" class="w-3.5 h-3.5 text-violet-500/60 dark:text-violet-400/60" />
                <span class="text-[12px] text-[#121317]/70 dark:text-white/60">Projects List</span>
              </div>
              <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/50 dark:bg-white/[0.05]">
                <UIcon name="i-lucide-file-text" class="w-3.5 h-3.5 text-violet-500/60 dark:text-violet-400/60" />
                <span class="text-[12px] text-[#121317]/70 dark:text-white/60">Project Detail</span>
              </div>
            </div>
          </div>

          <!-- Approvals -->
          <div class="rounded-3xl bento-gradient-portal-approvals overflow-hidden p-6 md:p-8 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center">
                <UIcon name="i-lucide-list-checks" class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span class="text-[15px] font-medium text-[#121317] dark:text-white">Approvals</span>
            </div>
            <div class="space-y-2">
              <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/50 dark:bg-white/[0.05]">
                <UIcon name="i-lucide-list-checks" class="w-3.5 h-3.5 text-emerald-500/60 dark:text-emerald-400/60" />
                <span class="text-[12px] text-[#121317]/70 dark:text-white/60">Approvals List</span>
              </div>
              <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/50 dark:bg-white/[0.05]">
                <UIcon name="i-lucide-file-check" class="w-3.5 h-3.5 text-emerald-500/60 dark:text-emerald-400/60" />
                <span class="text-[12px] text-[#121317]/70 dark:text-white/60">Approval Detail</span>
              </div>
              <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/50 dark:bg-white/[0.05]">
                <UIcon name="i-lucide-message-square-reply" class="w-3.5 h-3.5 text-emerald-500/60 dark:text-emerald-400/60" />
                <span class="text-[12px] text-[#121317]/70 dark:text-white/60">Approval Respond</span>
              </div>
            </div>
          </div>

          <!-- Requests -->
          <div class="rounded-3xl bento-gradient-portal-requests overflow-hidden p-6 md:p-8 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-500/15 flex items-center justify-center">
                <UIcon name="i-lucide-message-square-plus" class="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <span class="text-[15px] font-medium text-[#121317] dark:text-white">Requests</span>
            </div>
            <div class="space-y-2">
              <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/50 dark:bg-white/[0.05]">
                <UIcon name="i-lucide-message-square-plus" class="w-3.5 h-3.5 text-orange-500/60 dark:text-orange-400/60" />
                <span class="text-[12px] text-[#121317]/70 dark:text-white/60">Requests List</span>
              </div>
              <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/50 dark:bg-white/[0.05]">
                <UIcon name="i-lucide-message-circle" class="w-3.5 h-3.5 text-orange-500/60 dark:text-orange-400/60" />
                <span class="text-[12px] text-[#121317]/70 dark:text-white/60">Request Detail</span>
              </div>
            </div>
          </div>

          <!-- Invoices -->
          <div class="rounded-3xl bento-gradient-portal-invoices overflow-hidden p-6 md:p-8 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/15 flex items-center justify-center">
                <UIcon name="i-lucide-receipt" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <span class="text-[15px] font-medium text-[#121317] dark:text-white">Invoices</span>
            </div>
            <div class="space-y-2">
              <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/50 dark:bg-white/[0.05]">
                <UIcon name="i-lucide-receipt" class="w-3.5 h-3.5 text-amber-500/60 dark:text-amber-400/60" />
                <span class="text-[12px] text-[#121317]/70 dark:text-white/60">Invoice List & Detail</span>
              </div>
            </div>
          </div>

          <!-- CRM & Leads -->
          <div class="rounded-3xl bento-gradient-portal-projects overflow-hidden p-6 md:p-8 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-500/15 flex items-center justify-center">
                <UIcon name="i-lucide-contact-round" class="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
              <span class="text-[15px] font-medium text-[#121317] dark:text-white">CRM &amp; leads</span>
            </div>
            <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">
              Client-scoped contacts, companies, opportunities, lead follow-up, response status, and won outcomes.
            </p>
          </div>

          <!-- Campaigns & Measurement -->
          <div class="rounded-3xl bento-gradient-portal-dash overflow-hidden p-6 md:p-8 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center">
                <UIcon name="i-lucide-chart-no-axes-combined" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span class="text-[15px] font-medium text-[#121317] dark:text-white">Campaigns &amp; measurement</span>
            </div>
            <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">
              Permission-gated campaign trends, spend, leads, outcomes, and separate browser, server, and CRM evidence.
            </p>
          </div>

          <!-- Meetings & Video Reviews -->
          <div class="rounded-3xl bento-gradient-portal-approvals overflow-hidden p-6 md:p-8 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-500/15 flex items-center justify-center">
                <UIcon name="i-lucide-video" class="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <span class="text-[15px] font-medium text-[#121317] dark:text-white">Meetings &amp; video reviews</span>
            </div>
            <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">
              Upcoming sessions, shared recordings, review-ready video, and feedback kept with the client relationship.
            </p>
          </div>

          <!-- Briefs & Social -->
          <div class="rounded-3xl bento-gradient-portal-requests overflow-hidden p-6 md:p-8 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl bg-pink-50 dark:bg-pink-500/15 flex items-center justify-center">
                <UIcon name="i-lucide-panels-top-left" class="w-5 h-5 text-pink-600 dark:text-pink-400" />
              </div>
              <span class="text-[15px] font-medium text-[#121317] dark:text-white">Briefs &amp; social</span>
            </div>
            <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">
              Structured brief intake plus approved social inbox, listening, reporting, and news workflows.
            </p>
          </div>

          <!-- Utility pages — compact strip -->
          <div class="md:col-span-2 rounded-3xl bento-gradient-portal-utility overflow-hidden p-6 md:p-8 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-500/15 flex items-center justify-center shrink-0">
                  <UIcon name="i-lucide-image" class="w-4 h-4 text-rose-600 dark:text-rose-400" />
                </div>
                <span class="text-[13px] font-medium text-[#121317] dark:text-white">Gallery</span>
              </div>
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-500/15 flex items-center justify-center shrink-0">
                  <UIcon name="i-lucide-bell" class="w-4 h-4 text-sky-600 dark:text-sky-400" />
                </div>
                <span class="text-[13px] font-medium text-[#121317] dark:text-white">Notifications</span>
              </div>
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-[#b7bfd9]/[0.09] dark:bg-white/[0.06] flex items-center justify-center shrink-0">
                  <UIcon name="i-lucide-settings" class="w-4 h-4 text-[#45474D] dark:text-white/60" />
                </div>
                <span class="text-[13px] font-medium text-[#121317] dark:text-white">Settings</span>
              </div>
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-pink-50 dark:bg-pink-500/15 flex items-center justify-center shrink-0">
                  <UIcon name="i-lucide-mail-open" class="w-4 h-4 text-pink-600 dark:text-pink-400" />
                </div>
                <span class="text-[13px] font-medium text-[#121317] dark:text-white">Accept Invite</span>
              </div>
            </div>
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

          <!-- Right: Approval mockup + feature details -->
          <div class="space-y-6">
            <!-- Approval card mockup -->
            <div class="w-full rounded-3xl feature-gradient-2 overflow-hidden flex items-center justify-center px-6 py-10 md:px-10 md:py-14">
              <div class="w-full max-w-[360px] rounded-2xl bg-white/80 dark:bg-white/[0.08] backdrop-blur-sm shadow-sm dark:shadow-none p-5 flex flex-col">
                <!-- Header -->
                <div class="flex items-center justify-between mb-4">
                  <div class="text-[12px] font-medium text-[#121317]/80 dark:text-white/80">Campaign Creative v2</div>
                  <div class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">Approved</div>
                </div>
                <!-- Thumbnail squares -->
                <div class="flex gap-2 mb-4">
                  <div class="w-16 h-12 rounded-lg bg-[#121317]/[0.06] dark:bg-white/[0.08]" />
                  <div class="w-16 h-12 rounded-lg bg-[#121317]/[0.06] dark:bg-white/[0.08]" />
                  <div class="w-16 h-12 rounded-lg bg-[#121317]/[0.06] dark:bg-white/[0.08]" />
                </div>
                <!-- Comment bubble -->
                <div class="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-xl bg-[#121317]/[0.03] dark:bg-white/[0.04]">
                  <div class="w-5 h-5 rounded-full bg-violet-200 dark:bg-violet-500/30 shrink-0 mt-0.5" />
                  <div>
                    <div class="h-1.5 w-16 rounded-full bg-[#121317]/10 dark:bg-white/15 mb-1.5" />
                    <div class="h-1 w-24 rounded-full bg-[#121317]/[0.06] dark:bg-white/10" />
                  </div>
                </div>
                <!-- Action buttons -->
                <div class="flex gap-2">
                  <div class="flex-1 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
                    <span class="text-[9px] font-semibold text-white">Approve</span>
                  </div>
                  <div class="flex-1 h-7 rounded-lg bg-[#121317]/[0.06] dark:bg-white/[0.08] flex items-center justify-center">
                    <span class="text-[9px] font-medium text-[#121317]/70 dark:text-white/60">Request Changes</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Feature cards -->
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

    <!-- Job Requests & Support Section -->
    <section class="py-20 md:py-28 bg-[#fafbfc] dark:bg-white/[0.02]">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
          <!-- Left: Description -->
          <div>
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-500/15 flex items-center justify-center">
                <UIcon name="i-lucide-message-square-plus" class="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Job requests &amp; support</h2>
            </div>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Clients can submit job requests for new work or support tickets for issues — directly from the portal. No more email threads or lost Slack messages.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Each request has a built-in message thread where clients and staff can exchange updates. Internal notes stay hidden from clients, visible only to your team.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Staff manage all requests from the agency dashboard — assign team members, link to projects, set priorities, and track resolution times.
            </p>
          </div>

          <!-- Right: Request form mockup + feature details -->
          <div class="space-y-6">
            <!-- Request form mockup -->
            <div class="w-full rounded-3xl feature-gradient-4 overflow-hidden flex items-center justify-center px-6 py-10 md:px-10 md:py-14">
              <div class="w-full max-w-[340px] rounded-2xl bg-white/80 dark:bg-white/[0.08] backdrop-blur-sm shadow-sm dark:shadow-none p-5 flex flex-col">
                <!-- Header -->
                <div class="text-[13px] font-medium text-[#121317]/80 dark:text-white/80 mb-4">New Request</div>
                <!-- Type selector pills -->
                <div class="flex gap-2 mb-4">
                  <div class="px-3 py-1.5 rounded-full bg-orange-500 text-[9px] font-semibold text-white">Job Request</div>
                  <div class="px-3 py-1.5 rounded-full bg-[#121317]/[0.06] dark:bg-white/[0.08] text-[9px] font-medium text-[#45474D]/60 dark:text-white/40">Support</div>
                </div>
                <!-- Category dropdown -->
                <div class="mb-3">
                  <div class="text-[9px] text-[#45474D]/60 dark:text-white/40 mb-1 font-medium">Category</div>
                  <div class="h-7 w-full rounded-lg bg-[#121317]/[0.04] dark:bg-white/[0.06] border border-[#121317]/[0.06] dark:border-white/[0.08] flex items-center px-2.5">
                    <div class="h-1.5 w-12 rounded-full bg-[#121317]/10 dark:bg-white/15" />
                    <UIcon name="i-lucide-chevron-down" class="w-3 h-3 text-[#45474D]/40 dark:text-white/30 ml-auto" />
                  </div>
                </div>
                <!-- Title -->
                <div class="mb-3">
                  <div class="text-[9px] text-[#45474D]/60 dark:text-white/40 mb-1 font-medium">Title</div>
                  <div class="h-7 w-full rounded-lg bg-[#121317]/[0.04] dark:bg-white/[0.06] border border-[#121317]/[0.06] dark:border-white/[0.08]" />
                </div>
                <!-- Description textarea -->
                <div class="mb-3">
                  <div class="text-[9px] text-[#45474D]/60 dark:text-white/40 mb-1 font-medium">Description</div>
                  <div class="h-16 w-full rounded-lg bg-[#121317]/[0.04] dark:bg-white/[0.06] border border-[#121317]/[0.06] dark:border-white/[0.08]" />
                </div>
                <!-- Priority selector -->
                <div class="mb-4">
                  <div class="text-[9px] text-[#45474D]/60 dark:text-white/40 mb-1.5 font-medium">Priority</div>
                  <div class="flex gap-1.5">
                    <div class="px-2.5 py-1 rounded-md bg-[#121317]/[0.04] dark:bg-white/[0.06] text-[8px] text-[#45474D]/50 dark:text-white/40">Low</div>
                    <div class="px-2.5 py-1 rounded-md bg-blue-100 dark:bg-blue-500/20 text-[8px] font-medium text-blue-700 dark:text-blue-400">Normal</div>
                    <div class="px-2.5 py-1 rounded-md bg-[#121317]/[0.04] dark:bg-white/[0.06] text-[8px] text-[#45474D]/50 dark:text-white/40">High</div>
                    <div class="px-2.5 py-1 rounded-md bg-[#121317]/[0.04] dark:bg-white/[0.06] text-[8px] text-[#45474D]/50 dark:text-white/40">Urgent</div>
                  </div>
                </div>
                <!-- Submit button -->
                <div class="w-full h-8 rounded-lg bg-orange-500 flex items-center justify-center">
                  <span class="text-[10px] font-semibold text-white">Submit Request</span>
                </div>
              </div>
            </div>

            <!-- Feature cards -->
            <div
              v-for="item in requestFeatures"
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

    <!-- Team & Invoices Section -->
    <section class="py-20 md:py-28">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid md:grid-cols-2 gap-12 md:gap-16">
          <!-- Team Visibility -->
          <div>
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 flex items-center justify-center">
                <UIcon name="i-lucide-users" class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h2 class="text-[clamp(20px,2.5vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Your team, visible</h2>
            </div>
            <div class="space-y-4">
              <div
                v-for="item in teamFeatures"
                :key="item.title"
                class="flex items-start gap-4 p-5 rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03]"
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

          <!-- Invoice Enhancements -->
          <div>
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/15 flex items-center justify-center">
                <UIcon name="i-lucide-receipt" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 class="text-[clamp(20px,2.5vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Invoice detail view</h2>
            </div>
            <div class="space-y-4">
              <div
                v-for="item in invoiceFeatures"
                :key="item.title"
                class="flex items-start gap-4 p-5 rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03]"
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

        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-[960px] mx-auto">
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

    <!-- Stats Strip -->
    <section class="py-16 md:py-20">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 text-center">
          <div v-for="stat in portalStats" :key="stat.label">
            <div class="text-[clamp(36px,5vw,56px)] font-[500] text-[#121317] dark:text-white tracking-[-0.03em]">
              {{ stat.value }}
            </div>
            <div class="text-[14px] text-[#45474D] dark:text-white/50 mt-1">
              {{ stat.label }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Dark CTA with wave particles -->
    <section class="py-10 md:py-16">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="relative rounded-[2rem] bg-[#0a0b0e] overflow-hidden py-24 md:py-32">
          <!-- Animated rose wave particles -->
          <ClientOnly>
            <div class="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
              <!-- Wave layer 1 (slow, large orbit) -->
              <div class="cta-wave cta-wave-1">
                <div
                  v-for="dot in waveParticles1"
                  :key="'w1-' + dot.id"
                  class="absolute rounded-full"
                  :style="{
                    left: dot.x + '%',
                    top: dot.y + '%',
                    width: dot.size + 'px',
                    height: dot.size + 'px',
                    backgroundColor: dot.color,
                    opacity: dot.opacity
                  }"
                />
              </div>
              <!-- Wave layer 2 (medium, counter-rotate) -->
              <div class="cta-wave cta-wave-2">
                <div
                  v-for="dot in waveParticles2"
                  :key="'w2-' + dot.id"
                  class="absolute rounded-full"
                  :style="{
                    left: dot.x + '%',
                    top: dot.y + '%',
                    width: dot.size + 'px',
                    height: dot.size + 'px',
                    backgroundColor: dot.color,
                    opacity: dot.opacity
                  }"
                />
              </div>
              <!-- Wave layer 3 (fast, tight swirl) -->
              <div class="cta-wave cta-wave-3">
                <div
                  v-for="dot in waveParticles3"
                  :key="'w3-' + dot.id"
                  class="absolute rounded-full"
                  :style="{
                    left: dot.x + '%',
                    top: dot.y + '%',
                    width: dot.size + 'px',
                    height: dot.size + 'px',
                    backgroundColor: dot.color,
                    opacity: dot.opacity
                  }"
                />
              </div>
              <!-- Ambient glow -->
              <div class="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-rose-500/[0.06] blur-[120px] cta-glow-1" />
              <div class="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full bg-rose-400/[0.04] blur-[100px] cta-glow-2" />
            </div>
          </ClientOnly>

          <!-- Content -->
          <div class="relative text-center px-6">
            <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Give your clients a<br class="hidden sm:block">premium experience
            </h2>
            <p class="text-[16px] text-white/50 max-w-[440px] mx-auto leading-relaxed mb-10">
              A branded portal that makes your agency look polished — and keeps clients in the loop without the email back-and-forth.
            </p>
            <NuxtLink
              to="/contact"
              class="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#121317] text-[17.5px] font-medium rounded-full hover:bg-white/90 transition-colors"
            >
              Talk to us
            </NuxtLink>
          </div>
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
    description: 'Every page and API endpoint checks permissions like canViewInvoices, canApproveWork, and canSubmitRequests before rendering.'
  },
  {
    title: 'Auto-scoped queries',
    icon: 'i-lucide-database',
    description: 'All database queries filter by the authenticated client ID. No clientId parameter needed — it is implicit.'
  }
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
  },
  {
    key: 'canSubmitRequests',
    icon: 'i-lucide-message-square-plus',
    description: 'Controls whether the client can submit job requests and support tickets.',
    badgeBg: 'bg-orange-50 dark:bg-orange-500/15',
    badgeColor: 'text-orange-700 dark:text-orange-400'
  }
]

const requestFeatures = [
  {
    title: 'Two request types',
    icon: 'i-lucide-split',
    description: 'Job requests for new work (projects, revisions, strategy) and support tickets for issues (billing, access, bugs).'
  },
  {
    title: 'Category-based routing',
    icon: 'i-lucide-tag',
    description: 'Each type has its own categories — design, development, content for jobs; billing, access, feedback for support.'
  },
  {
    title: 'Conversation threads',
    icon: 'i-lucide-messages-square',
    description: 'Built-in message thread per request. Clients and staff exchange updates without leaving the portal.'
  },
  {
    title: 'Internal notes',
    icon: 'i-lucide-eye-off',
    description: 'Staff can leave internal notes that are invisible to the client — perfect for handoff context and team coordination.'
  }
]

const teamFeatures = [
  {
    title: 'Dashboard team widget',
    icon: 'i-lucide-contact',
    description: 'Clients see their assigned project managers on the dashboard with email and phone contact buttons.'
  },
  {
    title: 'Project team members',
    icon: 'i-lucide-user-check',
    description: 'The project detail page shows all team members assigned to tasks — controlled by the show_team_members setting.'
  }
]

const invoiceFeatures = [
  {
    title: 'Line item breakdown',
    icon: 'i-lucide-list',
    description: 'Click any invoice to see the full line-by-line breakdown — descriptions, quantities, prices, and amounts.'
  },
  {
    title: 'Aging badges',
    icon: 'i-lucide-clock',
    description: 'Overdue invoices show exact days overdue with color-coded badges — 30d, 60d, and 90+ day aging buckets.'
  },
  {
    title: 'Slideover detail view',
    icon: 'i-lucide-panel-right',
    description: 'Full invoice detail opens in a slideover — subtotals, tax, discounts, payments, and outstanding balance at a glance.'
  }
]

// Stats strip data
const portalStats = [
  { value: 'CRM', label: 'Contacts, companies, leads, and opportunities' },
  { value: 'Live', label: 'Campaign and measurement context' },
  { value: 'Scoped', label: 'Per-user modules and permissions' },
  { value: 'Audited', label: 'Agency access and approval history' }
]

useSeoMeta({
  title: 'Client Portal CRM, Campaigns & Collaboration — XeroFlow',
  description: 'Give every client a secure workspace for CRM and leads, campaign analytics, measurement, jobs, briefs, approvals, meetings, social reporting, shared files, and billing.',
  ogTitle: 'Client Portal CRM, Campaigns & Collaboration — XeroFlow',
  ogDescription: 'A client-scoped workspace for relationship management, campaign outcomes, delivery, approvals, shared work, and billing.'
})

// Rose particle colors for CTA waves
const roseColors = ['#fb7185', '#f472b6', '#e11d48', '#fda4af', '#be123c']

// CTA wave particles (3 layers for depth)
const waveParticles1 = Array.from({ length: 35 }, (_, i) => ({
  id: i,
  x: 10 + Math.random() * 50,
  y: 15 + Math.random() * 70,
  size: 2 + Math.random() * 3.5,
  color: roseColors[Math.floor(Math.random() * roseColors.length)],
  opacity: 0.3 + Math.random() * 0.5
}))

const waveParticles2 = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  x: 20 + Math.random() * 60,
  y: 10 + Math.random() * 80,
  size: 1.5 + Math.random() * 3,
  color: roseColors[Math.floor(Math.random() * roseColors.length)],
  opacity: 0.2 + Math.random() * 0.4
}))

const waveParticles3 = Array.from({ length: 25 }, (_, i) => ({
  id: i,
  x: 15 + Math.random() * 55,
  y: 20 + Math.random() * 60,
  size: 1.5 + Math.random() * 2.5,
  color: roseColors[Math.floor(Math.random() * roseColors.length)],
  opacity: 0.25 + Math.random() * 0.45
}))
</script>

<style scoped>
/* CTA wave particle animations */
.cta-wave {
  position: absolute;
  inset: 0;
  transform-origin: 40% 50%;
}
.cta-wave-1 {
  animation: wave-drift-1 20s ease-in-out infinite;
}
.cta-wave-2 {
  animation: wave-drift-2 16s ease-in-out infinite;
}
.cta-wave-3 {
  animation: wave-drift-3 12s ease-in-out infinite;
}

@keyframes wave-drift-1 {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  25% { transform: translate(30px, -20px) rotate(8deg); }
  50% { transform: translate(-10px, 15px) rotate(-4deg); }
  75% { transform: translate(20px, 10px) rotate(5deg); }
}

@keyframes wave-drift-2 {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  25% { transform: translate(-25px, 15px) rotate(-6deg); }
  50% { transform: translate(20px, -25px) rotate(7deg); }
  75% { transform: translate(-15px, -10px) rotate(-3deg); }
}

@keyframes wave-drift-3 {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  33% { transform: translate(20px, 20px) rotate(10deg); }
  66% { transform: translate(-20px, -15px) rotate(-8deg); }
}

.cta-glow-1 {
  animation: glow-pulse-1 8s ease-in-out infinite;
}
.cta-glow-2 {
  animation: glow-pulse-2 10s ease-in-out infinite;
}

@keyframes glow-pulse-1 {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.15); }
}

@keyframes glow-pulse-2 {
  0%, 100% { opacity: 0.5; transform: scale(1.1); }
  50% { opacity: 0.8; transform: scale(0.9); }
}

/* Feature illustration gradients (from index.vue) */
.feature-gradient-2 {
  background: linear-gradient(135deg, #d1fae5 0%, #ccfbf1 25%, #dbeafe 50%, #d1fae5 75%, #fef3c7 100%);
}
.feature-gradient-4 {
  background: linear-gradient(135deg, #fef3c7 0%, #fed7aa 20%, #fce7f3 45%, #ede9fe 70%, #fef3c7 100%);
}
.feature-gradient-5 {
  background: linear-gradient(135deg, #fce7f3 0%, #fecdd3 25%, #ede9fe 50%, #dbeafe 75%, #fce7f3 100%);
}

:root.dark .feature-gradient-2 {
  background: linear-gradient(135deg, #064e3b 0%, #134e4a 25%, #172554 50%, #064e3b 75%, #451a03 100%);
}
:root.dark .feature-gradient-4 {
  background: linear-gradient(135deg, #451a03 0%, #7c2d12 20%, #831843 45%, #2e1065 70%, #451a03 100%);
}
:root.dark .feature-gradient-5 {
  background: linear-gradient(135deg, #831843 0%, #881337 25%, #2e1065 50%, #172554 75%, #831843 100%);
}

/* Bento grid gradients — light */
.bento-gradient-portal-dash {
  background: linear-gradient(135deg, #dbeafe, #e0e7ff, #ede9fe);
}
.bento-gradient-portal-projects {
  background: linear-gradient(135deg, #ede9fe, #e0e7ff, #dbeafe);
}
.bento-gradient-portal-approvals {
  background: linear-gradient(135deg, #d1fae5, #ccfbf1, #dbeafe);
}
.bento-gradient-portal-requests {
  background: linear-gradient(135deg, #fed7aa, #fef3c7, #fce7f3);
}
.bento-gradient-portal-invoices {
  background: linear-gradient(135deg, #fef3c7, #fed7aa, #fce7f3);
}
.bento-gradient-portal-utility {
  background: linear-gradient(135deg, #f3f4f6, #f0f0f5, #f5f3ff);
}

/* Bento grid gradients — dark */
:root.dark .bento-gradient-portal-dash {
  background: linear-gradient(135deg, #172554, #1e1b4b, #2e1065);
}
:root.dark .bento-gradient-portal-projects {
  background: linear-gradient(135deg, #2e1065, #1e1b4b, #172554);
}
:root.dark .bento-gradient-portal-approvals {
  background: linear-gradient(135deg, #064e3b, #134e4a, #172554);
}
:root.dark .bento-gradient-portal-requests {
  background: linear-gradient(135deg, #7c2d12, #451a03, #831843);
}
:root.dark .bento-gradient-portal-invoices {
  background: linear-gradient(135deg, #451a03, #7c2d12, #831843);
}
:root.dark .bento-gradient-portal-utility {
  background: linear-gradient(135deg, #1a1a2e, #16213e, #1a1a2e);
}
</style>
