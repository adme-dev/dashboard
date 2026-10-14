<script setup lang="ts">
type Path = 'existing' | 'dns' | 'transfer' | 'buy'
const selected = ref<Path>('existing')
const choices: { value: Path, label: string, icon: string }[] = [
  { value: 'existing', label: 'Use my existing domain', icon: 'i-lucide-link' },
  { value: 'dns', label: 'Move DNS to Cloudflare', icon: 'i-lucide-cloud' },
  { value: 'transfer', label: 'Transfer my registration', icon: 'i-lucide-arrow-right-left' },
  { value: 'buy', label: 'Buy a new domain', icon: 'i-lucide-search' }
]
const guides = {
  existing: {
    title: 'Keep your domain where it is',
    description: 'Your registrar and email can stay with your current provider. Connect the website address below to get its exact DNS records.',
    steps: ['Connect the hostname you want visitors to use, such as www.example.com.', 'Add the ownership and HTTPS records shown below at your DNS provider.', 'When your website is ready for cutover, update its website record and verify DNS and HTTPS.'],
    note: 'Changing website DNS does not transfer your domain registration. Keep your MX records and email verification records.'
  },
  dns: {
    title: 'Use Cloudflare for your DNS',
    description: 'Keep your current registrar and move DNS hosting to your own Cloudflare account.',
    steps: ['Add your domain to Cloudflare and review the imported DNS records against your current provider.', 'Preserve email, verification and other service records. Follow Cloudflare’s DNSSEC and nameserver instructions at your registrar.', 'Wait until Cloudflare marks the zone active, then return here to connect your website hostname.'],
    note: 'Use only the nameservers assigned to your domain. For website verification, use a DNS-only CNAME on a subdomain such as www, without CNAME flattening. Opening Cloudflare does not migrate records or complete setup.',
    href: 'https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/', label: 'Open Cloudflare DNS setup'
  },
  transfer: {
    title: 'Move registration to Cloudflare',
    description: 'Cloudflare becomes the registrar that manages your domain registration and renewals. This is separate from moving DNS hosting.',
    steps: ['Check that Cloudflare supports your domain extension and that the domain is eligible for transfer.', 'Make the domain active on Cloudflare DNS first. Follow the transfer instructions for unlocking and authorization at your current registrar.', 'Complete contact details, payment and transfer approval in your own Cloudflare account, then return here to connect the website.'],
    note: 'Transfer timing and fees depend on the domain. Cloudflare Registrar requires Cloudflare nameservers.',
    href: 'https://developers.cloudflare.com/registrar/get-started/transfer-domain-to-cloudflare/', label: 'Open Cloudflare transfer guide'
  },
  buy: {
    title: 'Find your new website address',
    description: 'Search and purchase in your own Cloudflare account so the registration, billing and renewal notices belong to you.',
    steps: ['Search for an available domain. Cloudflare shows supported extensions, current availability and pricing.', 'Review the price, registration term and renewal settings. Complete payment and accept the terms directly with Cloudflare.', 'Verify your registrant email, then return here and connect the domain you purchased.'],
    note: 'XeroFlow does not collect payment or register a domain when you open this link. Cloudflare Registrar uses Cloudflare DNS.',
    href: 'https://dash.cloudflare.com/?to=/:account/registrar/register', label: 'Search domains at Cloudflare'
  }
}
const guide = computed(() => guides[selected.value])
</script>

<template>
  <section class="@container space-y-5" aria-labelledby="domain-setup-title">
    <div>
      <h2 id="domain-setup-title" class="text-lg font-semibold text-highlighted">
        How would you like to connect?
      </h2>
      <p class="mt-1 max-w-2xl text-sm leading-6 text-muted">
        Choose where your domain is managed. Each path returns here for website connection and status checks.
      </p>
    </div>
    <div class="grid gap-6 @3xl:grid-cols-[240px_1fr]">
      <div class="flex flex-col items-stretch gap-2" role="group" aria-label="Domain setup options">
        <UButton
          v-for="choice in choices"
          :key="choice.value"
          :label="choice.label"
          :icon="choice.icon"
          :aria-pressed="selected === choice.value"
          :variant="selected === choice.value ? 'soft' : 'ghost'"
          color="neutral"
          class="justify-start whitespace-normal py-3 text-left"
          @click="selected = choice.value"
        />
      </div>
      <div class="min-w-0 space-y-4 rounded-lg border border-default p-5" aria-live="polite">
        <h3 class="font-semibold text-highlighted">
          {{ guide.title }}
        </h3>
        <p class="max-w-2xl text-sm leading-6 text-muted">
          {{ guide.description }}
        </p>
        <ol class="ml-5 max-w-2xl list-decimal space-y-3 text-sm leading-6 text-default">
          <li v-for="step in guide.steps" :key="step" class="pl-1">
            {{ step }}
          </li>
        </ol>
        <UButton
          v-if="'href' in guide"
          :to="guide.href"
          :label="guide.label"
          target="_blank"
          rel="noopener noreferrer"
          trailing-icon="i-lucide-external-link"
          color="neutral"
          variant="outline"
          class="whitespace-normal"
        />
        <p class="max-w-2xl text-xs leading-5 text-muted">
          {{ guide.note }}
        </p>
      </div>
    </div>
  </section>
</template>
