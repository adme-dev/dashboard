<script setup lang="ts">
// Client-only QR generator — encoding happens entirely in the browser; the
// content never leaves the page. Used by the agency tools page and (flag-gated)
// the client portal.
import { computed, ref, watch } from 'vue'
import QRCode from 'qrcode'

const props = withDefaults(defineProps<{
  /** Optional preset links offered above the free-text field. */
  presets?: Array<{ label: string; value: string }>
}>(), { presets: () => [] })

const content = ref('')
const level = ref<'L' | 'M' | 'Q' | 'H'>('M')
const size = ref(512)
const dark = ref('#111111')
const light = ref('#ffffff')
const svg = ref('')
const generateError = ref<string | null>(null)
const toast = useToast()

const LEVELS = [
  { label: 'L · smallest', value: 'L' },
  { label: 'M · balanced', value: 'M' },
  { label: 'Q · robust', value: 'Q' },
  { label: 'H · print-safe', value: 'H' },
]
const SIZES = [
  { label: '256 px', value: 256 },
  { label: '512 px', value: 512 },
  { label: '1024 px', value: 1024 },
  { label: '2048 px', value: 2048 },
]

const fileStem = computed(() => {
  const stem = content.value.replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return stem || 'qr-code'
})

watch([content, level, dark, light], async () => {
  generateError.value = null
  if (!content.value.trim()) { svg.value = ''; return }
  try {
    svg.value = await QRCode.toString(content.value, {
      type: 'svg',
      errorCorrectionLevel: level.value,
      margin: 2,
      color: { dark: dark.value, light: light.value },
    })
  } catch (e: unknown) {
    svg.value = ''
    generateError.value = e instanceof Error ? e.message : 'Could not encode this content'
  }
}, { immediate: true })

function downloadSvg() {
  const blob = new Blob([svg.value], { type: 'image/svg+xml' })
  triggerDownload(URL.createObjectURL(blob), `${fileStem.value}.svg`)
}

async function downloadPng() {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, content.value, {
    errorCorrectionLevel: level.value,
    margin: 2,
    width: size.value,
    color: { dark: dark.value, light: light.value },
  })
  triggerDownload(canvas.toDataURL('image/png'), `${fileStem.value}.png`)
}

function triggerDownload(href: string, name: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.click()
  if (href.startsWith('blob:')) URL.revokeObjectURL(href)
}

async function copyPng() {
  try {
    const canvas = document.createElement('canvas')
    await QRCode.toCanvas(canvas, content.value, {
      errorCorrectionLevel: level.value, margin: 2, width: size.value,
      color: { dark: dark.value, light: light.value },
    })
    const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('no blob')), 'image/png'))
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    toast.add({ title: 'QR code copied', color: 'success' })
  } catch {
    toast.add({ title: 'Could not copy — download instead', color: 'error' })
  }
}
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
    <div class="space-y-4">
      <div v-if="props.presets.length" class="flex flex-wrap gap-1.5">
        <UButton
          v-for="preset in props.presets"
          :key="preset.label"
          size="xs"
          variant="soft"
          color="neutral"
          :label="preset.label"
          @click="content = preset.value"
        />
      </div>

      <UFormField label="Content" help="A link or any text. Encoded in your browser — nothing is sent to a server.">
        <UTextarea v-model="content" :rows="4" autofocus placeholder="https://…" class="w-full" />
      </UFormField>

      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Error correction" help="Higher survives damage/logos; more dense.">
          <USelect v-model="level" :items="LEVELS" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="PNG size">
          <USelect v-model="size" :items="SIZES" value-key="value" class="w-full" />
        </UFormField>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Foreground">
          <UInput v-model="dark" type="color" class="w-full" aria-label="Foreground colour" />
        </UFormField>
        <UFormField label="Background">
          <UInput v-model="light" type="color" class="w-full" aria-label="Background colour" />
        </UFormField>
      </div>

      <UAlert v-if="generateError" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="generateError" />
    </div>

    <div class="flex flex-col items-center gap-3">
      <div
        class="flex aspect-square w-full max-w-[320px] items-center justify-center overflow-hidden rounded-lg border border-default bg-white p-3"
        data-testid="qr-preview"
      >
        <!-- eslint-disable-next-line vue/no-v-html — SVG is generated locally by the qrcode library from user-typed text; it contains no markup from the input. -->
        <div v-if="svg" class="size-full [&>svg]:size-full" v-html="svg" />
        <div v-else class="text-center text-muted">
          <UIcon name="i-lucide-qr-code" class="mx-auto size-8" />
          <p class="mt-2 text-xs">Type content to generate</p>
        </div>
      </div>
      <div class="flex flex-wrap justify-center gap-2">
        <UButton icon="i-lucide-download" size="sm" color="primary" label="PNG" :disabled="!svg" @click="downloadPng" />
        <UButton icon="i-lucide-download" size="sm" variant="soft" color="neutral" label="SVG" :disabled="!svg" @click="downloadSvg" />
        <UButton icon="i-lucide-copy" size="sm" variant="ghost" color="neutral" label="Copy" :disabled="!svg" @click="copyPng" />
      </div>
    </div>
  </div>
</template>
