<script setup lang="ts">
/**
 * Swatch + hex picker for QR colours. Replaces the browser-native <input type="color">
 * (unstyled, tiny, no dark-mode) with a UPopover of preset swatches and a hex field.
 */
const props = withDefaults(defineProps<{
  modelValue: string
  label: string
  help?: string
  /** Shown as "Same as foreground"-style reset when the value is optional. */
  inherit?: { label: string, value: string } | null
}>(), { help: undefined, inherit: null })
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void, (e: 'clear'): void }>()

const HEX = /^#[0-9a-fA-F]{6}$/
const PRESETS = [
  '#000000', '#121317', '#1f2937', '#374151', '#ffffff',
  '#1877f2', '#0a66c2', '#0f766e', '#15803d', '#ca8a04',
  '#ea580c', '#dc2626', '#c13584', '#833ab4', '#4f46e5'
]

const open = ref(false)
const draft = ref(props.modelValue)
watch(() => props.modelValue, (v) => {
  draft.value = v
})
const draftValid = computed(() => HEX.test(draft.value))

function pick(hex: string) {
  emit('update:modelValue', hex)
  open.value = false
}
function commitDraft() {
  let v = draft.value.trim()
  if (!v.startsWith('#')) v = `#${v}`
  if (/^#[0-9a-fA-F]{3}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  if (HEX.test(v)) pick(v.toLowerCase())
}
</script>

<template>
  <UFormField :label="label" :help="help">
    <UPopover v-model:open="open">
      <button
        type="button"
        class="flex w-full items-center gap-2.5 rounded-md ring-1 ring-default bg-default px-2.5 py-1.5 text-sm hover:ring-accented focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span class="size-5 shrink-0 rounded-sm ring-1 ring-inset ring-black/10" :style="{ background: modelValue }" />
        <span class="font-mono text-xs uppercase tracking-wide">{{ modelValue }}</span>
        <UIcon name="i-lucide-chevron-down" class="ml-auto size-4 text-muted" />
      </button>
      <template #content>
        <div class="w-56 space-y-3 p-3">
          <div class="grid grid-cols-5 gap-2">
            <button
              v-for="c in PRESETS"
              :key="c"
              type="button"
              class="size-8 rounded-md ring-1 ring-inset ring-black/10 transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              :class="c === modelValue ? 'outline outline-2 outline-offset-2 outline-primary' : ''"
              :style="{ background: c }"
              :aria-label="c"
              @click="pick(c)"
            />
          </div>
          <UFormField :error="draft && !draftValid ? 'Use a 6-digit hex like #1877f2' : undefined">
            <UInput
              v-model="draft"
              size="sm"
              class="w-full font-mono"
              placeholder="#000000"
              maxlength="7"
              @keydown.enter.prevent="commitDraft"
              @blur="commitDraft"
            />
          </UFormField>
          <UButton
            v-if="inherit"
            size="xs"
            variant="ghost"
            color="neutral"
            block
            icon="i-lucide-rotate-ccw"
            @click="() => { emit('clear'); open = false }"
          >
            {{ inherit.label }}
          </UButton>
        </div>
      </template>
    </UPopover>
  </UFormField>
</template>
