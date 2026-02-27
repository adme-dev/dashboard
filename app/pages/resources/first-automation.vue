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
            <div class="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
              <UIcon name="i-lucide-zap" class="w-5 h-5 text-rose-600" />
            </div>
            <span class="text-[13px] text-[#45474D]/60 dark:text-white/40 font-medium">7 min read</span>
          </div>
          <h1 class="text-[clamp(32px,5vw,48px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.02em] mb-4">
            Your First Automation
          </h1>
          <p class="text-lg text-[#45474D] dark:text-white/60 leading-relaxed">
            Automations eliminate repetitive work by running actions when specific events happen. This guide explains triggers and actions, walks you through creating your first recipe, and shows common patterns agencies use every day.
          </p>
        </div>

        <!-- Feature Grid: Trigger Types -->
        <div class="grid sm:grid-cols-3 gap-4 mb-16">
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-circle-dot" class="w-4 h-4 text-rose-600" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Status Changes</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Fire when a task moves to a specific status like "Done" or "In Review."</p>
          </div>
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-calendar-clock" class="w-4 h-4 text-blue-600" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Date Triggers</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Notify before deadlines or trigger actions when dates arrive.</p>
          </div>
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-user-plus" class="w-4 h-4 text-violet-600" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Person Assigned</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Auto-assign default owners or notify when assignments change.</p>
          </div>
        </div>

        <!-- Content -->
        <div class="flex flex-col gap-14">

          <!-- Section 1 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Understanding triggers and actions</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Every automation in XeroFlow is a recipe with two parts: a trigger (the event that starts it) and one or more actions (what happens in response). Think of it as "When this happens, do that."
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              <strong class="text-[#121317] dark:text-white">Triggers</strong> are events that XeroFlow watches for. They include things like a task status changing, a due date arriving, a task being assigned to someone, or a new task being created. Triggers are board-specific -- each automation is scoped to a particular board.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              <strong class="text-[#121317] dark:text-white">Actions</strong> are what happens when a trigger fires. Actions include sending a notification (in-app or email), updating a column value, moving a task to a different group, assigning a person, or posting a message to a chat channel. You can chain multiple actions on a single trigger.
            </p>
          </section>

          <!-- Section 2 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Creating a status change notification</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Let's build the most common automation: notifying a team member when a task moves to a specific status. For example, when a task is marked "Ready for Review," the assigned reviewer should get a notification.
            </p>
            <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] divide-y divide-[#121317]/[0.06] dark:divide-white/[0.06] mb-4">
              <div class="p-4">
                <div class="flex items-center gap-2 mb-1.5">
                  <div class="w-6 h-6 rounded-full bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[12px] font-medium flex items-center justify-center">1</div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Open the Automations panel</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed pl-8">Navigate to the board you want to automate. Click the lightning bolt icon in the board toolbar to open the Automations panel.</p>
              </div>
              <div class="p-4">
                <div class="flex items-center gap-2 mb-1.5">
                  <div class="w-6 h-6 rounded-full bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[12px] font-medium flex items-center justify-center">2</div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Choose a trigger</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed pl-8">Click "New Automation" and select "Status changes" as your trigger. Then pick the specific status value -- in this case, "Ready for Review."</p>
              </div>
              <div class="p-4">
                <div class="flex items-center gap-2 mb-1.5">
                  <div class="w-6 h-6 rounded-full bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[12px] font-medium flex items-center justify-center">3</div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Add an action</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed pl-8">Click "Add Action" and select "Send notification." Choose who receives it -- you can target a specific person, the task assignee, or the board owner. Write a message like "Task '{task_name}' is ready for your review."</p>
              </div>
              <div class="p-4">
                <div class="flex items-center gap-2 mb-1.5">
                  <div class="w-6 h-6 rounded-full bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[12px] font-medium flex items-center justify-center">4</div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Save and activate</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed pl-8">Give your automation a name (e.g. "Review notification"), click Save, and toggle it on. It will start running immediately for any task that moves to "Ready for Review."</p>
              </div>
            </div>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              That's it. You now have a working automation. Every time a team member drags a task into the "Ready for Review" status -- whether from the Table, Kanban, or any other view -- the notification fires automatically.
            </p>
          </section>

          <!-- Section 3 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Common automation patterns</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Agencies typically use a handful of automation patterns that cover the majority of repetitive work. Here are the most popular ones:
            </p>
            <div class="space-y-4 mb-4">
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5">
                <div class="flex items-center gap-2 mb-2">
                  <UIcon name="i-lucide-bell" class="w-4 h-4 text-blue-600" />
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Due date reminders</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">Trigger: Due date is 1 day away. Action: Notify the task assignee. Prevents tasks from silently going overdue.</p>
              </div>
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5">
                <div class="flex items-center gap-2 mb-2">
                  <UIcon name="i-lucide-user-plus" class="w-4 h-4 text-violet-600" />
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Auto-assign on creation</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">Trigger: Task created in a specific group. Action: Assign a default person. Useful for intake boards where new requests should go to a specific team lead.</p>
              </div>
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5">
                <div class="flex items-center gap-2 mb-2">
                  <UIcon name="i-lucide-move-right" class="w-4 h-4 text-emerald-600" />
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Move to group on status change</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">Trigger: Status changes to "Done." Action: Move task to the "Completed" group. Keeps your active groups clean without manual sorting.</p>
              </div>
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5">
                <div class="flex items-center gap-2 mb-2">
                  <UIcon name="i-lucide-message-circle" class="w-4 h-4 text-amber-600" />
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Chat channel updates</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">Trigger: Task status changes. Action: Post a message to the board's linked chat channel. Keeps the team informed without everyone watching the board constantly.</p>
              </div>
            </div>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              You can combine these patterns. A single board might have a due date reminder, an auto-assign rule, and a chat notification -- all running independently.
            </p>
          </section>

          <!-- Highlight Callout -->
          <div class="rounded-2xl bg-gradient-to-br from-rose-50 to-pink-50/50 border border-rose-100/50 p-6">
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-lightbulb" class="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <p class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">Chain Multiple Actions</p>
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">A single trigger can fire multiple actions at once. For example, when a task moves to "Done," you could notify the client, move the task to the "Completed" group, and post an update to your team chat channel -- all from one automation recipe.</p>
              </div>
            </div>
          </div>

          <!-- Section 4 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Using variables in messages</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Automation messages support dynamic variables that are replaced with actual values when the automation runs. Wrap variable names in curly braces to use them. The most common variables are:
            </p>
            <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5 space-y-2 mb-4 font-mono text-[14px]">
              <p class="text-[#121317] dark:text-white"><span class="text-rose-600">{task_name}</span> <span class="text-[#45474D]/60 dark:text-white/40 font-sans">-- the task's title</span></p>
              <p class="text-[#121317] dark:text-white"><span class="text-rose-600">{board_name}</span> <span class="text-[#45474D]/60 dark:text-white/40 font-sans">-- the board it belongs to</span></p>
              <p class="text-[#121317] dark:text-white"><span class="text-rose-600">{assignee}</span> <span class="text-[#45474D]/60 dark:text-white/40 font-sans">-- name of the assigned person</span></p>
              <p class="text-[#121317] dark:text-white"><span class="text-rose-600">{status}</span> <span class="text-[#45474D]/60 dark:text-white/40 font-sans">-- the new status value</span></p>
              <p class="text-[#121317] dark:text-white"><span class="text-rose-600">{previous_status}</span> <span class="text-[#45474D]/60 dark:text-white/40 font-sans">-- what the status was before</span></p>
              <p class="text-[#121317] dark:text-white"><span class="text-rose-600">{due_date}</span> <span class="text-[#45474D]/60 dark:text-white/40 font-sans">-- the task's due date</span></p>
            </div>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              A message like "Hey {assignee}, task '{task_name}' just moved from {previous_status} to {status}" becomes "Hey Sarah, task 'Homepage Redesign' just moved from In Progress to Ready for Review" when the automation fires.
            </p>
          </section>

          <!-- Section 5 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Testing your automations</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Before relying on an automation in production, test it. The simplest way is to create a test task and manually trigger the condition -- for example, change its status to the value your automation watches for. Check that the notification arrives, the message looks correct, and any column updates or group moves happen as expected.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              The Automations panel also shows a log of recent executions. Each entry shows when it fired, which task triggered it, and whether the actions completed successfully. If an action fails (for example, the target user no longer exists), the log will show an error with details. Use this log to debug and refine your recipes.
            </p>
          </section>

          <!-- Dark CTA Card -->
          <div class="rounded-2xl bg-[#0a0b0e] p-8 md:p-12 text-center">
            <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span class="text-white text-xs font-semibold">XF</span>
            </div>
            <h3 class="text-[22px] font-[450] text-white tracking-[-0.02em] mb-3">Automate your workflow</h3>
            <p class="text-[15px] text-white/60 mb-6 max-w-[400px] mx-auto">Create your first automation recipe and let XeroFlow handle the repetitive work.</p>
            <NuxtLink to="/auth/login" class="inline-flex items-center gap-2 px-6 py-2.5 bg-white text-[#121317] text-[15px] font-medium rounded-full hover:bg-white/90 transition-colors">
              Get Started
            </NuxtLink>
          </div>

          <!-- Next Steps -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Next steps</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              Now that you know how automations work, explore these guides to round out your XeroFlow setup.
            </p>
            <div class="flex flex-col gap-3">
              <NuxtLink
                to="/resources/board-basics"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                    <UIcon name="i-lucide-kanban" class="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Board Basics</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Master columns, views, and task management</p>
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317]/30 dark:text-white/20 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink
                to="/resources/setting-up-clients"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                    <UIcon name="i-lucide-building-2" class="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Setting Up Clients</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Client records, portal access, and billing</p>
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317]/30 dark:text-white/20 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink
                to="/resources/connecting-xero"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
                    <UIcon name="i-lucide-link" class="w-4 h-4 text-teal-600" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Connecting Xero</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Financial integration and invoice sync</p>
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
            <NuxtLink to="/about" class="hover:text-[#45474D] dark:hover:text-white transition-colors">About</NuxtLink>
            <NuxtLink to="/privacy" class="hover:text-[#45474D] dark:hover:text-white transition-colors">Privacy</NuxtLink>
            <NuxtLink to="/terms" class="hover:text-[#45474D] dark:hover:text-white transition-colors">Terms</NuxtLink>
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

useSeoMeta({
  title: 'Your First Automation — XeroFlow',
  description: 'Build your first automation recipe in XeroFlow. Learn the trigger-action model, configure conditions, and automate your board workflows.',
  ogTitle: 'Your First Automation — XeroFlow',
  ogDescription: 'Build your first automation recipe in XeroFlow. Learn the trigger-action model, configure conditions, and automate your board workflows.',
})
</script>
