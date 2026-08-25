<script setup lang="ts">
import { QR_TEMPLATES } from '~~/shared/qr/templates'
import { QR_PATTERNS, QR_EYES, type QrStyle } from '~~/shared/qr/style'

const model = defineModel<QrStyle>({ required: true })
const emit = defineEmits<{ (e: 'upload-logo', file: File): void }>()

const SAMPLE = 'https://app.xeroflow.io/q/AbC1234'
const patternLabel: Record<string, string> = { classic: 'Classic', rounded: 'Rounded', thin: 'Thin', smooth: 'Smooth', circles: 'Dots' }
const eyeLabel: Record<string, string> = { square: 'Square', rounded: 'Rounded', circle: 'Circle' }
const logoInput = ref<HTMLInputElement>()

// A template is "active" when every non-logo field matches — lets the user see which preset they started from.
const activeTemplate = computed(() => QR_TEMPLATES.find(t =>
  t.style.pattern === model.value.pattern
  && t.style.eye === model.value.eye
  && t.style.fg === model.value.fg
  && t.style.bg === model.value.bg
  && (t.style.eyeFg ?? null) === (model.value.eyeFg ?? null)
)?.key ?? null)

function applyTemplate(style: QrStyle) {
  model.value = { ...style, logo: model.value.logo }
}
function onLogo(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (f) emit('upload-logo', f)
  input.value = ''
}
const optionClass = (active: boolean) => [
  'rounded-lg p-1.5 text-center ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
  active ? 'ring-2 ring-primary bg-primary/5' : 'ring-default hover:ring-accented'
]
</script>

<template>
  <div class="space-y-7">
    <section>
      <h4 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        Start from a template
      </h4>
      <div class="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <button
          v-for="t in QR_TEMPLATES"
          :key="t.key"
          type="button"
          :class="optionClass(activeTemplate === t.key)"
          @click="applyTemplate(t.style)"
        >
          <QrPreview
            :text="SAMPLE"
            :style="t.style"
            :size="64"
            fluid
            class="mx-auto"
          />
          <span class="mt-1.5 block truncate text-[11px] text-muted">{{ t.label }}</span>
        </button>
      </div>
    </section>

    <section>
      <h4 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        Module shape
      </h4>
      <div class="grid grid-cols-5 gap-3">
        <button
          v-for="p in QR_PATTERNS"
          :key="p"
          type="button"
          :class="optionClass(model.pattern === p)"
          @click="() => { model = { ...model, pattern: p } }"
        >
          <QrPreview
            :text="SAMPLE"
            :style="{ ...model, pattern: p, logo: undefined }"
            :size="56"
            fluid
            class="mx-auto"
          />
          <span class="mt-1.5 block text-[11px] text-muted">{{ patternLabel[p] }}</span>
        </button>
      </div>
    </section>

    <section>
      <h4 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        Corner markers
      </h4>
      <div class="grid max-w-xs grid-cols-3 gap-3">
        <button
          v-for="e in QR_EYES"
          :key="e"
          type="button"
          :class="optionClass(model.eye === e)"
          @click="() => { model = { ...model, eye: e } }"
        >
          <QrPreview
            :text="SAMPLE"
            :style="{ ...model, eye: e, logo: undefined }"
            :size="56"
            fluid
            class="mx-auto"
          />
          <span class="mt-1.5 block text-[11px] text-muted">{{ eyeLabel[e] }}</span>
        </button>
      </div>
    </section>

    <section>
      <h4 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        Colours
      </h4>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <QrColorField :model-value="model.fg" label="Modules" @update:model-value="(v: string) => model = { ...model, fg: v }" />
        <QrColorField :model-value="model.bg" label="Background" @update:model-value="(v: string) => model = { ...model, bg: v }" />
        <QrColorField
          :model-value="model.eyeFg ?? model.fg"
          label="Corner markers"
          :help="model.eyeFg ? undefined : 'Same as modules'"
          :inherit="{ label: 'Match modules', value: model.fg }"
          @update:model-value="(v: string) => model = { ...model, eyeFg: v }"
          @clear="() => model = { ...model, eyeFg: undefined }"
        />
      </div>
      <p class="mt-2 text-xs text-muted">
        Keep modules darker than the background — low contrast codes fail to scan in print.
      </p>
    </section>

    <section>
      <h4 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        Logo
      </h4>
      <div class="flex items-center gap-3">
        <input
          ref="logoInput"
          type="file"
          accept="image/png,image/svg+xml"
          class="hidden"
          @change="onLogo"
        >
        <div v-if="model.logo" class="size-10 shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-default">
          <img :src="model.logo.dataUri" alt="" class="size-full object-contain p-1">
        </div>
        <UButton
          size="sm"
          variant="soft"
          icon="i-lucide-image-plus"
          @click="logoInput?.click()"
        >
          {{ model.logo ? 'Replace logo' : 'Add logo' }}
        </UButton>
        <UButton
          v-if="model.logo"
          size="sm"
          variant="ghost"
          color="neutral"
          icon="i-lucide-x"
          @click="() => { model = { ...model, logo: undefined } }"
        >
          Remove
        </UButton>
        <span v-else class="text-xs text-muted">PNG or SVG, centred over the code</span>
      </div>
      <UFormField v-if="model.logo" :label="`Logo size · ${model.logo.sizePct}%`" class="mt-4 max-w-xs">
        <USlider
          :model-value="model.logo.sizePct"
          :min="10"
          :max="25"
          :step="1"
          @update:model-value="(v: number) => model = { ...model, logo: { ...model.logo!, sizePct: v } }"
        />
      </UFormField>
    </section>
  </div>
</template>
