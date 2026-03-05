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
            <div class="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
              <UIcon name="i-lucide-users" class="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <span class="text-[13px] text-[#45474D]/60 dark:text-white/40 font-medium">6 min read</span>
          </div>
          <h1 class="text-[clamp(32px,5vw,48px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.02em] mb-4">
            Inviting Your Team
          </h1>
          <p class="text-lg text-[#45474D] dark:text-white/60 leading-relaxed">
            XeroFlow is built for collaboration. Learn how to add team members via email, configure roles and permissions, and manage workspace access so everyone has exactly the right level of control.
          </p>
        </div>

        <!-- Feature Grid: Roles -->
        <div class="grid sm:grid-cols-2 gap-4 mb-16">
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-crown" class="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Owner</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Full workspace control including billing, integrations, and deletion.</p>
          </div>
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-shield" class="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Admin</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Manage team, boards, and integrations without billing access.</p>
          </div>
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-user" class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Member</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Day-to-day access to boards, tasks, chat, and all core features.</p>
          </div>
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center mb-3">
              <UIcon name="i-lucide-eye" class="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Viewer</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Read-only visibility for stakeholders who need to follow along.</p>
          </div>
        </div>

        <!-- Content -->
        <div class="flex flex-col gap-14">

          <!-- Section 1 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Sending invitations</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              To invite someone to your workspace, go to Settings and select "Team Members." Click "Invite Member" and enter their email address. You can invite multiple people at once by adding several email addresses separated by commas.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Each person receives an email with a link to join your workspace. The link is valid for 7 days. If it expires, you can resend the invitation from the same Team Members page. Once they accept and create their account (or sign in with an existing one), they immediately have access to the workspace.
            </p>
          </section>

          <!-- Section 2 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Understanding roles</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Every team member is assigned a role that determines what they can do in the workspace. XeroFlow has four roles, each with a progressively broader set of permissions:
            </p>
            <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] divide-y divide-[#121317]/[0.06] dark:divide-white/[0.06] mb-4">
              <div class="p-4">
                <div class="flex items-center gap-2 mb-1.5">
                  <UIcon name="i-lucide-crown" class="w-4 h-4 text-amber-500" />
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Owner</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">Full control over the workspace including billing, integrations, and the ability to delete the workspace. There is typically one owner per workspace -- the person who created it.</p>
              </div>
              <div class="p-4">
                <div class="flex items-center gap-2 mb-1.5">
                  <UIcon name="i-lucide-shield" class="w-4 h-4 text-blue-500" />
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Admin</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">Can manage team members, configure integrations, create and delete boards, and adjust workspace settings. Admins cannot change billing or delete the workspace.</p>
              </div>
              <div class="p-4">
                <div class="flex items-center gap-2 mb-1.5">
                  <UIcon name="i-lucide-user" class="w-4 h-4 text-emerald-500" />
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Member</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">The standard role for day-to-day users. Members can create and edit tasks, participate in chat, view boards, and use all core features. They cannot manage team members or workspace settings.</p>
              </div>
              <div class="p-4">
                <div class="flex items-center gap-2 mb-1.5">
                  <UIcon name="i-lucide-eye" class="w-4 h-4 text-gray-500" />
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Viewer</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">Read-only access to boards and tasks. Viewers can see data and follow along but cannot create, edit, or delete anything. Useful for stakeholders who need visibility without edit access.</p>
              </div>
            </div>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              You assign a role when sending the invitation, and you can change it at any time from the Team Members page. Most agencies start everyone as Members and promote key people to Admin as the team grows.
            </p>
          </section>

          <!-- Section 3 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Configuring permissions</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Beyond roles, XeroFlow gives you granular control over what team members can access. Board-level permissions let you restrict specific boards to certain people -- useful when you have sensitive client work or financial boards that only managers should see.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              To set board permissions, open the board settings (gear icon in the board toolbar) and navigate to the "Access" tab. From here you can choose between "All workspace members" or "Specific people only." When set to specific, only the people you add to the access list will see the board in their sidebar.
            </p>
          </section>

          <!-- Highlight Callout -->
          <div class="rounded-2xl bg-gradient-to-br from-violet-50 to-purple-50/50 dark:from-violet-500/10 dark:to-purple-500/5 border border-violet-100/50 dark:border-violet-500/20 p-6">
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-shield-check" class="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">Permissions Are Layered</p>
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">Roles set the baseline, but board-level permissions add a second layer of control. An Admin can see all boards by default, but you can still restrict specific sensitive boards to only the people who need access. This layered approach keeps things simple for most teams while offering fine-grained control when needed.</p>
              </div>
            </div>
          </div>

          <!-- Section 4 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Workspace access levels</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              XeroFlow supports different access scopes depending on how your agency operates. Workspace-level access determines what sections of the platform a person can see -- Boards, Clients, Finance, Time, Chat, and AI are the main areas. By default, all team members can access all sections.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              If your agency has strict separation between departments -- for example, finance staff who should only see billing data, or producers who should not access ad spend reports -- you can configure section-level access from the workspace settings. This is an advanced feature and most small-to-medium agencies leave the defaults in place.
            </p>
          </section>

          <!-- Section 5 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Managing your team over time</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              As people join and leave your agency, you will need to manage their access. Deactivating a team member (from the Team Members page) removes their access to the workspace without deleting their historical data -- their assigned tasks, time entries, and chat messages remain intact.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              You can reactivate a deactivated member at any time if they return. For contractors or freelancers who work on specific projects, consider using the Viewer role or board-level permissions to give them access to only what they need for the duration of their engagement.
            </p>
          </section>

          <!-- Next Steps -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Next steps</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              With your team on board, here are some guides to help you set up the rest of your workspace.
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
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Columns, views, and task management</p>
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317]/30 dark:text-white/20 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink
                to="/resources/setting-up-clients"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                    <UIcon name="i-lucide-building-2" class="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Setting Up Clients</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Client records, billing, and portal access</p>
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317]/30 dark:text-white/20 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink
                to="/resources/first-automation"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
                    <UIcon name="i-lucide-zap" class="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Your First Automation</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Trigger-action recipes for your workflow</p>
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
  title: 'Inviting Your Team — XeroFlow',
  description: 'Set up your team in XeroFlow. Learn about roles, permissions, access levels, and how to manage team members effectively.',
  ogTitle: 'Inviting Your Team — XeroFlow',
  ogDescription: 'Set up your team in XeroFlow. Learn about roles, permissions, access levels, and how to manage team members effectively.',
})
</script>
