<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { annotateHtmlEditables, getHtmlEditableSelection, updateHtmlEditable, type EdmHtmlEditableSelection } from '~~/app/utils/edmHtmlEditables'

const props = defineProps<{ contents: string, editable?: boolean, selectedId?: string | null }>()
const emit = defineEmits<{
  'update:contents': [html: string]
  'select': [selection: EdmHtmlEditableSelection]
  'request-image': [selection: EdmHtmlEditableSelection]
}>()
const frame = ref<HTMLIFrameElement | null>(null)
const height = ref(600)
let dispose: (() => void) | undefined
const srcdoc = computed(() => {
  const source = props.editable ? annotateHtmlEditables(props.contents, { editable: true }) : props.contents
  // Scripts/forms/navigation never acquire the application's authority, even if
  // a historical document bypassed the current import sanitizer. same-origin is
  // solely for the parent's selection/resize handlers; scripts remain disabled.
  const parsed = new DOMParser().parseFromString(source, 'text/html')
  parsed.querySelectorAll('script, iframe, object, embed, form, input, button, select, textarea, base, meta[http-equiv]').forEach(element => element.remove())
  const policy = parsed.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content = 'default-src \'none\'; script-src \'none\'; connect-src \'none\'; img-src https:; style-src \'unsafe-inline\' https://fonts.googleapis.com; font-src https:; frame-src \'none\'; form-action \'none\'; base-uri \'none\''
  parsed.head.prepend(policy)
  return '<!DOCTYPE html>\n' + parsed.documentElement.outerHTML
})
function highlightSelection() {
  const doc = frame.value?.contentDocument
  doc?.querySelectorAll('[data-edm-html-editable-id]').forEach((element) => {
    element.classList.toggle('is-selected', element.getAttribute('data-edm-html-editable-id') === props.selectedId)
  })
}
watch(() => props.selectedId, highlightSelection)
function loaded() {
  dispose?.()
  const doc = frame.value?.contentDocument
  const win = frame.value?.contentWindow
  if (!doc?.body || !win) return
  const resize = () => {
    const bottom = Math.max(0, ...Array.from(doc.body.children).map(element => element.getBoundingClientRect().bottom))
    const margin = Number.parseFloat(win.getComputedStyle(doc.body).marginBottom) || 0
    height.value = Math.max(40, Math.min(120000, Math.ceil(bottom + margin)))
  }
  const target = (event: Event) => (event.target as Element | null)?.closest?.('[data-edm-html-editable-id]') as HTMLElement | null
  const select = (event: Event, image = false) => {
    const element = target(event)
    if (!element) return
    const selection = getHtmlEditableSelection(props.contents, element.dataset.edmHtmlEditableId || '')
    if (!selection) return
    emit('select', selection)
    if (image && selection.kind === 'image') emit('request-image', selection)
  }
  const click = (event: MouseEvent) => {
    // Preview and editor links never navigate or activate provider click URLs.
    if ((event.target as Element | null)?.closest?.('a')) event.preventDefault()
    if (props.editable) select(event)
  }
  const context = (event: MouseEvent) => {
    if (!props.editable) return
    event.preventDefault()
    select(event, true)
  }
  const blur = (event: FocusEvent) => {
    const element = target(event)
    const kind = element?.dataset.edmHtmlEditableKind
    if (!props.editable || !element || (kind !== 'text' && kind !== 'link')) return
    const next = updateHtmlEditable(props.contents, element.dataset.edmHtmlEditableId || '', { kind, html: element.innerHTML })
    if (next !== props.contents) emit('update:contents', next)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(doc.body)
  doc.addEventListener('click', click)
  doc.addEventListener('auxclick', click)
  doc.addEventListener('contextmenu', context)
  doc.addEventListener('blur', blur, true)
  doc.fonts?.ready.then(resize).catch(() => {})
  resize()
  highlightSelection()
  dispose = () => {
    observer.disconnect()
    doc.removeEventListener('click', click)
    doc.removeEventListener('auxclick', click)
    doc.removeEventListener('contextmenu', context)
    doc.removeEventListener('blur', blur, true)
  }
}
onBeforeUnmount(() => dispose?.())
</script>

<template>
  <iframe
    ref="frame"
    title="Imported email document"
    sandbox="allow-same-origin"
    referrerpolicy="no-referrer"
    :srcdoc="srcdoc"
    :style="{ height: height + 'px', width: '100%', border: 0, display: 'block' }"
    @load="loaded"
  />
</template>
