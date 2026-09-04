<script setup lang="ts">
const props = defineProps<{ siteId: string }>()

interface Snippet { name: string | null, spa: boolean, writeKey: string, raw: string, gtm: string }
interface Status { installed: boolean, total: number, last24h: number, lastEventAt: string | null }

const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>
const data = ref<Snippet | null>(null)
const status = ref<Status | null>(null)
const pending = ref(false)
const statusState = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refreshSnippet() {
  pending.value = true
  try {
    data.value = await apiFetch<Snippet>(`/api/agency/tracking/${props.siteId}/snippet`)
  } catch {
    data.value = null
  } finally {
    pending.value = false
  }
}

async function refreshStatus() {
  statusState.value = 'pending'
  try {
    status.value = await apiFetch<Status>(`/api/agency/tracking/${props.siteId}/status`)
    statusState.value = 'success'
  } catch {
    status.value = null
    statusState.value = 'error'
  }
}

await Promise.all([refreshSnippet(), refreshStatus()])
watch(() => props.siteId, () => {
  void refreshSnippet()
  void refreshStatus()
})

const toast = useToast()
const copied = ref<string | null>(null)
let resetTimer: ReturnType<typeof setTimeout> | null = null

async function copy(which: string, value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = which
    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = setTimeout(() => (copied.value = null), 2000)
    toast.add({ title: 'Copied to clipboard', color: 'success' })
  } catch {
    toast.add({ title: 'Copy failed', description: 'Select the text and copy manually.', color: 'error' })
  }
}

function rel(iso: string | null): string {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Ready-to-forward message for a client's web team / third-party developer.
const devMessage = computed(() => {
  if (!data.value) return ''
  const site = data.value.name || 'your website'
  return `Hi,

Please add our website analytics tag to ${site}. It's a single lightweight script — no cookies by default and privacy-friendly.

Option A — paste this just before the closing </head> tag, on every page:

${data.value.raw}

Option B — if you use Google Tag Manager: add a new Custom HTML tag with the snippet above, trigger = All Pages (Window Loaded).

Once it's live we'll start receiving data automatically. Any questions, just reply here.

Thanks!`
})

const mailtoHref = computed(() => {
  const subject = `Install analytics tag${data.value?.name ? ` on ${data.value.name}` : ''}`
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(devMessage.value)}`
})

// Platform-specific install guidance.
const guideItems = [
  {
    label: 'Google Tag Manager',
    icon: 'i-lucide-container',
    steps: [
      'In GTM: Tags → New → Tag Configuration → Custom HTML.',
      'Paste the install snippet above into the HTML box.',
      'Triggering → choose All Pages (or a Window Loaded trigger).',
      'Save, then Submit / Publish the container.'
    ]
  },
  {
    label: 'WordPress',
    icon: 'i-lucide-square-code',
    steps: [
      'Easiest: install a "header scripts" plugin (e.g. WPCode or Insert Headers and Footers).',
      'Paste the snippet into the "Header" / <head> section and save.',
      'Or, in a child theme, add it to header.php just before </head>.'
    ]
  },
  {
    label: 'Shopify',
    icon: 'i-lucide-shopping-bag',
    steps: [
      'Online Store → Themes → ⋯ → Edit code.',
      'Open layout/theme.liquid and paste the snippet just before </head>.',
      'Save. (Applies across the storefront automatically.)'
    ]
  },
  {
    label: 'Webflow / Framer / Wix',
    icon: 'i-lucide-layout-template',
    steps: [
      'Open Site/Project Settings → Custom Code (or "Head code").',
      'Paste the snippet into the Head / <head> field.',
      'Save and publish the site.'
    ]
  },
  {
    label: 'Raw HTML / other',
    icon: 'i-lucide-code',
    steps: [
      'Paste the snippet just before the closing </head> tag.',
      'It must be on every page you want measured (usually a shared layout/template).',
      'No other setup — it loads asynchronously and won\'t block the page.'
    ]
  }
]
</script>

<template>
  <div class="space-y-6">
    <div v-if="pending" class="flex items-center gap-2 text-sm text-muted py-8 justify-center">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
      Loading snippet…
    </div>

    <template v-else-if="data">
      <!-- Install status -->
      <div
        class="flex items-center gap-3 rounded-lg border p-3"
        :class="status?.installed ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'"
      >
        <span class="relative flex size-2.5 shrink-0">
          <span
            v-if="status?.installed"
            class="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60"
          />
          <span class="relative inline-flex size-2.5 rounded-full" :class="status?.installed ? 'bg-success' : 'bg-warning'" />
        </span>
        <div class="flex-1 min-w-0 text-sm">
          <p class="font-medium">
            {{ status?.installed ? 'Receiving events' : 'Awaiting first event' }}
          </p>
          <p class="text-xs text-muted">
            <template v-if="status?.installed">
              Last seen {{ rel(status.lastEventAt) }} · {{ status.last24h }} in the last 24h. The tag is live.
            </template>
            <template v-else>
              No data yet — the tag hasn’t been detected. Install it (or send it on), then re-check.
            </template>
          </p>
        </div>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          :loading="statusState === 'pending'"
          label="Re-check"
          @click="refreshStatus()"
        />
      </div>

      <!-- Install snippet -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium">
            Install snippet
          </p>
          <UButton
            size="xs"
            :color="copied === 'raw' ? 'success' : 'neutral'"
            variant="soft"
            :icon="copied === 'raw' ? 'i-lucide-check' : 'i-lucide-copy'"
            :label="copied === 'raw' ? 'Copied' : 'Copy'"
            @click="copy('raw', data.raw)"
          />
        </div>
        <pre class="text-xs font-mono bg-elevated border border-default rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{{ data.raw }}</pre>
        <p class="text-xs text-muted">
          Paste once, just before the closing <code class="text-[0.7rem]">&lt;/head&gt;</code> tag, on every page.
          <span v-if="data.spa">This site is in SPA mode — it also tracks client-side route changes.</span>
        </p>
      </div>

      <!-- Managed Google Tag Manager installation -->
      <TrackingGtmManager :site-id="siteId" />

      <!-- Send to a developer / third party -->
      <div class="space-y-2 rounded-lg border border-default p-3">
        <div class="flex items-center justify-between gap-2">
          <div>
            <p class="text-sm font-medium flex items-center gap-1.5">
              <UIcon name="i-lucide-send" class="size-3.5 text-primary" />
              Send to your developer
            </p>
            <p class="text-xs text-muted">
              A ready-to-forward message — no need to explain the snippet yourself.
            </p>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <UButton
              size="xs"
              :color="copied === 'msg' ? 'success' : 'neutral'"
              variant="soft"
              :icon="copied === 'msg' ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="copied === 'msg' ? 'Copied' : 'Copy'"
              @click="copy('msg', devMessage)"
            />
            <UButton
              size="xs"
              color="primary"
              variant="soft"
              icon="i-lucide-mail"
              label="Email"
              :to="mailtoHref"
              external
            />
          </div>
        </div>
        <pre class="text-xs bg-elevated border border-default rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{{ devMessage }}</pre>
      </div>

      <!-- Platform install guides -->
      <div class="space-y-2">
        <p class="text-sm font-medium">
          Step-by-step by platform
        </p>
        <UAccordion :items="guideItems">
          <template #content="{ item }">
            <ol class="text-sm text-muted list-decimal pl-5 space-y-1 pb-3">
              <li v-for="(step, i) in (item as { steps: string[] }).steps" :key="i">
                {{ step }}
              </li>
            </ol>
          </template>
        </UAccordion>
      </div>
    </template>
  </div>
</template>
