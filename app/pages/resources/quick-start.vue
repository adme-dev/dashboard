<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="resources" />

    <!-- Article -->
    <article class="pt-[52px]">
      <div class="max-w-[720px] mx-auto px-6 pt-24 md:pt-36 pb-16 md:pb-24">

        <!-- Breadcrumb -->
        <NuxtLink to="/resources" class="inline-flex items-center gap-1.5 text-[14px] text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors mb-8">
          <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
          Back to Resources
        </NuxtLink>

        <!-- Hero -->
        <div class="mb-16">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
              <UIcon name="i-lucide-rocket" class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span class="text-[13px] text-[#45474D]/60 dark:text-white/40 font-medium">8 min read</span>
          </div>
          <h1 class="text-[clamp(32px,5vw,48px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.02em] mb-4">
            Quick Start Guide
          </h1>
          <p class="text-lg text-[#45474D] dark:text-white/60 leading-relaxed">
            Get your agency up and running on XeroFlow in under 10 minutes. This guide walks you through creating your workspace, setting up your first board, inviting your team, and connecting Xero.
          </p>
        </div>

        <!-- Stats Row -->
        <div class="grid grid-cols-3 gap-4 mb-16">
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">10 min</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Setup Time</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">5</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Simple Steps</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">&infin;</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Unlimited Boards</div>
          </div>
        </div>

        <!-- Content -->
        <div class="flex flex-col gap-14">

          <!-- Section 1 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">1. Create your workspace</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              After signing up, you will land on the workspace creation screen. Your workspace is the top-level container for everything in XeroFlow -- boards, clients, invoices, and team members all live here. Choose a name that represents your agency (you can change it later from Settings).
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Once created, you will be taken to your dashboard. This is your home base -- a personalized overview showing recent activity, upcoming deadlines, and key metrics. Take a moment to familiarize yourself with the sidebar navigation: Boards, Clients, Finance, Chat, and AI are the core sections you will use daily.
            </p>
          </section>

          <!-- Section 2 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">2. Set up your first board</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Boards are the heart of XeroFlow. Navigate to the Boards section in your sidebar and click "New Board." Give it a name like "Client Projects" or "Weekly Tasks" -- something your team will immediately understand.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Every new board comes with a default Status column and a few starter groups. You can add more columns right away -- click the "+" icon at the end of the column headers. Popular first columns include People (to assign tasks), Date (for deadlines), and Status (for workflow stages like "To Do", "In Progress", "Done").
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Add a few tasks to get a feel for how it works. Type a task name, press Enter, and it appears in your board. You can drag tasks between groups, fill in column values, and switch between Table, Kanban, Timeline, Calendar, and Gallery views using the toolbar at the top.
            </p>
          </section>

          <!-- Highlight Callout -->
          <div class="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50/50 dark:from-emerald-500/10 dark:to-teal-500/5 border border-emerald-100/50 dark:border-emerald-500/20 p-6">
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-lightbulb" class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">Pro Tip</p>
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">Start with a single board for your most active project. Once your team is comfortable with the workflow, duplicate it as a template for new projects. This way you build consistency without overwhelming anyone on day one.</p>
              </div>
            </div>
          </div>

          <!-- Section 3 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">3. Invite your team</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              XeroFlow is designed for collaboration. Head to Settings and select "Team Members" to send invitations. Enter your colleagues' email addresses and assign them a role -- Owner, Admin, Member, or Viewer. Most team members should start as Members, which gives them full access to boards and tasks without admin-level settings access.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Invited members receive an email with a link to join your workspace. Once they accept, they can immediately see shared boards, participate in chat, and start tracking their work. You can always change roles later from the Team settings page.
            </p>
          </section>

          <!-- Section 4 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">4. Connect Xero</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              If your agency uses Xero for accounting, connecting it unlocks powerful financial features. Go to Settings, then Integrations, and click "Connect Xero." You will be redirected to Xero's OAuth authorization page where you grant XeroFlow read and write access to your organization.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Once connected, XeroFlow automatically syncs your chart of accounts, contacts, and recent invoices. This enables features like end-of-month invoice generation, profit and loss dashboards, and client-level billing -- all from within XeroFlow. The sync runs continuously, so changes in either direction are reflected within minutes.
            </p>
          </section>

          <!-- Section 5 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">5. Explore the dashboard</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              With your board created, team invited, and Xero connected, head back to your dashboard. You will see widgets populating with real data -- tasks assigned to you, recent board activity, upcoming deadlines, and financial summaries if Xero is connected.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              The AI chat panel in the bottom right is available from any page. Try asking it something like "What tasks are due this week?" or "Show me this month's revenue." It pulls context from your boards, clients, and financial data to give you answers instantly.
            </p>
          </section>

          <!-- Dark CTA Card -->
          <div class="rounded-2xl bg-[#0a0b0e] p-8 md:p-12 text-center">
            <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span class="text-white text-xs font-semibold">XF</span>
            </div>
            <h3 class="text-[22px] font-[450] text-white tracking-[-0.02em] mb-3">Ready to get started?</h3>
            <p class="text-[15px] text-white/60 mb-6 max-w-[400px] mx-auto">Set up your workspace in minutes and see the difference.</p>
            <NuxtLink to="/auth/login" class="inline-flex items-center gap-2 px-6 py-2.5 bg-white text-[#121317] text-[15px] font-medium rounded-full hover:bg-white/90 transition-colors">
              Get Started
            </NuxtLink>
          </div>

          <!-- Section 6 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">6. What to do next</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              You have covered the essentials. From here, you can dive deeper into the features that matter most to your team.
            </p>
            <div class="flex flex-col gap-3">
              <NuxtLink
                to="/resources/board-basics"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                    <UIcon name="i-lucide-kanban" class="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Board Basics</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Columns, views, groups, and more</p>
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317]/30 dark:text-white/20 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink
                to="/resources/inviting-team"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
                    <UIcon name="i-lucide-users" class="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Inviting Your Team</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Roles, permissions, and access levels</p>
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317]/30 dark:text-white/20 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink
                to="/resources/connecting-xero"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-500/10 flex items-center justify-center">
                    <UIcon name="i-lucide-link" class="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Connecting Xero</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">OAuth setup and sync configuration</p>
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317]/30 dark:text-white/20 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
            </div>
          </section>

        </div>
      </div>
    </article>

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
  title: 'Quick Start Guide — XeroFlow',
  description: 'Get your agency up and running on XeroFlow in under 10 minutes. Create your workspace, set up boards, invite your team, and connect Xero.',
  ogTitle: 'Quick Start Guide — XeroFlow',
  ogDescription: 'Get your agency up and running on XeroFlow in under 10 minutes. Create your workspace, set up boards, invite your team, and connect Xero.',
})
</script>
