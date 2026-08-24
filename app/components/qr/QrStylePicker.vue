<script setup lang="ts">
import { QR_TEMPLATES } from '~~/shared/qr/templates'
import { QR_PATTERNS, QR_EYES, type QrStyle } from '~~/shared/qr/style'

const model = defineModel<QrStyle>({ required: true })
const emit = defineEmits<{ (e: 'upload-logo', file: File): void }>()

const SAMPLE = 'https://app.xeroflow.io/q/AbC1234'
const patternLabel: Record<string, string> = { classic: 'Classic', rounded: 'Rounded', thin: 'Thin', smooth: 'Smooth', circles: 'Circles' }
const eyeLabel: Record<string, string> = { square: 'Square', rounded: 'Rounded', circle: 'Circle' }
const logoInput = ref<HTMLInputElement>()

function applyTemplate(style: QrStyle) {
  model.value = { ...style, logo: model.value.logo }
}
function onLogo(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) emit('upload-logo', f)
}
</script>

<template>
  <div class="space-y-6">
    <section>
      <h4 class="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Templates</h4>
      <div class="flex gap-3 overflow-x-auto pb-1">
        <button
          v-for="t in QR_TEMPLATES"
          :key="t.key"
          type="button"
          class="shrink-0 rounded-lg ring-1 ring-default p-1.5 hover:ring-primary focus-visible:ring-primary"
          :title="t.label"
          @click="applyTemplate(t.style)"
        >
          <QrPreview :text="SAMPLE" :style="t.style" :size="64" />
        </button>
      </div>
    </section>

    <section>
      <h4 class="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Pattern and style</h4>
      <div class="grid grid-cols-5 gap-3">
        <button
          v-for="p in QR_PATTERNS"
          :key="p"
          type="button"
          class="rounded-lg ring-1 p-1.5 text-center"
          :class="model.pattern === p ? 'ring-2 ring-primary' : 'ring-default hover:ring-accented'"
          @click="() => { model = { ...model, pattern: p } }"
        >
          <QrPreview :text="SAMPLE" :style="{ ...model, pattern: p, logo: undefined }" :size="56" />
          <span class="block mt-1 text-[11px] text-muted">{{ patternLabel[p] }}</span>
        </button>
      </div>
    </section>

    <section>
      <h4 class="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Corners</h4>
      <div class="grid grid-cols-3 gap-3 max-w-xs">
        <button
          v-for="e in QR_EYES"
          :key="e"
          type="button"
          class="rounded-lg ring-1 p-1.5 text-center"
          :class="model.eye === e ? 'ring-2 ring-primary' : 'ring-default hover:ring-accented'"
          @click="() => { model = { ...model, eye: e } }"
        >
          <QrPreview :text="SAMPLE" :style="{ ...model, eye: e, logo: undefined }" :size="56" />
          <span class="block mt-1 text-[11px] text-muted">{{ eyeLabel[e] }}</span>
        </button>
      </div>
    </section>

    <section class="grid grid-cols-3 gap-4">
      <UFormField label="Foreground"><UInput v-model="model.fg" type="color" /></UFormField>
      <UFormField label="Background"><UInput v-model="model.bg" type="color" /></UFormField>
      <UFormField label="Corners" help="Blank = same as foreground">
        <UInput :model-value="model.eyeFg ?? model.fg" type="color" @update:model-value="(v: string) => model = { ...model, eyeFg: v }" />
      </UFormField>
    </section>

    <section>
      <h4 class="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Logo</h4>
      <div class="flex items-center gap-3">
        <input ref="logoInput" type="file" accept="image/png,image/svg+xml" class="hidden" @change="onLogo">
        <UButton size="sm" variant="soft" icon="i-lucide-image-plus" @click="logoInput?.click()">{{ model.logo ? 'Replace logo' : 'Add logo' }}</UButton>
        <UButton v-if="model.logo" size="sm" variant="ghost" color="neutral" icon="i-lucide-x" @click="() => { model = { ...model, logo: undefined } }">Remove</UButton>
      </div>
      <UFormField v-if="model.logo" label="Logo size" class="mt-3 max-w-xs">
        <USlider :model-value="model.logo.sizePct" :min="10" :max="25" :step="1" @update:model-value="(v: number) => model = { ...model, logo: { ...model.logo!, sizePct: v } }" />
      </UFormField>
    </section>
  </div>
</template>
