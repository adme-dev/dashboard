<script setup lang="ts">
const props = defineProps<{ name: string, kind: 'Layer' | 'Group', disabled?: boolean }>()
const emit = defineEmits<{ rename: [value: string] }>()
const editing = ref(false)
const draft = ref('')
const input = ref<{ inputRef?: HTMLInputElement }>()
let previousTap = 0

async function edit() {
  if (props.disabled || editing.value) return
  draft.value = props.name
  editing.value = true
  await nextTick()
  input.value?.inputRef?.focus()
  input.value?.inputRef?.select()
}
function finish() {
  if (!editing.value) return
  editing.value = false
  const value = draft.value.trim()
  if (!props.disabled && value && value !== props.name) emit('rename', value)
}
function tap(event: PointerEvent) {
  if (event.pointerType !== 'touch') return
  if (previousTap && event.timeStamp - previousTap < 450) {
    previousTap = 0
    void edit()
  } else previousTap = event.timeStamp
}
</script>

<template>
  <span class="block min-w-0">
    <UFormField
      v-if="editing"
      :label="`${kind} name`"
      :ui="{ label: 'sr-only' }"
      @click.stop
    >
      <UInput
        ref="input"
        v-model="draft"
        size="xs"
        class="w-full"
        :aria-label="`${kind} name`"
        @keydown.stop
        @keydown.enter.prevent="finish"
        @keydown.esc.prevent="editing = false"
        @blur="finish"
      />
    </UFormField>
    <span
      v-else
      role="button"
      tabindex="0"
      class="block truncate touch-manipulation"
      :aria-label="`${kind} name: ${name}`"
      :title="disabled ? name : `Double-click to rename ${name}`"
      @dblclick.stop="edit"
      @pointerup="tap"
      @keydown.f2.stop.prevent="edit"
      @keydown.enter.stop.prevent="edit"
    >{{ name }}</span>
  </span>
</template>
