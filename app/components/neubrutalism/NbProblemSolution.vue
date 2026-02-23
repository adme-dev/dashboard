<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <!-- The Problem -->
    <div class="border border-black/20 rounded overflow-hidden">
      <!-- Header -->
      <div class="inline-block px-4 py-2 bg-[#2A2A2A] text-white text-sm font-medium">
        The problem
      </div>
      
      <!-- Content -->
      <div class="p-8">
        <h3 class="text-2xl font-normal text-black mb-6 leading-tight">
          The hidden factory inside every company
        </h3>
        <ul class="space-y-3">
          <li v-for="item in problemItems" :key="item" class="flex items-start gap-3">
            <span class="w-1.5 h-1.5 bg-black rounded-sm mt-2 flex-shrink-0"></span>
            <span class="text-black/70">{{ item }}</span>
          </li>
        </ul>
      </div>
      
      <!-- Illustration Area -->
      <div class="h-64 bg-[#FFFBF0] relative overflow-hidden bb-bg-grid-fine">
        <div class="absolute inset-0 flex items-center justify-center">
          <!-- Browser window mockup -->
          <div class="w-64 bg-white border border-black/20 rounded shadow-lg">
            <!-- Browser header -->
            <div class="h-8 bg-[#2A2A2A] flex items-center px-3 gap-1.5">
              <div class="w-2.5 h-2.5 rounded-full bg-[#FF6B6B]"></div>
              <div class="w-2.5 h-2.5 rounded-full bg-[#F4B942]"></div>
              <div class="w-2.5 h-2.5 rounded-full bg-[#7DD3A8]"></div>
            </div>
            <!-- Browser content -->
            <div class="p-4 space-y-3">
              <div class="h-3 bg-[#4A90D9] rounded w-full"></div>
              <div class="h-3 bg-[#4A90D9] rounded w-3/4"></div>
              <div class="flex gap-2">
                <div class="h-2 bg-black/20 rounded w-16"></div>
                <div class="h-2 bg-[#4A90D9] rounded w-24"></div>
              </div>
              <div class="border border-black/10 rounded p-2 flex justify-between items-center">
                <span class="text-xs text-black/60">Verify</span>
                <div class="w-4 h-4 border border-black/20 rounded flex items-center justify-center">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-black/60" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- Click cursor -->
        <div class="absolute bottom-8 left-1/2 transform -translate-x-1/2">
          <UIcon name="i-lucide-mouse-pointer-2" class="w-6 h-6 text-black/60" />
        </div>
      </div>
    </div>

    <!-- The Solution -->
    <div class="border border-black/20 rounded overflow-hidden">
      <!-- Header -->
      <div class="inline-block px-4 py-2 bg-[#2A2A2A] text-white text-sm font-medium">
        The solution
      </div>
      
      <!-- Content -->
      <div class="p-8">
        <h3 class="text-2xl font-normal text-black mb-6 leading-tight">
          How Browserbase changes the game
        </h3>
        <ul class="space-y-3">
          <li v-for="item in solutionItems" :key="item.label" class="flex items-start gap-3">
            <span class="w-1.5 h-1.5 bg-black rounded-sm mt-2 flex-shrink-0"></span>
            <div>
              <span class="font-medium text-black">{{ item.label }}</span>
              <UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5 inline mx-1 text-black/40" />
              <span class="text-black/70">{{ item.description }}</span>
            </div>
          </li>
        </ul>
      </div>
      
      <!-- Illustration Area -->
      <div class="h-64 bg-[#F4D9A3] relative overflow-hidden">
        <div class="absolute inset-0 flex items-center justify-center">
          <!-- Flow diagram -->
          <div class="flex flex-col items-center gap-4">
            <!-- Browserbase node -->
            <div class="bg-white border border-black/20 rounded px-4 py-2 flex items-center gap-2 shadow-sm">
              <div class="w-5 h-5 bg-[#FF6B6B] rounded flex items-center justify-center text-white text-xs font-bold">B</div>
              <span class="text-sm font-medium">Browserbase</span>
            </div>
            
            <!-- Connected apps -->
            <div class="flex gap-4">
              <div class="bg-white border border-black/20 rounded px-3 py-2 flex items-center gap-1.5 shadow-sm">
                <UIcon name="i-lucide-video" class="w-4 h-4 text-[#00A4EF]" />
                <span class="text-xs">Skype</span>
              </div>
              <div class="bg-white border border-black/20 rounded px-3 py-2 flex items-center gap-1.5 shadow-sm">
                <UIcon name="i-lucide-linkedin" class="w-4 h-4 text-[#0077B5]" />
                <span class="text-xs">LinkedIn</span>
              </div>
              <div class="bg-white border border-black/20 rounded px-3 py-2 shadow-sm">
                <div class="w-8 h-4 flex gap-0.5">
                  <div class="flex-1 bg-black/10 rounded-sm"></div>
                  <div class="flex-1 bg-black/10 rounded-sm"></div>
                  <div class="flex-1 bg-black/10 rounded-sm"></div>
                </div>
              </div>
            </div>
            
            <!-- Your systems -->
            <div class="bg-white border-2 border-black rounded px-4 py-2 shadow-sm">
              <span class="text-sm font-medium">Your systems</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface SolutionItem {
  label: string
  description: string
}

interface Props {
  problemItems?: string[]
  solutionItems?: SolutionItem[]
}

withDefaults(defineProps<Props>(), {
  problemItems: () => [
    'Onboarding vendors across clunky portals.',
    'Pulling reports from legacy dashboards.',
    'Copying data from one SaaS app to another.',
    'Clicking through captchas, forms, and approvals.'
  ],
  solutionItems: () => [
    { label: 'Persistent sessions', description: 'stay logged in across runs.' },
    { label: 'Human-like navigation', description: 'click, scroll and interact without fragile hacks.' },
    { label: 'Form filling', description: 'eliminate typos and retries.' },
    { label: 'File handling at scale', description: 'upload, download and verify automatically.' }
  ]
})
</script>

<style scoped>
.bb-bg-grid-fine {
  background-image: 
    linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px);
  background-size: 10px 10px;
}
</style>
