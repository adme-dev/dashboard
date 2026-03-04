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
              <UIcon name="i-lucide-download" class="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <span class="text-[13px] text-[#45474D]/60 dark:text-white/40 font-medium">6 min read</span>
          </div>
          <h1 class="text-[clamp(32px,5vw,48px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.02em] mb-4">
            Ad Platform Export Guide
          </h1>
          <p class="text-lg text-[#45474D] dark:text-white/60 leading-relaxed">
            Export HTML5 banners from the Custom Banner Editor for any major ad platform. This guide covers platform selection, clickTag injection, validation, and downloading compliant ZIP files.
          </p>
        </div>

        <!-- Feature Grid: What You Can Do -->
        <div class="grid sm:grid-cols-3 gap-4 mb-16">
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-globe" class="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">14 Platforms</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Google Ads, DV360, TTD, Xandr, Amazon, and more — all from one modal.</p>
          </div>
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-shield-check" class="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Auto Validation</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">File size, external calls, looping, and animation limits are checked automatically.</p>
          </div>
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-file-archive" class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">ZIP Download</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Download a ready-to-upload ZIP with index.html at the root and correct clickTag.</p>
          </div>
        </div>

        <!-- Content -->
        <div class="flex flex-col gap-14">

          <!-- Section 1 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Opening the Export modal</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The Export button sits in the Custom Banner Editor toolbar, between Save and Publish. Click it to open the export modal. You'll see a grid of 14 supported ad platforms.
            </p>
            <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] divide-y divide-[#121317]/[0.06] dark:divide-white/[0.06] mb-4">
              <div class="p-4">
                <div class="flex items-center gap-2 mb-1.5">
                  <div class="w-6 h-6 rounded-full bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[12px] font-medium flex items-center justify-center">1</div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Open the editor</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed pl-8">Navigate to a custom banner instance in Banner Studio. The editor loads your template code, variables, and preview.</p>
              </div>
              <div class="p-4">
                <div class="flex items-center gap-2 mb-1.5">
                  <div class="w-6 h-6 rounded-full bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[12px] font-medium flex items-center justify-center">2</div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Click Export</span>
                </div>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed pl-8">The Export button is in the toolbar. It opens a modal with platform selection, requirements, validation results, and a download button.</p>
              </div>
            </div>
          </section>

          <!-- Section 2 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Choosing a platform</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Click any platform in the grid to select it. The requirements panel updates immediately to show the platform's constraints.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Each platform defines up to five rules:
            </p>
            <div class="space-y-3 mb-4">
              <div class="flex items-start gap-3 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
                <UIcon name="i-lucide-hard-drive" class="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-0.5">Max file size</p>
                  <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Google Ads and AdSense enforce 150KB. Most others allow 200KB. Generic/IAB has no limit.</p>
                </div>
              </div>
              <div class="flex items-start gap-3 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
                <UIcon name="i-lucide-timer" class="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-0.5">Animation time limit</p>
                  <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Most platforms cap animation at 30 seconds. The Trade Desk and Yahoo DSP limit to 15 seconds.</p>
                </div>
              </div>
              <div class="flex items-start gap-3 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
                <UIcon name="i-lucide-globe" class="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                <div>
                  <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-0.5">External calls</p>
                  <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Most platforms block external scripts and stylesheets. When disallowed, XeroFlow strips them from the exported HTML and shows a warning.</p>
                </div>
              </div>
              <div class="flex items-start gap-3 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
                <UIcon name="i-lucide-repeat" class="w-5 h-5 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
                <div>
                  <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-0.5">Looping</p>
                  <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Google Ads, AdSense, and AdRoll prohibit infinite loops. XeroFlow detects GSAP <code class="px-1 py-0.5 rounded bg-[#e8e9ec] dark:bg-white/[0.06] text-[12px]">repeat: -1</code> and CSS infinite iteration.</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Section 3 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Understanding clickTag injection</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              When you export, XeroFlow does <strong class="text-[#121317] dark:text-white">not</strong> wrap your banner in a generic click link. Instead, it injects the platform's specific clickTag script before <code class="px-1 py-0.5 rounded bg-[#f4f5f7] dark:bg-white/[0.06] text-[14px]">&lt;/body&gt;</code>.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The key differences between platforms:
            </p>
            <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] divide-y divide-[#121317]/[0.06] dark:divide-white/[0.06]">
              <div class="p-4">
                <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Google family</p>
                <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Uses <code class="px-1 py-0.5 rounded bg-[#e8e9ec] dark:bg-white/[0.06] text-[12px]">var clickTag</code> — same variable name across Google Ads, DV360, GAM, CM360, and AdSense.</p>
              </div>
              <div class="p-4">
                <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">The Trade Desk</p>
                <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Uses <code class="px-1 py-0.5 rounded bg-[#e8e9ec] dark:bg-white/[0.06] text-[12px]">var clickTAG</code> — note the uppercase TAG. Case-sensitive and will break if wrong.</p>
              </div>
              <div class="p-4">
                <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Xandr (AppNexus)</p>
                <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Requires the AppNexus HTML5 library loaded in <code class="px-1 py-0.5 rounded bg-[#e8e9ec] dark:bg-white/[0.06] text-[12px]">&lt;head&gt;</code>, then uses <code class="px-1 py-0.5 rounded bg-[#e8e9ec] dark:bg-white/[0.06] text-[12px]">APPNEXUS.getClickTag()</code>. XeroFlow injects both automatically.</p>
              </div>
              <div class="p-4">
                <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Yahoo DSP</p>
                <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Uses the AdKit library with <code class="px-1 py-0.5 rounded bg-[#e8e9ec] dark:bg-white/[0.06] text-[12px]">adkit.onReady()</code> and <code class="px-1 py-0.5 rounded bg-[#e8e9ec] dark:bg-white/[0.06] text-[12px]">adkit.clicktag()</code>. Library injected into <code class="px-1 py-0.5 rounded bg-[#e8e9ec] dark:bg-white/[0.06] text-[12px]">&lt;head&gt;</code> automatically.</p>
              </div>
            </div>
          </section>

          <!-- Section 4 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Validation and warnings</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              After clicking Download ZIP, the validation panel appears below the requirements. It shows:
            </p>
            <ul class="space-y-2 mb-4">
              <li class="flex items-start gap-2 text-[16px] text-[#45474D] dark:text-white/60">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-1 shrink-0" />
                <span>A <strong class="text-[#121317] dark:text-white">file size meter</strong> with a progress bar — green under 80%, yellow at 80-100%, red if over the limit.</span>
              </li>
              <li class="flex items-start gap-2 text-[16px] text-[#45474D] dark:text-white/60">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-1 shrink-0" />
                <span><strong class="text-[#121317] dark:text-white">Error-level warnings</strong> (red) for hard violations like exceeding the file size cap.</span>
              </li>
              <li class="flex items-start gap-2 text-[16px] text-[#45474D] dark:text-white/60">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-1 shrink-0" />
                <span><strong class="text-[#121317] dark:text-white">Advisory warnings</strong> (yellow) for things like animation time limits or detected looping.</span>
              </li>
            </ul>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              The ZIP still downloads even if there are warnings — you decide whether to address them. Errors indicate the ad server will likely reject the file.
            </p>
          </section>

          <!-- Section 5 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">What's in the ZIP</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The downloaded ZIP contains a single <code class="px-1.5 py-0.5 rounded bg-[#f4f5f7] dark:bg-white/[0.06] text-[14px]">index.html</code> file at the root. This file includes:
            </p>
            <ul class="space-y-2 mb-4">
              <li class="flex items-start gap-2 text-[16px] text-[#45474D] dark:text-white/60">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-1 shrink-0" />
                <span>The <code class="px-1 py-0.5 rounded bg-[#f4f5f7] dark:bg-white/[0.06] text-[14px]">&lt;meta name="ad.size"&gt;</code> tag with width and height.</span>
              </li>
              <li class="flex items-start gap-2 text-[16px] text-[#45474D] dark:text-white/60">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-1 shrink-0" />
                <span>All CSS and JS inlined — no external dependencies (unless required by the platform, like AppNexus or AdKit).</span>
              </li>
              <li class="flex items-start gap-2 text-[16px] text-[#45474D] dark:text-white/60">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-1 shrink-0" />
                <span>Variable substitutions already applied — the HTML is fully rendered with your configured values.</span>
              </li>
              <li class="flex items-start gap-2 text-[16px] text-[#45474D] dark:text-white/60">
                <UIcon name="i-lucide-check" class="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-1 shrink-0" />
                <span>The platform-specific clickTag script injected before <code class="px-1 py-0.5 rounded bg-[#f4f5f7] dark:bg-white/[0.06] text-[14px]">&lt;/body&gt;</code>.</span>
              </li>
            </ul>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              No impression or click tracking pixels are included — those are handled by the ad server. The ZIP filename follows the pattern <code class="px-1.5 py-0.5 rounded bg-[#f4f5f7] dark:bg-white/[0.06] text-[14px]">banner_name_300x250_google_ads.zip</code>.
            </p>
          </section>

        </div>

        <!-- Related links -->
        <div class="mt-20 pt-10 border-t border-[#121317]/[0.06] dark:border-white/[0.06]">
          <h3 class="text-[18px] font-[450] text-[#121317] dark:text-white mb-4">Related resources</h3>
          <div class="space-y-2">
            <NuxtLink to="/features/ad-platform-export" class="flex items-center gap-2 text-[15px] text-[#45474D] dark:text-white/60 hover:text-[#121317] dark:hover:text-white transition-colors">
              <UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5" />
              Ad Platform Export feature overview
            </NuxtLink>
            <NuxtLink to="/resources/bulk-ad-launch" class="flex items-center gap-2 text-[15px] text-[#45474D] dark:text-white/60 hover:text-[#121317] dark:hover:text-white transition-colors">
              <UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5" />
              Bulk Ad Launch guide
            </NuxtLink>
            <NuxtLink to="/features/bulk-ad-launch" class="flex items-center gap-2 text-[15px] text-[#45474D] dark:text-white/60 hover:text-[#121317] dark:hover:text-white transition-colors">
              <UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5" />
              Bulk Ad Launch feature overview
            </NuxtLink>
          </div>
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
              <NuxtLink to="/features" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Features</NuxtLink>
              <NuxtLink to="/pricing" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Pricing</NuxtLink>
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
  title: 'Ad Platform Export Guide — XeroFlow',
  description: 'Learn how to export HTML5 banners for Google Ads, DV360, The Trade Desk, Xandr, and 10 more platforms with automatic clickTag injection and validation.',
  ogTitle: 'Ad Platform Export Guide — XeroFlow',
  ogDescription: 'Step-by-step guide to exporting compliant HTML5 ads for 14 ad platforms.',
})
</script>
