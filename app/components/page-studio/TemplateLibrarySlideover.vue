<script setup lang="ts">
import {
  PAGE_STUDIO_PAGE_PRESETS,
  PAGE_STUDIO_SECTION_PRESETS,
  PAGE_STUDIO_SHELL_PRESETS,
  PAGE_STUDIO_SITE_PRESETS,
  type PagePresetId,
  type SectionPresetId,
  type ShellPresetId,
  type SitePresetId
} from '~~/shared/pageStudio/presets'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ pageCount: number, pageLimit: number }>()
const emit = defineEmits<{
  applySection: [id: SectionPresetId]
  applyPage: [id: PagePresetId]
  applyShell: [id: ShellPresetId]
  applySite: [id: SitePresetId]
}>()

function closeLibrary() {
  open.value = false
}
const confirmOpen = ref(false)
const pending = ref<{ kind: 'page' | 'site', id: PagePresetId | SitePresetId, name: string, pageCount?: number } | null>(null)
const tabs = [
  { label: 'Sections', slot: 'sections' as const },
  { label: 'Pages', slot: 'pages' as const },
  { label: 'Shells', slot: 'shells' as const },
  { label: 'Sites', slot: 'sites' as const }
]

function requestPage(id: PagePresetId, name: string) {
  pending.value = { kind: 'page', id, name }
  confirmOpen.value = true
}

function requestSite(id: SitePresetId, name: string, pageCount: number) {
  if (pageCount > props.pageLimit) return
  pending.value = { kind: 'site', id, name, pageCount }
  confirmOpen.value = true
}

function applyPending() {
  if (!pending.value) return
  if (pending.value.kind === 'site') emit('applySite', pending.value.id as SitePresetId)
  else emit('applyPage', pending.value.id as PagePresetId)
  pending.value = null
}
</script>

<template>
  <USlideover v-model:open="open" title="Component library" description="Curated XeroFlow sections, layouts and complete site starters.">
    <template #content>
      <div class="flex h-full min-h-0 flex-col">
        <div class="border-b border-default p-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-lg font-semibold text-highlighted">
                Component library
              </h2>
              <p class="mt-1 text-sm text-muted">
                Insert canonical components that remain fully editable.
              </p>
            </div>
            <UButton
              icon="i-lucide-x"
              aria-label="Close library"
              color="neutral"
              variant="ghost"
              @click="closeLibrary"
            />
          </div>
        </div>
        <UTabs :items="tabs" class="min-h-0 flex-1 overflow-y-auto p-4">
          <template #sections>
            <div class="grid grid-cols-1 gap-3 pt-4">
              <UCard v-for="preset in PAGE_STUDIO_SECTION_PRESETS" :key="preset.id">
                <div class="flex items-start gap-3">
                  <UIcon :name="preset.icon" class="mt-0.5 size-5 text-primary" />
                  <div class="min-w-0 flex-1">
                    <h3 class="font-medium text-highlighted">
                      {{ preset.name }}
                    </h3>
                    <p class="mt-1 text-sm leading-5 text-muted">
                      {{ preset.description }}
                    </p>
                  </div>
                  <UButton
                    label="Insert"
                    size="sm"
                    color="neutral"
                    variant="outline"
                    @click="emit('applySection', preset.id)"
                  />
                </div>
              </UCard>
            </div>
          </template>
          <template #pages>
            <div class="grid grid-cols-1 gap-3 pt-4">
              <UCard v-for="preset in PAGE_STUDIO_PAGE_PRESETS" :key="preset.id">
                <div class="flex items-start gap-3">
                  <UIcon :name="preset.icon" class="mt-0.5 size-5 text-primary" />
                  <div class="min-w-0 flex-1">
                    <h3 class="font-medium text-highlighted">
                      {{ preset.name }}
                    </h3>
                    <p class="mt-1 text-sm leading-5 text-muted">
                      {{ preset.description }}
                    </p>
                    <UBadge
                      class="mt-3"
                      :label="`${preset.sections.length} sections`"
                      color="neutral"
                      variant="subtle"
                    />
                  </div>
                  <UButton
                    label="Apply"
                    size="sm"
                    color="neutral"
                    variant="outline"
                    @click="requestPage(preset.id, preset.name)"
                  />
                </div>
              </UCard>
            </div>
          </template>
          <template #shells>
            <div class="grid grid-cols-1 gap-3 pt-4">
              <UCard v-for="preset in PAGE_STUDIO_SHELL_PRESETS" :key="preset.id">
                <div class="flex items-start gap-3">
                  <UIcon :name="preset.icon" class="mt-0.5 size-5 text-primary" />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <h3 class="font-medium text-highlighted">
                        {{ preset.name }}
                      </h3><UBadge :label="preset.target" color="neutral" variant="subtle" />
                    </div>
                    <p class="mt-1 text-sm leading-5 text-muted">
                      {{ preset.description }}
                    </p>
                  </div>
                  <UButton
                    label="Apply"
                    size="sm"
                    color="neutral"
                    variant="outline"
                    @click="emit('applyShell', preset.id)"
                  />
                </div>
              </UCard>
            </div>
          </template>
          <template #sites>
            <div class="grid grid-cols-1 gap-3 pt-4">
              <UCard v-for="preset in PAGE_STUDIO_SITE_PRESETS" :key="preset.id">
                <div class="flex items-start gap-3">
                  <UIcon :name="preset.icon" class="mt-0.5 size-5 text-primary" />
                  <div class="min-w-0 flex-1">
                    <h3 class="font-medium text-highlighted">
                      {{ preset.name }}
                    </h3>
                    <p class="mt-1 text-sm leading-5 text-muted">
                      {{ preset.description }}
                    </p>
                    <UBadge
                      class="mt-3"
                      :label="`${preset.pageCount} pages`"
                      :color="preset.pageCount > pageLimit ? 'warning' : 'neutral'"
                      variant="subtle"
                    />
                  </div>
                  <UButton
                    label="Apply"
                    size="sm"
                    color="neutral"
                    variant="outline"
                    :disabled="preset.pageCount > pageLimit"
                    @click="requestSite(preset.id, preset.name, preset.pageCount)"
                  />
                </div>
              </UCard>
            </div>
          </template>
        </UTabs>
      </div>
    </template>
  </USlideover>

  <PageStudioTemplateApplyModal
    v-if="pending"
    v-model:open="confirmOpen"
    :kind="pending.kind"
    :name="pending.name"
    :page-count="pending.pageCount"
    @confirm="applyPending"
    @cancel="pending = null"
  />
</template>
