<script setup lang="ts">
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'

const props = withDefaults(defineProps<{
  modelValue: string
  language: 'html' | 'css' | 'javascript'
  readonly?: boolean
  height?: string
}>(), {
  readonly: false,
  height: '100%',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const container = ref<HTMLElement | null>(null)
let view: EditorView | null = null
let suppressUpdate = false

const langExtension = computed(() => {
  switch (props.language) {
    case 'html': return html()
    case 'css': return css()
    case 'javascript': return javascript()
  }
})

onMounted(() => {
  if (!container.value) return

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged && !suppressUpdate) {
      emit('update:modelValue', update.state.doc.toString())
    }
  })

  const state = EditorState.create({
    doc: props.modelValue || '',
    extensions: [
      basicSetup,
      langExtension.value,
      oneDark,
      updateListener,
      EditorView.editable.of(!props.readonly),
      EditorState.readOnly.of(props.readonly),
      EditorView.theme({
        '&': { height: props.height },
        '.cm-scroller': { overflow: 'auto' },
      }),
    ],
  })

  view = new EditorView({
    state,
    parent: container.value,
  })
})

watch(() => props.modelValue, (newVal) => {
  if (!view) return
  const current = view.state.doc.toString()
  if (current !== newVal) {
    suppressUpdate = true
    view.dispatch({
      changes: { from: 0, to: current.length, insert: newVal || '' },
    })
    suppressUpdate = false
  }
})

onUnmounted(() => {
  view?.destroy()
  view = null
})
</script>

<template>
  <div ref="container" class="code-editor-wrapper" />
</template>

<style scoped>
.code-editor-wrapper {
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--ui-border);
}

.code-editor-wrapper :deep(.cm-editor) {
  font-size: 13px;
}

.code-editor-wrapper :deep(.cm-gutters) {
  border-right: 1px solid var(--ui-border);
}
</style>
