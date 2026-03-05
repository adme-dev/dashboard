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
    <MarketingFooter />
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
