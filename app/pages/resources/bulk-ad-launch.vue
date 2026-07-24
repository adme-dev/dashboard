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
            <div class="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
              <UIcon name="i-lucide-rocket" class="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <span class="text-[13px] text-[#45474D]/60 dark:text-white/40 font-medium">8 min read</span>
          </div>
          <h1 class="text-[clamp(32px,5vw,48px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.02em] mb-4">
            Bulk Ad Launch Guide
          </h1>
          <p class="text-lg text-[#45474D] dark:text-white/60 leading-relaxed">
            Launch dozens of ads across platforms in minutes instead of hours. This guide walks you through the Bulk Ad Launch page — from connecting your ad account to publishing creatives from Banner Studio directly to Meta Ads.
          </p>
        </div>

        <!-- Feature Grid: What You Can Do -->
        <div class="grid sm:grid-cols-3 gap-4 mb-16">
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-layers" class="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Multi-Project</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Select creatives from any Banner Studio project in one unified view.</p>
          </div>
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-zap" class="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">One-Click Launch</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Publish all selected creatives to Meta Ads with a single button press.</p>
          </div>
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-bookmark" class="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Text Presets</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Save winning ad copy as presets and reuse across campaigns.</p>
          </div>
        </div>

        <!-- Content -->
        <div class="flex flex-col gap-14">

          <!-- Section 1 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Prerequisites</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Before using Bulk Ad Launch, you need two things in place: a connected Meta Ads account and published banners in Banner Studio.
            </p>
            <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] divide-y divide-[#121317]/[0.06] dark:divide-white/[0.06] mb-4">
              <div class="p-4">
                <div class="flex items-center gap-2 mb-1.5">
                  <div class="w-6 h-6 rounded-full bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[12px] font-medium flex items-center justify-center">1</div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Connect Meta Ads</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed pl-8">Go to Connections and add a Meta connection with the <strong class="text-[#121317] dark:text-white">ads_management</strong> OAuth scope. This grants XeroFlow permission to create ads in your account.</p>
              </div>
              <div class="p-4">
                <div class="flex items-center gap-2 mb-1.5">
                  <div class="w-6 h-6 rounded-full bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[12px] font-medium flex items-center justify-center">2</div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Publish banners</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed pl-8">In Banner Studio, design your creatives and publish them. Published banners are hosted on CDN-backed URLs and become available in the Bulk Ad Launch creative picker.</p>
              </div>
            </div>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Once both are set up, navigate to the Bulk Ad Launch page from the sidebar under the Creative section.
            </p>
          </section>

          <!-- Section 2 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Page layout overview</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The Bulk Ad Launch page is a single scrollable page with five collapsible sections. Unlike a step-by-step wizard, everything is visible at once so you can fill in sections in any order and review the full picture before launching.
            </p>
            <div class="space-y-3 mb-4">
              <div class="flex items-start gap-3 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
                <div class="w-7 h-7 rounded-lg bg-white dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 text-[13px] font-medium text-[#121317] dark:text-white">1</div>
                <div>
                  <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-0.5">Ad Account</p>
                  <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Select your Meta connection and verify the ads_management scope is granted.</p>
                </div>
              </div>
              <div class="flex items-start gap-3 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
                <div class="w-7 h-7 rounded-lg bg-white dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 text-[13px] font-medium text-[#121317] dark:text-white">2</div>
                <div>
                  <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-0.5">Campaign & Ad Set</p>
                  <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Browse existing campaigns and ad sets from your Meta account. Targeting, budget, and schedule come from the ad set.</p>
                </div>
              </div>
              <div class="flex items-start gap-3 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
                <div class="w-7 h-7 rounded-lg bg-white dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 text-[13px] font-medium text-[#121317] dark:text-white">3</div>
                <div>
                  <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-0.5">Creatives</p>
                  <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Browse all published banners grouped by project. Select individual formats or entire projects at once.</p>
                </div>
              </div>
              <div class="flex items-start gap-3 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
                <div class="w-7 h-7 rounded-lg bg-white dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 text-[13px] font-medium text-[#121317] dark:text-white">4</div>
                <div>
                  <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-0.5">Ad Copy & Settings</p>
                  <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Write primary texts, headlines, descriptions, pick a CTA, link URL, and Facebook Page.</p>
                </div>
              </div>
              <div class="flex items-start gap-3 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
                <div class="w-7 h-7 rounded-lg bg-white dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 text-[13px] font-medium text-[#121317] dark:text-white">5</div>
                <div>
                  <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-0.5">Review & Launch</p>
                  <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Preview your ad name pattern, set ads to PAUSED or ACTIVE, and hit the launch button.</p>
                </div>
              </div>
            </div>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              The left column holds your account and campaign settings, while the right column holds creatives, ad copy, and the launch section. Sections auto-expand as you complete each one.
            </p>
          </section>

          <!-- Highlight Callout -->
          <div class="rounded-2xl bg-gradient-to-br from-rose-50 to-pink-50/50 dark:from-rose-500/10 dark:to-pink-500/5 border border-rose-100/50 dark:border-rose-500/20 p-6">
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-lightbulb" class="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <p class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">Ads Launch as PAUSED by Default</p>
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">All ads are created in PAUSED status so you can review them in Meta Ads Manager before they start spending. You can toggle this to ACTIVE in the Review section if you prefer immediate launch.</p>
              </div>
            </div>
          </div>

          <!-- Section 3 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Selecting creatives across projects</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The creative picker pulls every published banner from every Banner Studio project in your agency. Banners are grouped by project name, so you can quickly find the right assets.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Use the search bar to filter by project name or ad format (e.g., "Facebook Feed" or "Instagram Story"). Each creative shows a thumbnail preview, the format name, and pixel dimensions. Click any creative to toggle its selection, or use the group-level "All" / "None" buttons to select entire projects at once.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              There is no limit on how many creatives you can select. The launch process uploads them sequentially with rate limiting between each, so Meta's API limits are respected automatically.
            </p>
          </section>

          <!-- Section 4 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Writing ad copy</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The ad copy section supports Meta's multi-text optimization. You can write up to five variations each for primary text, headlines, and descriptions. Meta will automatically test combinations and optimize toward the best performers.
            </p>
            <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5 space-y-3 mb-4">
              <div>
                <span class="text-[14px] font-medium text-[#121317] dark:text-white">Primary Text</span>
                <span class="text-[13px] text-[#45474D]/60 dark:text-white/40 ml-2">Up to 5 variations, 250 chars each</span>
              </div>
              <div>
                <span class="text-[14px] font-medium text-[#121317] dark:text-white">Headlines</span>
                <span class="text-[13px] text-[#45474D]/60 dark:text-white/40 ml-2">Up to 5 variations, 40 chars each</span>
              </div>
              <div>
                <span class="text-[14px] font-medium text-[#121317] dark:text-white">Descriptions</span>
                <span class="text-[13px] text-[#45474D]/60 dark:text-white/40 ml-2">Up to 5 variations, 30 chars each</span>
              </div>
              <div>
                <span class="text-[14px] font-medium text-[#121317] dark:text-white">Call to Action</span>
                <span class="text-[13px] text-[#45474D]/60 dark:text-white/40 ml-2">Learn More, Shop Now, Sign Up, etc.</span>
              </div>
            </div>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              You also need to select a Facebook Page (the page that will be shown as the ad's publisher) and enter a landing page URL. The URL must start with http:// or https://.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              <strong class="text-[#121317] dark:text-white">Text presets</strong> let you save a complete set of ad copy as a named preset. If your agency runs similar campaigns for multiple clients, save a preset called "Standard Lead Gen" and apply it to any future campaign with one click. Presets are stored locally in your browser.
            </p>
          </section>

          <!-- Section 5 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Review and launch</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The review section shows a summary table of every creative that will be launched, including the ad name that will be generated. Ad names follow a configurable pattern using variables:
            </p>
            <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5 space-y-2 mb-4 font-mono text-[14px]">
              <p class="text-[#121317] dark:text-white"><span class="text-rose-600">{ProjectName}</span> <span class="text-[#45474D]/60 dark:text-white/40 font-sans">-- the Banner Studio project name</span></p>
              <p class="text-[#121317] dark:text-white"><span class="text-rose-600">{Format}</span> <span class="text-[#45474D]/60 dark:text-white/40 font-sans">-- the ad format (e.g., "Facebook Feed")</span></p>
              <p class="text-[#121317] dark:text-white"><span class="text-rose-600">{Date}</span> <span class="text-[#45474D]/60 dark:text-white/40 font-sans">-- today's date (YYYY-MM-DD)</span></p>
            </div>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The default pattern is <code class="text-[14px] bg-[#f4f5f7] dark:bg-white/[0.06] px-1.5 py-0.5 rounded">{ProjectName} - {Format} - {Date}</code>, which produces names like "Summer Campaign - Instagram Story - 2026-03-04".
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              When you hit the launch button, each creative is processed in sequence: the banner image is uploaded to Meta, an ad creative is created, and then the ad itself is created in your selected ad set. A real-time progress bar shows the status of each creative as it moves through the pipeline.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              If any individual creative fails (e.g., image too large, API rate limit), it shows an error message while the remaining creatives continue processing. You can fix and retry failed creatives without affecting the ones that succeeded.
            </p>
          </section>

          <!-- Section 6 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Tips for media buyers</h2>
            <div class="space-y-4 mb-4">
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5">
                <div class="flex items-center gap-2 mb-2">
                  <UIcon name="i-lucide-target" class="w-4 h-4 text-blue-600" />
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Create ad sets first</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">Set up your targeting, budget, and schedule in Meta Ads Manager first, then use Bulk Ad Launch to push creatives into those ad sets. This way you keep full control over targeting.</p>
              </div>
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5">
                <div class="flex items-center gap-2 mb-2">
                  <UIcon name="i-lucide-test-tubes" class="w-4 h-4 text-violet-600" />
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Use multiple text variations</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">Always fill in 3-5 headline and primary text variations. Meta's algorithm will test combinations automatically, often finding winners you wouldn't have predicted.</p>
              </div>
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5">
                <div class="flex items-center gap-2 mb-2">
                  <UIcon name="i-lucide-palette" class="w-4 h-4 text-rose-600" />
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Match formats to placements</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">Select creatives that match your ad set's placements. A 1080x1080 banner works for Feed, a 1080x1920 for Stories, and 1200x628 for the right column. XeroFlow shows dimensions next to each creative.</p>
              </div>
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5">
                <div class="flex items-center gap-2 mb-2">
                  <UIcon name="i-lucide-pause" class="w-4 h-4 text-amber-600" />
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Launch as PAUSED</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">Keep the default PAUSED status and review everything in Ads Manager before activating. This gives you a final check on ad previews, audience, and budget before any money is spent.</p>
              </div>
            </div>
          </section>

          <!-- Dark CTA Card -->
          <div class="rounded-2xl bg-[#0a0b0e] p-8 md:p-12 text-center">
            <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span class="text-white text-xs font-semibold">XF</span>
            </div>
            <h3 class="text-[22px] font-[450] text-white tracking-[-0.02em] mb-3">Launch your next campaign</h3>
            <p class="text-[15px] text-white/60 mb-6 max-w-[400px] mx-auto">Design in Banner Studio, launch in Bulk Ad Launch. Your entire creative-to-live workflow in one platform.</p>
            <NuxtLink to="/contact" class="inline-flex items-center gap-2 px-6 py-2.5 bg-white text-[#121317] text-[15px] font-medium rounded-full hover:bg-white/90 transition-colors">
              Talk to us
            </NuxtLink>
          </div>

          <!-- Next Steps -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Next steps</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              Now that you know how Bulk Ad Launch works, explore these related guides.
            </p>
            <div class="flex flex-col gap-3">
              <NuxtLink
                to="/features/bulk-ad-launch"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
                    <UIcon name="i-lucide-rocket" class="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Bulk Ad Launch Feature</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Detailed feature overview and capabilities</p>
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317]/30 dark:text-white/20 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink
                to="/resources/financial-operations"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                    <UIcon name="i-lucide-calculator" class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Financial Operations</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Ad spend tracking and budget management</p>
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317]/30 dark:text-white/20 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink
                to="/resources/first-automation"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
                    <UIcon name="i-lucide-zap" class="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Your First Automation</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Automate workflows with trigger-action recipes</p>
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
  title: 'Bulk Ad Launch Guide — XeroFlow',
  description: 'Learn how to launch dozens of ads across platforms using XeroFlow\'s Bulk Ad Launch. Select creatives from Banner Studio, configure campaigns, and publish to Meta Ads in bulk.',
  ogTitle: 'Bulk Ad Launch Guide — XeroFlow',
  ogDescription: 'Learn how to launch dozens of ads across platforms using XeroFlow\'s Bulk Ad Launch. Select creatives from Banner Studio, configure campaigns, and publish to Meta Ads in bulk.',
})
</script>
