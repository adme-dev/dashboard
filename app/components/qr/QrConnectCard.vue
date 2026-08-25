<script setup lang="ts">
import { buildTrackedUrl } from '~~/shared/qr/tracking'
import type { QrCode } from '~/composables/useQrCodes'

const props = defineProps<{ code: QrCode, trackerInstalled: boolean, visits: { sessions: number, visitors: number }, leads: number }>()
const toast = useToast()
const open = ref(false)

const trackedUrl = computed(() => buildTrackedUrl(props.code.destination_url, {
  code: props.code.code,
  enabled: props.code.utm_enabled ?? true,
  medium: props.code.utm_medium,
  campaign: props.code.folder_name || props.code.name
}))
const enabled = computed(() => props.code.utm_enabled ?? true)

// For sites without track.js: persist the click id first-party and drop it into every form.
const gtmSnippet = computed(() => `<script>
(function(){try{var p=new URLSearchParams(location.search),q=p.get('xf_qr');
if(q)localStorage.setItem('xf_qr',q);q=q||localStorage.getItem('xf_qr');if(!q)return;
document.querySelectorAll('form').forEach(function(f){if(f.querySelector('[name=xf_qr]'))return;
var i=document.createElement('input');i.type='hidden';i.name='xf_qr';i.value=q;f.appendChild(i)});}catch(e){}})();
  </scr` + `ipt>`)

async function copy(text: string, what: string) {
  await navigator.clipboard.writeText(text)
  toast.add({ title: `${what} copied`, color: 'success' })
}
</script>

<template>
  <UCard :ui="{ body: 'p-0' }">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm font-medium">Connected to the client's site</span>
        <UBadge :color="trackerInstalled ? 'success' : 'neutral'" variant="subtle" size="sm">
          {{ trackerInstalled ? 'XeroFlow tracking installed' : 'No XeroFlow tracker' }}
        </UBadge>
      </div>
    </template>
    <div class="divide-y divide-default">
      <div class="grid grid-cols-2 divide-x divide-default">
        <div class="px-4 py-3">
          <p class="text-xs text-muted">
            Site visits from this code
          </p>
          <p class="mt-1 text-xl font-semibold tabular-nums">
            {{ visits.sessions.toLocaleString() }}
          </p>
          <p class="text-[11px] text-muted">
            {{ trackerInstalled ? `${visits.visitors.toLocaleString()} visitors` : 'Needs track.js on the destination' }}
          </p>
        </div>
        <div class="px-4 py-3">
          <p class="text-xs text-muted">
            Leads attributed
          </p>
          <p class="mt-1 text-xl font-semibold tabular-nums">
            {{ leads.toLocaleString() }}
          </p>
          <p class="text-[11px] text-muted">
            via xf_qr / utm_content
          </p>
        </div>
      </div>
      <div class="space-y-2 px-4 py-3">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-muted">
            {{ enabled ? 'Scans land on' : 'Tagging is off — scans land on the bare destination' }}
          </p>
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-copy"
            @click="copy(trackedUrl, 'Tagged URL')"
          >
            Copy
          </UButton>
        </div>
        <p class="break-all font-mono text-[11px]" :class="enabled ? '' : 'text-muted'">
          {{ trackedUrl }}
        </p>
        <p v-if="enabled" class="text-xs text-muted">
          GA4 and Meta pick up the <code>utm_*</code> parameters with no setup. The <code>xf_qr</code> click id is how leads get matched back to this code.
        </p>
      </div>
      <div class="px-4 py-3">
        <UButton
          size="xs"
          variant="link"
          color="neutral"
          class="px-0"
          :icon="open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          @click="() => { open = !open }"
        >
          {{ trackerInstalled ? 'Lead matching works automatically — details' : 'Match leads without the XeroFlow tracker' }}
        </UButton>
        <div v-if="open" class="mt-2 space-y-2 text-xs text-muted">
          <template v-if="trackerInstalled">
            <p>
              <code>track.js</code> stores <code>xf_qr</code> as a first-party touch on the client's domain and sends it with every form submission it sees, so leads arriving through the tracker, the generic webhook or CSV carry the code in their attribution.
            </p>
          </template>
          <template v-else>
            <p>
              Add this to the site (GTM "Custom HTML" tag on all pages). It keeps <code>xf_qr</code> in first-party storage and adds it as a hidden field to every form; then map that field through to the lead webhook.
            </p>
            <pre class="overflow-x-auto rounded-md bg-elevated/60 p-3 font-mono text-[11px] leading-relaxed text-default">{{ gtmSnippet }}</pre>
            <UButton
              size="xs"
              variant="soft"
              color="neutral"
              icon="i-lucide-copy"
              @click="copy(gtmSnippet, 'Snippet')"
            >
              Copy snippet
            </UButton>
          </template>
        </div>
      </div>
    </div>
  </UCard>
</template>
