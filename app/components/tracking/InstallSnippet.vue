<script setup lang="ts">
const props = defineProps<{ siteId: string }>()

const { data, pending } = await useFetch<{ writeKey: string, raw: string, gtm: string }>(
  () => `/api/agency/tracking/${props.siteId}/snippet`
)

const toast = useToast()
const copied = ref<'raw' | 'gtm' | null>(null)
let resetTimer: ReturnType<typeof setTimeout> | null = null

async function copy(which: 'raw' | 'gtm', value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = which
    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = setTimeout(() => { copied.value = null }, 2000)
    toast.add({ title: 'Copied to clipboard', color: 'success' })
  } catch {
    toast.add({ title: 'Copy failed', description: 'Select the snippet and copy manually.', color: 'error' })
  }
}
</script>

<template>
  <div class="space-y-5">
    <div v-if="pending" class="flex items-center gap-2 text-sm text-muted py-8 justify-center">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
      Loading snippet…
    </div>

    <template v-else-if="data">
      <!-- Raw script tag -->
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
          Paste into the site <code class="text-[0.7rem]">&lt;head&gt;</code>, or use the GTM method below.
        </p>
      </div>

      <!-- GTM instructions -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium">
            Google Tag Manager
          </p>
          <UButton
            size="xs"
            :color="copied === 'gtm' ? 'success' : 'neutral'"
            variant="soft"
            :icon="copied === 'gtm' ? 'i-lucide-check' : 'i-lucide-copy'"
            :label="copied === 'gtm' ? 'Copied' : 'Copy'"
            @click="copy('gtm', data.gtm)"
          />
        </div>
        <pre class="text-xs font-mono bg-elevated border border-default rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{{ data.gtm }}</pre>
      </div>

      <UAlert
        icon="i-lucide-info"
        color="neutral"
        variant="soft"
        title="Per-site method"
        description="kia.gws → raw or GTM, SPA off · kevindennisvw / ferntreegully → GTM, SPA on."
      />
    </template>
  </div>
</template>
