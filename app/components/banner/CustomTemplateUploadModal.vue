<script setup lang="ts">
import { extractVariableNames } from '~/utils/custom-banner-builder'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [val: boolean]
  'uploaded': []
}>()

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>
const saving = ref(false)

const form = reactive({
  name: '',
  category: 'brand-corporate',
  description: '',
  tags: '',
  width: 300,
  height: 250,
  html: '',
  css: '',
  js: '',
  externalScripts: [''],
  externalStyles: [''],
  variables: [] as { name: string; label: string; type: string; default: string }[],
})

const categoryOptions = [
  { label: 'Event & Entertainment', value: 'event-entertainment' },
  { label: 'Product & E-commerce', value: 'product-ecommerce' },
  { label: 'Brand & Corporate', value: 'brand-corporate' },
  { label: 'Social & Lifestyle', value: 'social-lifestyle' },
  { label: 'Typography & Kinetic', value: 'typography-kinetic' },
  { label: 'Abstract & Artistic', value: 'abstract-artistic' },
]

const typeOptions = [
  { label: 'Text', value: 'text' },
  { label: 'Color', value: 'color' },
  { label: 'URL', value: 'url' },
  { label: 'Number', value: 'number' },
]

function autoDetectVariables() {
  const names = extractVariableNames(form.html, form.css, form.js)
  const existingMap = new Map(form.variables.map(v => [v.name, v]))

  form.variables = names.map(name => {
    if (existingMap.has(name)) return existingMap.get(name)!
    return {
      name,
      label: name.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' '),
      type: 'text',
      default: '',
    }
  })

  toast.add({ title: 'Variables detected', description: `Found ${names.length} variable(s)`, color: 'success' })
}

function addScript() { form.externalScripts.push('') }
function removeScript(i: number) { form.externalScripts.splice(i, 1) }
function addStyle() { form.externalStyles.push('') }
function removeStyle(i: number) { form.externalStyles.splice(i, 1) }

function addVariable() {
  form.variables.push({ name: '', label: '', type: 'text', default: '' })
}
function removeVariable(i: number) { form.variables.splice(i, 1) }

async function save() {
  if (!form.name.trim() || !form.html.trim()) {
    toast.add({ title: 'Error', description: 'Name and HTML are required', color: 'error' })
    return
  }

  saving.value = true
  try {
    await apiFetch('/api/agency/banner-studio/custom-templates', {
      method: 'POST',
      body: {
        name: form.name.trim(),
        category: form.category,
        description: form.description.trim() || null,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        width: form.width,
        height: form.height,
        html: form.html,
        css: form.css,
        js: form.js,
        externalScripts: form.externalScripts.filter(u => u.trim()),
        externalStyles: form.externalStyles.filter(u => u.trim()),
        variables: form.variables.filter(v => v.name.trim()),
      },
    })
    toast.add({ title: 'Template created', color: 'success' })
    emit('uploaded')
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to create template', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal :open="open" @update:open="emit('update:open', $event)">
    <template #content>
      <div class="p-5 max-h-[80vh] overflow-y-auto">
        <h2 class="text-lg font-semibold mb-4">Upload Custom HTML Template</h2>

        <!-- Name + Category -->
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label class="text-sm font-medium text-muted mb-1 block">Name *</label>
            <UInput v-model="form.name" placeholder="My Banner Template" />
          </div>
          <div>
            <label class="text-sm font-medium text-muted mb-1 block">Category</label>
            <USelect v-model="form.category" :items="categoryOptions" />
          </div>
        </div>

        <!-- Description -->
        <div class="mb-4">
          <label class="text-sm font-medium text-muted mb-1 block">Description</label>
          <UTextarea v-model="form.description" placeholder="What this template does..." :rows="2" />
        </div>

        <!-- Tags + Dimensions -->
        <div class="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label class="text-sm font-medium text-muted mb-1 block">Tags (comma-sep)</label>
            <UInput v-model="form.tags" placeholder="gsap, animation" />
          </div>
          <div>
            <label class="text-sm font-medium text-muted mb-1 block">Width</label>
            <UInput v-model.number="form.width" type="number" />
          </div>
          <div>
            <label class="text-sm font-medium text-muted mb-1 block">Height</label>
            <UInput v-model.number="form.height" type="number" />
          </div>
        </div>

        <!-- Code Sections -->
        <div class="mb-4">
          <label class="text-sm font-medium text-muted mb-1 block">HTML *</label>
          <UTextarea v-model="form.html" placeholder="<div class='ad'>...</div>" :rows="6" class="font-mono text-xs" />
        </div>
        <div class="mb-4">
          <label class="text-sm font-medium text-muted mb-1 block">CSS</label>
          <UTextarea v-model="form.css" placeholder=".ad { ... }" :rows="5" class="font-mono text-xs" />
        </div>
        <div class="mb-4">
          <label class="text-sm font-medium text-muted mb-1 block">JavaScript</label>
          <UTextarea v-model="form.js" placeholder="gsap.from('.element', { ... })" :rows="5" class="font-mono text-xs" />
        </div>

        <!-- External Scripts -->
        <div class="mb-4">
          <div class="flex items-center justify-between mb-1">
            <label class="text-sm font-medium text-muted">External Scripts (HTTPS)</label>
            <UButton icon="i-lucide-plus" size="xs" variant="ghost" @click="addScript" />
          </div>
          <div v-for="(_, i) in form.externalScripts" :key="i" class="flex gap-2 mb-1">
            <UInput v-model="form.externalScripts[i]" placeholder="https://cdn.jsdelivr.net/..." class="flex-1" />
            <UButton icon="i-lucide-x" size="xs" variant="ghost" color="error" @click="removeScript(i)" />
          </div>
        </div>

        <!-- External Styles -->
        <div class="mb-4">
          <div class="flex items-center justify-between mb-1">
            <label class="text-sm font-medium text-muted">External Styles (HTTPS)</label>
            <UButton icon="i-lucide-plus" size="xs" variant="ghost" @click="addStyle" />
          </div>
          <div v-for="(_, i) in form.externalStyles" :key="i" class="flex gap-2 mb-1">
            <UInput v-model="form.externalStyles[i]" placeholder="https://cdn.example.com/styles.css" class="flex-1" />
            <UButton icon="i-lucide-x" size="xs" variant="ghost" color="error" @click="removeStyle(i)" />
          </div>
        </div>

        <!-- Variables -->
        <div class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <label class="text-sm font-medium text-muted">Template Variables</label>
            <div class="flex gap-2">
              <UButton
                label="Auto-Detect"
                icon="i-lucide-scan"
                size="xs"
                variant="soft"
                @click="autoDetectVariables"
              />
              <UButton icon="i-lucide-plus" size="xs" variant="ghost" @click="addVariable" />
            </div>
          </div>

          <div v-if="form.variables.length" class="space-y-2">
            <div class="grid grid-cols-12 gap-2 text-xs text-muted font-medium px-1">
              <span class="col-span-3">Name</span>
              <span class="col-span-3">Label</span>
              <span class="col-span-2">Type</span>
              <span class="col-span-3">Default</span>
              <span class="col-span-1" />
            </div>
            <div
              v-for="(v, i) in form.variables"
              :key="i"
              class="grid grid-cols-12 gap-2 items-center"
            >
              <UInput v-model="v.name" placeholder="TITLE" size="xs" class="col-span-3 font-mono" />
              <UInput v-model="v.label" placeholder="Title" size="xs" class="col-span-3" />
              <USelect v-model="v.type" :items="typeOptions" size="xs" class="col-span-2" />
              <UInput v-model="v.default" placeholder="Default" size="xs" class="col-span-3" />
              <UButton icon="i-lucide-x" size="xs" variant="ghost" color="error" class="col-span-1" @click="removeVariable(i)" />
            </div>
          </div>
          <p v-else class="text-xs text-muted">
            No variables. Use <code class="bg-elevated px-1 rounded" v-text="'{{VARIABLE_NAME}}'" /> in your code and click Auto-Detect.
          </p>
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-2 pt-3 border-t border-default">
          <UButton label="Cancel" variant="outline" @click="emit('update:open', false)" />
          <UButton label="Create Template" color="primary" :loading="saving" @click="save" />
        </div>
      </div>
    </template>
  </UModal>
</template>
