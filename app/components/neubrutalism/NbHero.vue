<template>
  <section class="py-24 px-6 bg-white">
    <div class="max-w-6xl mx-auto">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <!-- Left Content -->
        <div>
          <h1 class="text-5xl md:text-6xl font-normal text-black leading-tight mb-6">
            {{ headline }}
          </h1>
          <p class="text-lg text-black/70 leading-relaxed mb-8 max-w-xl">
            {{ description }}
          </p>
          <button 
            class="px-8 py-4 bg-[#13B5EA] text-white font-medium rounded hover:bg-[#0E9AD1] transition-colors"
            @click="$emit('ctaClick')"
          >
            {{ ctaText }}
          </button>
        </div>
        
        <!-- Right Content - Browser Mockup -->
        <div class="relative">
          <div class="border border-black/20 rounded-lg overflow-hidden bg-[#F0FAFE]">
            <!-- Browser Header -->
            <div class="h-10 bg-[#2A2A2A] flex items-center px-4 gap-2">
              <div class="w-3 h-3 rounded-full bg-[#FF6B6B]"></div>
              <div class="w-3 h-3 rounded-full bg-[#F4B942]"></div>
              <div class="w-3 h-3 rounded-full bg-[#7DD3A8]"></div>
            </div>
            <!-- Browser Content -->
            <div class="p-8 relative">
              <!-- Contact Tab -->
              <div class="inline-block border border-black/20 border-b-0 bg-white px-4 py-2 text-sm font-medium text-black">
                {{ mockupTabText }}
              </div>
              <!-- Form -->
              <div class="border border-black/20 bg-white p-6 -mt-0">
                <!-- Progress Bar -->
                <div class="flex justify-end mb-4">
                  <div class="w-32 h-2 bg-black/10 rounded-full overflow-hidden">
                    <div class="w-2/3 h-full bg-[#13B5EA] rounded-full"></div>
                  </div>
                </div>
                <!-- Input Field -->
                <div class="border border-black/20 rounded px-4 py-3 mb-4 relative">
                  <span class="text-black/40">{{ mockupInputPlaceholder }}</span>
                  <!-- Cursor -->
                  <div class="absolute left-[180px] top-1/2 -translate-y-1/2">
                    <UIcon name="i-lucide-mouse-pointer-2" class="w-5 h-5 text-black" />
                  </div>
                </div>
                <!-- Next Button -->
                <button class="w-full py-3 bg-black/5 text-black/40 font-medium rounded cursor-not-allowed">
                  {{ mockupButtonText }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  headline?: string
  description?: string
  ctaText?: string
  mockupTabText?: string
  mockupInputPlaceholder?: string
  mockupButtonText?: string
}>(), {
  headline: "Transform your client onboarding with XeroFlow.",
  description: "XeroFlow automates Xero implementations for accounting firms. From client data collection to chart of accounts setup, streamline every step so your team can focus on advisory, not admin.",
  ctaText: "Get a Demo",
  mockupTabText: "Client Onboarding",
  mockupInputPlaceholder: "Enter company details...",
  mockupButtonText: "Continue"
})

defineEmits<{
  ctaClick: []
}>()
</script>
