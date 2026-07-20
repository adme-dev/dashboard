<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e] overflow-x-hidden">
    <MarketingNav />

    <!-- Hero Section -->
    <section class="relative pt-[52px]">
      <!-- Floating icon particles -->
      <div class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          v-for="icon in heroFloatingIcons"
          :key="'hfi-' + icon.id"
          class="absolute"
          :class="icon.id % 2 === 0 ? 'hero-float-a' : 'hero-float-b'"
          :style="{
            left: icon.x + '%',
            top: icon.y + '%',
            animationDuration: icon.duration + 's',
            animationDelay: icon.delay + 's',
            opacity: icon.opacity
          }"
        >
          <div
            class="hero-icon-color rounded-2xl border border-[#121317]/[0.04] dark:border-white/[0.06] flex items-center justify-center backdrop-blur-[2px]"
            :class="icon.size === 'lg' ? 'w-14 h-14' : icon.size === 'md' ? 'w-11 h-11' : 'w-8 h-8'"
            :style="{ animationDelay: icon.colorDelay + 's' }"
          >
            <UIcon
              :name="icon.icon"
              class="hero-icon-text"
              :class="icon.size === 'lg' ? 'w-6 h-6' : icon.size === 'md' ? 'w-5 h-5' : 'w-3.5 h-3.5'"
              :style="{ animationDelay: icon.colorDelay + 's' }"
            />
          </div>
        </div>
      </div>

      <div class="relative max-w-[1200px] mx-auto px-6 pt-24 pb-20 md:pt-36 md:pb-32 text-center">
        <NuxtLink to="/creativity" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06] hover:bg-[#121317]/[0.07] dark:hover:bg-white/[0.1] transition-colors mb-8 group">
          <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span class="text-[13px] text-[#45474D] dark:text-white/60 font-medium">Agency operations, unified</span>
          <UIcon name="i-lucide-arrow-right" class="w-3 h-3 text-[#45474D]/50 dark:text-white/40 group-hover:translate-x-0.5 transition-transform" />
        </NuxtLink>

        <h1 class="text-[clamp(40px,7vw,80px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.03em] mb-6 max-w-[900px] mx-auto">
          Run your agency<br class="hidden sm:block"> from a single platform
        </h1>

        <p class="text-lg md:text-xl text-[#45474D] dark:text-white/60 max-w-[560px] mx-auto mb-10 leading-relaxed">
          Work management, client portal, financials, real-time chat, and AI-powered insights — all in one place.
        </p>

        <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
          <NuxtLink
            to="/auth/login"
            class="inline-flex items-center gap-2.5 px-6 py-3 bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[17.5px] font-medium rounded-full hover:bg-[#2a2b30] dark:hover:bg-white/90 transition-colors"
          >
            Get Started
          </NuxtLink>
          <button
            class="inline-flex items-center gap-2 px-6 py-3 bg-[#b7bfd9]/10 dark:bg-white/[0.06] text-[#121317] dark:text-white text-[17.5px] font-medium rounded-full hover:bg-[#b7bfd9]/20 dark:hover:bg-white/[0.1] transition-colors"
            @click="scrollToFeatures"
          >
            Explore features
          </button>
        </div>
      </div>
    </section>

    <!-- Scrolling platform card grid (2 rows, opposite directions) -->
    <section class="py-8 overflow-hidden border-t border-black/[0.04] dark:border-white/[0.06]">
      <div class="flex flex-col gap-4">
        <div
          v-for="(row, ri) in marqueeRows"
          :key="ri"
          class="flex gap-4"
          :class="ri === 0 ? 'marquee-row-left' : 'marquee-row-right'"
        >
          <NuxtLink
            v-for="(card, ci) in row"
            :key="ci"
            :to="card.to"
            class="flex-shrink-0 w-[250px] sm:w-[280px] rounded-[22px] overflow-hidden group hover:shadow-2xl hover:-translate-y-1 transition-all duration-400"
            :class="card.bg"
          >
            <div class="relative h-[220px] flex items-center justify-center">
              <MorphBlob
                :seed="(ci % platformCards.length) + ri * 50"
                class="w-[80%] aspect-square group-hover:scale-[1.06] transition-transform duration-500"
              >
                <img
                  :src="card.image"
                  :alt="card.title"
                  class="w-full h-full object-cover"
                />
              </MorphBlob>
            </div>
            <div class="px-4 pb-4 pt-3">
              <div class="text-[15px] font-bold text-black tracking-[-0.01em]">{{ card.title }}</div>
              <div class="text-[12px] text-black/50 leading-relaxed line-clamp-1">{{ card.subtitle }}</div>
            </div>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section id="features" class="py-20 md:py-32">
      <div class="max-w-[1200px] mx-auto px-6">

        <!-- 1. Work Management -->
        <div class="flex flex-col gap-8 mb-24 md:flex-row">
          <div class="flex-1 flex flex-col justify-center">
            <h2 class="text-[clamp(28px,4vw,40px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Work Management
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[480px]">
              Monday.com-style boards with 20+ column types, Kanban, timeline, calendar and gallery views. Groups, subtasks, and real-time collaboration.
            </p>
            <NuxtLink to="/platform/boards" class="inline-flex items-center gap-1.5 mt-5 text-[15px] font-medium text-[#121317] dark:text-white hover:opacity-70 transition-opacity group">
              Learn more
              <UIcon name="i-lucide-arrow-right" class="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </NuxtLink>
          </div>
          <div class="flex-1">
            <div class="w-full rounded-3xl feature-gradient-1 overflow-hidden flex items-center justify-center px-6 py-10 md:px-10 md:py-14">
              <div class="w-full h-full rounded-2xl bg-white/80 dark:bg-white/[0.08] backdrop-blur-sm shadow-sm dark:shadow-none overflow-hidden flex flex-col">
                <!-- Kanban header -->
                <div class="flex items-center gap-3 px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06]">
                  <div class="w-2 h-2 rounded-full bg-emerald-400" />
                  <span class="text-[11px] font-medium text-[#121317]/70 dark:text-white/70">Sprint Board</span>
                  <div class="ml-auto flex gap-1.5">
                    <div class="w-5 h-5 rounded bg-[#121317]/[0.04] dark:bg-white/[0.08]" />
                    <div class="w-5 h-5 rounded bg-[#121317]/[0.04] dark:bg-white/[0.08]" />
                  </div>
                </div>
                <!-- Kanban columns -->
                <div class="flex-1 flex gap-3 p-3 overflow-hidden">
                  <div class="flex-1 flex flex-col gap-2">
                    <div class="text-[9px] font-semibold text-[#45474D]/60 dark:text-white/40 uppercase tracking-wider px-1">To Do</div>
                    <div class="flex-1 rounded-lg bg-blue-50/80 dark:bg-blue-500/[0.08] p-2 flex flex-col gap-1.5">
                      <div class="rounded-md bg-white dark:bg-white/[0.1] p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none">
                        <div class="h-1.5 w-3/4 rounded-full bg-[#121317]/10 dark:bg-white/15 mb-1.5" />
                        <div class="h-1 w-1/2 rounded-full bg-[#121317]/[0.06] dark:bg-white/10" />
                        <div class="flex items-center gap-1 mt-2">
                          <div class="w-3 h-3 rounded-full bg-blue-200" />
                          <div class="h-1 w-6 rounded-full bg-blue-200/60" />
                        </div>
                      </div>
                      <div class="rounded-md bg-white dark:bg-white/[0.1] p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none">
                        <div class="h-1.5 w-2/3 rounded-full bg-[#121317]/10 dark:bg-white/15 mb-1.5" />
                        <div class="h-1 w-1/3 rounded-full bg-[#121317]/[0.06] dark:bg-white/10" />
                      </div>
                    </div>
                  </div>
                  <div class="flex-1 flex flex-col gap-2">
                    <div class="text-[9px] font-semibold text-[#45474D]/60 dark:text-white/40 uppercase tracking-wider px-1">In Progress</div>
                    <div class="flex-1 rounded-lg bg-amber-50/80 dark:bg-amber-500/[0.08] p-2 flex flex-col gap-1.5">
                      <div class="rounded-md bg-white dark:bg-white/[0.1] p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none">
                        <div class="h-1.5 w-4/5 rounded-full bg-[#121317]/10 dark:bg-white/15 mb-1.5" />
                        <div class="flex gap-1 mt-1.5">
                          <div class="h-3 w-10 rounded-full bg-amber-200/80 text-[6px] flex items-center justify-center text-amber-700">Design</div>
                        </div>
                      </div>
                      <div class="rounded-md bg-white dark:bg-white/[0.1] p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none">
                        <div class="h-1.5 w-1/2 rounded-full bg-[#121317]/10 dark:bg-white/15 mb-1.5" />
                        <div class="h-1 w-2/3 rounded-full bg-[#121317]/[0.06] dark:bg-white/10" />
                        <div class="flex items-center gap-1 mt-2">
                          <div class="w-3 h-3 rounded-full bg-violet-200" />
                          <div class="w-3 h-3 rounded-full bg-rose-200 -ml-1.5" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="flex-1 flex flex-col gap-2">
                    <div class="text-[9px] font-semibold text-[#45474D]/60 dark:text-white/40 uppercase tracking-wider px-1">Done</div>
                    <div class="flex-1 rounded-lg bg-emerald-50/80 dark:bg-emerald-500/[0.08] p-2 flex flex-col gap-1.5">
                      <div class="rounded-md bg-white dark:bg-white/[0.1] p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none">
                        <div class="h-1.5 w-3/5 rounded-full bg-[#121317]/10 dark:bg-white/15 mb-1.5" />
                        <div class="flex items-center gap-1 mt-1.5">
                          <div class="w-2.5 h-2.5 rounded-full bg-emerald-400 flex items-center justify-center">
                            <div class="w-1 h-1 text-white">&#10003;</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. Financial Operations -->
        <div class="flex flex-col gap-8 mb-24 md:flex-row-reverse">
          <div class="flex-1 flex flex-col justify-center">
            <h2 class="text-[clamp(28px,4vw,40px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Financial Operations
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[480px]">
              Xero integration for invoices, expenses and P&amp;L. End-of-month invoice generation, Meta and Google Ads spend tracking with budget management.
            </p>
            <NuxtLink to="/platform/financials" class="inline-flex items-center gap-1.5 mt-5 text-[15px] font-medium text-[#121317] dark:text-white hover:opacity-70 transition-opacity group">
              Learn more
              <UIcon name="i-lucide-arrow-right" class="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </NuxtLink>
          </div>
          <div class="flex-1">
            <div class="w-full rounded-3xl feature-gradient-2 overflow-hidden flex items-center justify-center px-6 py-10 md:px-10 md:py-14">
              <div class="w-full h-full rounded-2xl bg-white/80 dark:bg-white/[0.08] backdrop-blur-sm shadow-sm dark:shadow-none overflow-hidden flex flex-col">
                <!-- Dashboard header -->
                <div class="flex items-center gap-3 px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06]">
                  <div class="w-2 h-2 rounded-full bg-emerald-400" />
                  <span class="text-[11px] font-medium text-[#121317]/70 dark:text-white/70">Financial Overview</span>
                  <div class="ml-auto text-[9px] text-[#45474D]/50 dark:text-white/40">Feb 2026</div>
                </div>
                <!-- Stats row -->
                <div class="grid grid-cols-3 gap-2 px-4 py-3">
                  <div class="rounded-lg bg-emerald-50/60 dark:bg-emerald-500/[0.08] px-2.5 py-2">
                    <div class="text-[8px] text-[#45474D]/50 dark:text-white/40 mb-0.5">Revenue</div>
                    <div class="text-[13px] font-semibold text-[#121317] dark:text-white">$84,320</div>
                    <div class="text-[8px] text-emerald-600 mt-0.5">+12.4%</div>
                  </div>
                  <div class="rounded-lg bg-blue-50/60 dark:bg-blue-500/[0.08] px-2.5 py-2">
                    <div class="text-[8px] text-[#45474D]/50 dark:text-white/40 mb-0.5">Expenses</div>
                    <div class="text-[13px] font-semibold text-[#121317] dark:text-white">$32,180</div>
                    <div class="text-[8px] text-blue-600 mt-0.5">-3.2%</div>
                  </div>
                  <div class="rounded-lg bg-violet-50/60 dark:bg-violet-500/[0.08] px-2.5 py-2">
                    <div class="text-[8px] text-[#45474D]/50 dark:text-white/40 mb-0.5">Profit</div>
                    <div class="text-[13px] font-semibold text-[#121317] dark:text-white">$52,140</div>
                    <div class="text-[8px] text-violet-600 mt-0.5">+18.7%</div>
                  </div>
                </div>
                <!-- Mini chart area -->
                <div class="flex-1 px-4 pb-3">
                  <div class="w-full h-full rounded-lg bg-[#121317]/[0.02] dark:bg-white/[0.03] p-3 flex flex-col justify-end">
                    <div class="flex items-end gap-1.5 h-full">
                      <div v-for="h in [40, 55, 45, 65, 50, 70, 60, 80, 75, 85, 70, 90]" :key="h" class="flex-1 rounded-t bg-gradient-to-t from-emerald-400/80 to-emerald-300/40" :style="{ height: h + '%' }" />
                    </div>
                    <div class="flex justify-between mt-2">
                      <span class="text-[7px] text-[#45474D]/40 dark:text-white/30">Mar</span>
                      <span class="text-[7px] text-[#45474D]/40 dark:text-white/30">Jun</span>
                      <span class="text-[7px] text-[#45474D]/40 dark:text-white/30">Sep</span>
                      <span class="text-[7px] text-[#45474D]/40 dark:text-white/30">Feb</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Real-Time Chat -->
        <div class="flex flex-col gap-8 mb-24 md:flex-row">
          <div class="flex-1 flex flex-col justify-center">
            <h2 class="text-[clamp(28px,4vw,40px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Real-Time Chat
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[480px]">
              Channels, DMs, threads, file sharing, emoji reactions, and presence indicators. Integrated with boards and tasks for seamless context.
            </p>
            <NuxtLink to="/platform/chat" class="inline-flex items-center gap-1.5 mt-5 text-[15px] font-medium text-[#121317] dark:text-white hover:opacity-70 transition-opacity group">
              Learn more
              <UIcon name="i-lucide-arrow-right" class="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </NuxtLink>
          </div>
          <div class="flex-1">
            <div class="w-full rounded-3xl feature-gradient-3 overflow-hidden flex items-center justify-center px-6 py-10 md:px-10 md:py-14">
              <div class="w-full h-full rounded-2xl bg-white/80 dark:bg-white/[0.08] backdrop-blur-sm shadow-sm dark:shadow-none overflow-hidden flex flex-col">
                <!-- Chat header -->
                <div class="flex items-center gap-2.5 px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06]">
                  <div class="text-[11px] font-medium text-[#121317]/70 dark:text-white/70"># design-team</div>
                  <div class="ml-auto flex items-center gap-1">
                    <div class="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span class="text-[9px] text-[#45474D]/50 dark:text-white/40">4 online</span>
                  </div>
                </div>
                <!-- Chat messages -->
                <div class="flex-1 px-4 py-3 flex flex-col gap-3 overflow-hidden">
                  <div class="flex gap-2.5">
                    <div class="w-6 h-6 rounded-full bg-violet-200 flex-shrink-0 flex items-center justify-center">
                      <span class="text-[7px] font-semibold text-violet-700">SL</span>
                    </div>
                    <div>
                      <div class="flex items-center gap-2 mb-0.5">
                        <span class="text-[10px] font-medium text-[#121317] dark:text-white">Sarah L.</span>
                        <span class="text-[8px] text-[#45474D]/40 dark:text-white/30">10:42 AM</span>
                      </div>
                      <div class="rounded-xl rounded-tl-sm bg-[#121317]/[0.04] dark:bg-white/[0.06] px-3 py-1.5 text-[10px] text-[#121317]/80 dark:text-white/80 max-w-[85%]">
                        Updated the hero mockup for Acme Corp — can someone review?
                      </div>
                      <div class="flex gap-1 mt-1">
                        <div class="px-1.5 py-0.5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06] text-[8px] dark:text-white/70">&#128077; 2</div>
                        <div class="px-1.5 py-0.5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06] text-[8px] dark:text-white/70">&#128064; 1</div>
                      </div>
                    </div>
                  </div>
                  <div class="flex gap-2.5">
                    <div class="w-6 h-6 rounded-full bg-blue-200 flex-shrink-0 flex items-center justify-center">
                      <span class="text-[7px] font-semibold text-blue-700">JK</span>
                    </div>
                    <div>
                      <div class="flex items-center gap-2 mb-0.5">
                        <span class="text-[10px] font-medium text-[#121317] dark:text-white">James K.</span>
                        <span class="text-[8px] text-[#45474D]/40 dark:text-white/30">10:44 AM</span>
                      </div>
                      <div class="rounded-xl rounded-tl-sm bg-[#121317]/[0.04] dark:bg-white/[0.06] px-3 py-1.5 text-[10px] text-[#121317]/80 dark:text-white/80 max-w-[85%]">
                        Looks great! Love the new colour palette &#127912;
                      </div>
                    </div>
                  </div>
                  <div class="flex gap-2.5">
                    <div class="w-6 h-6 rounded-full bg-amber-200 flex-shrink-0 flex items-center justify-center">
                      <span class="text-[7px] font-semibold text-amber-700">MR</span>
                    </div>
                    <div>
                      <div class="flex items-center gap-2 mb-0.5">
                        <span class="text-[10px] font-medium text-[#121317] dark:text-white">Maria R.</span>
                        <span class="text-[8px] text-[#45474D]/40 dark:text-white/30">10:45 AM</span>
                      </div>
                      <div class="rounded-xl rounded-tl-sm bg-[#121317]/[0.04] dark:bg-white/[0.06] px-3 py-1.5 text-[10px] text-[#121317]/80 dark:text-white/80 max-w-[85%]">
                        +1, sending to client for sign-off now
                      </div>
                    </div>
                  </div>
                </div>
                <!-- Input bar -->
                <div class="px-3 pb-3">
                  <div class="rounded-xl border border-black/[0.06] dark:border-white/[0.08] px-3 py-2 flex items-center gap-2">
                    <div class="h-1 flex-1 rounded-full bg-[#121317]/[0.06] dark:bg-white/10" />
                    <div class="w-5 h-5 rounded-full bg-[#121317] dark:bg-white flex items-center justify-center">
                      <div class="w-0 h-0 border-l-[4px] border-l-white border-y-[3px] border-y-transparent ml-0.5" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 4. AI-Powered Insights -->
        <div class="flex flex-col gap-8 mb-24 md:flex-row-reverse">
          <div class="flex-1 flex flex-col justify-center">
            <h2 class="text-[clamp(28px,4vw,40px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
              AI-Powered Insights
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[480px]">
              Groq-powered chat with @entity mentions, anomaly detection across 8 analyzers, semantic search, and proactive recommendations.
            </p>
            <NuxtLink to="/platform/ai" class="inline-flex items-center gap-1.5 mt-5 text-[15px] font-medium text-[#121317] dark:text-white hover:opacity-70 transition-opacity group">
              Learn more
              <UIcon name="i-lucide-arrow-right" class="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </NuxtLink>
          </div>
          <div class="flex-1">
            <div class="w-full rounded-3xl feature-gradient-4 overflow-hidden flex items-center justify-center px-6 py-10 md:px-10 md:py-14">
              <div class="w-full h-full rounded-2xl bg-white/80 dark:bg-white/[0.08] backdrop-blur-sm shadow-sm dark:shadow-none overflow-hidden flex flex-col">
                <!-- AI header -->
                <div class="flex items-center gap-2.5 px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06]">
                  <div class="w-5 h-5 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                    <span class="text-[8px] text-white font-bold">AI</span>
                  </div>
                  <span class="text-[11px] font-medium text-[#121317]/70 dark:text-white/70">XeroFlow AI</span>
                  <div class="ml-auto flex gap-1">
                    <div class="px-2 py-0.5 rounded-full bg-amber-100/80 dark:bg-amber-500/20 text-[8px] text-amber-700 dark:text-amber-400 font-medium">3 alerts</div>
                  </div>
                </div>
                <!-- AI conversation -->
                <div class="flex-1 px-4 py-3 flex flex-col gap-3 overflow-hidden">
                  <div class="self-end max-w-[80%]">
                    <div class="rounded-xl rounded-br-sm bg-[#121317] px-3 py-2 text-[10px] text-white/90">
                      What's our ad spend looking like for @Acme Corp this month?
                    </div>
                  </div>
                  <div class="flex gap-2.5 max-w-[90%]">
                    <div class="w-5 h-5 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex-shrink-0 flex items-center justify-center mt-0.5">
                      <span class="text-[7px] text-white font-bold">AI</span>
                    </div>
                    <div class="rounded-xl rounded-tl-sm bg-gradient-to-br from-amber-50 to-orange-50/50 dark:from-amber-500/[0.08] dark:to-orange-500/[0.04] border border-amber-200/30 dark:border-amber-500/20 px-3 py-2">
                      <div class="text-[10px] text-[#121317]/80 dark:text-white/80 mb-2">Acme Corp — February spend summary:</div>
                      <div class="flex gap-2 mb-2">
                        <div class="rounded-md bg-white/80 dark:bg-white/[0.06] px-2 py-1">
                          <div class="text-[7px] text-[#45474D]/50 dark:text-white/40">Meta Ads</div>
                          <div class="text-[10px] font-semibold text-[#121317] dark:text-white">$4,230</div>
                        </div>
                        <div class="rounded-md bg-white/80 dark:bg-white/[0.06] px-2 py-1">
                          <div class="text-[7px] text-[#45474D]/50 dark:text-white/40">Google Ads</div>
                          <div class="text-[10px] font-semibold text-[#121317] dark:text-white">$2,810</div>
                        </div>
                      </div>
                      <div class="text-[9px] text-amber-700/80">&#9888;&#65039; Meta CPC is 23% above target — recommend pausing underperforming ad sets.</div>
                    </div>
                  </div>
                </div>
                <!-- AI input -->
                <div class="px-3 pb-3">
                  <div class="rounded-xl border border-amber-200/40 dark:border-amber-500/20 bg-amber-50/30 dark:bg-amber-500/[0.04] px-3 py-2 flex items-center gap-2">
                    <span class="text-[9px] text-[#45474D]/40 dark:text-white/30">Ask about clients, spend, tasks...</span>
                    <div class="ml-auto w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                      <div class="w-0 h-0 border-l-[4px] border-l-white border-y-[3px] border-y-transparent ml-0.5" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 5. Client Portal -->
        <div class="flex flex-col gap-8 mb-0 md:flex-row">
          <div class="flex-1 flex flex-col justify-center">
            <h2 class="text-[clamp(28px,4vw,40px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Client Portal
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[480px]">
              Dedicated portal for your clients to view projects, approve work, access invoices and browse the creative gallery — all permission-gated.
            </p>
            <NuxtLink to="/platform/client-portal" class="inline-flex items-center gap-1.5 mt-5 text-[15px] font-medium text-[#121317] dark:text-white hover:opacity-70 transition-opacity group">
              Learn more
              <UIcon name="i-lucide-arrow-right" class="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </NuxtLink>
          </div>
          <div class="flex-1">
            <div class="w-full rounded-3xl feature-gradient-5 overflow-hidden flex items-center justify-center px-6 py-10 md:px-10 md:py-14">
              <div class="w-full h-full rounded-2xl bg-white/80 dark:bg-white/[0.08] backdrop-blur-sm shadow-sm dark:shadow-none overflow-hidden flex flex-col">
                <!-- Portal header -->
                <div class="flex items-center gap-2.5 px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06]">
                  <div class="w-2 h-2 rounded-full bg-rose-400" />
                  <span class="text-[11px] font-medium text-[#121317]/70 dark:text-white/70">Client Portal — Acme Corp</span>
                </div>
                <!-- Approval cards -->
                <div class="flex-1 px-4 py-3 flex flex-col gap-2.5 overflow-hidden">
                  <div class="text-[9px] font-semibold text-[#45474D]/60 dark:text-white/40 uppercase tracking-wider">Pending Approvals</div>
                  <div class="rounded-xl border border-black/[0.05] dark:border-white/[0.06] p-3 flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-100 to-pink-50 flex items-center justify-center flex-shrink-0">
                      <UIcon name="i-lucide-image" class="w-4 h-4 text-rose-400" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[10px] font-medium text-[#121317] dark:text-white mb-0.5">Homepage Hero Banner v3</div>
                      <div class="text-[8px] text-[#45474D]/50 dark:text-white/40">Uploaded 2 hours ago</div>
                    </div>
                    <div class="flex gap-1.5 flex-shrink-0">
                      <div class="px-2.5 py-1 rounded-full bg-emerald-500 text-[8px] text-white font-medium">Approve</div>
                      <div class="px-2.5 py-1 rounded-full bg-[#121317]/[0.06] dark:bg-white/[0.08] text-[8px] text-[#45474D] dark:text-white/60 font-medium">Revise</div>
                    </div>
                  </div>
                  <div class="rounded-xl border border-black/[0.05] dark:border-white/[0.06] p-3 flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-50 flex items-center justify-center flex-shrink-0">
                      <UIcon name="i-lucide-file-text" class="w-4 h-4 text-blue-400" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[10px] font-medium text-[#121317] dark:text-white mb-0.5">February Content Calendar</div>
                      <div class="text-[8px] text-[#45474D]/50 dark:text-white/40">Uploaded yesterday</div>
                    </div>
                    <div class="flex gap-1.5 flex-shrink-0">
                      <div class="px-2.5 py-1 rounded-full bg-emerald-500 text-[8px] text-white font-medium">Approve</div>
                      <div class="px-2.5 py-1 rounded-full bg-[#121317]/[0.06] dark:bg-white/[0.08] text-[8px] text-[#45474D] dark:text-white/60 font-medium">Revise</div>
                    </div>
                  </div>
                  <div class="rounded-xl border border-black/[0.05] dark:border-white/[0.06] p-3 flex items-center gap-3 opacity-60">
                    <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-50 flex items-center justify-center flex-shrink-0">
                      <UIcon name="i-lucide-receipt" class="w-4 h-4 text-emerald-400" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[10px] font-medium text-[#121317] dark:text-white mb-0.5">Invoice #1042 — $12,400</div>
                      <div class="text-[8px] text-[#45474D]/50 dark:text-white/40">Due Mar 15, 2026</div>
                    </div>
                    <div class="px-2 py-0.5 rounded-full bg-emerald-100 text-[8px] text-emerald-700 font-medium flex-shrink-0">Paid</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>

    <!-- Bento Grid — Banner Studio, Time Tracking, Automations -->
    <section class="py-20 md:py-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <!-- Section header -->
        <div class="mb-12">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06] mb-6">
            <div class="w-1.5 h-1.5 rounded-full bg-violet-500" />
            <span class="text-[13px] text-[#45474D] dark:text-white/60 font-medium">And so much more</span>
          </div>
          <h2 class="text-[clamp(32px,5vw,56px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.03em] mb-4">
            Creative, briefs &amp;<br class="hidden sm:block"><span class="text-[#45474D]/50 dark:text-white/40">automation tools</span>
          </h2>
          <p class="text-[#45474D] dark:text-white/60 text-lg max-w-[520px] leading-relaxed">
            A full creative suite, brief-to-quote pipeline, resource management, and workflow automation — built into the same platform.
          </p>
        </div>

        <!-- Bento cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <!-- Banner Studio — spans 2 cols -->
          <div class="md:col-span-2 rounded-3xl bento-gradient-banner overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div class="flex flex-col md:flex-row gap-6 p-6 md:p-10">
              <div class="flex-1 flex flex-col justify-center">
                <div class="flex items-center gap-2 mb-3">
                  <UIcon name="i-lucide-palette" class="w-5 h-5 text-violet-600 dark:text-violet-400" />
                  <span class="text-[13px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider">Banner Studio</span>
                </div>
                <h3 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white leading-[1.2] tracking-[-0.02em] mb-3">
                  Design, animate &amp; publish<br>HTML5 ads at scale
                </h3>
                <p class="text-[#45474D] dark:text-white/60 text-[15px] leading-relaxed max-w-[400px]">
                  Multi-format editor with GSAP animations, data feeds, dynamic creative optimization, AI copy assist, and one-click ad tag generation.
                </p>
              </div>
              <div class="flex-1">
                <div class="rounded-2xl bg-white/80 dark:bg-white/[0.08] backdrop-blur-sm shadow-sm dark:shadow-none overflow-hidden">
                  <!-- Editor mockup header -->
                  <div class="flex items-center gap-2 px-4 py-2.5 border-b border-black/[0.04] dark:border-white/[0.06]">
                    <div class="flex gap-1.5">
                      <div class="w-2 h-2 rounded-full bg-rose-400/80" />
                      <div class="w-2 h-2 rounded-full bg-amber-400/80" />
                      <div class="w-2 h-2 rounded-full bg-emerald-400/80" />
                    </div>
                    <span class="text-[10px] text-[#45474D]/50 dark:text-white/40 ml-2">Banner Editor — 300×250</span>
                  </div>
                  <!-- Editor body -->
                  <div class="flex">
                    <!-- Sidebar layers -->
                    <div class="w-28 border-r border-black/[0.04] dark:border-white/[0.06] px-2 py-3 flex flex-col gap-1.5">
                      <div class="text-[8px] font-semibold text-[#45474D]/50 dark:text-white/30 uppercase tracking-wider mb-1">Layers</div>
                      <div class="flex items-center gap-1.5 px-1.5 py-1 rounded bg-violet-100/60 dark:bg-violet-500/20">
                        <div class="w-2.5 h-2.5 rounded-sm bg-violet-400" />
                        <span class="text-[8px] text-[#121317] dark:text-white font-medium">Headline</span>
                      </div>
                      <div class="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-black/[0.02] dark:hover:bg-white/[0.04]">
                        <div class="w-2.5 h-2.5 rounded-sm bg-blue-300" />
                        <span class="text-[8px] text-[#45474D]/70 dark:text-white/60">CTA Button</span>
                      </div>
                      <div class="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-black/[0.02] dark:hover:bg-white/[0.04]">
                        <div class="w-2.5 h-2.5 rounded-sm bg-emerald-300" />
                        <span class="text-[8px] text-[#45474D]/70 dark:text-white/60">Logo</span>
                      </div>
                      <div class="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-black/[0.02] dark:hover:bg-white/[0.04]">
                        <div class="w-2.5 h-2.5 rounded-sm bg-rose-300" />
                        <span class="text-[8px] text-[#45474D]/70 dark:text-white/60">Background</span>
                      </div>
                    </div>
                    <!-- Canvas area -->
                    <div class="flex-1 p-4 flex items-center justify-center">
                      <div class="w-full aspect-[300/250] rounded-lg bg-gradient-to-br from-indigo-100 to-violet-50 dark:from-indigo-900/40 dark:to-violet-900/30 border border-violet-200/50 dark:border-violet-500/20 flex flex-col items-center justify-center gap-2 p-4">
                        <div class="h-2 w-3/4 rounded-full bg-[#121317]/15 dark:bg-white/20" />
                        <div class="h-1.5 w-1/2 rounded-full bg-[#121317]/10 dark:bg-white/15" />
                        <div class="mt-2 px-4 py-1.5 rounded-full bg-violet-500 text-[8px] text-white font-medium">Learn More</div>
                      </div>
                    </div>
                  </div>
                  <!-- Timeline bar -->
                  <div class="px-3 py-2 border-t border-black/[0.04] dark:border-white/[0.06] flex items-center gap-2">
                    <div class="w-4 h-4 rounded bg-[#121317]/[0.06] dark:bg-white/[0.08] flex items-center justify-center">
                      <div class="w-0 h-0 border-l-[3px] border-l-[#121317]/40 dark:border-l-white/40 border-y-[2px] border-y-transparent ml-0.5" />
                    </div>
                    <div class="flex-1 h-1.5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06] relative">
                      <div class="absolute left-0 top-0 h-full w-1/3 rounded-full bg-violet-400/60" />
                      <div class="absolute left-[33%] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-violet-500 border-2 border-white dark:border-[#121317]" />
                    </div>
                    <span class="text-[8px] text-[#45474D]/40 dark:text-white/30">1.2s</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Briefs & Proposals -->
          <div class="rounded-3xl bento-gradient-briefs overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 p-6 md:p-8">
            <div class="flex items-center gap-2 mb-3">
              <UIcon name="i-lucide-file-text" class="w-5 h-5 text-orange-600 dark:text-orange-400" />
              <span class="text-[13px] font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider">Briefs &amp; Proposals</span>
            </div>
            <h3 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">
              Brief to quote pipeline
            </h3>
            <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed mb-5">
              Template builder, AI scoring, field suggestions, and automatic Xero quote generation on approval.
            </p>
            <!-- Brief mockup -->
            <div class="rounded-2xl bg-white/80 dark:bg-white/[0.08] backdrop-blur-sm shadow-sm dark:shadow-none overflow-hidden p-4">
              <div class="flex items-center justify-between mb-3">
                <span class="text-[10px] font-medium text-[#121317] dark:text-white">Website Redesign Brief</span>
                <div class="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-[8px] text-blue-700 dark:text-blue-400 font-medium">In Review</div>
              </div>
              <div class="flex flex-col gap-2 mb-3">
                <div class="flex items-center gap-2">
                  <div class="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <div class="h-1 flex-1 rounded-full bg-[#121317]/10 dark:bg-white/15" />
                  <span class="text-[8px] text-emerald-600 dark:text-emerald-400">Complete</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <div class="h-1 flex-1 rounded-full bg-[#121317]/10 dark:bg-white/15" />
                  <span class="text-[8px] text-emerald-600 dark:text-emerald-400">Complete</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <div class="h-1 w-2/3 rounded-full bg-[#121317]/10 dark:bg-white/15" />
                  <span class="text-[8px] text-amber-600 dark:text-amber-400">Partial</span>
                </div>
              </div>
              <div class="flex items-center justify-between pt-2 border-t border-black/[0.04] dark:border-white/[0.06]">
                <div class="flex items-center gap-1">
                  <UIcon name="i-lucide-sparkles" class="w-3 h-3 text-orange-400" />
                  <span class="text-[8px] text-orange-600 dark:text-orange-400 font-medium">AI Score: 82%</span>
                </div>
                <span class="text-[8px] text-[#45474D]/40 dark:text-white/30">5 of 6 fields</span>
              </div>
            </div>
          </div>

          <!-- Time Tracking -->
          <div class="rounded-3xl bento-gradient-time overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 p-6 md:p-8">
            <div class="flex items-center gap-2 mb-3">
              <UIcon name="i-lucide-timer" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span class="text-[13px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Time &amp; Resources</span>
            </div>
            <h3 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">
              Timesheets &amp; utilisation
            </h3>
            <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed mb-5">
              Weekly time logging, task-level tracking, approval workflows, and team utilisation reports.
            </p>
            <!-- Timesheet mockup -->
            <div class="rounded-2xl bg-white/80 dark:bg-white/[0.08] backdrop-blur-sm shadow-sm dark:shadow-none overflow-hidden p-4">
              <div class="flex items-center justify-between mb-3">
                <span class="text-[10px] font-medium text-[#121317] dark:text-white">Week of Feb 24</span>
                <div class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-[8px] text-emerald-700 dark:text-emerald-400 font-medium">Approved</div>
              </div>
              <div class="flex gap-1.5 mb-2">
                <div v-for="(d, i) in [{ label: 'M', h: 8 }, { label: 'T', h: 7.5 }, { label: 'W', h: 8 }, { label: 'T', h: 6 }, { label: 'F', h: 7 }]" :key="i" class="flex-1 flex flex-col items-center gap-1">
                  <div class="w-full rounded-md bg-blue-100/80 dark:bg-blue-500/20 relative" :style="{ height: (d.h / 8) * 48 + 'px' }">
                    <div class="absolute inset-x-0 bottom-0 rounded-md bg-blue-400/60 dark:bg-blue-400/40" :style="{ height: (d.h / 8) * 100 + '%' }" />
                  </div>
                  <span class="text-[8px] text-[#45474D]/50 dark:text-white/40">{{ d.label }}</span>
                </div>
              </div>
              <div class="flex items-center justify-between pt-2 border-t border-black/[0.04] dark:border-white/[0.06]">
                <span class="text-[9px] text-[#45474D]/60 dark:text-white/40">Total: 36.5h</span>
                <div class="flex items-center gap-1">
                  <div class="w-3 h-3 rounded-full bg-blue-200" />
                  <div class="w-3 h-3 rounded-full bg-violet-200 -ml-1" />
                  <span class="text-[8px] text-[#45474D]/40 dark:text-white/30 ml-0.5">2 projects</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Automations -->
          <div class="rounded-3xl bento-gradient-auto overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 p-6 md:p-8">
            <div class="flex items-center gap-2 mb-3">
              <UIcon name="i-lucide-zap" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <span class="text-[13px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Automations</span>
            </div>
            <h3 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">
              Trigger-action recipes
            </h3>
            <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed mb-5">
              Board events, email hooks, status changes, and notifications — all automated.
            </p>
            <!-- Automation recipe cards -->
            <div class="flex flex-col gap-2.5">
              <div class="rounded-xl bg-white/80 dark:bg-white/[0.08] backdrop-blur-sm shadow-sm dark:shadow-none p-3 flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-arrow-right-left" class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[10px] font-medium text-[#121317] dark:text-white mb-0.5">Status changed to Done</div>
                  <div class="text-[8px] text-[#45474D]/50 dark:text-white/40">Notify assignee + move to Archive group</div>
                </div>
                <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              </div>
              <div class="rounded-xl bg-white/80 dark:bg-white/[0.08] backdrop-blur-sm shadow-sm dark:shadow-none p-3 flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-mail" class="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[10px] font-medium text-[#121317] dark:text-white mb-0.5">Client approves proof</div>
                  <div class="text-[8px] text-[#45474D]/50 dark:text-white/40">Email team + update board status</div>
                </div>
                <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              </div>
              <div class="rounded-xl bg-white/80 dark:bg-white/[0.08] backdrop-blur-sm shadow-sm dark:shadow-none p-3 flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-clock" class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[10px] font-medium text-[#121317] dark:text-white mb-0.5">Due date passes</div>
                  <div class="text-[8px] text-[#45474D]/50 dark:text-white/40">Escalate to manager + flag overdue</div>
                </div>
                <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              </div>
            </div>
          </div>

          <!-- Roles & Admin -->
          <div class="rounded-3xl bento-gradient-roles overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 p-6 md:p-8">
            <div class="flex flex-col gap-5">
              <div>
                <div class="flex items-center gap-2 mb-3">
                  <UIcon name="i-lucide-shield-check" class="w-5 h-5 text-slate-600 dark:text-slate-400" />
                  <span class="text-[13px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Admin &amp; Roles</span>
                </div>
                <h3 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">
                  Granular permissions &amp; custom roles
                </h3>
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">
                  15 built-in roles, custom role builder, and 3-layer enforcement across server middleware, route middleware, and sidebar gating.
                </p>
              </div>
              <div>
                <div class="rounded-2xl bg-white/80 dark:bg-white/[0.08] backdrop-blur-sm shadow-sm dark:shadow-none overflow-hidden p-4">
                  <!-- Roles mockup -->
                  <div class="flex items-center justify-between mb-3">
                    <span class="text-[10px] font-medium text-[#121317] dark:text-white">Role Matrix</span>
                    <div class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-500/20 text-[8px] text-slate-700 dark:text-slate-400 font-medium">15 roles</div>
                  </div>
                  <div class="flex flex-col gap-2">
                    <div class="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-emerald-50/80 dark:bg-emerald-500/[0.08]">
                      <div class="w-5 h-5 rounded-full bg-emerald-200 dark:bg-emerald-500/30 flex items-center justify-center">
                        <UIcon name="i-lucide-crown" class="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                      </div>
                      <span class="text-[9px] font-medium text-[#121317] dark:text-white flex-1">Owner</span>
                      <span class="text-[7px] text-emerald-600 dark:text-emerald-400">All access</span>
                    </div>
                    <div class="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-blue-50/80 dark:bg-blue-500/[0.08]">
                      <div class="w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-500/30 flex items-center justify-center">
                        <UIcon name="i-lucide-settings" class="w-3 h-3 text-blue-700 dark:text-blue-400" />
                      </div>
                      <span class="text-[9px] font-medium text-[#121317] dark:text-white flex-1">Admin</span>
                      <span class="text-[7px] text-blue-600 dark:text-blue-400">Manage users</span>
                    </div>
                    <div class="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-violet-50/80 dark:bg-violet-500/[0.08]">
                      <div class="w-5 h-5 rounded-full bg-violet-200 dark:bg-violet-500/30 flex items-center justify-center">
                        <UIcon name="i-lucide-palette" class="w-3 h-3 text-violet-700 dark:text-violet-400" />
                      </div>
                      <span class="text-[9px] font-medium text-[#121317] dark:text-white flex-1">Creative Lead</span>
                      <span class="text-[7px] text-violet-600 dark:text-violet-400">Briefs + studio</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- First-party Measurement -->
    <section
      id="measurement"
      aria-labelledby="first-party-measurement-title"
      class="py-20 md:py-28"
    >
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="overflow-hidden rounded-[2rem] bg-[#0a0b0e] text-white border border-white/[0.08]">
          <div class="grid lg:grid-cols-[1.05fr_0.95fr]">
            <div class="p-7 sm:p-10 md:p-14 lg:p-16">
              <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-400/10 border border-emerald-300/15 mb-7">
                <UIcon name="i-lucide-activity" class="w-3.5 h-3.5 text-emerald-300" />
                <span class="text-[13px] font-medium text-emerald-200">First-party measurement</span>
              </div>

              <h2
                id="first-party-measurement-title"
                class="text-[clamp(30px,4.5vw,52px)] font-[450] leading-[1.08] tracking-[-0.03em] mb-5"
              >
                Measure every consented enquiry from site to ad platform
              </h2>
              <p class="text-base md:text-lg leading-relaxed text-white/60 max-w-[580px] mb-8">
                Connect client websites, capture consented first-party events, and manage server-side conversion delivery to Google and Meta from one agency workspace.
              </p>

              <ul class="grid sm:grid-cols-2 gap-x-8 gap-y-5" aria-label="First-party measurement capabilities">
                <li
                  v-for="capability in measurementCapabilities"
                  :key="capability.title"
                  class="flex gap-3"
                >
                  <div class="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <UIcon :name="capability.icon" class="w-4 h-4 text-emerald-300" />
                  </div>
                  <div>
                    <h3 class="text-[14px] font-medium text-white mb-1">
                      {{ capability.title }}
                    </h3>
                    <p class="text-[13px] leading-relaxed text-white/60">
                      {{ capability.description }}
                    </p>
                  </div>
                </li>
              </ul>

              <NuxtLink
                to="/platform/ad-spend"
                class="inline-flex items-center gap-2 mt-9 text-[15px] font-medium text-white hover:text-emerald-200 transition-colors group"
              >
                Explore advertising operations
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </NuxtLink>
            </div>

            <div class="relative min-h-[430px] bg-white/[0.025] border-t lg:border-t-0 lg:border-l border-white/[0.08] p-6 sm:p-9 flex items-center">
              <div class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                <div class="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-emerald-400/10 blur-3xl" />
                <div class="absolute -bottom-24 -left-20 w-72 h-72 rounded-full bg-blue-400/[0.07] blur-3xl" />
              </div>

              <div class="relative w-full max-w-[460px] mx-auto rounded-2xl bg-[#121317] border border-white/[0.1] p-4 sm:p-5 shadow-2xl">
                <div class="flex items-center justify-between pb-4 border-b border-white/[0.08]">
                  <div>
                    <p class="text-[11px] uppercase tracking-[0.16em] text-white/60 mb-1">
                      Measurement control
                    </p>
                    <p class="text-[14px] font-medium text-white">
                      Client conversion pipeline
                    </p>
                  </div>
                  <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-400/10 text-[10px] text-emerald-200">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                    Consent-gated
                  </div>
                </div>

                <ol class="mt-4 space-y-3" aria-label="Governed measurement delivery flow">
                  <li
                    v-for="(stage, index) in measurementStages"
                    :key="stage.title"
                    class="relative flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/[0.06] p-3.5"
                  >
                    <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" :class="stage.iconBg">
                      <UIcon :name="stage.icon" class="w-4 h-4" :class="stage.iconColor" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center justify-between gap-3">
                        <p class="text-[12px] font-medium text-white">
                          {{ stage.title }}
                        </p>
                        <span class="text-[10px] text-white/50">
                          0{{ index + 1 }}
                        </span>
                      </div>
                      <p class="text-[11px] text-white/60 mt-0.5">
                        {{ stage.description }}
                      </p>
                    </div>
                    <UIcon
                      v-if="index < measurementStages.length - 1"
                      name="i-lucide-chevron-down"
                      class="absolute -bottom-3.5 left-[1.65rem] z-10 w-3 h-3 text-white/20"
                      aria-hidden="true"
                    />
                  </li>
                </ol>

                <div class="grid grid-cols-2 gap-3 mt-4">
                  <div class="rounded-xl bg-white/[0.035] border border-white/[0.06] p-3">
                    <div class="flex items-center gap-2 mb-1.5">
                      <UIcon name="i-simple-icons-googleads" class="w-3.5 h-3.5 text-[#4285F4]" />
                      <span class="text-[11px] font-medium text-white">Google</span>
                    </div>
                    <p class="text-[10px] leading-relaxed text-white/60">
                      Data Manager &amp; enhanced conversions
                    </p>
                  </div>
                  <div class="rounded-xl bg-white/[0.035] border border-white/[0.06] p-3">
                    <div class="flex items-center gap-2 mb-1.5">
                      <UIcon name="i-simple-icons-meta" class="w-3.5 h-3.5 text-[#0081FB]" />
                      <span class="text-[11px] font-medium text-white">Meta</span>
                    </div>
                    <p class="text-[10px] leading-relaxed text-white/60">
                      Conversions API delivery
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Integration Strip -->
    <section class="py-16 md:py-20 bg-[#b7bfd9]/[0.04] dark:bg-white/[0.02]">
      <div class="max-w-[1200px] mx-auto px-6 text-center">
        <h2 class="text-[clamp(24px,3.5vw,36px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-3">
          Connects to the tools you already use
        </h2>
        <p class="text-[#45474D] dark:text-white/60 text-lg mb-10 max-w-[480px] mx-auto">
          Native integrations with your accounting, ad platforms, and infrastructure.
        </p>
        <div class="flex flex-wrap justify-center gap-4 md:gap-6">
          <div
            v-for="int in integrations"
            :key="int.name"
            class="flex items-center gap-2.5 px-5 py-3 rounded-full bg-white dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <UIcon :name="int.icon" class="w-5 h-5" :class="int.color" />
            <span class="text-[14px] font-medium text-[#121317] dark:text-white">{{ int.name }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Built For Section (Persona Carousel) -->
    <section class="py-20 md:py-32 overflow-hidden">
      <div class="max-w-[1200px] mx-auto px-6">
        <!-- Section Header -->
        <div class="mb-16">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06] mb-6">
            <div class="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            <span class="text-[13px] text-[#45474D] dark:text-white/60 font-medium">Your team, empowered</span>
          </div>
          <h2 class="text-[clamp(32px,5vw,56px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.03em] mb-4">
            Built for agencies<br class="hidden sm:block"><span class="text-[#45474D]/50 dark:text-white/40">in the modern era</span>
          </h2>
          <p class="text-[#45474D] dark:text-white/60 text-lg max-w-[520px] leading-relaxed">
            Every role gets a tailored experience — from campaign management to financial oversight.
          </p>
        </div>

        <!-- Carousel -->
        <div class="relative">
          <!-- Navigation arrows -->
          <div class="hidden md:flex items-center gap-2 absolute -top-20 right-0">
            <button
              class="w-10 h-10 rounded-full border border-[#121317]/10 dark:border-white/10 flex items-center justify-center hover:bg-[#121317]/[0.03] dark:hover:bg-white/[0.06] transition-colors disabled:opacity-30"
              :disabled="personaOffset === 0"
              @click="personaOffset = Math.max(0, personaOffset - 1)"
            >
              <UIcon name="i-lucide-arrow-left" class="w-4 h-4 text-[#121317] dark:text-white" />
            </button>
            <button
              class="w-10 h-10 rounded-full border border-[#121317]/10 dark:border-white/10 flex items-center justify-center hover:bg-[#121317]/[0.03] dark:hover:bg-white/[0.06] transition-colors disabled:opacity-30"
              :disabled="personaOffset >= personas.length - 3"
              @click="personaOffset = Math.min(personas.length - 3, personaOffset + 1)"
            >
              <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317] dark:text-white" />
            </button>
          </div>

          <!-- Cards container -->
          <div class="flex gap-5 transition-transform duration-500 ease-out" :style="{ transform: `translateX(-${personaOffset * (100 / 3 + 1.4)}%)` }">
            <div
              v-for="persona in personas"
              :key="persona.role"
              class="flex-shrink-0 w-[calc(85vw-32px)] sm:w-[340px] md:w-[calc(33.333%-14px)] group cursor-pointer"
            >
              <!-- Card Image/Gradient -->
              <div
                class="relative aspect-[3/4] rounded-3xl overflow-hidden mb-5"
                :class="persona.bg"
              >
                <!-- Background photo -->
                <img
                  :src="persona.image"
                  :alt="persona.role"
                  class="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
                <!-- Color tint overlay -->
                <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                <!-- Icon overlay (top-right) -->
                <div class="absolute top-4 right-4">
                  <div class="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <UIcon :name="persona.icon" class="w-6 h-6 text-white/90" />
                  </div>
                </div>
                <!-- Role badge -->
                <div class="absolute bottom-5 left-5 right-5">
                  <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white text-[12px] font-medium tracking-wide">
                    <UIcon :name="persona.icon" class="w-3.5 h-3.5" />
                    {{ persona.badge }}
                  </span>
                </div>
              </div>
              <!-- Card Text -->
              <h3 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">
                {{ persona.role }}
              </h3>
              <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
                {{ persona.description }}
              </p>
            </div>
          </div>

          <!-- Mobile scroll indicators -->
          <div class="flex md:hidden items-center justify-center gap-2 mt-6">
            <div
              v-for="(_, i) in personas"
              :key="i"
              class="w-1.5 h-1.5 rounded-full transition-colors"
              :class="i === personaOffset ? 'bg-[#121317] dark:bg-white' : 'bg-[#121317]/15 dark:bg-white/15'"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Roles Section -->
    <section class="py-20 md:py-32 bg-[#b7bfd9]/[0.04] dark:bg-white/[0.02]">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid md:grid-cols-2 gap-16 text-center">
          <div>
            <div class="inline-flex items-center px-3 py-1.5 rounded-full border border-[#121317]/10 dark:border-white/10 text-[13px] text-[#45474D] dark:text-white/60 font-medium mb-6">
              For agencies
            </div>
            <h3 class="text-[clamp(24px,3.5vw,36px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-2">
              Manage your operations
            </h3>
            <p class="text-[#45474D] dark:text-white/60 text-lg mb-8">Boards, clients, projects & financials</p>
            <NuxtLink
              to="/auth/login"
              class="inline-flex items-center gap-2.5 px-6 py-3 bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[15px] font-medium rounded-full hover:bg-[#2a2b30] dark:hover:bg-white/90 transition-colors"
            >
              Sign In
            </NuxtLink>
          </div>
          <div>
            <div class="inline-flex items-center px-3 py-1.5 rounded-full border border-[#121317]/10 dark:border-white/10 text-[13px] text-[#45474D] dark:text-white/60 font-medium mb-6">
              For clients
            </div>
            <h3 class="text-[clamp(24px,3.5vw,36px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-2">
              View your projects
            </h3>
            <p class="text-[#45474D] dark:text-white/60 text-lg mb-8">Approvals, invoices & deliverables</p>
            <NuxtLink
              to="/portal/login"
              class="inline-flex items-center gap-2 px-6 py-3 bg-[#b7bfd9]/10 dark:bg-white/[0.06] text-[#121317] dark:text-white text-[15px] font-medium rounded-full hover:bg-[#b7bfd9]/20 dark:hover:bg-white/[0.1] transition-colors"
            >
              Client Portal
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

    <!-- Dark CTA Section -->
    <section class="py-10 md:py-16">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="relative rounded-[2rem] bg-[#0a0b0e] overflow-hidden py-24 md:py-36">
          <!-- Animated green wave particles -->
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
            <div class="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-emerald-500/[0.06] blur-[120px] cta-glow-1" />
            <div class="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full bg-emerald-400/[0.04] blur-[100px] cta-glow-2" />
          </div>

          <!-- Content -->
          <div class="relative text-center px-6">
            <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mx-auto mb-8">
              <span class="text-white text-xs font-semibold tracking-tight">XF</span>
            </div>
            <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-10">
              Ready to streamline<br class="hidden sm:block"> your agency?
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
    <MarketingFooter />

    <!-- Session expired / redirect info -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="sessionExpired" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div class="flex items-center gap-3 px-5 py-3 bg-[#121317] text-white rounded-full shadow-xl text-sm">
            <UIcon name="i-lucide-alert-triangle" class="w-4 h-4 text-amber-400" />
            Session expired. Please sign in again.
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

useSeoMeta({
  title: 'XeroFlow — Agency Operations Platform',
  description: 'Run your agency from one platform with work management, financials, governed people operations, client portals, AI insights, and consent-gated first-party measurement.',
  ogTitle: 'XeroFlow — Agency Operations Platform',
  ogDescription: 'Run your agency from one platform with work management, financials, governed people operations, client portals, AI insights, and consent-gated first-party measurement.'
})

const route = useRoute()
const sessionExpired = computed(() => route.query.expired === 'true')

// Persona carousel
const personaOffset = ref(0)

const personas = [
  {
    role: 'Account Manager',
    badge: 'Client ops',
    description: 'Manage client relationships, track project progress across boards, and keep deliverables on schedule with real-time updates.',
    icon: 'i-lucide-users',
    bg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    image: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=600&h=800&fit=crop&crop=faces'
  },
  {
    role: 'Media Buyer',
    badge: 'Ad spend',
    description: 'Monitor Meta and Google Ads performance, track campaign budgets, and catch anomalies before they impact ROI.',
    icon: 'i-lucide-bar-chart-3',
    bg: 'bg-gradient-to-br from-violet-500 to-purple-600',
    image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=600&h=800&fit=crop&crop=faces'
  },
  {
    role: 'Finance Manager',
    badge: 'Financials',
    description: 'Xero-integrated invoicing, end-of-month automation, cashflow forecasting, and profit & loss at a glance.',
    icon: 'i-lucide-calculator',
    bg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    image: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=600&h=800&fit=crop&crop=faces'
  },
  {
    role: 'Creative Producer',
    badge: 'Production',
    description: 'Brief-to-delivery workflows, approval pipelines, asset galleries, and time tracking — all connected to your boards.',
    icon: 'i-lucide-palette',
    bg: 'bg-gradient-to-br from-rose-500 to-pink-600',
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=800&fit=crop&crop=faces'
  },
  {
    role: 'Agency Owner',
    badge: 'Overview',
    description: 'AI-powered dashboards, team utilization insights, cross-client reporting, and proactive anomaly detection.',
    icon: 'i-lucide-crown',
    bg: 'bg-gradient-to-br from-amber-500 to-orange-600',
    image: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600&h=800&fit=crop&crop=faces'
  }
]

const platformCards = [
  { title: 'Boards', subtitle: 'Kanban, timeline & calendar views for managing all your tasks across projects.', to: '/platform/boards', bg: 'bg-pink-300', image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=600&fit=crop&crop=center' },
  { title: 'Financials', subtitle: 'End-of-month invoicing engine with Xero integration and P&L tracking.', to: '/platform/financials', bg: 'bg-emerald-300', image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&h=600&fit=crop&crop=center' },
  { title: 'Chat', subtitle: 'Real-time channels, threads, file sharing, and team messaging.', to: '/platform/chat', bg: 'bg-violet-400', image: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=600&h=600&fit=crop&crop=faces' },
  { title: 'Office', subtitle: 'Live presence, virtual rooms, guest lobbies, and organised meeting follow-up.', to: '/platform/office', bg: 'bg-emerald-300', image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&h=600&fit=crop&crop=faces' },
  { title: 'People Operations', subtitle: 'Role clarity, private business reviews, evidence controls, and human governance.', to: '/features/hr-people-operations', bg: 'bg-cyan-300', image: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=600&h=600&fit=crop&crop=faces' },
  { title: 'AI Insights', subtitle: 'Smart project generation, anomaly detection, and AI recommendations.', to: '/platform/ai', bg: 'bg-yellow-300', image: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=600&h=600&fit=crop&crop=center' },
  { title: 'Time Tracking', subtitle: 'Weekly timesheets, timer, approvals, and utilization reports.', to: '/platform/time-tracking', bg: 'bg-rose-300', image: 'https://images.unsplash.com/photo-1501139083538-0139583c060f?w=600&h=600&fit=crop&crop=center' },
  { title: 'Client Portal', subtitle: 'Client-facing approvals, invoices, deliverables, and project updates.', to: '/platform/client-portal', bg: 'bg-blue-400', image: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=600&h=600&fit=crop&crop=faces' },
  { title: 'Ad Spend', subtitle: 'Meta & Google Ads connections with spend syncing and budget management.', to: '/platform/ad-spend', bg: 'bg-teal-300', image: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&h=600&fit=crop&crop=center' },
  { title: 'Automations', subtitle: 'Trigger-action recipes, board event hooks, and workflow automation.', to: '/platform/automations', bg: 'bg-orange-300', image: 'https://images.unsplash.com/photo-1518432031352-d6fc5c10da5a?w=600&h=600&fit=crop&crop=center' },
  { title: 'Banner Studio', subtitle: 'Design, animate, and publish HTML5 display ads at scale from one editor.', to: '/banner-studio', bg: 'bg-rose-400', image: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=600&h=600&fit=crop&crop=center' },
  { title: 'Briefs', subtitle: 'Template builder with 30+ field types, AI scoring, and automatic quote generation.', to: '/features/brief-templates', bg: 'bg-orange-300', image: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&h=600&fit=crop&crop=center' },
  { title: 'Admin & Roles', subtitle: 'Custom roles, granular permissions, and 3-layer RBAC enforcement.', to: '/features/custom-roles', bg: 'bg-slate-300', image: 'https://images.unsplash.com/photo-1633265486064-086b219458ec?w=600&h=600&fit=crop&crop=center' }
]

// Bottom row — different images, mixed routes, benefit-focused copy
const platformCardsRow2 = [
  { title: 'Collaboration', subtitle: 'Cross-functional teams working in sync across every project.', to: '/creativity', bg: 'bg-indigo-300', image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&h=600&fit=crop&crop=faces' },
  { title: 'Reporting', subtitle: 'Real-time dashboards and KPIs across clients and campaigns.', to: '/platform/ai', bg: 'bg-sky-300', image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&h=600&fit=crop&crop=center' },
  { title: 'Creative Production', subtitle: 'Brief to delivery — assets, proofs, and approvals in one place.', to: '/creativity', bg: 'bg-fuchsia-300', image: 'https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=600&h=600&fit=crop&crop=center' },
  { title: 'Invoicing', subtitle: 'End-of-month automation with Xero sync and audit trails.', to: '/platform/financials', bg: 'bg-lime-300', image: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=600&h=600&fit=crop&crop=center' },
  { title: 'Presentations', subtitle: 'Client-ready reports and campaign performance decks.', to: '/platform/client-portal', bg: 'bg-amber-300', image: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=600&h=600&fit=crop&crop=center' },
  { title: 'Campaign Strategy', subtitle: 'Plan, launch, and optimise paid media from one hub.', to: '/platform/ad-spend', bg: 'bg-red-300', image: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?w=600&h=600&fit=crop&crop=center' },
  { title: 'Data Insights', subtitle: 'Visualise spend, revenue, and utilisation at a glance.', to: '/platform/ai', bg: 'bg-cyan-300', image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=600&fit=crop&crop=center' },
  { title: 'Team Culture', subtitle: 'Chat, kudos, and real-time presence to keep teams connected.', to: '/platform/chat', bg: 'bg-violet-300', image: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=600&h=600&fit=crop&crop=faces' },
  { title: 'Scale', subtitle: 'From boutique to enterprise — infrastructure that grows with you.', to: '/pricing', bg: 'bg-emerald-400', image: 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=600&h=600&fit=crop&crop=center' },
  { title: 'AI Training', subtitle: 'Train your AI on your agency data — knowledge extraction, LoRA adapters, and edge inference.', to: '/ai-training', bg: 'bg-amber-300', image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&h=600&fit=crop&crop=center' },
  { title: 'Rate Cards', subtitle: 'Manage service pricing, fuzzy-match to Xero invoices, and power AI pricing queries.', to: '/features/rate-cards', bg: 'bg-teal-300', image: 'https://images.unsplash.com/photo-1554224155-1696413dd7a1?w=600&h=600&fit=crop&crop=center' }
]

// Two marquee rows — each has its own card set, duplicated for seamless loop
const marqueeRow1 = [...platformCards, ...platformCards]
const marqueeRow2 = [...platformCardsRow2, ...platformCardsRow2]
const marqueeRows = [marqueeRow1, marqueeRow2]

// Green particle colors (shared between hero + CTA)
const greenColors = ['#34d399', '#6ee7b7', '#10b981', '#a7f3d0', '#059669']

// Hero floating icons — wide variety covering all platform features
const heroIconPool = [
  // Work management
  'i-lucide-kanban', 'i-lucide-layout-grid', 'i-lucide-columns-3', 'i-lucide-list-checks',
  'i-lucide-calendar-days', 'i-lucide-gantt-chart', 'i-lucide-clipboard-list',
  // Finance & billing
  'i-lucide-calculator', 'i-lucide-receipt', 'i-lucide-credit-card', 'i-lucide-wallet',
  'i-lucide-trending-up', 'i-lucide-piggy-bank',
  // Communication
  'i-lucide-message-circle', 'i-lucide-mail', 'i-lucide-at-sign', 'i-lucide-bell',
  'i-lucide-inbox', 'i-lucide-send',
  // AI & analytics
  'i-lucide-brain', 'i-lucide-sparkles', 'i-lucide-search', 'i-lucide-bar-chart-3',
  'i-lucide-pie-chart', 'i-lucide-activity',
  // People & clients
  'i-lucide-users', 'i-lucide-user-check', 'i-lucide-briefcase', 'i-lucide-building-2',
  // Files & media
  'i-lucide-folder-open', 'i-lucide-file-check', 'i-lucide-image', 'i-lucide-paperclip',
  // Misc platform
  'i-lucide-timer', 'i-lucide-zap', 'i-lucide-shield-check', 'i-lucide-palette',
  'i-lucide-crown', 'i-lucide-target', 'i-lucide-globe', 'i-lucide-cloud'
]

const sizes = ['sm', 'md', 'lg'] as const
const ICON_COUNT = 28
const COLS = 7
const ROWS = Math.ceil(ICON_COUNT / COLS)
const heroFloatingIcons = Array.from({ length: ICON_COUNT }, (_, i) => ({
  id: i,
  x: 1 + (i % COLS) * (96 / COLS) + Math.random() * (80 / COLS),
  y: 3 + Math.floor(i / COLS) * (90 / ROWS) + Math.random() * (70 / ROWS),
  icon: heroIconPool[i % heroIconPool.length],
  size: sizes[i % 3],
  duration: 8 + Math.random() * 8,
  delay: Math.random() * -10,
  colorDelay: Math.random() * -12,
  opacity: i % 3 === 2 ? 0.7 + Math.random() * 0.3 : 0.5 + Math.random() * 0.35
}))

// CTA wave particles (3 layers for depth)
const waveParticles1 = Array.from({ length: 35 }, (_, i) => ({
  id: i,
  x: 10 + Math.random() * 50,
  y: 15 + Math.random() * 70,
  size: 2 + Math.random() * 3.5,
  color: greenColors[Math.floor(Math.random() * greenColors.length)],
  opacity: 0.3 + Math.random() * 0.5
}))

const waveParticles2 = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  x: 20 + Math.random() * 60,
  y: 10 + Math.random() * 80,
  size: 1.5 + Math.random() * 3,
  color: greenColors[Math.floor(Math.random() * greenColors.length)],
  opacity: 0.2 + Math.random() * 0.4
}))

const waveParticles3 = Array.from({ length: 25 }, (_, i) => ({
  id: i,
  x: 15 + Math.random() * 55,
  y: 20 + Math.random() * 60,
  size: 1.5 + Math.random() * 2.5,
  color: greenColors[Math.floor(Math.random() * greenColors.length)],
  opacity: 0.25 + Math.random() * 0.45
}))

const integrations = [
  { name: 'Xero', icon: 'i-simple-icons-xero', color: 'text-[#13B5EA]' },
  { name: 'Meta Ads', icon: 'i-simple-icons-meta', color: 'text-[#0081FB]' },
  { name: 'Google Ads', icon: 'i-simple-icons-googleads', color: 'text-[#4285F4]' },
  { name: 'TikTok', icon: 'i-simple-icons-tiktok', color: 'text-[#121317] dark:text-white' },
  { name: 'Cloudflare', icon: 'i-simple-icons-cloudflare', color: 'text-[#F38020]' },
  { name: 'Resend', icon: 'i-lucide-send', color: 'text-[#121317] dark:text-white' }
]

const measurementCapabilities = [
  {
    title: 'Consent-aware collection',
    description: 'Collect the event classes each visitor has approved, with clear privacy controls.',
    icon: 'i-lucide-shield-check'
  },
  {
    title: 'Multi-account connections',
    description: 'Attach separate Google and Meta profiles across every client in the agency.',
    icon: 'i-lucide-network'
  },
  {
    title: 'Governed server delivery',
    description: 'Map exact conversion destinations and validate providers before live delivery.',
    icon: 'i-lucide-server-cog'
  },
  {
    title: 'Approvals and audit trails',
    description: 'Versioned configuration, privacy approval, evidence, and controlled activation.',
    icon: 'i-lucide-file-check-2'
  }
]

const measurementStages = [
  {
    title: 'Collect consented site events',
    description: 'Page, engagement and enquiry signals',
    icon: 'i-lucide-mouse-pointer-click',
    iconBg: 'bg-blue-400/10',
    iconColor: 'text-blue-300'
  },
  {
    title: 'Apply policy and approvals',
    description: 'Consent, destination and evidence gates',
    icon: 'i-lucide-shield-check',
    iconBg: 'bg-amber-400/10',
    iconColor: 'text-amber-300'
  },
  {
    title: 'Deliver approved conversions',
    description: 'Controlled Google and Meta destinations',
    icon: 'i-lucide-send',
    iconBg: 'bg-emerald-400/10',
    iconColor: 'text-emerald-300'
  }
]

function scrollToFeatures() {
  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
}
</script>

<style scoped>
/* Two-row marquee grid — opposite directions, pre-filled via negative delay */
@keyframes marquee-left {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
@keyframes marquee-right {
  0% { transform: translateX(-50%); }
  100% { transform: translateX(0); }
}

.marquee-row-left {
  animation: marquee-left 45s linear infinite;
  animation-delay: -15s;
}
.marquee-row-right {
  animation: marquee-right 50s linear infinite;
  animation-delay: -10s;
}
.marquee-row-left:hover,
.marquee-row-right:hover {
  animation-play-state: paused;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Hero floating icon animations — two variants for natural feel */
.hero-float-a {
  animation: hero-drift-a ease-in-out infinite;
}
.hero-float-b {
  animation: hero-drift-b ease-in-out infinite;
}

@keyframes hero-drift-a {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  20% { transform: translate(18px, -24px) rotate(5deg); }
  40% { transform: translate(-12px, -8px) rotate(-3deg); }
  60% { transform: translate(24px, 14px) rotate(6deg); }
  80% { transform: translate(-8px, 20px) rotate(-2deg); }
}

@keyframes hero-drift-b {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  20% { transform: translate(-20px, 14px) rotate(-5deg); }
  40% { transform: translate(14px, 22px) rotate(3deg); }
  60% { transform: translate(-10px, -18px) rotate(-6deg); }
  80% { transform: translate(22px, -10px) rotate(4deg); }
}

/* Colour-cycling background for hero icons */
.hero-icon-color {
  animation: icon-color-cycle 12s ease-in-out infinite;
}
.hero-icon-text {
  animation: icon-text-cycle 12s ease-in-out infinite;
}

@keyframes icon-color-cycle {
  0%, 100% { background-color: rgba(183, 191, 217, 0.06); }
  16% { background-color: rgba(196, 181, 253, 0.09); }
  33% { background-color: rgba(167, 243, 208, 0.09); }
  50% { background-color: rgba(253, 186, 116, 0.09); }
  66% { background-color: rgba(252, 205, 211, 0.09); }
  83% { background-color: rgba(191, 219, 254, 0.09); }
}

@keyframes icon-text-cycle {
  0%, 100% { color: rgba(69, 71, 77, 0.25); }
  16% { color: rgba(139, 92, 246, 0.35); }
  33% { color: rgba(16, 185, 129, 0.35); }
  50% { color: rgba(245, 158, 11, 0.35); }
  66% { color: rgba(244, 63, 94, 0.30); }
  83% { color: rgba(59, 130, 246, 0.35); }
}

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

/* Feature illustration pastel gradients (Antigravity-style rainbow) */
.feature-gradient-1 {
  background: linear-gradient(135deg, #e0e7ff 0%, #dbeafe 25%, #ede9fe 50%, #e0e7ff 75%, #dbeafe 100%);
}
.feature-gradient-2 {
  background: linear-gradient(135deg, #d1fae5 0%, #ccfbf1 25%, #dbeafe 50%, #d1fae5 75%, #fef3c7 100%);
}
.feature-gradient-3 {
  background: linear-gradient(135deg, #ede9fe 0%, #fce7f3 25%, #fef3c7 50%, #d1fae5 75%, #dbeafe 100%);
}
.feature-gradient-4 {
  background: linear-gradient(135deg, #fef3c7 0%, #fed7aa 20%, #fce7f3 45%, #ede9fe 70%, #fef3c7 100%);
}
.feature-gradient-5 {
  background: linear-gradient(135deg, #fce7f3 0%, #fecdd3 25%, #ede9fe 50%, #dbeafe 75%, #fce7f3 100%);
}

/* Dark mode feature gradients — deep saturated versions */
:root.dark .feature-gradient-1 {
  background: linear-gradient(135deg, #1e1b4b 0%, #172554 25%, #2e1065 50%, #1e1b4b 75%, #172554 100%);
}
:root.dark .feature-gradient-2 {
  background: linear-gradient(135deg, #064e3b 0%, #134e4a 25%, #172554 50%, #064e3b 75%, #451a03 100%);
}
:root.dark .feature-gradient-3 {
  background: linear-gradient(135deg, #2e1065 0%, #831843 25%, #451a03 50%, #064e3b 75%, #172554 100%);
}
:root.dark .feature-gradient-4 {
  background: linear-gradient(135deg, #451a03 0%, #7c2d12 20%, #831843 45%, #2e1065 70%, #451a03 100%);
}
:root.dark .feature-gradient-5 {
  background: linear-gradient(135deg, #831843 0%, #881337 25%, #2e1065 50%, #172554 75%, #831843 100%);
}

/* Bento grid gradients — light */
.bento-gradient-banner {
  background: linear-gradient(135deg, #ede9fe 0%, #e0e7ff 30%, #fce7f3 60%, #ede9fe 100%);
}
.bento-gradient-time {
  background: linear-gradient(135deg, #dbeafe 0%, #e0e7ff 35%, #ccfbf1 70%, #dbeafe 100%);
}
.bento-gradient-auto {
  background: linear-gradient(135deg, #fef3c7 0%, #fed7aa 30%, #fce7f3 60%, #d1fae5 100%);
}
.bento-gradient-briefs {
  background: linear-gradient(135deg, #ffedd5 0%, #fed7aa 30%, #fef3c7 60%, #ffedd5 100%);
}
.bento-gradient-roles {
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 30%, #e0e7ff 60%, #f1f5f9 100%);
}

/* Bento grid gradients — dark */
:root.dark .bento-gradient-banner {
  background: linear-gradient(135deg, #2e1065 0%, #1e1b4b 30%, #831843 60%, #2e1065 100%);
}
:root.dark .bento-gradient-time {
  background: linear-gradient(135deg, #172554 0%, #1e1b4b 35%, #134e4a 70%, #172554 100%);
}
:root.dark .bento-gradient-auto {
  background: linear-gradient(135deg, #451a03 0%, #7c2d12 30%, #831843 60%, #064e3b 100%);
}
:root.dark .bento-gradient-briefs {
  background: linear-gradient(135deg, #7c2d12 0%, #451a03 30%, #451a03 60%, #7c2d12 100%);
}
:root.dark .bento-gradient-roles {
  background: linear-gradient(135deg, #1e293b 0%, #334155 30%, #1e1b4b 60%, #1e293b 100%);
}

/* Mobile horizontal scroll for persona carousel */
@media (max-width: 767px) {
  .flex.gap-5 {
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    transform: none !important;
  }
  .flex.gap-5::-webkit-scrollbar {
    display: none;
  }
  .flex.gap-5 > * {
    scroll-snap-align: start;
  }
}
</style>
