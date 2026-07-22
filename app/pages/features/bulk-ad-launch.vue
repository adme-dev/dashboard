<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <!-- Hero — dark, full-width with gradient -->
    <section class="relative bg-[#0a0b0e] pt-[52px] overflow-hidden">
      <MarketingHeroBackground theme="feature-detail" />

      <!-- Floating gradient orbs for visual richness -->
      <div class="absolute top-32 -right-40 w-[500px] h-[500px] bg-rose-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div class="absolute bottom-0 -left-40 w-[400px] h-[400px] bg-violet-500/8 rounded-full blur-[100px] pointer-events-none" />

      <div class="relative max-w-[1200px] mx-auto px-6 pt-8">
        <!-- Breadcrumb -->
        <NuxtLink to="/features" class="inline-flex items-center gap-1.5 text-[14px] text-white/60 hover:text-white transition-colors">
          <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
          All Features
        </NuxtLink>

        <!-- Hero content — wide, two-column -->
        <div class="grid lg:grid-cols-2 gap-12 lg:gap-16 pt-16 pb-20 md:pt-24 md:pb-28 items-center">
          <!-- Left: text -->
          <div>
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-500/15">
                <UIcon name="i-lucide-palette" class="w-5 h-5 text-rose-400" />
              </div>
              <span class="text-[14px] text-white/60 font-medium">Communication & Creative</span>
            </div>
            <h1 class="text-[clamp(36px,5vw,56px)] font-[450] text-white leading-[1.08] tracking-[-0.03em] mb-6">
              Launch dozens of ads<br class="hidden md:block">in minutes, not hours
            </h1>
            <p class="text-lg md:text-xl text-white/50 leading-relaxed mb-8 max-w-[520px]">
              Select creatives from Banner Studio, configure your campaign, write ad copy, and publish to Meta Ads — all from a single page.
            </p>
            <div class="flex flex-wrap gap-3">
              <NuxtLink
                to="/contact"
                class="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#121317] text-[15px] font-medium rounded-full hover:bg-white/90 transition-colors"
              >
                Get Started
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
              </NuxtLink>
              <NuxtLink
                to="/resources/bulk-ad-launch"
                class="inline-flex items-center gap-2 px-6 py-3 bg-white/[0.08] text-white text-[15px] font-medium rounded-full hover:bg-white/[0.12] transition-colors border border-white/[0.08]"
              >
                Read the Guide
              </NuxtLink>
            </div>
          </div>

          <!-- Right: stacked ad preview mockups -->
          <div class="relative hidden lg:block">
            <div class="relative h-[420px]">
              <!-- Meta Feed card — front, slightly rotated -->
              <div class="absolute top-0 left-8 transform rotate-[-2deg] z-20 scale-[0.82] origin-top-left">
                <AdPreviewMetaFeedPreview
                  :image="sampleImage"
                  page-name="Acme Agency"
                  primary-text="Transform your digital presence with our award-winning creative team. Limited spots available."
                  headline="Book a Free Strategy Call"
                  description="acmeagency.com"
                  cta-type="LEARN_MORE"
                  link-url="https://acmeagency.com"
                />
              </div>
              <!-- Meta Story — behind, offset right, opposite rotation -->
              <div class="absolute top-6 right-0 transform rotate-[3deg] z-10 scale-[0.72] origin-top-right">
                <AdPreviewMetaStoryPreview
                  :image="sampleStoryImage"
                  page-name="Acme Agency"
                  primary-text="Limited time offer — 50% off all services"
                  cta-type="SHOP_NOW"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Stats bar -->
    <section class="border-b border-[#121317]/[0.06] dark:border-white/[0.06]">
      <div class="max-w-[1200px] mx-auto px-6 py-8">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div class="text-center">
            <div class="text-[clamp(28px,4vw,40px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">23+</div>
            <div class="text-[13px] text-[#45474D]/70 dark:text-white/40 mt-1">Ad Formats Supported</div>
          </div>
          <div class="text-center">
            <div class="text-[clamp(28px,4vw,40px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">8</div>
            <div class="text-[13px] text-[#45474D]/70 dark:text-white/40 mt-1">Platform Previews</div>
          </div>
          <div class="text-center">
            <div class="text-[clamp(28px,4vw,40px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">5x</div>
            <div class="text-[13px] text-[#45474D]/70 dark:text-white/40 mt-1">Text Variations per Ad</div>
          </div>
          <div class="text-center">
            <div class="text-[clamp(28px,4vw,40px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">1-Click</div>
            <div class="text-[13px] text-[#45474D]/70 dark:text-white/40 mt-1">Bulk Publish</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Workflow: visual step-by-step -->
    <section class="py-20 md:py-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-16">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-50 dark:bg-rose-500/10 mb-6">
            <div class="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <span class="text-[13px] text-rose-600 dark:text-rose-400 font-medium">How it works</span>
          </div>
          <h2 class="text-[clamp(28px,4vw,42px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
            From creative to live ad in four steps
          </h2>
          <p class="text-[16px] text-[#45474D] dark:text-white/50 max-w-[560px] mx-auto">
            No more switching between Ads Manager and design tools. Everything happens in one place.
          </p>
        </div>

        <!-- Steps grid -->
        <div class="grid md:grid-cols-2 gap-6">
          <!-- Step 1 -->
          <div class="rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-8 relative overflow-hidden group hover:border-rose-200 dark:hover:border-rose-500/20 transition-colors">
            <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-rose-50 dark:from-rose-500/5 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity" />
            <div class="relative">
              <div class="flex items-center gap-3 mb-5">
                <div class="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center text-[15px] font-semibold text-rose-600 dark:text-rose-400">01</div>
                <h3 class="text-[18px] font-medium text-[#121317] dark:text-white">Connect your ad account</h3>
              </div>
              <p class="text-[15px] text-[#45474D] dark:text-white/50 leading-relaxed mb-5">
                Link your Meta Ads account via OAuth. XeroFlow securely connects with the <code class="text-[13px] text-[#121317] dark:text-white/70 bg-[#f4f5f7] dark:bg-white/[0.06] px-1.5 py-0.5 rounded">ads_management</code> scope to create ads on your behalf.
              </p>
              <!-- Mini UI mockup -->
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <UIcon name="i-lucide-facebook" class="w-4.5 h-4.5 text-blue-500" />
                  </div>
                  <div class="flex-1">
                    <div class="text-[13px] font-medium text-[#121317] dark:text-white">Meta Ads — Acme Digital</div>
                    <div class="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><UIcon name="i-lucide-check-circle" class="w-3 h-3" /> Connected · ads_management</div>
                  </div>
                  <div class="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                    <UIcon name="i-lucide-check" class="w-3 h-3 text-white" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 2 -->
          <div class="rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-8 relative overflow-hidden group hover:border-blue-200 dark:hover:border-blue-500/20 transition-colors">
            <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-50 dark:from-blue-500/5 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity" />
            <div class="relative">
              <div class="flex items-center gap-3 mb-5">
                <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-[15px] font-semibold text-blue-600 dark:text-blue-400">02</div>
                <h3 class="text-[18px] font-medium text-[#121317] dark:text-white">Pick your campaign & ad set</h3>
              </div>
              <p class="text-[15px] text-[#45474D] dark:text-white/50 leading-relaxed mb-5">
                Browse existing campaigns and ad sets from your Meta account. Targeting, budget, and schedule come from the ad set — you keep full control.
              </p>
              <!-- Mini campaign tree -->
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4 space-y-2">
                <div class="flex items-center gap-2 text-[13px]">
                  <UIcon name="i-lucide-folder" class="w-3.5 h-3.5 text-[#45474D] dark:text-white/50" />
                  <span class="font-medium text-[#121317] dark:text-white">Q1 Brand Awareness</span>
                  <span class="text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded">Active</span>
                </div>
                <div class="flex items-center gap-2 text-[13px] pl-5">
                  <UIcon name="i-lucide-target" class="w-3.5 h-3.5 text-blue-500" />
                  <span class="text-[#121317] dark:text-white">US 25-44 — Interest Targeting</span>
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-blue-500 ml-auto" />
                </div>
                <div class="flex items-center gap-2 text-[13px] pl-5">
                  <UIcon name="i-lucide-target" class="w-3.5 h-3.5 text-[#45474D]/40 dark:text-white/30" />
                  <span class="text-[#45474D]/70 dark:text-white/40">AU 18-34 — Lookalike</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 3 — spans full width for the creative picker showcase -->
          <div class="md:col-span-2 rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-8 relative overflow-hidden group hover:border-violet-200 dark:hover:border-violet-500/20 transition-colors">
            <div class="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-violet-50 dark:from-violet-500/5 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity" />
            <div class="relative">
              <div class="flex items-center gap-3 mb-5">
                <div class="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center text-[15px] font-semibold text-violet-600 dark:text-violet-400">03</div>
                <h3 class="text-[18px] font-medium text-[#121317] dark:text-white">Select creatives across all projects</h3>
              </div>
              <div class="grid lg:grid-cols-[1fr_auto] gap-8 items-start">
                <div>
                  <p class="text-[15px] text-[#45474D] dark:text-white/50 leading-relaxed mb-5">
                    Browse every published banner across all Banner Studio projects. Creatives are grouped by project with thumbnails, format names, and dimensions. Select individual formats or entire projects with one click.
                  </p>
                  <!-- Mini creative picker mockup -->
                  <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4 space-y-3">
                    <div class="flex items-center gap-2">
                      <div class="flex-1 h-8 bg-white dark:bg-white/[0.06] rounded-lg px-3 flex items-center gap-2 text-[12px] text-[#45474D]/50 dark:text-white/30">
                        <UIcon name="i-lucide-search" class="w-3.5 h-3.5" /> Search by project or format...
                      </div>
                      <div class="px-2 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px] font-medium rounded">12 selected</div>
                    </div>
                    <!-- Project group -->
                    <div class="rounded-lg border border-[#121317]/[0.06] dark:border-white/[0.06] overflow-hidden">
                      <div class="flex items-center gap-2 px-3 py-2 bg-white dark:bg-white/[0.03]">
                        <UIcon name="i-lucide-chevron-down" class="w-3 h-3 text-[#45474D]/50 dark:text-white/30" />
                        <UIcon name="i-lucide-folder" class="w-3 h-3 text-[#45474D]/50 dark:text-white/30" />
                        <span class="text-[12px] font-semibold text-[#121317] dark:text-white">Summer Campaign 2026</span>
                        <span class="ml-auto text-[10px] text-[#45474D]/50 dark:text-white/30 bg-[#f4f5f7] dark:bg-white/[0.06] px-1.5 py-0.5 rounded">6</span>
                      </div>
                      <div class="divide-y divide-[#121317]/[0.04] dark:divide-white/[0.04]">
                        <div v-for="item in sampleCreatives" :key="item.name" class="flex items-center gap-2.5 px-3 py-2" :class="item.selected ? 'bg-blue-500/5' : ''">
                          <div class="w-4 h-4 rounded border flex items-center justify-center" :class="item.selected ? 'bg-blue-500 border-blue-500' : 'border-[#121317]/20 dark:border-white/20'">
                            <UIcon v-if="item.selected" name="i-lucide-check" class="w-3 h-3 text-white" />
                          </div>
                          <div class="w-8 h-8 rounded bg-gradient-to-br shrink-0" :class="item.gradient" />
                          <div class="flex-1 min-w-0">
                            <div class="text-[12px] font-medium text-[#121317] dark:text-white truncate">{{ item.name }}</div>
                            <div class="text-[10px] text-[#45474D]/50 dark:text-white/30">{{ item.size }}</div>
                          </div>
                          <UIcon v-if="item.selected" name="i-lucide-check" class="w-3 h-3 text-blue-500" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Right: preview grid of format thumbnails -->
                <div class="hidden lg:grid grid-cols-3 gap-2 w-[240px]">
                  <div v-for="fmt in sampleFormats" :key="fmt.label" class="rounded-lg overflow-hidden border border-[#121317]/[0.06] dark:border-white/[0.06]">
                    <div class="bg-gradient-to-br from-rose-400 to-violet-500" :style="{ aspectRatio: fmt.ratio }" />
                    <div class="px-1.5 py-1 text-center">
                      <div class="text-[9px] font-medium text-[#121317] dark:text-white truncate">{{ fmt.label }}</div>
                      <div class="text-[8px] text-[#45474D]/50 dark:text-white/30">{{ fmt.dims }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 4 -->
          <div class="md:col-span-2 rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-8 relative overflow-hidden group hover:border-amber-200 dark:hover:border-amber-500/20 transition-colors">
            <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-amber-50 dark:from-amber-500/5 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity" />
            <div class="relative">
              <div class="flex items-center gap-3 mb-5">
                <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-[15px] font-semibold text-amber-600 dark:text-amber-400">04</div>
                <h3 class="text-[18px] font-medium text-[#121317] dark:text-white">Write copy, review & launch</h3>
              </div>
              <div class="grid lg:grid-cols-2 gap-8">
                <div>
                  <p class="text-[15px] text-[#45474D] dark:text-white/50 leading-relaxed mb-5">
                    Write up to 5 headline and primary text variations — Meta tests combinations automatically. Save winning copy as presets for future campaigns. Hit launch and watch each creative upload in real time.
                  </p>
                  <!-- Mini progress mockup -->
                  <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4 space-y-3">
                    <div class="text-[12px] font-medium text-[#121317] dark:text-white mb-1">Publishing 12 ads...</div>
                    <div v-for="prog in sampleProgress" :key="prog.name" class="flex items-center gap-2.5">
                      <div class="w-6 h-6 rounded flex items-center justify-center shrink-0" :class="prog.done ? 'bg-emerald-100 dark:bg-emerald-500/15' : 'bg-blue-100 dark:bg-blue-500/15'">
                        <UIcon :name="prog.done ? 'i-lucide-check' : 'i-lucide-loader-2'" class="w-3.5 h-3.5" :class="prog.done ? 'text-emerald-600' : 'text-blue-500 animate-spin'" />
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="text-[11px] font-medium text-[#121317] dark:text-white truncate">{{ prog.name }}</div>
                        <div class="text-[10px]" :class="prog.done ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-500 dark:text-blue-400'">{{ prog.done ? 'Complete' : 'Uploading image...' }}</div>
                      </div>
                    </div>
                    <!-- Progress bar -->
                    <div class="h-1.5 bg-[#121317]/[0.06] dark:bg-white/[0.06] rounded-full overflow-hidden">
                      <div class="h-full bg-emerald-500 rounded-full transition-all" style="width: 67%;" />
                    </div>
                    <div class="text-[11px] text-[#45474D]/60 dark:text-white/40 text-right">8 of 12 complete</div>
                  </div>
                </div>
                <!-- Right: ad name pattern -->
                <div>
                  <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5 space-y-4">
                    <div>
                      <div class="text-[12px] font-medium text-[#45474D]/60 dark:text-white/40 mb-1.5">Ad Name Pattern</div>
                      <div class="h-9 bg-white dark:bg-white/[0.06] rounded-lg px-3 flex items-center text-[13px] font-mono text-[#121317] dark:text-white border border-[#121317]/[0.06] dark:border-white/[0.06]">
                        <span class="text-rose-500">{ProjectName}</span><span class="text-[#45474D]/40 dark:text-white/30"> - </span><span class="text-blue-500">{Format}</span><span class="text-[#45474D]/40 dark:text-white/30"> - </span><span class="text-amber-500">{Date}</span>
                      </div>
                    </div>
                    <div>
                      <div class="text-[12px] font-medium text-[#45474D]/60 dark:text-white/40 mb-1.5">Preview</div>
                      <div class="text-[13px] text-[#121317] dark:text-white bg-white dark:bg-white/[0.06] rounded-lg px-3 py-2 border border-[#121317]/[0.06] dark:border-white/[0.06]">
                        Summer Campaign - Facebook Feed - 2026-03-04
                      </div>
                    </div>
                    <div>
                      <div class="text-[12px] font-medium text-[#45474D]/60 dark:text-white/40 mb-1.5">Initial Status</div>
                      <div class="flex items-center gap-3">
                        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                          <UIcon name="i-lucide-pause" class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span class="text-[12px] font-medium text-amber-700 dark:text-amber-400">Paused</span>
                        </div>
                        <span class="text-[11px] text-[#45474D]/50 dark:text-white/30">Review in Ads Manager before activating</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Platform previews showcase -->
    <section class="py-20 md:py-32 bg-[#0a0b0e] relative overflow-hidden">
      <!-- Background grid -->
      <div class="absolute inset-0 opacity-[0.03]" style="background-image: radial-gradient(circle at 1px 1px, white 1px, transparent 0); background-size: 32px 32px;" />
      <div class="relative max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-14">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] mb-6">
            <div class="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span class="text-[13px] text-white/60 font-medium">Platform previews</span>
          </div>
          <h2 class="text-[clamp(28px,4vw,42px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-4">
            See how your ads look<br class="hidden sm:block">before you publish
          </h2>
          <p class="text-[16px] text-white/40 max-w-[520px] mx-auto">
            Preview your creatives as they'll appear across 8 platforms — Facebook, Instagram, TikTok, LinkedIn, and more.
          </p>
        </div>

        <!-- Scrollable preview row -->
        <div class="flex gap-8 justify-center items-start flex-wrap">
          <div class="transform hover:scale-[1.02] transition-transform">
            <AdPreviewMetaFeedPreview
              :image="sampleImage"
              page-name="Acme Agency"
              primary-text="Ready to scale your brand? Our team has helped 200+ businesses grow their revenue by an average of 3x."
              headline="Get a Free Strategy Session"
              description="Expert digital marketing for ambitious brands."
              cta-type="LEARN_MORE"
              link-url="https://acmeagency.com"
            />
          </div>
          <div class="transform hover:scale-[1.02] transition-transform">
            <AdPreviewMetaStoryPreview
              :image="sampleStoryImage"
              page-name="Acme Agency"
              primary-text="Swipe up to claim your free audit"
              cta-type="SIGN_UP"
            />
          </div>
          <div class="transform hover:scale-[1.02] transition-transform">
            <AdPreviewTikTokPreview
              :image="sampleStoryImage"
              page-name="Acme Agency"
              primary-text="This one strategy increased our ROAS by 4x in just 30 days"
              cta-type="LEARN_MORE"
            />
          </div>
          <div class="transform hover:scale-[1.02] transition-transform hidden xl:block">
            <AdPreviewLinkedInPreview
              :image="sampleImage"
              page-name="Acme Agency"
              primary-text="We helped 200+ B2B companies generate qualified leads at scale. Here's the playbook."
              headline="Download the B2B Growth Guide"
              description="Free 40-page guide — no email required."
              cta-type="DOWNLOAD"
              link-url="https://acmeagency.com/guide"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Features grid -->
    <section class="py-20 md:py-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-14">
          <h2 class="text-[clamp(28px,4vw,42px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
            Built for agency media buyers
          </h2>
          <p class="text-[16px] text-[#45474D] dark:text-white/50 max-w-[520px] mx-auto">
            Every feature designed to eliminate the tedious parts of ad operations.
          </p>
        </div>

        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="feat in featureCards" :key="feat.title" class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-6 hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center mb-4" :class="feat.bg">
              <UIcon :name="feat.icon" class="w-5 h-5" :class="feat.color" />
            </div>
            <h3 class="text-[16px] font-medium text-[#121317] dark:text-white mb-1.5">{{ feat.title }}</h3>
            <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ feat.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="py-10 md:py-16">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="rounded-[2rem] bg-[#0a0b0e] py-24 md:py-32 text-center px-6 relative overflow-hidden">
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-rose-500/10 rounded-full blur-[150px] pointer-events-none" />
          <div class="relative">
            <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Launch your next campaign faster
            </h2>
            <p class="text-[16px] text-white/40 max-w-[480px] mx-auto mb-10">
              Design in Banner Studio. Launch in Bulk Ad Launch. Your entire creative-to-live workflow in one platform.
            </p>
            <div class="flex justify-center gap-3">
              <NuxtLink
                to="/contact"
                class="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#121317] text-[17.5px] font-medium rounded-full hover:bg-white/90 transition-colors"
              >
                Get Started
              </NuxtLink>
              <NuxtLink
                to="/resources/bulk-ad-launch"
                class="inline-flex items-center gap-2 px-7 py-3.5 bg-white/[0.08] text-white text-[17.5px] font-medium rounded-full hover:bg-white/[0.12] transition-colors border border-white/[0.08]"
              >
                Read the Guide
              </NuxtLink>
            </div>
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

useSeoMeta({
  title: 'Bulk Ad Launch — XeroFlow',
  description: 'Launch dozens of ads across platforms in minutes. Select creatives from Banner Studio, configure campaigns, and publish to Meta Ads — all from one page.',
  ogTitle: 'Bulk Ad Launch — XeroFlow',
  ogDescription: 'Launch dozens of ads across platforms in minutes. Select creatives from Banner Studio, configure campaigns, and publish to Meta Ads — all from one page.',
})

// Sample gradient image for preview mockups
const sampleImage = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e8446a"/>
      <stop offset="50%" stop-color="#9b59b6"/>
      <stop offset="100%" stop-color="#3498db"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <text x="50%" y="38%" text-anchor="middle" fill="white" font-size="42" font-weight="700" font-family="system-ui" dy=".3em">SUMMER SALE</text>
  <text x="50%" y="52%" text-anchor="middle" fill="white" font-size="72" font-weight="900" font-family="system-ui" dy=".3em">50% OFF</text>
  <text x="50%" y="68%" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-size="20" font-family="system-ui" dy=".3em">Limited time only</text>
</svg>`)

const sampleStoryImage = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="700">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="50%" stop-color="#e8446a"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <rect width="400" height="700" fill="url(#g)"/>
  <text x="50%" y="35%" text-anchor="middle" fill="white" font-size="36" font-weight="900" font-family="system-ui" dy=".3em">FLASH</text>
  <text x="50%" y="48%" text-anchor="middle" fill="white" font-size="52" font-weight="900" font-family="system-ui" dy=".3em">SALE</text>
  <text x="50%" y="62%" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="18" font-family="system-ui" dy=".3em">Swipe up to shop</text>
</svg>`)

const sampleCreatives = [
  { name: 'Facebook Feed', size: '1200 × 628', selected: true, gradient: 'from-rose-400 to-violet-500' },
  { name: 'Instagram Square', size: '1080 × 1080', selected: true, gradient: 'from-blue-400 to-indigo-500' },
  { name: 'Instagram Story', size: '1080 × 1920', selected: true, gradient: 'from-amber-400 to-rose-500' },
  { name: 'Facebook Story', size: '1080 × 1920', selected: false, gradient: 'from-emerald-400 to-teal-500' },
]

const sampleFormats = [
  { label: 'Feed', dims: '1200×628', ratio: '1200/628' },
  { label: 'Square', dims: '1080×1080', ratio: '1/1' },
  { label: 'Story', dims: '1080×1920', ratio: '9/16' },
  { label: 'MRec', dims: '300×250', ratio: '300/250' },
  { label: 'Leader', dims: '728×90', ratio: '728/90' },
  { label: 'Portrait', dims: '1080×1350', ratio: '1080/1350' },
]

const sampleProgress = [
  { name: 'Summer Campaign - Facebook Feed', done: true },
  { name: 'Summer Campaign - Instagram Square', done: true },
  { name: 'Summer Campaign - Instagram Story', done: false },
  { name: 'Summer Campaign - Facebook Story', done: false },
]

const featureCards = [
  {
    title: 'Cross-Project Picker',
    description: 'Browse published banners from every Banner Studio project. Search, filter, and select across your entire creative library.',
    icon: 'i-lucide-layers',
    bg: 'bg-rose-50 dark:bg-rose-500/10',
    color: 'text-rose-600 dark:text-rose-400',
  },
  {
    title: 'Multi-Text Optimization',
    description: 'Write up to 5 variations of headlines, primary text, and descriptions. Meta auto-tests combinations to find winners.',
    icon: 'i-lucide-split',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    color: 'text-blue-600 dark:text-blue-400',
  },
  {
    title: 'Text Presets',
    description: 'Save winning ad copy as named presets. Apply them to future campaigns with one click — never rewrite the same copy.',
    icon: 'i-lucide-bookmark',
    bg: 'bg-violet-50 dark:bg-violet-500/10',
    color: 'text-violet-600 dark:text-violet-400',
  },
  {
    title: 'Real-Time Progress',
    description: 'Watch each creative upload to Meta in real time. Image upload, creative creation, and ad creation — tracked step by step.',
    icon: 'i-lucide-activity',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    color: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    title: 'Ad Name Templates',
    description: 'Configurable naming patterns with {ProjectName}, {Format}, and {Date} variables. Keep Ads Manager organized.',
    icon: 'i-lucide-tag',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    color: 'text-amber-600 dark:text-amber-400',
  },
  {
    title: 'Safe Defaults',
    description: 'Ads launch as PAUSED by default. Review everything in Ads Manager before spending a cent.',
    icon: 'i-lucide-shield-check',
    bg: 'bg-indigo-50 dark:bg-indigo-500/10',
    color: 'text-indigo-600 dark:text-indigo-400',
  },
]
</script>
