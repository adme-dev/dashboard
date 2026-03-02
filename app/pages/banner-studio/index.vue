<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e] overflow-x-hidden">
    <MarketingNav active="features" />

    <!-- 1. Hero Section — dark with scrolling ad tile grid -->
    <section class="relative bg-[#0a0b0e] pt-[52px]">
      <!-- Scrolling angled ad tile grid background -->
      <div class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <!-- Ambient glow orbs -->
        <div class="absolute top-1/3 left-1/4 w-[600px] h-[600px] rounded-full bg-rose-500/[0.07] blur-[140px]" />
        <div class="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-fuchsia-500/[0.05] blur-[120px]" />
        <div class="absolute top-[15%] right-[10%] w-[350px] h-[350px] rounded-full bg-violet-500/[0.04] blur-[120px]" />

        <!-- Angled tile grid container -->
        <div class="absolute inset-0 flex items-center justify-center" style="top: -5%;">
          <div ref="tileGridRef" class="tile-grid-wrapper tile-grid-fadein" style="transform: rotate(-12deg) scale(1.8);">
            <div
              v-for="(row, ri) in tileRows"
              :key="ri"
              :ref="el => setTileRowRef(el as HTMLElement, ri)"
              class="flex gap-1 mb-1"
              :style="{ marginLeft: row.offset + 'px' }"
            >
              <!-- Double full tile set for seamless infinite loop -->
              <div
                v-for="(tile, ti) in [...row.tiles, ...row.tiles]"
                :key="`${ri}-${ti}`"
                class="tile-card flex-shrink-0 rounded-lg overflow-hidden border border-white/[0.06]"
                :style="{ width: tile.w + 'px', height: tile.h + 'px' }"
              >
                <div class="w-full h-full flex flex-col items-center justify-center p-3 text-center relative" :class="tile.bg">
                  <!-- Background image with gradient overlay -->
                  <template v-if="tile.bgImage">
                    <img :src="tile.bgImage" alt="" class="absolute inset-0 w-full h-full object-cover">
                    <div class="absolute inset-0 bg-black/40" />
                  </template>
                  <div v-if="tile.type === 'ad'" class="flex flex-col items-center gap-1.5 relative z-10">
                    <div class="text-[7px] font-bold text-white/50 uppercase tracking-widest">{{ tile.tag }}</div>
                    <div class="text-[13px] font-bold text-white leading-tight tracking-tight whitespace-pre-line" :class="tile.bgImage ? 'drop-shadow-md' : ''">{{ tile.headline }}</div>
                    <div class="px-3 py-1 mt-0.5 rounded-full text-[8px] font-semibold" :class="tile.ctaBg">{{ tile.cta }}</div>
                  </div>
                  <div v-else-if="tile.type === 'image'" class="w-full h-full rounded-lg overflow-hidden relative z-10">
                    <div class="w-full h-full" :class="tile.bg" />
                  </div>
                  <div v-else class="flex flex-col items-center gap-1 relative z-10">
                    <div class="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
                      <UIcon :name="tile.icon!" class="w-3.5 h-3.5 text-white/60" />
                    </div>
                    <div class="text-[9px] text-white/40 font-medium">{{ tile.headline }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Vignette overlays — light enough to see tiles, strong enough for text -->
        <div class="absolute inset-0 bg-gradient-to-b from-[#0a0b0e] via-[#0a0b0e]/10 to-[#0a0b0e]" />
        <div class="absolute inset-0 bg-radial-gradient" />
      </div>

      <div class="relative max-w-[1200px] mx-auto px-6 pt-28 pb-24 md:pt-40 md:pb-36 text-center">
        <!-- Badge pill -->
        <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.06] border border-white/[0.08] mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
          <span class="text-[13px] text-white/70 font-medium">Banner Studio</span>
        </div>

        <h1 class="text-[clamp(36px,6.5vw,72px)] font-[450] text-white leading-[1.08] tracking-[-0.03em] mb-6 max-w-[900px] mx-auto">
          Design, animate, and<br class="hidden sm:block">publish ads at scale
        </h1>

        <p class="text-lg md:text-xl text-white/50 max-w-[600px] mx-auto mb-12 leading-relaxed">
          A complete HTML5 ad creation studio built into your agency platform. From concept to live ad tag in minutes — no external tools needed.
        </p>

        <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
          <NuxtLink
            to="/auth/login"
            class="inline-flex items-center gap-2.5 px-7 py-3.5 bg-white text-[#121317] text-[17px] font-medium rounded-full hover:bg-white/90 transition-colors"
          >
            Start Creating
            <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
          </NuxtLink>
          <button
            class="inline-flex items-center gap-2 px-6 py-3.5 bg-white/[0.06] text-white/80 text-[17px] font-medium rounded-full hover:bg-white/[0.1] transition-colors border border-white/[0.08]"
            @click="scrollToCapabilities"
          >
            See features
          </button>
        </div>
      </div>
    </section>

    <!-- 2. Editor Preview — simulated UI mockup -->
    <section class="py-16 md:py-24 -mt-8 md:-mt-16 relative z-10">
      <div class="max-w-[1100px] mx-auto px-6">
        <div class="rounded-2xl border border-[#121317]/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#121317] shadow-2xl overflow-hidden">
          <!-- Window chrome -->
          <div class="flex items-center gap-2 px-4 py-3 bg-[#fafafa] dark:bg-[#0a0b0e] border-b border-[#121317]/[0.06] dark:border-white/[0.06]">
            <div class="flex gap-1.5">
              <div class="w-3 h-3 rounded-full bg-red-400/80" />
              <div class="w-3 h-3 rounded-full bg-amber-400/80" />
              <div class="w-3 h-3 rounded-full bg-emerald-400/80" />
            </div>
            <div class="flex-1 flex justify-center">
              <div class="px-4 py-1 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06] text-[11px] text-[#45474D] dark:text-white/50">
                Banner Studio — Summer Campaign 2026
              </div>
            </div>
          </div>
          <!-- Editor layout mockup -->
          <div class="flex h-[340px] md:h-[420px]">
            <!-- Left sidebar — layers panel -->
            <div class="hidden md:flex flex-col w-[200px] border-r border-[#121317]/[0.06] dark:border-white/[0.06] bg-[#fafafa] dark:bg-[#0a0b0e]/50 p-3 gap-1.5">
              <div class="text-[10px] font-semibold text-[#45474D]/60 dark:text-white/40 uppercase tracking-wider mb-1">Layers</div>
              <div v-for="layer in mockLayers" :key="layer.name" class="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px]" :class="layer.active ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'text-[#45474D] dark:text-white/60 hover:bg-[#121317]/[0.03] dark:hover:bg-white/[0.04]'">
                <UIcon :name="layer.icon" class="w-3.5 h-3.5 flex-shrink-0" />
                <span class="truncate">{{ layer.name }}</span>
              </div>
            </div>
            <!-- Canvas area -->
            <div class="flex-1 flex items-center justify-center bg-[#e8e8e8] dark:bg-[#1a1b1f] relative overflow-hidden">
              <!-- Grid pattern -->
              <div class="absolute inset-0 opacity-[0.15]" style="background-image: radial-gradient(circle, #999 0.5px, transparent 0.5px); background-size: 16px 16px;" />
              <!-- Simulated banner -->
              <div class="relative w-[300px] h-[250px] rounded-lg bg-gradient-to-br from-rose-500 via-fuchsia-500 to-violet-600 shadow-xl flex flex-col items-center justify-center p-6 text-center">
                <div class="text-[10px] font-semibold text-white/60 uppercase tracking-wider mb-2">Summer Sale</div>
                <div class="text-[28px] font-bold text-white leading-tight tracking-tight mb-3">50% Off<br>Everything</div>
                <div class="px-5 py-2 bg-white rounded-full text-[12px] font-semibold text-[#121317]">Shop Now</div>
                <!-- Selection handles -->
                <div class="absolute -top-1 -left-1 w-2.5 h-2.5 border-2 border-rose-300 bg-white rounded-sm" />
                <div class="absolute -top-1 -right-1 w-2.5 h-2.5 border-2 border-rose-300 bg-white rounded-sm" />
                <div class="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-2 border-rose-300 bg-white rounded-sm" />
                <div class="absolute -bottom-1 -right-1 w-2.5 h-2.5 border-2 border-rose-300 bg-white rounded-sm" />
              </div>
            </div>
            <!-- Right sidebar — inspector -->
            <div class="hidden lg:flex flex-col w-[220px] border-l border-[#121317]/[0.06] dark:border-white/[0.06] bg-[#fafafa] dark:bg-[#0a0b0e]/50 p-3 gap-3">
              <div class="text-[10px] font-semibold text-[#45474D]/60 dark:text-white/40 uppercase tracking-wider">Properties</div>
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] text-[#45474D] dark:text-white/60">X</span>
                  <div class="w-16 h-6 rounded bg-[#121317]/[0.04] dark:bg-white/[0.06] flex items-center justify-center text-[11px] text-[#45474D] dark:text-white/60">120</div>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-[11px] text-[#45474D] dark:text-white/60">Y</span>
                  <div class="w-16 h-6 rounded bg-[#121317]/[0.04] dark:bg-white/[0.06] flex items-center justify-center text-[11px] text-[#45474D] dark:text-white/60">80</div>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-[11px] text-[#45474D] dark:text-white/60">W</span>
                  <div class="w-16 h-6 rounded bg-[#121317]/[0.04] dark:bg-white/[0.06] flex items-center justify-center text-[11px] text-[#45474D] dark:text-white/60">300</div>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-[11px] text-[#45474D] dark:text-white/60">H</span>
                  <div class="w-16 h-6 rounded bg-[#121317]/[0.04] dark:bg-white/[0.06] flex items-center justify-center text-[11px] text-[#45474D] dark:text-white/60">250</div>
                </div>
              </div>
              <div class="border-t border-[#121317]/[0.06] dark:border-white/[0.06] pt-3">
                <div class="text-[10px] font-semibold text-[#45474D]/60 dark:text-white/40 uppercase tracking-wider mb-2">Animation</div>
                <div class="flex gap-1.5">
                  <div class="px-2 py-1 rounded bg-rose-500/10 text-[10px] text-rose-600 font-medium">Fade In</div>
                  <div class="px-2 py-1 rounded bg-[#121317]/[0.04] dark:bg-white/[0.06] text-[10px] text-[#45474D] dark:text-white/50">0.5s</div>
                </div>
              </div>
              <div class="border-t border-[#121317]/[0.06] dark:border-white/[0.06] pt-3">
                <div class="text-[10px] font-semibold text-[#45474D]/60 dark:text-white/40 uppercase tracking-wider mb-2">Font</div>
                <div class="text-[11px] text-[#45474D] dark:text-white/60">Inter — Bold</div>
                <div class="text-[11px] text-[#45474D]/60 dark:text-white/40 mt-1">28px / Auto</div>
              </div>
            </div>
          </div>
          <!-- Timeline bar at bottom -->
          <div class="h-12 border-t border-[#121317]/[0.06] dark:border-white/[0.06] bg-[#fafafa] dark:bg-[#0a0b0e]/50 flex items-center px-4 gap-3">
            <div class="w-6 h-6 rounded-full bg-rose-500/10 flex items-center justify-center">
              <UIcon name="i-lucide-play" class="w-3 h-3 text-rose-500" />
            </div>
            <div class="text-[10px] text-[#45474D]/60 dark:text-white/40 font-mono">0:00</div>
            <div class="flex-1 h-1.5 rounded-full bg-[#121317]/[0.06] dark:bg-white/[0.06] overflow-hidden">
              <div class="h-full rounded-full bg-gradient-to-r from-rose-400 to-fuchsia-500" style="width: 35%" />
            </div>
            <div class="text-[10px] text-[#45474D]/60 dark:text-white/40 font-mono">0:05</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 3. Capability Cards -->
    <section id="capabilities" class="py-20 md:py-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-16">
          <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.12] tracking-[-0.02em] mb-4">
            Everything you need to create ads
          </h2>
          <p class="text-[#45474D] dark:text-white/60 text-lg max-w-[560px] mx-auto leading-relaxed">
            Design, animate, data-bind, and publish — all from within your existing agency platform. No file exports, no separate tools.
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

    <!-- 4. Feature Showcase — alternating left/right -->
    <section class="py-20 md:py-32 bg-[#fafafa] dark:bg-[#121317]">
      <div class="max-w-[1200px] mx-auto px-6 flex flex-col gap-24 md:gap-32">

        <!-- Visual Editor — rose accent -->
        <div class="flex flex-col gap-8 md:flex-row md:items-center">
          <div class="flex-1 flex flex-col justify-center">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 mb-5 self-start">
              <div class="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span class="text-[12px] text-rose-700 dark:text-rose-300 font-medium">Visual Editor</span>
            </div>
            <h2 class="text-[clamp(26px,3.5vw,38px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Pixel-perfect design control
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[480px] mb-6">
              A full layer-based editor with text, images, buttons, shapes, and video backgrounds. Work across multiple ad sizes simultaneously with smart resize.
            </p>
            <ul class="flex flex-col gap-3">
              <li v-for="item in editorFeatures" :key="item" class="flex items-center gap-3 text-[15px] text-[#45474D] dark:text-white/60">
                <div class="w-5 h-5 rounded-full bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-rose-600" />
                </div>
                {{ item }}
              </li>
            </ul>
          </div>
          <div class="flex-1">
            <div class="w-full rounded-3xl bg-gradient-to-br from-rose-50 via-pink-50 to-fuchsia-100/50 dark:from-rose-950/30 dark:via-pink-950/20 dark:to-fuchsia-900/20 overflow-hidden flex items-center justify-center px-6 py-10 md:px-10 md:py-14">
              <div class="w-full rounded-2xl bg-white/80 dark:bg-white/[0.06] backdrop-blur-sm shadow-sm overflow-hidden flex flex-col">
                <div class="flex items-center gap-2.5 px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06]">
                  <div class="w-2 h-2 rounded-full bg-rose-400" />
                  <span class="text-[11px] font-medium text-[#121317]/70 dark:text-white/70">Multi-Format Editor</span>
                </div>
                <div class="grid grid-cols-3 gap-2 p-3">
                  <div class="aspect-square rounded-xl bg-gradient-to-br from-rose-200/60 to-pink-100/40 flex flex-col items-center justify-center gap-1">
                    <span class="text-[9px] font-bold text-rose-600">300x250</span>
                    <span class="text-[7px] text-rose-500/60">MPU</span>
                  </div>
                  <div class="aspect-[1/2] rounded-xl bg-gradient-to-br from-fuchsia-200/60 to-purple-100/40 flex flex-col items-center justify-center gap-1 row-span-2">
                    <span class="text-[9px] font-bold text-fuchsia-600">160x600</span>
                    <span class="text-[7px] text-fuchsia-500/60">Skyscraper</span>
                  </div>
                  <div class="aspect-[2/1] rounded-xl bg-gradient-to-br from-violet-200/60 to-indigo-100/40 flex flex-col items-center justify-center gap-1">
                    <span class="text-[9px] font-bold text-violet-600">728x90</span>
                    <span class="text-[7px] text-violet-500/60">Leaderboard</span>
                  </div>
                  <div class="aspect-square rounded-xl bg-gradient-to-br from-orange-200/60 to-amber-100/40 flex flex-col items-center justify-center gap-1">
                    <span class="text-[9px] font-bold text-orange-600">1080x1080</span>
                    <span class="text-[7px] text-orange-500/60">Social</span>
                  </div>
                  <div class="aspect-square rounded-xl bg-gradient-to-br from-blue-200/60 to-cyan-100/40 flex flex-col items-center justify-center gap-1">
                    <span class="text-[9px] font-bold text-blue-600">970x250</span>
                    <span class="text-[7px] text-blue-500/60">Billboard</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Animation & Timeline — violet accent -->
        <div class="flex flex-col gap-8 md:flex-row-reverse md:items-center">
          <div class="flex-1 flex flex-col justify-center">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 mb-5 self-start">
              <div class="w-1.5 h-1.5 rounded-full bg-violet-500" />
              <span class="text-[12px] text-violet-700 dark:text-violet-300 font-medium">Animation Studio</span>
            </div>
            <h2 class="text-[clamp(26px,3.5vw,38px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Timeline-driven animation
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[480px] mb-6">
              GSAP-powered animations with a visual timeline editor. Keyframe any property, add motion paths, and preview in real-time. Export to HTML5, GIF, or MP4.
            </p>
            <ul class="flex flex-col gap-3">
              <li v-for="item in animationFeatures" :key="item" class="flex items-center gap-3 text-[15px] text-[#45474D] dark:text-white/60">
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
                  <span class="text-[11px] font-medium text-[#121317]/70 dark:text-white/70">Timeline Editor</span>
                </div>
                <div class="flex flex-col gap-0 p-3">
                  <!-- Timeline rows -->
                  <div v-for="track in timelineTracks" :key="track.label" class="flex items-center gap-2 py-1.5">
                    <div class="w-16 text-[10px] text-[#45474D]/60 dark:text-white/40 truncate">{{ track.label }}</div>
                    <div class="flex-1 h-5 rounded bg-[#121317]/[0.03] dark:bg-white/[0.04] relative overflow-hidden">
                      <div
                        class="absolute top-0.5 bottom-0.5 rounded"
                        :class="track.barColor"
                        :style="{ left: track.start + '%', width: track.width + '%' }"
                      />
                      <!-- Keyframe diamonds -->
                      <div
                        v-for="kf in track.keyframes"
                        :key="kf"
                        class="absolute top-1/2 -translate-y-1/2 w-2 h-2 rotate-45 border border-white"
                        :class="track.diamondColor"
                        :style="{ left: kf + '%' }"
                      />
                    </div>
                  </div>
                  <!-- Playhead -->
                  <div class="flex items-center gap-2 pt-2 mt-1 border-t border-black/[0.04] dark:border-white/[0.06]">
                    <div class="w-16" />
                    <div class="flex-1 relative h-3">
                      <div class="absolute top-0 bottom-0 w-0.5 bg-rose-500 rounded-full" style="left: 35%" />
                      <div class="absolute flex items-center gap-1 -top-0.5" style="left: calc(35% + 6px)">
                        <span class="text-[8px] text-rose-500 font-mono">1.2s</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Brand Kits & Templates — amber accent -->
        <div class="flex flex-col gap-8 md:flex-row md:items-center">
          <div class="flex-1 flex flex-col justify-center">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 mb-5 self-start">
              <div class="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span class="text-[12px] text-amber-700 dark:text-amber-300 font-medium">Brand System</span>
            </div>
            <h2 class="text-[clamp(26px,3.5vw,38px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
              On-brand, every time
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[480px] mb-6">
              Store brand kits with colours, fonts, and logos. Apply them to any project with one click. Save successful designs as reusable templates for your whole team.
            </p>
            <ul class="flex flex-col gap-3">
              <li v-for="item in brandFeatures" :key="item" class="flex items-center gap-3 text-[15px] text-[#45474D] dark:text-white/60">
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
                  <span class="text-[11px] font-medium text-[#121317]/70 dark:text-white/70">Brand Kits</span>
                </div>
                <div class="flex flex-col gap-3 p-3">
                  <div v-for="brand in brandKits" :key="brand.name" class="rounded-xl border border-black/[0.05] dark:border-white/[0.06] px-3 py-2.5 flex items-center gap-3">
                    <div class="flex gap-1 flex-shrink-0">
                      <div v-for="c in brand.colors" :key="c" class="w-5 h-5 rounded-full" :style="{ backgroundColor: c }" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[11px] font-medium text-[#121317] dark:text-white">{{ brand.name }}</div>
                      <div class="text-[9px] text-[#45474D]/50 dark:text-white/30">{{ brand.font }}</div>
                    </div>
                    <div class="px-2 py-0.5 rounded-full text-[8px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 flex-shrink-0">
                      {{ brand.count }} templates
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Export & Publishing — emerald accent -->
        <div class="flex flex-col gap-8 md:flex-row-reverse md:items-center">
          <div class="flex-1 flex flex-col justify-center">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 mb-5 self-start">
              <div class="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span class="text-[12px] text-emerald-700 dark:text-emerald-300 font-medium">Publish & Export</span>
            </div>
            <h2 class="text-[clamp(26px,3.5vw,38px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
              From editor to live in seconds
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[480px] mb-6">
              Export as PNG, GIF, or MP4 for social. Publish as HTML5 ad tags with stable CDN URLs, impression tracking, and click-through wrapping. AMPHTML ready.
            </p>
            <ul class="flex flex-col gap-3">
              <li v-for="item in publishFeatures" :key="item" class="flex items-center gap-3 text-[15px] text-[#45474D] dark:text-white/60">
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
                  <span class="text-[11px] font-medium text-[#121317]/70 dark:text-white/70">Export Formats</span>
                </div>
                <div class="grid grid-cols-2 gap-2 p-3">
                  <div v-for="fmt in exportFormats" :key="fmt.label" class="rounded-xl border border-black/[0.05] dark:border-white/[0.06] px-3 py-3 flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" :class="fmt.bg">
                      <UIcon :name="fmt.icon" class="w-4 h-4" :class="fmt.color" />
                    </div>
                    <div class="min-w-0">
                      <div class="text-[11px] font-medium text-[#121317] dark:text-white">{{ fmt.label }}</div>
                      <div class="text-[8px] text-[#45474D]/50 dark:text-white/30">{{ fmt.sub }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 5. Stats Section -->
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

    <!-- 6. Creative Showcase — Swissted-style animated ad posters -->
    <section ref="showcaseRef" class="py-20 md:py-32 bg-[#0a0b0e] overflow-hidden">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-16">
          <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-white leading-[1.12] tracking-[-0.02em] mb-4">
            Bring bold ideas to life
          </h2>
          <p class="text-white/50 text-lg max-w-[560px] mx-auto leading-relaxed">
            Create striking animated ads with bold typography and eye-catching motion. Click any poster to replay.
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          <div
            v-for="(poster, pi) in posters"
            :key="poster.word"
            :ref="el => setPosterRef(el as HTMLElement, pi)"
            class="poster-card relative rounded-2xl overflow-hidden cursor-pointer select-none group"
            :style="{ backgroundColor: poster.bg, aspectRatio: '3 / 4' }"
            @click="replayPoster(pi)"
          >
            <!-- Large letterforms -->
            <div class="absolute inset-0 flex items-end pointer-events-none">
              <div class="poster-letters relative w-full" :style="{ height: '70%' }">
                <span
                  v-for="(letter, li) in poster.letters"
                  :key="li"
                  class="poster-letter absolute font-black leading-[0.85] select-none"
                  :style="{
                    fontSize: letter.size + 'px',
                    left: letter.x + '%',
                    top: letter.y + '%',
                    color: letter.color,
                  }"
                >{{ letter.char }}</span>
              </div>
            </div>

            <!-- Text details — right-aligned -->
            <div class="absolute top-0 right-0 p-6 md:p-8 text-right z-10 pointer-events-none">
              <div class="poster-text-line text-[11px] md:text-[13px] font-semibold tracking-wide mb-6" :style="{ color: poster.textColor }">
                {{ poster.line1 }}
              </div>
              <div class="poster-text-line text-[10px] md:text-[12px] font-medium mb-1" :style="{ color: poster.textColor }">
                {{ poster.line2 }}
              </div>
              <div class="poster-text-line text-[10px] md:text-[12px] font-medium mb-6" :style="{ color: poster.textColor }">
                {{ poster.line3 }}
              </div>
              <div class="poster-text-line text-[10px] md:text-[12px] font-medium" :style="{ color: poster.textColor }">
                {{ poster.line4 }}
              </div>
            </div>

            <!-- Bottom detail text -->
            <div class="absolute bottom-0 right-0 p-6 md:p-8 text-right z-10 pointer-events-none">
              <div class="poster-text-line text-[9px] md:text-[11px] font-medium" :style="{ color: poster.textColor }">
                {{ poster.bottom1 }}
              </div>
              <div class="poster-text-line text-[9px] md:text-[11px] font-medium" :style="{ color: poster.textColor }">
                {{ poster.bottom2 }}
              </div>
            </div>

            <!-- Replay hint on hover -->
            <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100 z-20 pointer-events-none">
              <div class="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <UIcon name="i-lucide-rotate-ccw" class="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 7. Dynamic Ads CTA Banner  -->
    <section class="py-20 md:py-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="rounded-3xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-8 md:p-12 flex flex-col md:flex-row items-center gap-8 md:gap-12 bg-gradient-to-r from-fuchsia-50/50 via-white to-rose-50/50 dark:from-fuchsia-950/20 dark:via-[#121317] dark:to-rose-950/20">
          <div class="flex-1">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-fuchsia-500/10 mb-5">
              <div class="w-1.5 h-1.5 rounded-full bg-fuchsia-500" />
              <span class="text-[12px] text-fuchsia-700 dark:text-fuchsia-300 font-medium">Dynamic Creative</span>
            </div>
            <h2 class="text-[clamp(24px,3vw,34px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Scale with data-driven ads
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base leading-relaxed mb-6 max-w-[440px]">
              Upload a CSV, bind columns to layer properties, and generate hundreds of personalised ad variants automatically. Perfect for product feeds, localised campaigns, and A/B testing.
            </p>
            <NuxtLink
              to="/banner-studio/dynamic-ads"
              class="inline-flex items-center gap-2 text-[15px] font-medium text-fuchsia-600 dark:text-fuchsia-400 hover:text-fuchsia-700 dark:hover:text-fuchsia-300 transition-colors group"
            >
              Learn about Dynamic Ads
              <UIcon name="i-lucide-arrow-right" class="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </NuxtLink>
          </div>
          <div class="flex-shrink-0 grid grid-cols-3 gap-2">
            <div v-for="n in 6" :key="n" class="w-20 h-16 rounded-lg bg-gradient-to-br flex items-center justify-center" :class="dcoCardColors[n - 1]">
              <span class="text-[8px] font-bold text-white/80">Variant {{ n }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 8. Dark CTA Section -->
    <section class="py-10 md:py-16">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="relative rounded-[2rem] bg-[#0a0b0e] overflow-hidden py-24 md:py-36">
          <div class="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
            <div class="absolute top-1/3 left-1/3 w-[500px] h-[500px] rounded-full bg-rose-500/[0.06] blur-[120px]" />
            <div class="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full bg-fuchsia-500/[0.04] blur-[100px]" />
          </div>

          <div class="relative text-center px-6">
            <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mx-auto mb-8">
              <span class="text-white text-xs font-semibold tracking-tight">XF</span>
            </div>
            <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-5">
              Ready to build better ads?
            </h2>
            <p class="text-white/40 text-lg max-w-[480px] mx-auto mb-10 leading-relaxed">
              Banner Studio is included in every XeroFlow plan. Start creating professional HTML5 ads today.
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

    <!-- 9. Footer -->
    <footer class="pt-20 pb-10">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="flex flex-col md:flex-row gap-12 md:gap-0 md:justify-between mb-20">
          <div>
            <h3 class="text-[clamp(22px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">
              Experience XeroFlow
            </h3>
          </div>
          <div class="flex gap-20 md:gap-28">
            <div class="flex flex-col gap-3.5 text-[15px]">
              <NuxtLink to="/auth/login" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Sign In</NuxtLink>
              <NuxtLink to="/features" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Features</NuxtLink>
              <NuxtLink to="/banner-studio" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Banner Studio</NuxtLink>
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
          <div class="text-[clamp(80px,18vw,220px)] font-[450] text-[#121317] dark:text-white leading-[0.9] tracking-[-0.04em] select-none">
            XeroFlow
          </div>
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
  title: 'Banner Studio — XeroFlow',
  description: 'Design, animate, and publish HTML5 display ads at scale. A complete ad creation studio built into your agency platform.',
  ogTitle: 'Banner Studio — XeroFlow',
  ogDescription: 'Design, animate, and publish HTML5 display ads at scale. A complete ad creation studio built into your agency platform.',
})

function scrollToCapabilities() {
  document.getElementById('capabilities')?.scrollIntoView({ behavior: 'smooth' })
}

// ---- Scrolling tile grid ----

interface TileData {
  w: number
  h: number
  bg: string
  type: 'ad' | 'image' | 'icon'
  tag?: string
  headline?: string
  cta?: string
  ctaBg?: string
  icon?: string
  bgImage?: string
}

interface TileRow {
  tiles: TileData[]
  offset: number
  direction: 1 | -1
  speed: number
}

const adTiles: TileData[] = [
  { w: 170, h: 120, bg: 'bg-gradient-to-br from-rose-500 to-pink-600', type: 'ad', tag: 'Summer', headline: '50% Off\nEverything', cta: 'Shop Now', ctaBg: 'bg-white text-rose-600', bgImage: 'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=340&h=240&fit=crop' },
  { w: 145, h: 120, bg: 'bg-gradient-to-br from-violet-500 to-indigo-600', type: 'ad', tag: 'New Drop', headline: 'Fresh\nArrivals', cta: 'Explore', ctaBg: 'bg-white text-violet-600' },
  { w: 155, h: 120, bg: 'bg-gradient-to-br from-amber-500 to-orange-600', type: 'ad', tag: 'Limited', headline: 'Flash\nDeal', cta: 'Get It', ctaBg: 'bg-white text-amber-600', bgImage: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=310&h=240&fit=crop' },
  { w: 160, h: 120, bg: 'bg-gradient-to-br from-cyan-500 to-blue-600', type: 'ad', tag: 'Tech', headline: 'Next-Gen\nGadgets', cta: 'Learn More', ctaBg: 'bg-white text-cyan-600', bgImage: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=320&h=240&fit=crop' },
  { w: 140, h: 120, bg: 'bg-gradient-to-br from-emerald-500 to-teal-600', type: 'ad', tag: 'Eco', headline: 'Go\nGreen', cta: 'Discover', ctaBg: 'bg-white text-emerald-600', bgImage: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=280&h=240&fit=crop' },
  { w: 155, h: 120, bg: 'bg-gradient-to-br from-fuchsia-500 to-purple-600', type: 'ad', tag: 'Sale', headline: 'Weekend\nSpecial', cta: 'Save Now', ctaBg: 'bg-white text-fuchsia-600' },
  { w: 150, h: 120, bg: 'bg-gradient-to-br from-blue-500 to-indigo-600', type: 'ad', tag: 'Travel', headline: 'Book Your\nGetaway', cta: 'Fly Now', ctaBg: 'bg-white text-blue-600', bgImage: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&h=240&fit=crop' },
  { w: 170, h: 120, bg: 'bg-gradient-to-br from-rose-400 to-fuchsia-500', type: 'ad', tag: 'Beauty', headline: 'Glow\nUp', cta: 'Try Free', ctaBg: 'bg-white text-rose-600', bgImage: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=340&h=240&fit=crop' },
  { w: 120, h: 120, bg: 'bg-gradient-to-br from-slate-700 to-slate-900', type: 'icon', headline: '300x250', icon: 'i-lucide-maximize-2' },
  { w: 120, h: 120, bg: 'bg-gradient-to-br from-zinc-700 to-zinc-900', type: 'icon', headline: '728x90', icon: 'i-lucide-monitor' },
  { w: 160, h: 120, bg: 'bg-gradient-to-br from-orange-500 to-red-600', type: 'ad', tag: 'Food', headline: 'Order\nNow', cta: 'Menu', ctaBg: 'bg-white text-orange-600', bgImage: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=320&h=240&fit=crop' },
  { w: 145, h: 120, bg: 'bg-gradient-to-br from-lime-500 to-green-600', type: 'ad', tag: 'Fitness', headline: 'Train\nHarder', cta: 'Join Free', ctaBg: 'bg-white text-lime-700', bgImage: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=290&h=240&fit=crop' },
  { w: 120, h: 120, bg: 'bg-gradient-to-br from-neutral-700 to-neutral-900', type: 'icon', headline: '160x600', icon: 'i-lucide-smartphone' },
  { w: 155, h: 120, bg: 'bg-gradient-to-br from-sky-500 to-cyan-600', type: 'ad', tag: 'SaaS', headline: 'Start\nFree', cta: 'Sign Up', ctaBg: 'bg-white text-sky-600' },
  { w: 165, h: 120, bg: 'bg-gradient-to-br from-pink-500 to-rose-600', type: 'ad', tag: 'Fashion', headline: 'New\nSeason', cta: 'Shop', ctaBg: 'bg-white text-pink-600', bgImage: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=330&h=240&fit=crop' },
  { w: 140, h: 120, bg: 'bg-gradient-to-br from-yellow-500 to-amber-600', type: 'ad', tag: 'Finance', headline: 'Save\nMore', cta: 'Open Acct', ctaBg: 'bg-white text-yellow-700' },
  { w: 120, h: 120, bg: 'bg-gradient-to-br from-stone-700 to-stone-900', type: 'icon', headline: '1080x1080', icon: 'i-lucide-square' },
  { w: 155, h: 120, bg: 'bg-gradient-to-br from-teal-500 to-emerald-600', type: 'ad', tag: 'Health', headline: 'Feel\nGreat', cta: 'Learn More', ctaBg: 'bg-white text-teal-600', bgImage: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=310&h=240&fit=crop' },
  { w: 145, h: 120, bg: 'bg-gradient-to-br from-indigo-500 to-violet-600', type: 'ad', tag: 'Gaming', headline: 'Play\nNow', cta: 'Download', ctaBg: 'bg-white text-indigo-600' },
  { w: 170, h: 120, bg: 'bg-gradient-to-br from-red-500 to-rose-600', type: 'ad', tag: 'Auto', headline: 'Drive\nDreams', cta: 'Configure', ctaBg: 'bg-white text-red-600', bgImage: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=340&h=240&fit=crop' },
  { w: 150, h: 120, bg: 'bg-gradient-to-br from-purple-500 to-pink-600', type: 'ad', tag: 'Music', headline: 'Live\nNow', cta: 'Listen', ctaBg: 'bg-white text-purple-600', bgImage: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=300&h=240&fit=crop' },
  { w: 155, h: 120, bg: 'bg-gradient-to-br from-sky-400 to-blue-500', type: 'ad', tag: 'Pets', headline: 'Happy\nPets', cta: 'Shop', ctaBg: 'bg-white text-sky-600', bgImage: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=310&h=240&fit=crop' },
  { w: 140, h: 120, bg: 'bg-gradient-to-br from-orange-400 to-amber-500', type: 'ad', tag: 'Home', headline: 'Cosy\nVibes', cta: 'Browse', ctaBg: 'bg-white text-orange-600' },
  { w: 160, h: 120, bg: 'bg-gradient-to-br from-emerald-400 to-green-600', type: 'ad', tag: 'Organic', headline: 'Farm\nFresh', cta: 'Order', ctaBg: 'bg-white text-emerald-700', bgImage: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=320&h=240&fit=crop' },
]

// Shuffle helper — deterministic per-row offset
function shuffleTiles(tiles: TileData[], offset: number): TileData[] {
  return [...tiles.slice(offset % tiles.length), ...tiles.slice(0, offset % tiles.length)]
}

// 9 rows — fills every corner when rotated -12deg at 1.8x scale
const tileRows: TileRow[] = [
  { tiles: shuffleTiles(adTiles, 0), offset: -40, direction: -1, speed: 40 },
  { tiles: shuffleTiles(adTiles, 7), offset: -100, direction: 1, speed: 35 },
  { tiles: shuffleTiles(adTiles, 14), offset: -20, direction: -1, speed: 44 },
  { tiles: shuffleTiles(adTiles, 4), offset: -80, direction: 1, speed: 37 },
  { tiles: shuffleTiles(adTiles, 19), offset: -60, direction: -1, speed: 41 },
  { tiles: shuffleTiles(adTiles, 11), offset: -120, direction: 1, speed: 38 },
  { tiles: shuffleTiles(adTiles, 2), offset: -30, direction: -1, speed: 42 },
  { tiles: shuffleTiles(adTiles, 16), offset: -90, direction: 1, speed: 36 },
  { tiles: shuffleTiles(adTiles, 9), offset: -70, direction: -1, speed: 39 },
]

const tileGridRef = ref<HTMLElement>()
const tileRowRefs: HTMLElement[] = []

function setTileRowRef(el: HTMLElement | null, index: number) {
  if (el) tileRowRefs[index] = el
}

let gsapInstance: typeof import('gsap').default | null = null

onMounted(async () => {
  // Dynamically import GSAP on client only — prevents SSR breakage on hard refresh
  const { default: gsap } = await import('gsap')
  gsapInstance = gsap

  await nextTick()
  if (!tileGridRef.value) return

  // Animate each row as an infinite horizontal scroll
  tileRowRefs.forEach((rowEl, i) => {
    const row = tileRows[i]
    if (!rowEl) return

    // Calculate the width of one tile set (first half of doubled row)
    const children = Array.from(rowEl.children) as HTMLElement[]
    const half = children.length / 2
    let setWidth = 0
    for (let j = 0; j < half; j++) {
      setWidth += children[j].offsetWidth + 4 // gap-1 = 4px
    }

    // Start right-moving rows offset so the seam is hidden
    if (row.direction === 1) {
      gsap.set(rowEl, { x: -setWidth })
    }

    gsap.to(rowEl, {
      x: row.direction === -1 ? -setWidth : 0,
      duration: row.speed,
      ease: 'none',
      repeat: -1,
    })
  })

  // Set up poster intersection observer
  await nextTick()
  posterObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const index = posterRefs.indexOf(entry.target as HTMLElement)
        if (index >= 0 && !posterTimelines[index]) {
          posterTimelines[index] = animatePoster(posterRefs[index], posters[index], gsap)
        }
        posterObserver?.unobserve(entry.target)
      }
    })
  }, { threshold: 0.3 })

  posterRefs.forEach((el) => {
    if (el) posterObserver!.observe(el)
  })
})

let posterObserver: IntersectionObserver | null = null

onUnmounted(() => {
  // Kill all GSAP tweens on the row elements to prevent leaks
  if (gsapInstance) {
    tileRowRefs.forEach((el) => { if (el) gsapInstance!.killTweensOf(el) })
    posterRefs.forEach((el) => { if (el) gsapInstance!.killTweensOf(el) })
  }
  posterObserver?.disconnect()
})

// Editor mockup layers
const mockLayers = [
  { name: 'Background', icon: 'i-lucide-image', active: false },
  { name: 'Headline Text', icon: 'i-lucide-type', active: true },
  { name: 'Subline', icon: 'i-lucide-type', active: false },
  { name: 'CTA Button', icon: 'i-lucide-square', active: false },
  { name: 'Logo', icon: 'i-lucide-image', active: false },
  { name: 'Overlay Shape', icon: 'i-lucide-circle', active: false },
]

// Capability cards
const capabilityCards = [
  {
    title: 'Visual Design',
    description: 'Layer-based editor with text, images, buttons, shapes, and video backgrounds. Google Fonts, custom font upload, grid and snap guides.',
    icon: 'i-lucide-palette',
    iconBg: 'bg-rose-500/10',
    iconColor: 'text-rose-600'
  },
  {
    title: 'Animation & Motion',
    description: 'GSAP-powered timeline with keyframes, easing curves, motion paths, and exit animations. Preview and scrub in real-time.',
    icon: 'i-lucide-clapperboard',
    iconBg: 'bg-violet-500/10',
    iconColor: 'text-violet-600'
  },
  {
    title: 'Publish Anywhere',
    description: 'Export as PNG, GIF, or MP4. Publish live HTML5 ad tags with stable CDN URLs, impression tracking, and click-through wrapping.',
    icon: 'i-lucide-globe',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-600'
  }
]

// Feature lists
const editorFeatures = [
  'Multi-format editing (300x250, 728x90, 160x600, etc.)',
  'Smart resize with AI-assisted reflow',
  'Google Fonts + custom font upload (WOFF2/TTF)',
  'Grid overlay, snap guides, and alignment tools'
]

const animationFeatures = [
  'Visual timeline with draggable keyframes',
  'Motion path curves with artboard overlay',
  'Entry + exit animation presets',
  'Export to HTML5, GIF (5-15 fps), or MP4'
]

const brandFeatures = [
  'Brand kits with colours, fonts, and logos',
  'One-click brand application with undo',
  'Save designs as reusable templates',
  'Template gallery with search and categories'
]

const publishFeatures = [
  'Stable CDN URLs that never change on re-publish',
  'Iframe, JavaScript, and AMPHTML ad tags',
  'Impression and click tracking pixels',
  'File size meter with IAB compliance warnings'
]

// Timeline tracks for illustration
const timelineTracks = [
  { label: 'Background', start: 0, width: 100, barColor: 'bg-rose-400/30', diamondColor: 'bg-rose-400', keyframes: [0, 100] },
  { label: 'Headline', start: 10, width: 65, barColor: 'bg-violet-400/30', diamondColor: 'bg-violet-400', keyframes: [10, 40, 75] },
  { label: 'Subline', start: 25, width: 50, barColor: 'bg-blue-400/30', diamondColor: 'bg-blue-400', keyframes: [25, 75] },
  { label: 'CTA Button', start: 40, width: 45, barColor: 'bg-emerald-400/30', diamondColor: 'bg-emerald-400', keyframes: [40, 85] },
  { label: 'Logo', start: 5, width: 90, barColor: 'bg-amber-400/30', diamondColor: 'bg-amber-400', keyframes: [5, 95] },
]

// Brand kits
const brandKits = [
  { name: 'Acme Corp', font: 'Inter — Bold / Regular', colors: ['#f43f5e', '#121317', '#ffffff'], count: 12 },
  { name: 'TechStart', font: 'Space Grotesk — Medium', colors: ['#6366f1', '#0ea5e9', '#f8fafc'], count: 8 },
  { name: 'GreenLeaf', font: 'DM Sans — Semibold', colors: ['#10b981', '#065f46', '#ecfdf5'], count: 5 },
]

// Export formats
const exportFormats = [
  { label: 'PNG / JPG', sub: 'Static at 1x or 2x', icon: 'i-lucide-image', bg: 'bg-blue-50 dark:bg-blue-500/10', color: 'text-blue-600' },
  { label: 'GIF', sub: 'Animated 5-15 fps', icon: 'i-lucide-film', bg: 'bg-violet-50 dark:bg-violet-500/10', color: 'text-violet-600' },
  { label: 'MP4 Video', sub: 'FFmpeg HD export', icon: 'i-lucide-video', bg: 'bg-rose-50 dark:bg-rose-500/10', color: 'text-rose-600' },
  { label: 'HTML5 Ad Tag', sub: 'iframe / JS / AMPHTML', icon: 'i-lucide-code', bg: 'bg-emerald-50 dark:bg-emerald-500/10', color: 'text-emerald-600' },
]

// Stats
const stats = [
  { value: '6+', label: 'Layer Types', description: 'Text, image, button, shape, video, audio' },
  { value: '20+', label: 'Animation Presets', description: 'Entry, exit, and motion path animations' },
  { value: '120+', label: 'Google Fonts', description: 'Curated selection with custom upload' },
  { value: '4', label: 'Export Formats', description: 'PNG, GIF, MP4, and HTML5 ad tags' },
]

// ---- Swissted-style animated posters ----

interface PosterLetter {
  char: string
  size: number
  x: number // percentage
  y: number // percentage
  color: string
  fromX?: number // slide from X offset in px
  fromY?: number // slide from Y offset in px
}

interface PosterData {
  word: string
  bg: string
  textColor: string
  letters: PosterLetter[]
  line1: string
  line2: string
  line3: string
  line4: string
  bottom1: string
  bottom2: string
}

const posters: PosterData[] = [
  {
    word: 'BIG',
    bg: '#ef4444',
    textColor: 'rgba(255,255,255,0.85)',
    letters: [
      { char: 'B', size: 320, x: -8, y: 0, color: '#fecdd3', fromX: -600, fromY: 0 },
      { char: 'I', size: 280, x: 32, y: 12, color: '#18181b', fromX: 0, fromY: -600 },
      { char: 'G', size: 340, x: 48, y: -5, color: '#fecdd3', fromX: 600, fromY: 0 },
    ],
    line1: 'xeroflow studio presents\nthe big sale',
    line2: 'friday / march 15, 2026',
    line3: 'all categories 50% off',
    line4: 'at your favourite stores\nnationwide',
    bottom1: 'with brands you love',
    bottom2: 'nike, adidas & more / free shipping',
  },
  {
    word: 'NEW',
    bg: '#6366f1',
    textColor: 'rgba(255,255,255,0.85)',
    letters: [
      { char: 'N', size: 300, x: -5, y: 5, color: '#c7d2fe', fromX: 0, fromY: 600 },
      { char: 'E', size: 260, x: 30, y: 18, color: '#18181b', fromX: -600, fromY: 0 },
      { char: 'W', size: 340, x: 42, y: -8, color: '#c7d2fe', fromX: 600, fromY: 0 },
    ],
    line1: 'acme technologies presents\nthe new collection',
    line2: 'launching / april 1, 2026',
    line3: 'from 9:00 am AEST',
    line4: 'exclusive online\npre-order available',
    bottom1: 'limited first edition',
    bottom2: 'early access & special pricing',
  },
  {
    word: 'GO',
    bg: '#10b981',
    textColor: 'rgba(255,255,255,0.85)',
    letters: [
      { char: 'G', size: 380, x: -10, y: -5, color: '#a7f3d0', fromX: -600, fromY: 0 },
      { char: 'O', size: 360, x: 38, y: 0, color: '#18181b', fromX: 0, fromY: -600 },
    ],
    line1: 'greenleaf co. presents\ngo green campaign',
    line2: 'earth day / april 22, 2026',
    line3: 'join the movement',
    line4: 'sustainable living\nstarts here',
    bottom1: 'plant a tree with every order',
    bottom2: '100% carbon neutral / certified',
  },
]

const showcaseRef = ref<HTMLElement>()
const posterRefs: HTMLElement[] = []
let posterTimelines: any[] = []

function setPosterRef(el: HTMLElement | null, index: number) {
  if (el) posterRefs[index] = el
}

function animatePoster(posterEl: HTMLElement, poster: PosterData, gsap: any) {
  const tl = gsap.timeline({
    defaults: { duration: 1.8, ease: 'power4.out' },
  })

  // Animate letters from their offscreen positions
  const letters = posterEl.querySelectorAll('.poster-letter')
  letters.forEach((el: Element, i: number) => {
    const letterData = poster.letters[i]
    if (!letterData) return
    gsap.set(el, {
      x: letterData.fromX || 0,
      y: letterData.fromY || 0,
      opacity: 0,
    })
    tl.to(el, {
      x: 0,
      y: 0,
      opacity: 1,
      duration: 2,
      ease: 'power4.out',
    }, i * 0.15)
  })

  // Stagger text lines in
  const textLines = posterEl.querySelectorAll('.poster-text-line')
  textLines.forEach((el: Element) => {
    gsap.set(el, { opacity: 0, y: 20 })
  })
  tl.to(textLines, {
    opacity: 1,
    y: 0,
    stagger: 0.1,
    duration: 1,
    ease: 'power4.out',
  }, 0.6)

  return tl
}

function replayPoster(index: number) {
  if (!gsapInstance || !posterRefs[index]) return
  if (posterTimelines[index]) {
    posterTimelines[index].restart()
  }
}

// DCO card gradient colors
const dcoCardColors = [
  'from-rose-400 to-pink-500',
  'from-fuchsia-400 to-purple-500',
  'from-violet-400 to-indigo-500',
  'from-blue-400 to-cyan-500',
  'from-emerald-400 to-teal-500',
  'from-amber-400 to-orange-500',
]
</script>

<style scoped>
.bg-radial-gradient {
  background: radial-gradient(ellipse at center, transparent 45%, #0a0b0e 85%);
}

.tile-grid-wrapper {
  width: 400%;
  margin-left: -150%;
}

.tile-card {
  transition: opacity 0.3s ease;
}

/* CSS fade-in so grid appears immediately — no waiting for GSAP import */
@keyframes tileGridFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.tile-grid-fadein {
  animation: tileGridFadeIn 1.2s ease-out forwards;
}

/* Swissted-style poster cards */
.poster-card {
  transition: transform 0.3s ease;
}
.poster-card:hover {
  transform: scale(1.02);
}

.poster-letter {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  line-height: 0.85;
  will-change: transform, opacity;
}

.poster-letters {
  overflow: hidden;
}

.poster-text-line {
  white-space: pre-line;
  will-change: transform, opacity;
}
</style>
