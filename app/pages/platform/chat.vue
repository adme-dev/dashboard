<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <!-- Hero Section -->
    <section class="relative bg-[#0a0b0e] pt-[120px] pb-20 px-6">
      <MarketingHeroBackground theme="chat" />
      <div class="relative max-w-[1200px] mx-auto text-center">
        <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-500/[0.12] border border-violet-500/20 mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-violet-400" />
          <span class="text-[13px] font-medium text-violet-400 tracking-[-0.01em]">Communication</span>
        </div>
        <h1
          class="font-[450] text-white tracking-[-0.02em] mb-5 leading-[1.08]"
          :style="{ fontSize: 'clamp(2.25rem, 5vw, 3.75rem)' }"
        >
          Real-time chat<br class="hidden sm:block" />
          built for agencies
        </h1>
        <p
          class="max-w-[560px] mx-auto text-white/50 leading-relaxed"
          :style="{ fontSize: 'clamp(1rem, 1.5vw, 1.175rem)' }"
        >
          Channels, direct messages, threads, and file sharing — all woven into your project workflow. No more context switching between tools.
        </p>
      </div>
    </section>

    <!-- Core Features Grid -->
    <section class="pb-24 px-6">
      <div class="max-w-[1200px] mx-auto">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <!-- Channels & DMs -->
          <div class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6">
            <div class="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center mb-4">
              <UIcon name="i-lucide-hash" class="w-5 h-5 text-violet-600" />
            </div>
            <h3 class="text-[16px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">Channels & DMs</h3>
            <p class="text-[14.5px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Organize conversations by project, team, or topic. Send direct messages or create group DMs for quick coordination.
            </p>
          </div>

          <!-- Threads -->
          <div class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6">
            <div class="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center mb-4">
              <UIcon name="i-lucide-message-square-reply" class="w-5 h-5 text-violet-600" />
            </div>
            <h3 class="text-[16px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">Threads</h3>
            <p class="text-[14.5px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Keep discussions focused with threaded replies. Follow up on any message without cluttering the main channel.
            </p>
          </div>

          <!-- File Sharing -->
          <div class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6">
            <div class="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center mb-4">
              <UIcon name="i-lucide-paperclip" class="w-5 h-5 text-violet-600" />
            </div>
            <h3 class="text-[16px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">File Sharing</h3>
            <p class="text-[14.5px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Drop images, documents, and creative assets directly into chat. Files are stored in Cloudflare R2 for fast, reliable access.
            </p>
          </div>

          <!-- Emoji Reactions -->
          <div class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6">
            <div class="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center mb-4">
              <UIcon name="i-lucide-smile-plus" class="w-5 h-5 text-violet-600" />
            </div>
            <h3 class="text-[16px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">Emoji Reactions</h3>
            <p class="text-[14.5px] text-[#45474D] dark:text-white/60 leading-relaxed">
              React to messages without sending a reply. Quick acknowledgements, votes, and feedback with a single click.
            </p>
          </div>

          <!-- Message Pinning -->
          <div class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6">
            <div class="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center mb-4">
              <UIcon name="i-lucide-pin" class="w-5 h-5 text-violet-600" />
            </div>
            <h3 class="text-[16px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">Message Pinning</h3>
            <p class="text-[14.5px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Pin important messages, decisions, and reference material so your team can always find what matters.
            </p>
          </div>

          <!-- Presence Indicators -->
          <div class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6">
            <div class="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center mb-4">
              <UIcon name="i-lucide-circle-dot" class="w-5 h-5 text-violet-600" />
            </div>
            <h3 class="text-[16px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">Presence Indicators</h3>
            <p class="text-[14.5px] text-[#45474D] dark:text-white/60 leading-relaxed">
              See who is online, away, or in a meeting. Know when teammates are available before reaching out.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Board Integration Section -->
    <section class="pb-24 px-6">
      <div class="max-w-[1200px] mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <!-- Left: Text -->
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-50 border border-violet-100 mb-6">
              <UIcon name="i-lucide-kanban" class="w-3.5 h-3.5 text-violet-600" />
              <span class="text-[12.5px] font-medium text-violet-700">Board Integration</span>
            </div>
            <h2
              class="font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-5 leading-[1.12]"
              :style="{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)' }"
            >
              Chat that lives inside<br class="hidden lg:block" />
              your project boards
            </h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-8 max-w-[480px]">
              Every board can have a linked channel. When a task status changes, an assignee updates, or a deadline shifts, the relevant chat channel gets an automatic post. Your team stays informed without lifting a finger.
            </p>
          </div>

          <!-- Right: Feature list -->
          <div class="space-y-5">
            <div class="flex items-start gap-4">
              <div class="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <UIcon name="i-lucide-check" class="w-3.5 h-3.5 text-violet-600" />
              </div>
              <div>
                <h4 class="text-[15px] font-[450] text-[#121317] dark:text-white mb-1">Board-linked channels</h4>
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">
                  Automatically create a chat channel for any board. All team communication stays connected to the work.
                </p>
              </div>
            </div>

            <div class="flex items-start gap-4">
              <div class="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <UIcon name="i-lucide-check" class="w-3.5 h-3.5 text-violet-600" />
              </div>
              <div>
                <h4 class="text-[15px] font-[450] text-[#121317] dark:text-white mb-1">Task-specific channels</h4>
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">
                  Spin up a dedicated channel for any task. All discussion, files, and decisions live alongside the work item.
                </p>
              </div>
            </div>

            <div class="flex items-start gap-4">
              <div class="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <UIcon name="i-lucide-check" class="w-3.5 h-3.5 text-violet-600" />
              </div>
              <div>
                <h4 class="text-[15px] font-[450] text-[#121317] dark:text-white mb-1">Board events in chat</h4>
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">
                  Status changes, new assignments, and deadline updates post to chat automatically via the board event bridge.
                </p>
              </div>
            </div>

            <div class="flex items-start gap-4">
              <div class="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <UIcon name="i-lucide-check" class="w-3.5 h-3.5 text-violet-600" />
              </div>
              <div>
                <h4 class="text-[15px] font-[450] text-[#121317] dark:text-white mb-1">Configurable feed settings</h4>
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">
                  Control which board events post to chat. Filter by event type so channels stay focused and noise-free.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Productivity Features Section -->
    <section class="pb-24 px-6">
      <div class="max-w-[1200px] mx-auto">
        <div class="text-center mb-14">
          <h2
            class="font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4 leading-[1.12]"
            :style="{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)' }"
          >
            Productivity at your fingertips
          </h2>
          <p class="text-[16px] text-[#45474D] dark:text-white/60 max-w-[480px] mx-auto leading-relaxed">
            Shortcuts, formatting, forwarding, and receipts. Everything you need to move faster.
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Cmd+K Channel Switcher -->
          <div class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6">
            <div class="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center mb-4">
              <UIcon name="i-lucide-command" class="w-5 h-5 text-violet-600" />
            </div>
            <h3 class="text-[16px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">Cmd+K Channel Switcher</h3>
            <p class="text-[14.5px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Jump between channels instantly with a keyboard shortcut. Fuzzy search finds the right channel in milliseconds.
            </p>
          </div>

          <!-- Formatting Toolbar -->
          <div class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6">
            <div class="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center mb-4">
              <UIcon name="i-lucide-bold" class="w-5 h-5 text-violet-600" />
            </div>
            <h3 class="text-[16px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">Formatting Toolbar</h3>
            <p class="text-[14.5px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Bold, italic, code blocks, and more. Use keyboard shortcuts or the toolbar to format messages with clarity.
            </p>
          </div>

          <!-- Message Forwarding -->
          <div class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6">
            <div class="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center mb-4">
              <UIcon name="i-lucide-forward" class="w-5 h-5 text-violet-600" />
            </div>
            <h3 class="text-[16px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">Message Forwarding</h3>
            <p class="text-[14.5px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Forward any message to another channel or DM with full attribution. Share context across teams effortlessly.
            </p>
          </div>

          <!-- Read Receipts -->
          <div class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6">
            <div class="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center mb-4">
              <UIcon name="i-lucide-check-check" class="w-5 h-5 text-violet-600" />
            </div>
            <h3 class="text-[16px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">Read Receipts</h3>
            <p class="text-[14.5px] text-[#45474D] dark:text-white/60 leading-relaxed">
              See who has read your messages with avatar indicators. Know when important updates have been seen by the team.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Durable Objects Section -->
    <section class="pb-24 px-6">
      <div class="max-w-[1200px] mx-auto">
        <div class="rounded-3xl bg-[#121317] p-8 md:p-14 overflow-hidden">
          <div class="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <!-- Left: Text -->
            <div>
              <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 mb-6">
                <UIcon name="i-lucide-zap" class="w-3.5 h-3.5 text-violet-400" />
                <span class="text-[12.5px] font-medium text-white/70">Infrastructure</span>
              </div>
              <h2 class="text-[clamp(24px,3.5vw,36px)] font-[450] text-white tracking-[-0.02em] mb-5 leading-[1.12]">
                Built on Cloudflare<br class="hidden sm:block" />Durable Objects
              </h2>
              <p class="text-[15px] text-white/60 leading-relaxed mb-4 max-w-[440px]">
                Every chat room runs on its own Durable Object at the edge. WebSocket connections, presence tracking, and message delivery happen in the same data center as your users.
              </p>
              <p class="text-[14px] text-white/40 leading-relaxed max-w-[440px]">
                When Durable Objects are unavailable, the system gracefully falls back to SSE and then long polling.
              </p>
            </div>

            <!-- Right: Feature cards -->
            <div class="grid sm:grid-cols-2 gap-3">
              <div class="rounded-xl bg-white/[0.06] border border-white/[0.06] p-5">
                <div class="w-9 h-9 rounded-lg bg-violet-500/20 flex items-center justify-center mb-3">
                  <UIcon name="i-lucide-globe" class="w-4.5 h-4.5 text-violet-400" />
                </div>
                <div class="text-[14px] font-medium text-white mb-1">Edge delivery</div>
                <div class="text-[13px] text-white/40 leading-relaxed">Messages routed through the nearest data center</div>
              </div>
              <div class="rounded-xl bg-white/[0.06] border border-white/[0.06] p-5">
                <div class="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center mb-3">
                  <UIcon name="i-lucide-wifi" class="w-4.5 h-4.5 text-emerald-400" />
                </div>
                <div class="text-[14px] font-medium text-white mb-1">WebSocket-first</div>
                <div class="text-[13px] text-white/40 leading-relaxed">Persistent connections with auto-reconnect</div>
              </div>
              <div class="rounded-xl bg-white/[0.06] border border-white/[0.06] p-5">
                <div class="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center mb-3">
                  <UIcon name="i-lucide-users" class="w-4.5 h-4.5 text-amber-400" />
                </div>
                <div class="text-[14px] font-medium text-white mb-1">Presence tracking</div>
                <div class="text-[13px] text-white/40 leading-relaxed">Online status co-located with your messages</div>
              </div>
              <div class="rounded-xl bg-white/[0.06] border border-white/[0.06] p-5">
                <div class="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center mb-3">
                  <UIcon name="i-lucide-shield-check" class="w-4.5 h-4.5 text-blue-400" />
                </div>
                <div class="text-[14px] font-medium text-white mb-1">Graceful fallback</div>
                <div class="text-[13px] text-white/40 leading-relaxed">SSE and polling when WebSockets aren't available</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Dark CTA Section -->
    <section class="pb-24 px-6">
      <div class="max-w-[1200px] mx-auto">
        <div class="relative isolate overflow-hidden bg-[#0a0b0e] rounded-[2rem] px-8 py-16 sm:px-16 sm:py-20 text-center">
          <MarketingCtaParticles theme="violet" />
          <h2
            class="font-[450] text-white tracking-[-0.02em] mb-5 leading-[1.12]"
            :style="{ fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)' }"
          >
            Keep your team connected
          </h2>
          <p class="max-w-[440px] mx-auto text-[16px] text-white/60 leading-relaxed mb-10">
            Bring communication and project management together in one place. Start chatting in minutes.
          </p>
          <NuxtLink
            to="/contact"
            class="inline-flex items-center gap-2 px-7 py-3 text-[15px] font-medium text-[#121317] bg-white hover:bg-white/90 rounded-full transition-colors"
          >
            Get Started
            <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
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

useHead({
  title: 'Real-Time Chat — XeroFlow',
  meta: [
    { name: 'description', content: 'Channels, DMs, threads, and file sharing built into your project workflow. Powered by Cloudflare Durable Objects for low-latency, real-time communication.' }
  ]
})
</script>
