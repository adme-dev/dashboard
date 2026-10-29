<script setup lang="ts">
import { readTemplateBackup } from '~~/shared/emailRendering/templateBackup'
import { computed, ref, watch } from 'vue'

const props = defineProps<{ initialClientId?: string | null }>()
interface ImportedTemplate { client_id?: string | null, folder_name?: string | null, id: string, name: string, subject: string | null, updated_at: string, body_source?: unknown }
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [template: ImportedTemplate] }>()
const name = ref('Imported template')
const subject = ref('')
const previewText = ref('')
const format = ref<'html' | 'json'>('html')
const content = ref('')
const file = ref<File | null>(null)
const preview = ref('')
const importKey = ref<string | null>(null)
const blocks = ref(0)
const busy = ref(false)
const error = ref('')
const toast = useToast()
const category = ref('')
const templateKind = ref<'template' | 'draft'>('template')
const clientSelection = ref('__unset__')
const clientsLoading = ref(false)
const clients = ref<{ id: string, name: string }[]>([])
const canUseShared = ref(false)
const clientOptions = computed(() => [{ label: 'Choose a client or shared default', value: '__unset__' }, ...(canUseShared.value ? [{ label: 'Shared default', value: '__shared__' }] : []), ...clients.value.map(client => ({ label: client.name, value: client.id }))])
const hasClient = computed(() => clientSelection.value === '__shared__' ? canUseShared.value : clients.value.some(client => client.id === clientSelection.value))
async function loadClients() {
  clientsLoading.value = true
  try {
    const result = await $fetch<{ clients: { id: string, name: string }[], canUseSharedTemplates: boolean }>('/api/email/template-clients')
    clients.value = result.clients || []
    canUseShared.value = result.canUseSharedTemplates === true
    clientSelection.value = clients.value.some(client => client.id === props.initialClientId) ? props.initialClientId! : clients.value.length === 1 && !canUseShared.value ? clients.value[0]!.id : '__unset__'
  } catch { error.value = 'Client choices could not be loaded. Close and reopen import to try again.' }
  finally { clientsLoading.value = false }
}
let revision = 0
watch([content, format, name, subject, previewText, clientSelection, category, templateKind], () => {
  revision++
  importKey.value = null
  preview.value = ''
  error.value = ''
})
watch(open, (value) => {
  if (value) {
    content.value = ''
    file.value = null
    name.value = 'Imported template'
    subject.value = ''
    previewText.value = ''
    preview.value = ''
    error.value = ''
    category.value = ''
    templateKind.value = 'template'
    clientSelection.value = '__unset__'
    void loadClients()
  }
}, { immediate: true })
watch(file, async (value) => {
  if (!value) return
  if (value.size > 512 * 1024) {
    revision++
    preview.value = ''
    importKey.value = null
    content.value = ''
    error.value = 'Choose a file up to 512 KB.'
    return
  }
  const current = ++revision
  preview.value = ''
  importKey.value = null
  try {
    const text = await value.text()
    if (current !== revision || !open.value) return
    format.value = value.name.toLowerCase().endsWith('.json') ? 'json' : 'html'
    content.value = text
    name.value = value.name.replace(/\.(html?|json)$/i, '')
  } catch { error.value = 'Could not read this file. Try pasting its content.' }
})
watch([content, format], () => {
  if (format.value !== 'json') return
  try {
    const backup = readTemplateBackup(JSON.parse(content.value))
    if (!backup) return
    name.value = backup.metadata.name || name.value
    subject.value = backup.metadata.subject
    previewText.value = backup.metadata.preview_text
    category.value = backup.metadata.folder_name
    templateKind.value = backup.metadata.template_kind
  } catch { /* Incomplete pasted JSON is validated by Preview import. */ }
})
async function submit(save = false) {
  if (busy.value || clientsLoading.value || !hasClient.value || !content.value.trim() || !name.value.trim() || (save && (!preview.value || !importKey.value))) return
  busy.value = true
  error.value = ''
  const current = revision
  try {
    const result = await $fetch<{ template: ImportedTemplate, html: string, blocks: number }>('/api/email/templates/import', { method: 'POST', body: { format: format.value, content: content.value, name: name.value, subject: subject.value, preview_text: previewText.value, client_id: clientSelection.value === '__shared__' ? null : clientSelection.value, request_key: save ? importKey.value : undefined, folder_name: category.value.trim() || null, template_kind: templateKind.value, save } })
    if (save) {
      emit('imported', result.template)
      toast.add({ title: 'Template imported', color: 'success' })
      open.value = false
    } else if (current === revision && open.value) {
      importKey.value = crypto.randomUUID()
      preview.value = result.html
      blocks.value = result.blocks
    }
  } catch (cause: unknown) {
    error.value = (cause as { data?: { statusMessage?: string } })?.data?.statusMessage || (save ? 'The import could not be confirmed. Retry here to check the same save without creating another copy.' : 'Preview failed. Check your content and try again.')
  } finally { busy.value = false }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Import email template"
    :dismissible="!busy"
    :close="!busy"
    :ui="{ content: 'sm:max-w-4xl' }"
  >
    <template #content>
      <div class="max-h-[90svh] overflow-y-auto p-6 space-y-5">
        <div>
          <h2 class="text-xl font-semibold">
            Import email template
          </h2>
          <p class="mt-1 text-sm text-muted">
            Upload or paste an HTML email, XeroFlow document JSON or template backup. Review the preview before saving.
          </p>
        </div>
        <div class="@container space-y-4">
          <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <UFormField label="Template name" required>
              <UInput
                v-model="name"
                :disabled="busy"
                :maxlength="200"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Subject">
              <UInput
                v-model="subject"
                :disabled="busy"
                :maxlength="300"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Preview text"><UInput v-model="previewText" :maxlength="300" :disabled="busy" class="w-full" /></UFormField>
            <UFormField label="Client" required>
              <USelect v-model="clientSelection" :items="clientOptions" value-key="value" :disabled="busy || clientsLoading" class="w-full" />
            </UFormField>
            <UFormField label="Category"><UInput v-model="category" :maxlength="120" :disabled="busy" placeholder="e.g. Vehicle launches" class="w-full" /></UFormField>
            <UFormField label="Save as" description="Use Draft for historical campaigns or work that still needs review.">
              <USelect v-model="templateKind" :disabled="busy" :items="[{ label: 'Reusable template', value: 'template' }, { label: 'Draft', value: 'draft' }]" class="w-full" />
            </UFormField>
            <UFormField label="Format">
              <USelect
                v-model="format"
                :disabled="busy"
                :items="[{ label: 'HTML email', value: 'html' }, { label: 'XeroFlow document JSON', value: 'json' }]"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Upload file" description="HTML or JSON, up to 512 KB">
              <UFileUpload
                v-model="file"
                :disabled="busy"
                accept=".html,.htm,.json,text/html,application/json"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField label="Email content" description="Tables, basic inline styles and public HTTPS images are kept. Style sheets, scripts, forms and embedded content are removed." required>
            <UTextarea
              v-model="content"
              :disabled="busy"
              :rows="8"
              :maxlength="524288"
              class="w-full font-mono text-xs"
            />
          </UFormField>
        </div>
        <UAlert v-if="error" color="error" :title="error" />
        <section v-if="preview" class="space-y-2">
          <div class="flex justify-between text-sm">
            <h3 class="font-semibold">
              Preview
            </h3><span class="text-muted">{{ blocks }} block(s)</span>
          </div>
          <iframe
            title="Imported email preview"
            :srcdoc="preview"
            sandbox=""
            referrerpolicy="no-referrer"
            class="h-[460px] w-full rounded-lg border border-default bg-white"
          />
          <p class="text-xs text-muted">
            HTML imports remain one editable HTML block. Review images, links and sender/unsubscribe details before sending. Nothing is saved until you select Import template.
          </p>
        </section>
        <div class="flex justify-end gap-2 border-t border-default pt-4">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            :disabled="busy"
            @click="open = false"
          />
          <UButton
            v-if="!preview"
            label="Preview import"
            :loading="busy"
            :disabled="busy || clientsLoading || !hasClient || !content.trim() || !name.trim()"
            @click="submit(false)"
          />
          <UButton
            v-else
            label="Import template"
            icon="i-lucide-download"
            :loading="busy"
            :disabled="busy || !hasClient"
            @click="submit(true)"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
