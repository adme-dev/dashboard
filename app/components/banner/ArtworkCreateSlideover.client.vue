<script setup lang="ts">
const creation = useBannerArtworkCreation()
const {
  open,
  busy,
  error,
  brief,
  copy,
  reviewed,
  saveStyle,
  referenceIds,
  assets,
  styles,
  preview,
  canApply,
  styleName,
  styleGuidance,
  selectedStyle,
  hasStyleExample
} = creation
const styleItems = computed(() => [
  { label: 'Bold Retail Lifestyle · starter', value: 'starter' },
  ...styles.value.map(style => ({
    label: `${style.name} · version ${style.version}`,
    value: `${style.id}:${style.version}`
  }))
])
const assetItems = computed(() =>
  assets.value.map(asset => ({
    label: asset.name,
    value: asset.id,
    avatar: { src: asset.thumbnailUrl || asset.url }
  }))
)
defineExpose({ show: creation.show })
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Create campaign artwork"
    description="Create a complete concept, review it, then bring it into this artboard."
    :ui="{ content: 'max-w-2xl' }"
    @update:open="
      (value) => {
        if (!value) creation.discard();
      }
    "
  >
    <template #body>
      <div class="@container space-y-6">
        <UAlert color="info" variant="soft" title="Add QR codes after generation" description="Ask for a blank code area, then use Add QR code to insert a managed platform code. Review and remove any QR-like pixels in generated artwork." />
        <UFormField
          label="Style template"
          description="Saved styles from this client’s projects. Unassigned projects keep their own library. Choosing a style never copies campaign wording or source assets."
        >
          <USelect
            :model-value="selectedStyle"
            :items="styleItems"
            class="w-full"
            :disabled="busy"
            @update:model-value="(value) => creation.chooseStyle(String(value))"
          />
        </UFormField>
        <div class="border-l-4 border-primary pl-4 space-y-4">
          <UFormField label="Reusable style name">
            <UInput
              v-model="styleName"
              :maxlength="100"
              class="w-full"
              :disabled="busy"
            />
          </UFormField>
          <UFormField
            label="Reusable design guidance"
            description="Composition, typography, effects, palette and setting only. Keep client names, offers, dates and other campaign facts in the brief below."
          >
            <UTextarea
              v-model="styleGuidance"
              :rows="5"
              :maxlength="2000"
              class="w-full"
              :disabled="busy"
            />
          </UFormField>
          <UButton
            v-if="hasStyleExample"
            label="Use this style’s reviewed example as a reference"
            variant="outline"
            size="sm"
            :disabled="busy"
            @click="creation.addStyleExample"
          />
        </div>
        <UFormField
          label="Campaign brief"
          description="Describe the audience, composition and campaign. Include the required setting and any restrictions."
        >
          <UTextarea
            v-model="brief"
            :rows="5"
            :maxlength="3500"
            class="w-full"
            :disabled="busy"
          />
        </UFormField>
        <UFormField
          label="Exact approved copy"
          description="One text block per line. Dates, prices, eligibility, locations and legal wording remain exactly as supplied; review the visible generated lettering."
        >
          <UTextarea
            v-model="copy"
            :rows="7"
            :maxlength="12000"
            class="w-full"
            :disabled="busy"
          />
        </UFormField>
        <UFormField
          label="Owned reference assets"
          description="Choose up to eight existing library images: visual style, original vehicles, logos and other approved campaign assets. Upload new originals through the Assets panel first."
        >
          <USelectMenu
            v-model="referenceIds"
            :items="assetItems"
            value-key="value"
            multiple
            searchable
            class="w-full"
            :disabled="busy"
            placeholder="Choose campaign references"
          />
        </UFormField>
        <UAlert
          v-if="referenceIds.length > 8"
          color="warning"
          title="Choose no more than eight references"
        />
        <UAlert
          v-if="error"
          color="warning"
          title="Concept not ready"
          :description="error"
        />
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Generate complete concept"
            icon="i-lucide-sparkles"
            :loading="busy"
            :disabled="
              busy
                || referenceIds.length > 8
                || !brief.trim()
                || !copy.trim()
                || !referenceIds.length
            "
            @click="creation.generate"
          />
          <UButton
            v-if="busy"
            label="Cancel"
            variant="ghost"
            @click="creation.discard"
          />
        </div>
        <div v-if="preview" class="space-y-4 border-t border-default pt-5">
          <img
            :src="preview.asset.url"
            alt="Generated complete campaign concept for review"
            class="max-h-[55vh] w-full object-contain bg-elevated rounded"
          >
          <UAlert
            color="warning"
            title="Review before import"
            description="This concept is a flattened image. Check every visible word, vehicle identity, logo, setting and layout. Exact copy is saved separately; it does not prove the pixels are correct. Import preserves existing artwork and fits the full image without cropping."
          />
          <ul
            v-if="preview.warnings?.length"
            class="text-sm text-muted list-disc pl-5"
          >
            <li v-for="warning in preview.warnings" :key="warning">
              {{ warning }}
            </li>
          </ul>
          <UCheckbox
            v-model="reviewed"
            label="I reviewed the visible copy, original assets and leafy setting; this concept is approved for import."
          />
          <UCheckbox
            v-model="saveStyle"
            :label="`Save ${styleName || 'this style'} as a reviewed version in this project’s style library`"
          />
          <div class="flex flex-wrap gap-2">
            <UButton
              label="Import reviewed concept and save"
              :disabled="!canApply"
              @click="creation.apply"
            />
            <UButton
              label="Discard concept"
              variant="ghost"
              @click="creation.discard"
            />
          </div>
          <p v-if="reviewed && !canApply" class="text-sm text-warning">
            The canvas changed during review. Generate again from the current
            project.
          </p>
        </div>
      </div>
    </template>
  </USlideover>
</template>
