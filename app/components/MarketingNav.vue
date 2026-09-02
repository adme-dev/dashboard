<template>
  <div>
    <!-- Fixed Navigation -->
    <nav class="fixed top-0 left-0 right-0 z-50 bg-[#121317]">
      <div class="max-w-[1200px] mx-auto px-6 h-[52px] flex items-center justify-between">
        <!-- Logo -->
        <NuxtLink to="/" class="flex items-center gap-3">
          <div class="w-9 h-9 bg-white rounded-lg flex items-center justify-center">
            <span class="text-[#121317] text-sm font-bold tracking-tight">XF</span>
          </div>
          <span class="text-[18px] font-medium text-white tracking-[-0.01em]">XeroFlow</span>
        </NuxtLink>

        <!-- Desktop Nav Links -->
        <div class="hidden md:flex items-center gap-1">
          <button
            class="px-4 py-1.5 text-[14.5px] rounded-full transition-colors"
            :class="active === 'features'
              ? 'text-white font-medium bg-white/[0.1]'
              : 'text-white/70 hover:text-white'"
            @mouseenter="showDropdown('features')"
            @mouseleave="scheduleClose"
          >
            Features
          </button>
          <NuxtLink
            to="/pricing"
            class="px-4 py-1.5 text-[14.5px] rounded-full transition-colors"
            :class="active === 'pricing'
              ? 'text-white font-medium bg-white/[0.1]'
              : 'text-white/70 hover:text-white'"
            @mouseenter="openDropdown = null"
          >
            Pricing
          </NuxtLink>
          <button
            class="px-4 py-1.5 text-[14.5px] rounded-full transition-colors"
            :class="active === 'resources'
              ? 'text-white font-medium bg-white/[0.1]'
              : 'text-white/70 hover:text-white'"
            @mouseenter="showDropdown('resources')"
            @mouseleave="scheduleClose"
          >
            Resources
          </button>
          <NuxtLink
            to="/contact"
            class="px-4 py-1.5 text-[14.5px] rounded-full transition-colors"
            :class="active === 'contact'
              ? 'text-white font-medium bg-white/[0.1]'
              : 'text-white/70 hover:text-white'"
            @mouseenter="openDropdown = null"
          >
            Contact
          </NuxtLink>
        </div>

        <!-- Right Side Actions -->
        <div class="flex items-center gap-2">
          <!-- Theme Toggle -->
          <div class="hidden md:flex items-center bg-white/[0.06] rounded-full p-0.5">
            <button
              v-for="mode in themeModes"
              :key="mode.value"
              class="flex items-center justify-center w-7 h-7 rounded-full transition-all"
              :class="colorMode.preference === mode.value ? 'bg-white/[0.15] text-white' : 'text-white/40 hover:text-white/70'"
              :title="mode.label"
              @click="colorMode.preference = mode.value"
            >
              <UIcon :name="mode.icon" class="w-3.5 h-3.5" />
            </button>
          </div>

          <NuxtLink
            to="/auth/login"
            class="hidden md:inline-flex items-center gap-2 px-4 py-1.5 bg-white text-[#121317] text-[14.5px] font-medium rounded-full hover:bg-white/90 transition-colors"
          >
            Sign In
            <UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5" />
          </NuxtLink>

          <!-- Mobile Hamburger -->
          <button
            class="md:hidden flex items-center justify-center w-9 h-9 rounded-lg hover:bg-white/[0.08] transition-colors"
            aria-label="Open navigation menu"
            @click="mobileOpen = true"
          >
            <UIcon name="i-lucide-menu" class="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </nav>

    <!-- Desktop Dropdown Overlay (click outside) -->
    <Transition name="dropdown-backdrop">
      <div
        v-if="openDropdown"
        class="fixed inset-0 z-40"
        @click="openDropdown = null"
      />
    </Transition>

    <!-- Desktop Full-Width Mega Menu Panel -->
    <Transition name="dropdown">
      <div
        v-if="openDropdown"
        class="fixed top-[52px] left-0 right-0 z-40 hidden max-h-[calc(100dvh-52px)] overflow-y-auto overscroll-y-contain md:block"
        @mouseenter="cancelClose"
        @mouseleave="scheduleClose"
      >
        <!-- Full-width dark panel -->
        <div class="w-full bg-[#121317] border-b border-white/[0.06]">
          <div class="max-w-[1200px] mx-auto px-6">
            <!-- Features Mega Menu -->
            <div v-if="openDropdown === 'features'" class="py-12">
              <div class="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-12">
                <!-- Left CTA Column -->
                <div class="sticky top-12 flex h-[calc(100dvh-148px)] self-start flex-col justify-between border-r border-white/[0.06] pr-8">
                  <div>
                    <h3 class="text-[28px] font-[450] text-white leading-[1.2] tracking-[-0.02em] mb-4">
                      Explore our<br>complete platform
                    </h3>
                    <p class="text-[15px] text-white/40 leading-relaxed mb-8">
                      Everything your agency needs to manage work, finances, communication, and clients.
                    </p>
                  </div>
                  <NuxtLink
                    to="/features"
                    class="inline-flex items-center gap-2 text-[15px] font-medium text-white hover:text-white/70 transition-colors group"
                    @click="openDropdown = null"
                  >
                    Explore features
                    <UIcon name="i-lucide-arrow-right" class="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </NuxtLink>
                </div>

                <!-- Work Management Column -->
                <div>
                  <h4 class="text-[14px] font-semibold text-white/40 tracking-wide mb-5">Work Management</h4>
                  <div class="flex flex-col gap-1">
                    <NuxtLink
                      v-for="item in featuresCol1"
                      :key="item.title"
                      :to="item.to"
                      class="flex items-center gap-3.5 px-3 py-2.5 -mx-3 rounded-xl hover:bg-white/[0.04] transition-colors group"
                      @click="openDropdown = null"
                    >
                      <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" :class="item.iconBg">
                        <UIcon :name="item.icon" class="w-[18px] h-[18px]" :class="item.iconColor" />
                      </div>
                      <div>
                        <div class="text-[14px] font-medium text-white group-hover:text-white">{{ item.title }}</div>
                        <div class="text-[12px] text-white/35 leading-snug">{{ item.subtitle }}</div>
                      </div>
                    </NuxtLink>
                  </div>

                  <h4 class="text-[14px] font-semibold text-white/40 tracking-wide mb-5 mt-8">Creative</h4>
                  <div class="flex flex-col gap-1">
                    <NuxtLink
                      v-for="item in featuresCol3b"
                      :key="item.title"
                      :to="item.to"
                      class="flex items-center gap-3.5 px-3 py-2.5 -mx-3 rounded-xl hover:bg-white/[0.04] transition-colors group"
                      @click="openDropdown = null"
                    >
                      <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" :class="item.iconBg">
                        <UIcon :name="item.icon" class="w-[18px] h-[18px]" :class="item.iconColor" />
                      </div>
                      <div>
                        <div class="text-[14px] font-medium text-white group-hover:text-white">{{ item.title }}</div>
                        <div class="text-[12px] text-white/35 leading-snug">{{ item.subtitle }}</div>
                      </div>
                    </NuxtLink>
                  </div>
                </div>

                <!-- Financial & Communication Column -->
                <div>
                  <h4 class="text-[14px] font-semibold text-white/40 tracking-wide mb-5">Financial Operations</h4>
                  <div class="flex flex-col gap-1">
                    <NuxtLink
                      v-for="item in featuresCol2"
                      :key="item.title"
                      :to="item.to"
                      class="flex items-center gap-3.5 px-3 py-2.5 -mx-3 rounded-xl hover:bg-white/[0.04] transition-colors group"
                      @click="openDropdown = null"
                    >
                      <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" :class="item.iconBg">
                        <UIcon :name="item.icon" class="w-[18px] h-[18px]" :class="item.iconColor" />
                      </div>
                      <div>
                        <div class="text-[14px] font-medium text-white group-hover:text-white">{{ item.title }}</div>
                        <div class="text-[12px] text-white/35 leading-snug">{{ item.subtitle }}</div>
                      </div>
                    </NuxtLink>
                  </div>

                  <h4 class="text-[14px] font-semibold text-white/40 tracking-wide mb-5 mt-8">Communication</h4>
                  <div class="flex flex-col gap-1">
                    <NuxtLink
                      v-for="item in featuresCol3a"
                      :key="item.title"
                      :to="item.to"
                      class="flex items-center gap-3.5 px-3 py-2.5 -mx-3 rounded-xl hover:bg-white/[0.04] transition-colors group"
                      @click="openDropdown = null"
                    >
                      <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" :class="item.iconBg">
                        <UIcon :name="item.icon" class="w-[18px] h-[18px]" :class="item.iconColor" />
                      </div>
                      <div>
                        <div class="text-[14px] font-medium text-white group-hover:text-white">{{ item.title }}</div>
                        <div class="text-[12px] text-white/35 leading-snug">{{ item.subtitle }}</div>
                      </div>
                    </NuxtLink>
                  </div>

                  <h4 class="text-[14px] font-semibold text-white/40 tracking-wide mb-5 mt-8">Sales & CRM</h4>
                  <div class="flex flex-col gap-1">
                    <NuxtLink
                      v-for="item in featuresCrm"
                      :key="item.title"
                      :to="item.to"
                      class="flex items-center gap-3.5 px-3 py-2.5 -mx-3 rounded-xl hover:bg-white/[0.04] transition-colors group"
                      @click="openDropdown = null"
                    >
                      <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" :class="item.iconBg">
                        <UIcon :name="item.icon" class="w-[18px] h-[18px]" :class="item.iconColor" />
                      </div>
                      <div>
                        <div class="text-[14px] font-medium text-white group-hover:text-white">{{ item.title }}</div>
                        <div class="text-[12px] text-white/35 leading-snug">{{ item.subtitle }}</div>
                      </div>
                    </NuxtLink>
                  </div>

                </div>

                <!-- AI & Portal Column -->
                <div>
                  <h4 class="text-[14px] font-semibold text-white/40 tracking-wide mb-5">AI & Intelligence</h4>
                  <div class="flex flex-col gap-1">
                    <NuxtLink
                      v-for="item in featuresCol4"
                      :key="item.title"
                      :to="item.to"
                      class="flex items-center gap-3.5 px-3 py-2.5 -mx-3 rounded-xl hover:bg-white/[0.04] transition-colors group"
                      @click="openDropdown = null"
                    >
                      <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" :class="item.iconBg">
                        <UIcon :name="item.icon" class="w-[18px] h-[18px]" :class="item.iconColor" />
                      </div>
                      <div>
                        <div class="text-[14px] font-medium text-white group-hover:text-white">{{ item.title }}</div>
                        <div class="text-[12px] text-white/35 leading-snug">{{ item.subtitle }}</div>
                      </div>
                    </NuxtLink>
                  </div>

                  <h4 class="text-[14px] font-semibold text-white/40 tracking-wide mb-5 mt-8">
                    People & Operations
                  </h4>
                  <div class="flex flex-col gap-1">
                    <NuxtLink
                      v-for="item in featuresCol5"
                      :key="item.title"
                      :to="item.to"
                      class="flex items-center gap-3.5 px-3 py-2.5 -mx-3 rounded-xl hover:bg-white/[0.04] transition-colors group"
                      @click="openDropdown = null"
                    >
                      <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" :class="item.iconBg">
                        <UIcon :name="item.icon" class="w-[18px] h-[18px]" :class="item.iconColor" />
                      </div>
                      <div>
                        <div class="text-[14px] font-medium text-white group-hover:text-white">{{ item.title }}</div>
                        <div class="text-[12px] text-white/35 leading-snug">{{ item.subtitle }}</div>
                      </div>
                    </NuxtLink>
                  </div>
                </div>
              </div>
            </div>

            <!-- Resources Mega Menu -->
            <div v-if="openDropdown === 'resources'" class="py-12">
              <div class="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-12">
                <!-- Left CTA Column -->
                <div class="flex flex-col justify-between pr-8 border-r border-white/[0.06]">
                  <div>
                    <h3 class="text-[28px] font-[450] text-white leading-[1.2] tracking-[-0.02em] mb-4">
                      Learn XeroFlow<br>from the ground up
                    </h3>
                    <p class="text-[15px] text-white/40 leading-relaxed mb-8">
                      Guides, tutorials, and documentation to help you get the most out of the platform.
                    </p>
                  </div>
                  <div class="flex flex-col gap-3">
                    <NuxtLink
                      to="/resources/quick-start"
                      class="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-[#121317] text-[14px] font-medium rounded-full hover:bg-white/90 transition-colors"
                      @click="openDropdown = null"
                    >
                      Quick Start Guide
                      <UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5" />
                    </NuxtLink>
                    <NuxtLink
                      to="/resources"
                      class="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white/[0.06] text-white text-[14px] font-medium rounded-full hover:bg-white/[0.1] transition-colors"
                      @click="openDropdown = null"
                    >
                      Browse All Resources
                    </NuxtLink>
                  </div>
                </div>

                <!-- Getting Started Column -->
                <div>
                  <h4 class="text-[14px] font-semibold text-white/40 tracking-wide mb-5">Getting Started</h4>
                  <div class="flex flex-col gap-1">
                    <NuxtLink
                      v-for="item in resourcesCol1"
                      :key="item.title"
                      :to="item.to"
                      class="flex items-center gap-3.5 px-3 py-2.5 -mx-3 rounded-xl hover:bg-white/[0.04] transition-colors group"
                      @click="openDropdown = null"
                    >
                      <div class="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                        <UIcon :name="item.icon" class="w-[18px] h-[18px] text-white/60" />
                      </div>
                      <div>
                        <div class="text-[14px] font-medium text-white">{{ item.title }}</div>
                        <div class="text-[12px] text-white/35 leading-snug">{{ item.subtitle }}</div>
                      </div>
                    </NuxtLink>
                  </div>
                </div>

                <!-- Platform Guides Column -->
                <div>
                  <h4 class="text-[14px] font-semibold text-white/40 tracking-wide mb-5">Platform Guides</h4>
                  <div class="flex flex-col gap-1">
                    <NuxtLink
                      v-for="item in resourcesCol2"
                      :key="item.title"
                      :to="item.to"
                      class="flex items-center gap-3.5 px-3 py-2.5 -mx-3 rounded-xl hover:bg-white/[0.04] transition-colors group"
                      @click="openDropdown = null"
                    >
                      <div class="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                        <UIcon :name="item.icon" class="w-[18px] h-[18px] text-white/60" />
                      </div>
                      <div>
                        <div class="text-[14px] font-medium text-white">{{ item.title }}</div>
                        <div class="text-[12px] text-white/35 leading-snug">{{ item.subtitle }}</div>
                      </div>
                    </NuxtLink>
                  </div>
                </div>

                <!-- Advanced Column -->
                <div>
                  <h4 class="text-[14px] font-semibold text-white/40 tracking-wide mb-5">Advanced</h4>
                  <div class="flex flex-col gap-1">
                    <NuxtLink
                      v-for="item in resourcesCol3"
                      :key="item.title"
                      :to="item.to"
                      class="flex items-center gap-3.5 px-3 py-2.5 -mx-3 rounded-xl hover:bg-white/[0.04] transition-colors group"
                      @click="openDropdown = null"
                    >
                      <div class="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                        <UIcon :name="item.icon" class="w-[18px] h-[18px] text-white/60" />
                      </div>
                      <div>
                        <div class="text-[14px] font-medium text-white">{{ item.title }}</div>
                        <div class="text-[12px] text-white/35 leading-snug">{{ item.subtitle }}</div>
                      </div>
                    </NuxtLink>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Mobile Menu Overlay -->
    <Teleport to="body">
      <Transition name="mobile-overlay">
        <div
          v-if="mobileOpen"
          class="fixed inset-0 z-[60] md:hidden"
        >
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="mobileOpen = false" />

          <!-- Panel (slides from right) — dark themed -->
          <Transition name="mobile-panel" appear>
            <div
              v-if="mobileOpen"
              class="absolute top-0 right-0 bottom-0 w-full max-w-[380px] bg-[#121317] shadow-2xl overflow-y-auto"
            >
              <!-- Header -->
              <div class="flex items-center justify-between px-6 h-[56px] border-b border-white/[0.06]">
                <NuxtLink to="/" class="flex items-center gap-2.5" @click="mobileOpen = false">
                  <div class="w-7 h-7 bg-white rounded-lg flex items-center justify-center">
                    <span class="text-[#121317] text-xs font-semibold tracking-tight">XF</span>
                  </div>
                  <span class="text-[15px] font-medium text-white tracking-[-0.01em]">XeroFlow</span>
                </NuxtLink>
                <button
                  class="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-white/[0.06] transition-colors"
                  aria-label="Close navigation menu"
                  @click="mobileOpen = false"
                >
                  <UIcon name="i-lucide-x" class="w-5 h-5 text-white/60" />
                </button>
              </div>

              <!-- Mobile Nav Content -->
              <div class="px-6 py-4">
                <!-- Features Accordion -->
                <div class="border-b border-white/[0.06]">
                  <button
                    class="flex items-center justify-between w-full py-4 text-[16px] font-medium text-white"
                    @click="toggleMobileSection('features')"
                  >
                    Features
                    <UIcon
                      :name="mobileExpanded === 'features' ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                      class="w-4 h-4 text-white/40"
                    />
                  </button>
                  <Transition name="accordion">
                    <div v-if="mobileExpanded === 'features'" class="pb-4">
                      <template v-for="section in mobileFeatureSections" :key="section.label">
                        <div class="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2 mt-4 first:mt-0 px-1">{{ section.label }}</div>
                        <NuxtLink
                          v-for="item in section.items"
                          :key="item.title"
                          :to="item.to"
                          class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors"
                          @click="mobileOpen = false"
                        >
                          <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" :class="item.iconBg">
                            <UIcon :name="item.icon" class="w-4 h-4" :class="item.iconColor" />
                          </div>
                          <div>
                            <div class="text-[14px] text-white">{{ item.title }}</div>
                            <div class="text-[11px] text-white/30">{{ item.subtitle }}</div>
                          </div>
                        </NuxtLink>
                      </template>

                      <NuxtLink
                        to="/features"
                        class="flex items-center gap-1.5 px-3 py-2.5 mt-3 text-[14px] font-medium text-white/70 hover:text-white transition-colors"
                        @click="mobileOpen = false"
                      >
                        See all features
                        <UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5" />
                      </NuxtLink>
                    </div>
                  </Transition>
                </div>

                <!-- Pricing Link -->
                <NuxtLink
                  to="/pricing"
                  class="flex items-center py-4 text-[16px] font-medium text-white border-b border-white/[0.06]"
                  @click="mobileOpen = false"
                >
                  Pricing
                </NuxtLink>

                <!-- Contact Link -->
                <NuxtLink
                  to="/contact"
                  class="flex items-center py-4 text-[16px] font-medium text-white border-b border-white/[0.06]"
                  @click="mobileOpen = false"
                >
                  Contact
                </NuxtLink>

                <!-- Resources Accordion -->
                <div class="border-b border-white/[0.06]">
                  <button
                    class="flex items-center justify-between w-full py-4 text-[16px] font-medium text-white"
                    @click="toggleMobileSection('resources')"
                  >
                    Resources
                    <UIcon
                      :name="mobileExpanded === 'resources' ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                      class="w-4 h-4 text-white/40"
                    />
                  </button>
                  <Transition name="accordion">
                    <div v-if="mobileExpanded === 'resources'" class="pb-4">
                      <template v-for="section in mobileResourceSections" :key="section.label">
                        <div class="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2 mt-4 first:mt-0 px-1">{{ section.label }}</div>
                        <NuxtLink
                          v-for="item in section.items"
                          :key="item.title"
                          :to="item.to"
                          class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors"
                          @click="mobileOpen = false"
                        >
                          <div class="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                            <UIcon :name="item.icon" class="w-4 h-4 text-white/50" />
                          </div>
                          <div>
                            <div class="text-[14px] text-white">{{ item.title }}</div>
                            <div class="text-[11px] text-white/30">{{ item.subtitle }}</div>
                          </div>
                        </NuxtLink>
                      </template>
                    </div>
                  </Transition>
                </div>

                <!-- Theme Toggle (Mobile) -->
                <div class="flex items-center justify-between pt-4 mt-4 border-t border-white/[0.06]">
                  <span class="text-[13px] text-white/40">Appearance</span>
                  <div class="flex items-center bg-white/[0.06] rounded-full p-0.5">
                    <button
                      v-for="mode in themeModes"
                      :key="mode.value"
                      class="flex items-center justify-center w-8 h-8 rounded-full transition-all"
                      :class="colorMode.preference === mode.value ? 'bg-white/[0.15] text-white' : 'text-white/40 hover:text-white/70'"
                      :title="mode.label"
                      @click="colorMode.preference = mode.value"
                    >
                      <UIcon :name="mode.icon" class="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <!-- Sign In -->
                <NuxtLink
                  to="/auth/login"
                  class="flex items-center justify-center gap-2 mt-6 px-6 py-3 bg-white text-[#121317] text-[15px] font-medium rounded-full hover:bg-white/90 transition-colors"
                  @click="mobileOpen = false"
                >
                  Sign In
                  <UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5" />
                </NuxtLink>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { CRM_SEARCH_MARKETING_COPY } from '~/utils/marketingClaimManifest'

defineProps<{
  active?: 'features' | 'pricing' | 'resources' | 'contact' | ''
}>()

const colorMode = useColorMode()

const themeModes = [
  { value: 'light', label: 'Light', icon: 'i-lucide-sun' },
  { value: 'dark', label: 'Dark', icon: 'i-lucide-moon' },
  { value: 'system', label: 'System', icon: 'i-lucide-monitor' },
]

const openDropdown = ref<'features' | 'resources' | null>(null)
const mobileOpen = ref(false)
const mobileExpanded = ref<string | null>(null)

let closeTimeout: ReturnType<typeof setTimeout> | null = null

function showDropdown(name: 'features' | 'resources') {
  if (closeTimeout) clearTimeout(closeTimeout)
  openDropdown.value = name
}

function scheduleClose() {
  closeTimeout = setTimeout(() => {
    openDropdown.value = null
  }, 200)
}

function cancelClose() {
  if (closeTimeout) clearTimeout(closeTimeout)
}

function toggleMobileSection(name: string) {
  mobileExpanded.value = mobileExpanded.value === name ? null : name
}

// Lock body scroll when mobile menu is open
watch(mobileOpen, (open) => {
  if (import.meta.client) {
    document.body.style.overflow = open ? 'hidden' : ''
  }
})

// Close menus on route change
const route = useRoute()
watch(() => route.path, () => {
  mobileOpen.value = false
  openDropdown.value = null
})

// Cleanup on unmount
onUnmounted(() => {
  if (import.meta.client) {
    document.body.style.overflow = ''
  }
  if (closeTimeout) clearTimeout(closeTimeout)
})

// ---- Features data ----

const featuresCol1 = [
  { title: 'Boards', subtitle: 'Kanban, table, and timeline views', icon: 'i-lucide-kanban', iconBg: 'bg-blue-500/15', iconColor: 'text-blue-400', to: '/platform/boards' },
  { title: 'Calendar', subtitle: 'Schedule and deadline tracking', icon: 'i-lucide-calendar-days', iconBg: 'bg-blue-500/15', iconColor: 'text-blue-400', to: '/platform/calendar' },
  { title: 'Templates', subtitle: 'Pre-built board configurations', icon: 'i-lucide-copy', iconBg: 'bg-blue-500/15', iconColor: 'text-blue-400', to: '/platform/templates' },
]

const featuresCol2 = [
  { title: 'Xero Integration', subtitle: 'Sync invoices and accounts', icon: 'i-lucide-link', iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400', to: '/platform/financials' },
  { title: 'Ad Spend', subtitle: 'Meta tracking & governed Google Ads control', icon: 'i-lucide-bar-chart-3', iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400', to: '/platform/ad-spend' },
  { title: 'Search Authority', subtitle: 'Evidence, governed guides & trust', icon: 'i-lucide-search-check', iconBg: 'bg-cyan-500/15', iconColor: 'text-cyan-400', to: '/features/search-authority-ai-trust' },
  { title: 'Website Audience Intelligence', subtitle: 'Nearby dealerships, human-reviewed', icon: 'i-lucide-radio-tower', iconBg: 'bg-cyan-500/15', iconColor: 'text-cyan-400', to: '/features/website-audience-intelligence' },
  { title: 'AI Max Readiness', subtitle: 'Read-only Google migration evidence', icon: 'i-lucide-scan-search', iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400', to: '/features/google-ai-max-readiness' },
  { title: 'Governed PMax Launches', subtitle: 'Evidence-bound Vehicle Ads rollout', icon: 'i-lucide-shield-check', iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400', to: '/features/governed-google-pmax-launches' },
  { title: 'EOM Engine', subtitle: 'Automated invoice generation', icon: 'i-lucide-receipt', iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400', to: '/platform/financials' },
  { title: 'Lead Capture & Routing', subtitle: 'Webhooks, inbound email, CSV, and manual leads', icon: 'i-lucide-inbox', iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400', to: '/features/lead-capture-routing' }
]

const featuresCol3a = [
  { title: 'Real-Time Chat', subtitle: 'Channels, threads, and DMs', icon: 'i-lucide-message-circle', iconBg: 'bg-violet-500/15', iconColor: 'text-violet-400', to: '/platform/chat' },
  { title: 'Virtual Office', subtitle: 'Presence, rooms, guests & follow-up', icon: 'i-lucide-building-2', iconBg: 'bg-violet-500/15', iconColor: 'text-violet-400', to: '/platform/office' },
  { title: 'Smart Watch', subtitle: 'AI-prioritised notifications & digest', icon: 'i-lucide-bell-ring', iconBg: 'bg-violet-500/15', iconColor: 'text-violet-400', to: '/features/smart-watch' },
  { title: 'Email Marketing', subtitle: 'Campaigns, visual builder, and lists', icon: 'i-lucide-send', iconBg: 'bg-violet-500/15', iconColor: 'text-violet-400', to: '/features/email-campaigns' },
  { title: 'Automations', subtitle: 'Trigger-action workflows', icon: 'i-lucide-zap', iconBg: 'bg-violet-500/15', iconColor: 'text-violet-400', to: '/platform/automations' },
]

const featuresCol3b = [
  { title: 'Page Studio', subtitle: 'Visual multi-page website builder', icon: 'i-lucide-panels-top-left', iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400', to: '/features/page-studio' },
  { title: 'Banner Studio', subtitle: 'HTML5 ad design & animation', icon: 'i-lucide-palette', iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400', to: '/banner-studio' },
  { title: 'Bulk Ad Launch', subtitle: 'Publish ads across platforms', icon: 'i-lucide-rocket', iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400', to: '/features/bulk-ad-launch' },
  { title: 'Ad Export', subtitle: 'Platform-compliant ZIP export', icon: 'i-lucide-download', iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400', to: '/features/ad-platform-export' },
  { title: 'Dealer Feeds', subtitle: 'Vehicle feeds & Meta catalogue delivery', icon: 'i-lucide-boxes', iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400', to: '/features/dealer-inventory-feeds' },
  { title: 'Social Publishing', subtitle: 'Plan, compose & schedule organic', icon: 'i-lucide-share-2', iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400', to: '/features/social-composer' },
  { title: 'Client News Intelligence', subtitle: 'News-to-social with governed AI context', icon: 'i-lucide-newspaper', iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400', to: '/features/social-news-intelligence' },
  { title: 'Engagement Inbox', subtitle: 'Comments, messages & reviews in one place', icon: 'i-lucide-messages-square', iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400', to: '/features/social-inbox' },
  { title: 'Reply Automation', subtitle: 'AI-assisted replies with approval guardrails', icon: 'i-lucide-bot', iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400', to: '/features/social-automation' },
  { title: 'Audio Studio', subtitle: 'Owned AI voiceover & music for every channel', icon: 'i-lucide-mic', iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400', to: '/features/audio-studio' },
  { title: 'AI Video Generation', subtitle: 'Brand-safe image-to-video & B-roll clips', icon: 'i-lucide-video', iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400', to: '/features/ai-video-generation' },
  { title: 'Video Studio', subtitle: 'Multitrack social video editor & multi-format render', icon: 'i-lucide-clapperboard', iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400', to: '/features/video-studio' },
  { title: 'Dynamic QR Codes', subtitle: 'Editable destinations & per-scan analytics', icon: 'i-lucide-qr-code', iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400', to: '/features/qr-codes' },
]

const featuresCol4 = [
  { title: 'AI Assistant', subtitle: 'Agentic chat, anomaly detection, search', icon: 'i-lucide-sparkles', iconBg: 'bg-amber-500/15', iconColor: 'text-amber-400', to: '/platform/ai' },
  { title: 'Governed AI Assistants', subtitle: 'Personal and department specialists', icon: 'i-lucide-shield-check', iconBg: 'bg-amber-500/15', iconColor: 'text-amber-400', to: '/ai-assistants' },
  { title: 'Advisor Backlog', subtitle: 'CFO recommendations as a triage queue', icon: 'i-lucide-target', iconBg: 'bg-amber-500/15', iconColor: 'text-amber-400', to: '/features/advisor-backlog' },
  { title: 'AI Training', subtitle: 'Your data trains your AI, privately', icon: 'i-lucide-brain', iconBg: 'bg-amber-500/15', iconColor: 'text-amber-400', to: '/ai-training' },
  { title: 'Voice AI', subtitle: 'Talk to your AI by voice', icon: 'i-lucide-mic', iconBg: 'bg-amber-500/15', iconColor: 'text-amber-400', to: '/voice-ai' },
  { title: CRM_SEARCH_MARKETING_COPY.navigationTitle, subtitle: CRM_SEARCH_MARKETING_COPY.navigationSubtitle, icon: 'i-lucide-search', iconBg: 'bg-amber-500/15', iconColor: 'text-amber-400', to: '/features/semantic-search' },
  { title: 'AI Assistant Connectors', subtitle: 'Governed model fleet + vision pre-flight', icon: 'i-lucide-plug', iconBg: 'bg-amber-500/15', iconColor: 'text-amber-400', to: '/features/ai-connectors' },
]

const featuresCol5 = [
  { title: 'HR & People Operations', subtitle: 'Governed reviews, roles & evidence', icon: 'i-lucide-users-round', iconBg: 'bg-cyan-500/15', iconColor: 'text-cyan-400', to: '/features/hr-people-operations' },
  { title: 'Client Portal', subtitle: 'Secure CRM, campaigns, jobs & billing', icon: 'i-lucide-building-2', iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400', to: '/platform/client-portal' },
  { title: 'Time Tracking', subtitle: 'Timesheets and approvals', icon: 'i-lucide-timer', iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400', to: '/platform/time-tracking' },
  { title: 'Briefs', subtitle: 'Templates, AI tools, and quotes', icon: 'i-lucide-file-text', iconBg: 'bg-orange-500/15', iconColor: 'text-orange-400', to: '/features/brief-templates' },
  { title: 'Roles & Admin', subtitle: 'Custom roles and permissions', icon: 'i-lucide-shield', iconBg: 'bg-slate-500/15', iconColor: 'text-slate-400', to: '/features/custom-roles' },
]

const featuresCrm = [
  { title: 'Contacts & Companies', subtitle: 'Records, relationships & timeline', icon: 'i-lucide-contact-round', iconBg: 'bg-teal-500/15', iconColor: 'text-teal-400', to: '/features/crm-contacts' },
  { title: 'Sales Pipeline', subtitle: 'Opportunities & weighted forecast', icon: 'i-lucide-square-kanban', iconBg: 'bg-teal-500/15', iconColor: 'text-teal-400', to: '/features/crm-pipeline' },
  { title: 'Lead Scoring', subtitle: 'Know which leads are hot', icon: 'i-lucide-gauge', iconBg: 'bg-teal-500/15', iconColor: 'text-teal-400', to: '/features/crm-scoring' },
  { title: 'CRM Insights', subtitle: 'Funnels, forecast & leaderboard', icon: 'i-lucide-trending-up', iconBg: 'bg-teal-500/15', iconColor: 'text-teal-400', to: '/features/crm-insights' },
  { title: 'Quote Generation', subtitle: 'Opportunity to quote in one click', icon: 'i-lucide-file-signature', iconBg: 'bg-teal-500/15', iconColor: 'text-teal-400', to: '/features/crm-quotes' },
]

// ---- Resources data ----

const resourcesCol1 = [
  { title: 'Quick Start Guide', subtitle: 'Get up and running in 10 minutes', icon: 'i-lucide-rocket', to: '/resources/quick-start' },
  { title: 'Board Basics', subtitle: 'Create and configure boards', icon: 'i-lucide-kanban', to: '/resources/board-basics' },
  { title: 'Inviting Your Team', subtitle: 'Roles, permissions, and access', icon: 'i-lucide-users', to: '/resources/inviting-team' },
  { title: 'Setting Up Clients', subtitle: 'Client profiles and portal access', icon: 'i-lucide-briefcase', to: '/resources/setting-up-clients' },
]

const resourcesCol2 = [
  { title: 'Connecting Xero', subtitle: 'OAuth setup and sync', icon: 'i-lucide-link', to: '/resources/connecting-xero' },
  { title: 'First Automation', subtitle: 'Build trigger-action recipes', icon: 'i-lucide-zap', to: '/resources/first-automation' },
  { title: 'Work Management', subtitle: 'Views, groups, and workflows', icon: 'i-lucide-layout-grid', to: '/resources/work-management' },
  { title: 'Financial Operations', subtitle: 'Invoicing, P&L, and budgets', icon: 'i-lucide-calculator', to: '/resources/financial-operations' },
]

const resourcesCol3 = [
  { title: 'AI & Automation', subtitle: 'Chat, anomaly detection, intent', icon: 'i-lucide-sparkles', to: '/resources/ai-automation' },
  { title: 'Client Portal Admin', subtitle: 'Permissions and portal setup', icon: 'i-lucide-building-2', to: '/resources/client-portal-admin' },
  { title: 'Bulk Ad Launch', subtitle: 'Publish ads at scale', icon: 'i-lucide-rocket', to: '/resources/bulk-ad-launch' },
  { title: 'Ad Platform Export', subtitle: 'Export banners for ad servers', icon: 'i-lucide-download', to: '/resources/ad-platform-export' },
  { title: 'Integrations', subtitle: 'Connect your tools and services', icon: 'i-lucide-puzzle', to: '/resources/integrations' },
  { title: 'Roles & Permissions', subtitle: 'Custom roles and RBAC setup', icon: 'i-lucide-shield', to: '/resources/roles-permissions' },
  { title: 'Briefs & Proposals', subtitle: 'Templates, AI tools, and quotes', icon: 'i-lucide-file-text', to: '/resources/briefs-proposals' },
  { title: 'Time Tracking', subtitle: 'Timesheets and approvals', icon: 'i-lucide-timer', to: '/resources/time-tracking' },
]

// ---- Mobile sections (for accordion) ----

const mobileFeatureSections = [
  { label: 'Work Management', items: featuresCol1 },
  { label: 'Creative', items: featuresCol3b },
  { label: 'Financial Operations', items: featuresCol2 },
  { label: 'Communication', items: featuresCol3a },
  { label: 'Sales & CRM', items: featuresCrm },
  { label: 'AI & Intelligence', items: featuresCol4 },
  { label: 'People & Operations', items: featuresCol5 },
]

const mobileResourceSections = [
  { label: 'Getting Started', items: resourcesCol1 },
  { label: 'Platform Guides', items: resourcesCol2 },
  { label: 'Advanced', items: resourcesCol3 },
]
</script>

<style scoped>
/* Dropdown panel transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.dropdown-enter-to,
.dropdown-leave-from {
  opacity: 1;
  transform: translateY(0);
}

/* Dropdown backdrop transition */
.dropdown-backdrop-enter-active,
.dropdown-backdrop-leave-active {
  transition: opacity 0.15s ease;
}
.dropdown-backdrop-enter-from,
.dropdown-backdrop-leave-to {
  opacity: 0;
}

/* Mobile overlay transition */
.mobile-overlay-enter-active,
.mobile-overlay-leave-active {
  transition: opacity 0.25s ease;
}
.mobile-overlay-enter-from,
.mobile-overlay-leave-to {
  opacity: 0;
}

/* Mobile panel slide transition */
.mobile-panel-enter-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.mobile-panel-leave-active {
  transition: transform 0.2s ease-in;
}
.mobile-panel-enter-from,
.mobile-panel-leave-to {
  transform: translateX(100%);
}

/* Accordion transition */
.accordion-enter-active,
.accordion-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.accordion-enter-from,
.accordion-leave-to {
  opacity: 0;
  max-height: 0;
}
.accordion-enter-to,
.accordion-leave-from {
  opacity: 1;
  max-height: 2000px;
}
</style>
