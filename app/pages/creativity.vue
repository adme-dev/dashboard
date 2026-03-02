<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e] overflow-x-hidden">
    <MarketingNav />

    <!-- 1. Hero Section — dark dramatic opening -->
    <section class="relative bg-[#0a0b0e] pt-[52px]">
      <MarketingHeroBackground theme="creativity" />

      <div class="relative max-w-[1200px] mx-auto px-6 pt-28 pb-24 md:pt-40 md:pb-36 text-center">
        <!-- Badge pill -->
        <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.06] border border-white/[0.08] mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          <span class="text-[13px] text-white/70 font-medium">Creativity meets operations</span>
        </div>

        <h1 class="text-[clamp(36px,6.5vw,72px)] font-[450] text-white leading-[1.08] tracking-[-0.03em] mb-6 max-w-[850px] mx-auto">
          Unlock your agency's<br class="hidden sm:block">creative potential
        </h1>

        <p class="text-lg md:text-xl text-white/50 max-w-[580px] mx-auto mb-12 leading-relaxed">
          XeroFlow eliminates operational friction so your team can focus on what they do best — creative work that moves the needle.
        </p>

        <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
          <NuxtLink
            to="/auth/login"
            class="inline-flex items-center gap-2.5 px-7 py-3.5 bg-white text-[#121317] text-[17px] font-medium rounded-full hover:bg-white/90 transition-colors"
          >
            Get Started Free
            <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
          </NuxtLink>
          <button
            class="inline-flex items-center gap-2 px-6 py-3.5 bg-white/[0.06] text-white/80 text-[17px] font-medium rounded-full hover:bg-white/[0.1] transition-colors border border-white/[0.08]"
            @click="scrollToCapabilities"
          >
            See how it works
          </button>
        </div>
      </div>
    </section>

    <!-- 2. Capability Cards — 3 columns -->
    <section id="capabilities" class="py-20 md:py-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-16">
          <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.12] tracking-[-0.02em] mb-4">
            Three pillars of creative enablement
          </h2>
          <p class="text-[#45474D] dark:text-white/60 text-lg max-w-[520px] mx-auto leading-relaxed">
            Every feature in XeroFlow is designed to remove friction and give your creative team more room to breathe.
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          <div
            v-for="card in capabilityCards"
            :key="card.title"
            class="rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-8 hover:border-[#121317]/[0.12] dark:hover:border-white/[0.12] hover:shadow-lg transition-all duration-300 group"
          >
            <div
              class="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110"
              :class="card.iconBg"
            >
              <UIcon :name="card.icon" class="w-6 h-6" :class="card.iconColor" />
            </div>
            <h3 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-3">
              {{ card.title }}
            </h3>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              {{ card.description }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- 3. Feature Showcase — alternating left/right -->
    <section class="py-20 md:py-32 bg-[#fafafa] dark:bg-[#121317]">
      <div class="max-w-[1200px] mx-auto px-6 flex flex-col gap-24 md:gap-32">
        <!-- Creative Review Workflows — emerald accent -->
        <div class="flex flex-col gap-8 md:flex-row md:items-center">
          <div class="flex-1 flex flex-col justify-center">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 mb-5 self-start">
              <div class="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span class="text-[12px] text-emerald-700 font-medium">Creative Review</span>
            </div>
            <h2 class="text-[clamp(26px,3.5vw,38px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Creative review workflows
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[480px] mb-6">
              Client portal approvals, gallery view for visual assets, and version tracking. Your clients see exactly what they need to — and nothing they don't.
            </p>
            <ul class="flex flex-col gap-3">
              <li v-for="item in reviewFeatures" :key="item" class="flex items-center gap-3 text-[15px] text-[#45474D] dark:text-white/60">
                <div class="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-emerald-600" />
                </div>
                {{ item }}
              </li>
            </ul>
          </div>
          <div class="flex-1">
            <div class="w-full rounded-3xl bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100/50 dark:from-emerald-950/30 dark:via-teal-950/20 dark:to-emerald-900/20 overflow-hidden flex items-center justify-center px-6 py-10 md:px-10 md:py-14">
              <div class="w-full rounded-2xl bg-white/80 dark:bg-white/[0.06] backdrop-blur-sm shadow-sm overflow-hidden flex flex-col">
                <div class="flex items-center gap-2.5 px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06]">
                  <div class="w-2 h-2 rounded-full bg-emerald-400" />
                  <span class="text-[11px] font-medium text-[#121317]/70 dark:text-white/70">Gallery — Campaign Assets</span>
                </div>
                <div class="grid grid-cols-3 gap-2 p-3">
                  <div class="aspect-square rounded-xl bg-gradient-to-br from-emerald-200/60 to-teal-100/40 flex items-center justify-center">
                    <UIcon name="i-lucide-image" class="w-5 h-5 text-emerald-500/60" />
                  </div>
                  <div class="aspect-square rounded-xl bg-gradient-to-br from-blue-200/60 to-indigo-100/40 flex items-center justify-center">
                    <UIcon name="i-lucide-image" class="w-5 h-5 text-blue-500/60" />
                  </div>
                  <div class="aspect-square rounded-xl bg-gradient-to-br from-violet-200/60 to-purple-100/40 flex items-center justify-center">
                    <UIcon name="i-lucide-play-circle" class="w-5 h-5 text-violet-500/60" />
                  </div>
                  <div class="col-span-2 aspect-[2/1] rounded-xl bg-gradient-to-br from-rose-200/60 to-pink-100/40 flex items-center justify-center">
                    <UIcon name="i-lucide-file-image" class="w-5 h-5 text-rose-500/60" />
                  </div>
                  <div class="aspect-square rounded-xl bg-gradient-to-br from-amber-200/60 to-orange-100/40 flex items-center justify-center">
                    <UIcon name="i-lucide-image" class="w-5 h-5 text-amber-500/60" />
                  </div>
                </div>
                <div class="px-3 pb-3">
                  <div class="flex items-center gap-2 rounded-xl bg-emerald-50/60 px-3 py-2">
                    <UIcon name="i-lucide-check-circle" class="w-4 h-4 text-emerald-500" />
                    <span class="text-[10px] text-emerald-700 font-medium">3 approved</span>
                    <span class="text-[10px] text-[#45474D]/50 mx-1">&middot;</span>
                    <span class="text-[10px] text-amber-600 font-medium">2 pending review</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Intelligent Automation — violet accent -->
        <div class="flex flex-col gap-8 md:flex-row-reverse md:items-center">
          <div class="flex-1 flex flex-col justify-center">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 mb-5 self-start">
              <div class="w-1.5 h-1.5 rounded-full bg-violet-500" />
              <span class="text-[12px] text-violet-700 font-medium">Intelligent Automation</span>
            </div>
            <h2 class="text-[clamp(26px,3.5vw,38px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Automate the busywork
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[480px] mb-6">
              Automate status updates, deadline reminders, and assignment routing so creatives don't context-switch. The system handles the logistics — your team handles the craft.
            </p>
            <ul class="flex flex-col gap-3">
              <li v-for="item in automationFeatures" :key="item" class="flex items-center gap-3 text-[15px] text-[#45474D] dark:text-white/60">
                <div class="w-5 h-5 rounded-full bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-violet-600" />
                </div>
                {{ item }}
              </li>
            </ul>
          </div>
          <div class="flex-1">
            <div class="w-full rounded-3xl bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-100/50 dark:from-violet-950/30 dark:via-purple-950/20 dark:to-indigo-900/20 overflow-hidden flex items-center justify-center px-6 py-10 md:px-10 md:py-14">
              <div class="w-full rounded-2xl bg-white/80 dark:bg-white/[0.06] backdrop-blur-sm shadow-sm overflow-hidden flex flex-col">
                <div class="flex items-center gap-2.5 px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06]">
                  <div class="w-2 h-2 rounded-full bg-violet-400" />
                  <span class="text-[11px] font-medium text-[#121317]/70 dark:text-white/70">Automation Recipes</span>
                </div>
                <div class="flex flex-col gap-2.5 p-3">
                  <div v-for="recipe in automationRecipes" :key="recipe.label" class="rounded-xl border border-black/[0.05] dark:border-white/[0.06] px-3 py-2.5 flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" :class="recipe.bg">
                      <UIcon :name="recipe.icon" class="w-4 h-4" :class="recipe.color" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[10px] font-medium text-[#121317] dark:text-white">{{ recipe.label }}</div>
                      <div class="text-[8px] text-[#45474D]/50">{{ recipe.sub }}</div>
                    </div>
                    <div class="px-2 py-0.5 rounded-full text-[8px] font-medium flex-shrink-0" :class="recipe.statusClass">
                      {{ recipe.status }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Financial Clarity — amber accent -->
        <div class="flex flex-col gap-8 md:flex-row md:items-center">
          <div class="flex-1 flex flex-col justify-center">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 mb-5 self-start">
              <div class="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span class="text-[12px] text-amber-700 font-medium">Financial Clarity</span>
            </div>
            <h2 class="text-[clamp(26px,3.5vw,38px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
              No more surprise overruns
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[480px] mb-6">
              Know budgets in real-time with ad spend tracking, P&amp;L dashboards, and EOM invoicing. Creative teams can push boundaries when they know exactly where the numbers stand.
            </p>
            <ul class="flex flex-col gap-3">
              <li v-for="item in financeFeatures" :key="item" class="flex items-center gap-3 text-[15px] text-[#45474D] dark:text-white/60">
                <div class="w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-amber-600" />
                </div>
                {{ item }}
              </li>
            </ul>
          </div>
          <div class="flex-1">
            <div class="w-full rounded-3xl bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-100/50 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-yellow-900/20 overflow-hidden flex items-center justify-center px-6 py-10 md:px-10 md:py-14">
              <div class="w-full rounded-2xl bg-white/80 dark:bg-white/[0.06] backdrop-blur-sm shadow-sm overflow-hidden flex flex-col">
                <div class="flex items-center gap-2.5 px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06]">
                  <div class="w-2 h-2 rounded-full bg-amber-400" />
                  <span class="text-[11px] font-medium text-[#121317]/70 dark:text-white/70">Budget Overview</span>
                  <div class="ml-auto text-[9px] text-[#45474D]/50">Feb 2026</div>
                </div>
                <div class="grid grid-cols-3 gap-2 px-3 py-3">
                  <div class="rounded-lg bg-amber-50/60 px-2.5 py-2">
                    <div class="text-[8px] text-[#45474D]/50 mb-0.5">Ad Spend</div>
                    <div class="text-[13px] font-semibold text-[#121317] dark:text-white">$18,420</div>
                    <div class="text-[8px] text-amber-600 mt-0.5">72% of budget</div>
                  </div>
                  <div class="rounded-lg bg-emerald-50/60 px-2.5 py-2">
                    <div class="text-[8px] text-[#45474D]/50 mb-0.5">Revenue</div>
                    <div class="text-[13px] font-semibold text-[#121317] dark:text-white">$84,320</div>
                    <div class="text-[8px] text-emerald-600 mt-0.5">+12.4%</div>
                  </div>
                  <div class="rounded-lg bg-violet-50/60 px-2.5 py-2">
                    <div class="text-[8px] text-[#45474D]/50 mb-0.5">Margin</div>
                    <div class="text-[13px] font-semibold text-[#121317] dark:text-white">62%</div>
                    <div class="text-[8px] text-violet-600 mt-0.5">On target</div>
                  </div>
                </div>
                <div class="px-3 pb-3">
                  <div class="w-full h-2 rounded-full bg-[#121317]/[0.04] overflow-hidden">
                    <div class="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500" style="width: 72%" />
                  </div>
                  <div class="flex justify-between mt-1.5">
                    <span class="text-[8px] text-[#45474D]/40">$0</span>
                    <span class="text-[8px] text-amber-600 font-medium">$18,420 / $25,600</span>
                    <span class="text-[8px] text-[#45474D]/40">$25.6K</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 4. Stats Section -->
    <section class="py-20 md:py-28 bg-[#f4f5f7]/60 dark:bg-white/[0.02]">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-6">
          <div v-for="stat in stats" :key="stat.value" class="text-center">
            <div class="text-[clamp(32px,5vw,48px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] leading-none mb-2">
              {{ stat.value }}
            </div>
            <div class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">{{ stat.label }}</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 leading-snug">{{ stat.description }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 5. Use Cases Grid -->
    <section class="py-20 md:py-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-16">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06] mb-6">
            <div class="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span class="text-[13px] text-[#45474D] dark:text-white/70 font-medium">Built for every role</span>
          </div>
          <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.12] tracking-[-0.02em] mb-4">
            How your team benefits
          </h2>
          <p class="text-[#45474D] dark:text-white/60 text-lg max-w-[520px] mx-auto leading-relaxed">
            From creative direction to media buying, every role gets the tools they need to do their best work.
          </p>
        </div>

        <div class="grid sm:grid-cols-2 gap-6">
          <div
            v-for="useCase in useCases"
            :key="useCase.role"
            class="rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-7 hover:border-[#121317]/[0.12] dark:hover:border-white/[0.12] hover:shadow-lg transition-all duration-300 group"
          >
            <div class="flex items-start gap-5">
              <div
                class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
                :class="useCase.iconBg"
              >
                <UIcon :name="useCase.icon" class="w-5.5 h-5.5" :class="useCase.iconColor" />
              </div>
              <div>
                <h3 class="text-[18px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">
                  {{ useCase.role }}
                </h3>
                <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
                  {{ useCase.description }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 6. Dark CTA Section -->
    <section class="py-10 md:py-16">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="relative rounded-[2rem] bg-[#0a0b0e] overflow-hidden py-24 md:py-36">
          <!-- Ambient glow -->
          <div class="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
            <div class="absolute top-1/3 left-1/3 w-[500px] h-[500px] rounded-full bg-violet-500/[0.06] blur-[120px]" />
            <div class="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full bg-emerald-500/[0.04] blur-[100px]" />
          </div>

          <div class="relative text-center px-6">
            <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mx-auto mb-8">
              <span class="text-white text-xs font-semibold tracking-tight">XF</span>
            </div>
            <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-5">
              Ready to supercharge<br class="hidden sm:block">your creative output?
            </h2>
            <p class="text-white/40 text-lg max-w-[480px] mx-auto mb-10 leading-relaxed">
              Join agencies that ship faster, collaborate better, and spend less time on operations.
            </p>
            <NuxtLink
              to="/auth/login"
              class="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#121317] text-[17.5px] font-medium rounded-full hover:bg-white/90 transition-colors"
            >
              Get Started Free
              <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

    <!-- 7. Footer -->
    <footer class="pt-20 pb-10">
      <div class="max-w-[1200px] mx-auto px-6">
        <!-- Top row: brand name + link columns -->
        <div class="flex flex-col md:flex-row gap-12 md:gap-0 md:justify-between mb-20">
          <div>
            <h3 class="text-[clamp(22px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">
              Experience XeroFlow
            </h3>
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

        <!-- Giant wordmark -->
        <div class="overflow-hidden mb-10">
          <div class="text-[clamp(80px,18vw,220px)] font-[450] text-[#121317] dark:text-white leading-[0.9] tracking-[-0.04em] select-none">
            XeroFlow
          </div>
        </div>

        <!-- Bottom bar -->
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
  title: 'Creativity — XeroFlow',
  description: 'Unlock your agency\'s creative potential. XeroFlow eliminates operational friction so your team can focus on creative work that moves the needle.',
  ogTitle: 'Creativity — XeroFlow',
  ogDescription: 'Unlock your agency\'s creative potential. XeroFlow eliminates operational friction so your team can focus on creative work that moves the needle.',
})

function scrollToCapabilities() {
  document.getElementById('capabilities')?.scrollIntoView({ behavior: 'smooth' })
}

// Section 2: Capability cards
const capabilityCards = [
  {
    title: 'Visual Workflows',
    description: 'Kanban, timeline, calendar, and gallery views let creative teams see work their way. Switch perspectives in a click — from big picture to granular detail.',
    icon: 'i-lucide-palette',
    iconBg: 'bg-violet-500/10',
    iconColor: 'text-violet-600'
  },
  {
    title: 'Real-Time Collaboration',
    description: 'Chat, threads, @mentions, and presence indicators keep feedback loops instant. No more waiting on email chains or losing context across tools.',
    icon: 'i-lucide-message-circle',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-600'
  },
  {
    title: 'AI-Powered Insights',
    description: 'Anomaly detection, proactive recommendations, and semantic search surface what matters before you even think to ask. Your AI co-pilot for operations.',
    icon: 'i-lucide-sparkles',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-600'
  }
]

// Section 3: Feature showcase lists
const reviewFeatures = [
  'Client portal with approval workflows',
  'Gallery view for visual asset review',
  'Version tracking and revision history',
  'Permission-gated access per client'
]

const automationFeatures = [
  'Trigger-action automation recipes',
  'Automatic status and assignment updates',
  'Deadline reminders and escalation',
  'Board event notifications to chat'
]

const financeFeatures = [
  'Meta & Google Ads spend tracking',
  'Xero-integrated P&L dashboards',
  'End-of-month invoice generation',
  'Budget alerts and anomaly detection'
]

// Automation recipes for the illustration
const automationRecipes = [
  {
    label: 'When status changes to "In Review"',
    sub: 'Notify client via portal',
    icon: 'i-lucide-arrow-right-circle',
    bg: 'bg-emerald-50',
    color: 'text-emerald-600',
    status: 'Active',
    statusClass: 'bg-emerald-100 text-emerald-700'
  },
  {
    label: 'When deadline is 24h away',
    sub: 'Send reminder to assignee',
    icon: 'i-lucide-clock',
    bg: 'bg-amber-50',
    color: 'text-amber-600',
    status: 'Active',
    statusClass: 'bg-emerald-100 text-emerald-700'
  },
  {
    label: 'When task is created in "Design"',
    sub: 'Auto-assign to creative lead',
    icon: 'i-lucide-user-plus',
    bg: 'bg-violet-50',
    color: 'text-violet-600',
    status: 'Active',
    statusClass: 'bg-emerald-100 text-emerald-700'
  }
]

// Section 4: Stats
const stats = [
  { value: '5', label: 'Board Views', description: 'Kanban, table, timeline, calendar, gallery' },
  { value: '20+', label: 'Column Types', description: 'Status, people, date, formula, and more' },
  { value: '8', label: 'AI Analyzers', description: 'Proactive anomaly detection and recommendations' },
  { value: '\u221E', label: 'Unlimited Clients', description: 'No per-seat limits on client portal access' }
]

// Section 5: Use cases
const useCases = [
  {
    role: 'Creative Director',
    description: 'See all projects at a glance with timeline and gallery views. Track creative output across campaigns and keep quality consistent with approval workflows.',
    icon: 'i-lucide-crown',
    iconBg: 'bg-violet-500/10',
    iconColor: 'text-violet-600'
  },
  {
    role: 'Account Manager',
    description: 'Keep clients in the loop with portal approvals and real-time notifications. Manage briefs, deliverables, and feedback from a single interface.',
    icon: 'i-lucide-users',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-600'
  },
  {
    role: 'Media Buyer',
    description: 'Track Meta and Google Ads spend with real-time budget alerts. AI anomaly detection catches overspend and performance drops before they impact ROI.',
    icon: 'i-lucide-bar-chart-3',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-600'
  },
  {
    role: 'Producer',
    description: 'Manage timelines, budgets, and resources from a single board. Time tracking, deadline automations, and EOM invoicing keep production on rails.',
    icon: 'i-lucide-clipboard-list',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-600'
  }
]
</script>
