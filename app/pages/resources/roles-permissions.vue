<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="resources" />

    <div class="pt-[52px]">
      <div class="max-w-[720px] mx-auto px-6 pt-24 md:pt-36 pb-20 md:pb-32">

        <NuxtLink to="/resources" class="inline-flex items-center gap-1.5 text-[13px] text-[#45474D]/60 dark:text-white/40 hover:text-[#121317] dark:hover:text-white transition-colors mb-8">
          <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
          Back to Resources
        </NuxtLink>

        <h1 class="text-[clamp(32px,5vw,48px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.02em] mb-4">
          Roles &amp; Permissions
        </h1>
        <p class="text-lg text-[#45474D] dark:text-white/60 leading-relaxed mb-3">
          Configure team access levels, create custom roles, and understand how XeroFlow enforces permissions across the platform.
        </p>
        <p class="text-[13px] text-[#45474D]/50 dark:text-white/40 mb-14">10 min read</p>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-14">
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">15</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Built-in Roles</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">15+</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Permission Areas</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">3-Layer</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Enforcement</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">Instant</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Role Changes</div>
          </div>
        </div>

        <div class="flex flex-col gap-12">

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Understanding Roles</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              XeroFlow has 15 built-in roles that range from <strong class="font-medium text-[#121317] dark:text-white">owner</strong> with full platform control down to <strong class="font-medium text-[#121317] dark:text-white">guest</strong> with read-only access to specific boards. Each role determines what a user can see and do across the entire platform &mdash; sidebar visibility, page access, and API-level permissions.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              The hierarchy runs: <strong class="font-medium text-[#121317] dark:text-white">owner</strong> &rarr; <strong class="font-medium text-[#121317] dark:text-white">admin</strong> &rarr; <strong class="font-medium text-[#121317] dark:text-white">manager</strong> &rarr; department heads (finance, creative, media) &rarr; team leads &rarr; members &rarr; viewers &rarr; guests. Higher roles inherit all permissions from the levels below them, so an admin can do everything a manager can, plus admin-specific actions like managing users and configuring integrations.
            </p>
          </section>

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Custom Roles</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Create custom roles when the built-in ones don't match your organisation's structure. Navigate to <strong class="font-medium text-[#121317] dark:text-white">Admin &rarr; Permissions</strong> to see the full role matrix. Custom roles inherit a base permission level and let you toggle specific areas on or off, giving you fine-grained control without starting from scratch.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Common examples include a <strong class="font-medium text-[#121317] dark:text-white">"Junior Buyer"</strong> role that grants media access but blocks budget editing, or a <strong class="font-medium text-[#121317] dark:text-white">"Freelancer"</strong> role that provides board access without any visibility into financials. Custom roles appear alongside built-in roles in the user management interface.
            </p>
          </section>

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Permission Areas</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              XeroFlow defines over 15 permission areas that can be independently granted or restricted per role: <strong class="font-medium text-[#121317] dark:text-white">finance</strong>, <strong class="font-medium text-[#121317] dark:text-white">creative</strong>, <strong class="font-medium text-[#121317] dark:text-white">media</strong>, <strong class="font-medium text-[#121317] dark:text-white">clients</strong>, <strong class="font-medium text-[#121317] dark:text-white">admin</strong>, <strong class="font-medium text-[#121317] dark:text-white">boards</strong>, <strong class="font-medium text-[#121317] dark:text-white">chat</strong>, <strong class="font-medium text-[#121317] dark:text-white">time tracking</strong>, <strong class="font-medium text-[#121317] dark:text-white">AI</strong>, <strong class="font-medium text-[#121317] dark:text-white">reports</strong>, and more.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Finance permissions control access to invoices, expenses, P&amp;L reports, and EOM processing. Creative permissions control briefs, banner studio, and ad tools. Each permission area maps to specific sidebar sections, page routes, and API endpoints &mdash; ensuring consistent enforcement regardless of how a user attempts to access a feature.
            </p>
          </section>

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">How Enforcement Works</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              Permissions are enforced at three distinct layers, creating a defence-in-depth model. <strong class="font-medium text-[#121317] dark:text-white">Layer 1: Server middleware</strong> blocks unauthorised API calls before they reach your data. <strong class="font-medium text-[#121317] dark:text-white">Layer 2: Route middleware</strong> redirects users away from pages they cannot access. <strong class="font-medium text-[#121317] dark:text-white">Layer 3: Sidebar gating</strong> hides navigation items for restricted areas, so users never see links to pages they cannot reach.
            </p>
            <div class="rounded-2xl bg-gradient-to-br from-slate-50 to-gray-50/50 dark:from-slate-500/10 dark:to-gray-500/5 border border-slate-100/50 dark:border-slate-500/20 p-6">
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-500/20 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-shield-check" class="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </div>
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">Instant Enforcement</p>
                  <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">Changes take effect immediately &mdash; no restart required. External webhooks (Xero, Meta) and internal workers are exempt from RBAC, so integrations continue working regardless of user-level permissions.</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Managing Users</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Navigate to <strong class="font-medium text-[#121317] dark:text-white">Admin &rarr; Users</strong> to see all team members. From this page you can change roles, invite new users, and deactivate accounts. User cards display role badges and permission summaries so you can quickly audit who has access to what.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Bulk role changes are supported for team restructuring. Select multiple users and assign a new role in one operation. The system applies the change immediately across all three enforcement layers.
            </p>
          </section>

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Best Practices</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Start with built-in roles before creating custom ones. The 15 default roles cover the most common agency structures. Only create custom roles when you have a specific need that the defaults don't satisfy.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Apply the <strong class="font-medium text-[#121317] dark:text-white">principle of least privilege</strong> &mdash; give users only the access they need. Review permissions quarterly to catch role drift. When rolling out a new custom role, create a test user first and verify access before assigning it to real team members.
            </p>
          </section>

          <section class="mt-4 pt-10 border-t border-[#121317]/[0.06] dark:border-white/[0.06]">
            <h2 class="text-[18px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-5">Next Steps</h2>
            <div class="flex flex-col gap-3">
              <NuxtLink to="/resources/briefs-proposals" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Briefs &amp; Proposals</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Templates, AI tools, and quote conversion</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink to="/resources/time-tracking" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Time Tracking &amp; Timesheets</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Time logging, approvals, and team utilisation</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
            </div>
          </section>

        </div>
      </div>
    </div>

    <MarketingFooter />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

useSeoMeta({
  title: 'Roles & Permissions — XeroFlow',
  description: 'Configure team access levels, create custom roles, and understand how XeroFlow enforces permissions across the platform with 3-layer RBAC.',
  ogTitle: 'Roles & Permissions — XeroFlow',
  ogDescription: 'Configure team access levels, create custom roles, and understand how XeroFlow enforces permissions across the platform with 3-layer RBAC.',
})
</script>
