<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav />

    <!-- Hero -->
    <section class="relative bg-[#0a0b0e] pt-[52px]">
      <MarketingHeroBackground theme="legal" />
      <div class="relative max-w-[720px] mx-auto px-6 pt-32 md:pt-44 pb-16 md:pb-20">
        <h1 class="text-[clamp(36px,6vw,56px)] font-[450] text-white leading-[1.1] tracking-[-0.03em] mb-6">
          Terms of Service
        </h1>
        <p class="text-[15px] text-white/40">Last updated: February 2026</p>
      </div>
    </section>

    <!-- Content -->
    <div>
      <div class="max-w-[720px] mx-auto px-6 pt-12 pb-20 md:pb-32">

        <div class="flex flex-col gap-10">
          <section>
            <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white mb-4">1. Acceptance of Terms</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              By accessing or using XeroFlow, you agree to be bound by these Terms of Service. If you are using XeroFlow on behalf of an organisation, you represent that you have the authority to bind that organisation to these terms.
            </p>
          </section>

          <section>
            <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white mb-4">2. Account Responsibilities</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              You are responsible for maintaining the security of your account credentials and for all activity that occurs under your account. You must notify us immediately of any unauthorised access. Accounts are for use by a single organisation and may not be shared across unrelated entities.
            </p>
          </section>

          <section>
            <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white mb-4">3. Permitted Use</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              XeroFlow is provided for legitimate business use by digital marketing agencies and their teams. You agree not to reverse-engineer, decompile, or attempt to extract source code from the platform. You may not use the service for any unlawful purpose or in violation of any applicable regulations.
            </p>
          </section>

          <section>
            <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white mb-4">4. Data Ownership</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              You retain full ownership of all data you upload to or create within XeroFlow. We do not claim any intellectual property rights over your content. You grant us a limited licence to process your data solely for the purpose of providing the service.
            </p>
          </section>

          <section>
            <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white mb-4">5. Service Availability</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              We strive to maintain 99.9% uptime but do not guarantee uninterrupted availability. Scheduled maintenance windows will be communicated in advance. We reserve the right to modify, suspend, or discontinue features with reasonable notice.
            </p>
          </section>

          <section>
            <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white mb-4">6. Payment & Billing</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Paid plans are billed monthly or annually as selected. All fees are non-refundable except where required by law. We reserve the right to adjust pricing with 30 days' advance notice. Failure to pay may result in account suspension.
            </p>
          </section>

          <section>
            <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white mb-4">7. Limitation of Liability</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              To the maximum extent permitted by law, XeroFlow and its operators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform. Our total liability shall not exceed the amount paid by you in the twelve months preceding any claim.
            </p>
          </section>

          <section>
            <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white mb-4">8. Termination</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Either party may terminate the agreement at any time. Upon termination, you may export your data within 30 days, after which it will be permanently deleted. We may terminate accounts that violate these terms with immediate effect.
            </p>
          </section>

          <section>
            <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white mb-4">9. Contact</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Questions about these terms can be directed to
              <a href="mailto:legal@xeroflow.agency" class="text-[#121317] dark:text-white underline underline-offset-2">legal@xeroflow.agency</a>.
            </p>
          </section>
        </div>
      </div>
    </div>

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

<script setup>
definePageMeta({ layout: false })

useSeoMeta({
  title: 'Terms of Service — XeroFlow',
  description: 'Terms and conditions for using XeroFlow. Covers usage, responsibilities, liability, and service agreements.',
  ogTitle: 'Terms of Service — XeroFlow',
  ogDescription: 'Terms and conditions for using XeroFlow. Covers usage, responsibilities, liability, and service agreements.',
})
</script>
