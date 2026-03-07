<script setup lang="ts">
import { FORMATS } from '~/utils/banner-constants'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const toast = useToast()

const {
  connectionId,
  hasAdsManagement,
  campaignId,
  campaignName,
  adSetId,
  adSetName,
  selectedPublishedIds,
  selectedCreatives,
  canProceedStep1,
  canProceedStep2,
  canProceedStep3,
  canProceedStep4,
  adNamePattern,
  adStatus,
  uploadProgress,
  isUploading,
  uploadComplete,
  overallProgress,
  fetchAllPublished,
  uploadAllBulk,
  reset,
} = useMetaAdUpload()

// ── Section collapse state ──
const expandedSections = ref<Set<number>>(new Set([1]))

function toggleSection(n: number) {
  if (expandedSections.value.has(n)) {
    expandedSections.value.delete(n)
  } else {
    expandedSections.value.add(n)
  }
}

function isExpanded(n: number) {
  return expandedSections.value.has(n)
}

// Auto-expand next section when current completes
watch(canProceedStep1, (val) => {
  if (val && !expandedSections.value.has(2)) {
    expandedSections.value.add(2)
  }
})
watch(canProceedStep2, (val) => {
  if (val && !expandedSections.value.has(3)) {
    expandedSections.value.add(3)
  }
})
watch(canProceedStep3, (val) => {
  if (val && !expandedSections.value.has(4)) {
    expandedSections.value.add(4)
  }
})
watch(canProceedStep4, (val) => {
  if (val && !expandedSections.value.has(5)) {
    expandedSections.value.add(5)
  }
})

// ── Platform tabs ──
const activePlatform = ref('meta')
const platforms = [
  { key: 'meta', label: 'Meta', icon: 'i-lucide-facebook', enabled: true },
  { key: 'google', label: 'Google', icon: 'i-lucide-chrome', enabled: false },
  { key: 'tiktok', label: 'TikTok', icon: 'i-lucide-music', enabled: false },
  { key: 'snap', label: 'Snap', icon: 'i-lucide-ghost', enabled: false },
  { key: 'pinterest', label: 'Pinterest', icon: 'i-lucide-pin', enabled: false },
]

// ── Section status summaries ──
const accountSummary = computed(() => {
  if (!connectionId.value) return 'Not connected'
  if (!hasAdsManagement.value) return 'Read-only access'
  return 'Connected'
})

const campaignSummary = computed(() => {
  if (!campaignId.value) return 'Not selected'
  const parts = [campaignName.value || campaignId.value]
  if (adSetId.value) parts.push(adSetName.value || adSetId.value)
  return parts.join(' > ')
})

const creativeSummary = computed(() => {
  const count = selectedPublishedIds.value.length
  if (!count) return 'None selected'
  return `${count} creative${count > 1 ? 's' : ''} selected`
})

const textSummary = computed(() => {
  if (!canProceedStep4.value) return 'Incomplete'
  return 'Ready'
})

// ── Init ──
onMounted(() => {
  reset()
  fetchAllPublished()
})

// ── Launch ──
const isLaunching = ref(false)

async function handleLaunch() {
  isLaunching.value = true
  expandedSections.value.add(5)
  try {
    await uploadAllBulk()
    const done = uploadProgress.value.filter(p => p.step === 'done').length
    const errors = uploadProgress.value.filter(p => p.step === 'error').length
    if (errors === 0) {
      toast.add({ title: 'All ads launched!', description: `${done} ad${done > 1 ? 's' : ''} created successfully.`, color: 'success' })
    } else {
      toast.add({ title: 'Launch completed with errors', description: `${done} succeeded, ${errors} failed.`, color: 'warning' })
    }
  } catch (err: any) {
    toast.add({ title: 'Launch failed', description: err.message || 'Unknown error', color: 'error' })
  } finally {
    isLaunching.value = false
  }
}

function handleReset() {
  reset()
  expandedSections.value = new Set([1])
  fetchAllPublished()
}

// ── Can launch check ──
const canLaunch = computed(() =>
  canProceedStep1.value && canProceedStep2.value && canProceedStep3.value && canProceedStep4.value && !isUploading.value,
)

// ── Help slideover ──
const showHelp = ref(false)

const helpSteps = [
  {
    number: 1,
    title: 'Connect Ad Account',
    icon: 'i-lucide-plug',
    description: 'Select your Meta Ads account. You need "Full Access" (ads_management scope) to publish ads. Connect accounts in Social Settings if none appear.',
  },
  {
    number: 2,
    title: 'Choose Campaign & Ad Set',
    icon: 'i-lucide-target',
    description: 'Pick an existing campaign and ad set from your Meta account. Ads will be created inside the selected ad set with its targeting and budget settings.',
  },
  {
    number: 3,
    title: 'Select Creatives',
    icon: 'i-lucide-image',
    description: 'Choose published banners from Banner Studio. You can select creatives across multiple projects. Each selected creative becomes a separate ad in Meta.',
  },
  {
    number: 4,
    title: 'Write Ad Copy',
    icon: 'i-lucide-type',
    description: 'Enter primary text, headlines, and descriptions. Meta will optimize delivery across your text variations. Add up to 5 of each. Select a CTA button, Facebook page, and landing page URL.',
  },
  {
    number: 5,
    title: 'Review & Launch',
    icon: 'i-lucide-rocket',
    description: 'Preview the ad names that will be generated, choose whether ads start Paused or Active, then launch. Each creative is uploaded and published individually with a progress indicator.',
  },
]

const helpTips = [
  { icon: 'i-lucide-lightbulb', text: 'Use the ad name pattern to auto-generate descriptive names. {ProjectName} resolves to the Banner Studio project name.' },
  { icon: 'i-lucide-bookmark', text: 'Save ad copy as presets in section 4 to reuse across launches.' },
  { icon: 'i-lucide-pause', text: 'Launch ads as "Paused" first to review them in Meta Ads Manager before going live.' },
  { icon: 'i-lucide-palette', text: 'Banners must be published in Banner Studio before they appear here. Use the Publish modal in the editor.' },
]

// ── Review table data ──
const reviewItems = computed(() =>
  selectedCreatives.value.map((p: any) => {
    const formatName = FORMATS[p.formatKey]?.name || p.formatKey
    const projectName = p.projectName || 'Banner'
    const date = new Date().toISOString().slice(0, 10)
    const adName = adNamePattern.value
      .replace('{ProjectName}', projectName)
      .replace('{Format}', formatName)
      .replace('{Date}', date)
    return {
      id: p.id,
      formatKey: p.formatKey,
      formatName,
      projectName,
      dimensions: `${p.width}×${p.height}`,
      adName,
    }
  }),
)
</script>

<template>
  <div class="flex-1 overflow-y-auto">
    <div class="w-full px-6 py-6 space-y-4">
      <!-- Page header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold">Bulk Ad Launch</h1>
          <p class="text-sm text-(--ui-text-muted)">
            Launch ads across platforms using creatives from Banner Studio.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UButton variant="ghost" size="sm" icon="i-lucide-circle-help" @click="showHelp = true">
            Help
          </UButton>
          <UButton variant="ghost" size="sm" icon="i-lucide-rotate-ccw" @click="handleReset">
            Reset All
          </UButton>
        </div>
      </div>

      <!-- Platform tabs -->
      <div class="flex items-center gap-1.5 border-b border-(--ui-border) pb-2">
        <button
          v-for="p in platforms"
          :key="p.key"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
          :class="[
            p.key === activePlatform
              ? 'bg-blue-500/10 text-blue-500'
              : p.enabled
                ? 'hover:bg-(--ui-bg-elevated) text-(--ui-text-muted)'
                : 'text-(--ui-text-muted)/50 cursor-not-allowed',
          ]"
          :disabled="!p.enabled"
          @click="p.enabled && (activePlatform = p.key)"
        >
          <UIcon :name="p.icon" class="w-3.5 h-3.5" />
          {{ p.label }}
          <UBadge v-if="!p.enabled" variant="subtle" color="neutral" size="xs">Soon</UBadge>
        </button>
      </div>

      <!-- Two-column layout: Left = Account + Campaign, Right = Creatives + Text + Review -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <!-- LEFT COLUMN: Account & Campaign -->
        <div class="lg:col-span-4 space-y-4">
          <!-- Section 1: Ad Account -->
          <div class="rounded-lg border border-(--ui-border) overflow-hidden">
            <button
              class="w-full flex items-center gap-3 px-4 py-3 bg-(--ui-bg) hover:bg-(--ui-bg-elevated) transition-colors"
              @click="toggleSection(1)"
            >
              <span class="w-6 h-6 rounded-full bg-blue-500/10 text-blue-500 text-xs font-bold flex items-center justify-center shrink-0">1</span>
              <span class="text-sm font-semibold flex-1 text-left">Ad Account</span>
              <UIcon v-if="canProceedStep1" name="i-lucide-check-circle" class="w-4 h-4 text-green-500 shrink-0" />
              <UIcon :name="isExpanded(1) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="w-4 h-4 text-(--ui-text-muted) shrink-0" />
            </button>
            <div v-if="isExpanded(1)" class="px-4 py-4 border-t border-(--ui-border)">
              <AdUploadStepAccount />
            </div>
          </div>

          <!-- Section 2: Campaign & Ad Set -->
          <div class="rounded-lg border border-(--ui-border) overflow-hidden">
            <button
              class="w-full flex items-center gap-3 px-4 py-3 bg-(--ui-bg) hover:bg-(--ui-bg-elevated) transition-colors"
              @click="toggleSection(2)"
            >
              <span class="w-6 h-6 rounded-full bg-blue-500/10 text-blue-500 text-xs font-bold flex items-center justify-center shrink-0">2</span>
              <span class="text-sm font-semibold flex-1 text-left">Campaign & Ad Set</span>
              <UIcon v-if="canProceedStep2" name="i-lucide-check-circle" class="w-4 h-4 text-green-500 shrink-0" />
              <UIcon :name="isExpanded(2) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="w-4 h-4 text-(--ui-text-muted) shrink-0" />
            </button>
            <div v-if="isExpanded(2)" class="px-4 py-4 border-t border-(--ui-border)">
              <AdUploadStepCampaign />
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN: Creatives + Text + Review -->
        <div class="lg:col-span-8 space-y-4">
          <!-- Section 3: Creatives -->
          <div class="rounded-lg border border-(--ui-border) overflow-hidden">
            <button
              class="w-full flex items-center gap-3 px-4 py-3 bg-(--ui-bg) hover:bg-(--ui-bg-elevated) transition-colors"
              @click="toggleSection(3)"
            >
              <span class="w-6 h-6 rounded-full bg-blue-500/10 text-blue-500 text-xs font-bold flex items-center justify-center shrink-0">3</span>
              <span class="text-sm font-semibold flex-1 text-left">Creatives</span>
              <span class="text-xs text-(--ui-text-muted) mr-2">{{ creativeSummary }}</span>
              <UIcon v-if="canProceedStep3" name="i-lucide-check-circle" class="w-4 h-4 text-green-500 shrink-0" />
              <UIcon :name="isExpanded(3) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="w-4 h-4 text-(--ui-text-muted) shrink-0" />
            </button>
            <div v-if="isExpanded(3)" class="px-4 py-4 border-t border-(--ui-border)">
              <AdPublishBulkCreativePicker />
            </div>
          </div>

          <!-- Section 4: Ad Copy & Settings -->
          <div class="rounded-lg border border-(--ui-border) overflow-hidden">
            <button
              class="w-full flex items-center gap-3 px-4 py-3 bg-(--ui-bg) hover:bg-(--ui-bg-elevated) transition-colors"
              @click="toggleSection(4)"
            >
              <span class="w-6 h-6 rounded-full bg-blue-500/10 text-blue-500 text-xs font-bold flex items-center justify-center shrink-0">4</span>
              <span class="text-sm font-semibold flex-1 text-left">Ad Copy & Settings</span>
              <span class="text-xs text-(--ui-text-muted) mr-2">{{ textSummary }}</span>
              <UIcon v-if="canProceedStep4" name="i-lucide-check-circle" class="w-4 h-4 text-green-500 shrink-0" />
              <UIcon :name="isExpanded(4) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="w-4 h-4 text-(--ui-text-muted) shrink-0" />
            </button>
            <div v-if="isExpanded(4)" class="px-4 py-4 border-t border-(--ui-border)">
              <AdUploadStepText />
            </div>
          </div>

          <!-- Section 5: Review & Launch -->
          <div class="rounded-lg border border-(--ui-border) overflow-hidden">
            <button
              class="w-full flex items-center gap-3 px-4 py-3 bg-(--ui-bg) hover:bg-(--ui-bg-elevated) transition-colors"
              @click="toggleSection(5)"
            >
              <span class="w-6 h-6 rounded-full bg-blue-500/10 text-blue-500 text-xs font-bold flex items-center justify-center shrink-0">5</span>
              <span class="text-sm font-semibold flex-1 text-left">Review & Launch</span>
              <UIcon :name="isExpanded(5) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="w-4 h-4 text-(--ui-text-muted) shrink-0" />
            </button>
            <div v-if="isExpanded(5)" class="px-4 py-4 border-t border-(--ui-border) space-y-4">
              <!-- Ad name pattern -->
              <div>
                <label class="text-xs font-medium block mb-1.5">Ad Name Pattern</label>
                <UInput
                  v-model="adNamePattern"
                  size="sm"
                  placeholder="{ProjectName} - {Format} - {Date}"
                />
                <p class="text-[10px] text-(--ui-text-muted) mt-1">
                  Variables: {ProjectName}, {Format}, {Date}
                </p>
              </div>

              <!-- Ad status toggle -->
              <div class="flex items-center gap-3">
                <label class="text-xs font-medium">Initial Status:</label>
                <div class="flex gap-1.5">
                  <UButton
                    :variant="adStatus === 'PAUSED' ? 'solid' : 'outline'"
                    :color="adStatus === 'PAUSED' ? 'primary' : 'neutral'"
                    size="xs"
                    @click="adStatus = 'PAUSED'"
                  >
                    Paused
                  </UButton>
                  <UButton
                    :variant="adStatus === 'ACTIVE' ? 'solid' : 'outline'"
                    :color="adStatus === 'ACTIVE' ? 'primary' : 'neutral'"
                    size="xs"
                    @click="adStatus = 'ACTIVE'"
                  >
                    Active
                  </UButton>
                </div>
              </div>

              <!-- Review table -->
              <div v-if="reviewItems.length" class="rounded-lg border border-(--ui-border) overflow-hidden">
                <div class="overflow-x-auto">
                  <table class="w-full text-xs">
                    <thead>
                      <tr class="bg-(--ui-bg-elevated)">
                        <th class="text-left px-3 py-2 font-medium text-(--ui-text-muted)">Project</th>
                        <th class="text-left px-3 py-2 font-medium text-(--ui-text-muted)">Format</th>
                        <th class="text-left px-3 py-2 font-medium text-(--ui-text-muted)">Size</th>
                        <th class="text-left px-3 py-2 font-medium text-(--ui-text-muted)">Ad Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="item in reviewItems"
                        :key="item.id"
                        class="border-t border-(--ui-border)"
                      >
                        <td class="px-3 py-2 truncate max-w-[140px]">{{ item.projectName }}</td>
                        <td class="px-3 py-2">{{ item.formatName }}</td>
                        <td class="px-3 py-2 text-(--ui-text-muted)">{{ item.dimensions }}</td>
                        <td class="px-3 py-2 font-mono text-[10px] truncate max-w-[200px]">{{ item.adName }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div v-else class="py-4 text-center text-xs text-(--ui-text-muted)">
                Select creatives in section 3 to see the review summary.
              </div>

              <!-- Launch button -->
              <div class="pt-2">
                <UButton
                  size="lg"
                  color="primary"
                  icon="i-lucide-rocket"
                  class="w-full justify-center"
                  :disabled="!canLaunch"
                  :loading="isUploading"
                  @click="handleLaunch"
                >
                  Launch {{ selectedPublishedIds.length }} Ad{{ selectedPublishedIds.length !== 1 ? 's' : '' }} to Meta
                </UButton>

                <p v-if="!canLaunch && !isUploading" class="text-[10px] text-(--ui-text-muted) text-center mt-1.5">
                  Complete all sections above to enable launch.
                </p>
              </div>

              <!-- Upload progress (appears during/after launch) -->
              <AdUploadUploadProgress
                v-if="uploadProgress.length > 0"
                :items="uploadProgress"
                :overall-progress="overallProgress"
                :is-uploading="isUploading"
              />

              <!-- Post-launch success -->
              <div v-if="uploadComplete && !isUploading" class="rounded-lg bg-green-500/5 border border-green-500/20 px-4 py-3 text-center">
                <UIcon name="i-lucide-party-popper" class="w-6 h-6 text-green-500 mx-auto mb-1" />
                <p class="text-sm font-medium text-green-600">Launch Complete!</p>
                <p class="text-xs text-(--ui-text-muted) mt-0.5">
                  Check your Meta Ads Manager for the new ads.
                </p>
                <UButton variant="outline" size="xs" class="mt-2" @click="handleReset">
                  Start New Batch
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Help Slideover -->
    <USlideover v-model:open="showHelp">
      <template #content>
        <div class="p-6 space-y-6 overflow-y-auto h-full">
          <div>
            <h2 class="text-lg font-bold">How Bulk Ad Launch Works</h2>
            <p class="text-sm text-(--ui-text-muted) mt-1">
              Launch multiple ads to Meta in one go using creatives from Banner Studio.
            </p>
          </div>

          <!-- Steps -->
          <div class="space-y-4">
            <div
              v-for="step in helpSteps"
              :key="step.number"
              class="flex gap-3"
            >
              <div class="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                <UIcon :name="step.icon" class="w-4 h-4 text-blue-500" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-mono text-(--ui-text-muted)">Step {{ step.number }}</span>
                  <span class="text-sm font-semibold">{{ step.title }}</span>
                </div>
                <p class="text-xs text-(--ui-text-muted) mt-0.5 leading-relaxed">{{ step.description }}</p>
              </div>
            </div>
          </div>

          <!-- Tips -->
          <div>
            <h3 class="text-sm font-semibold mb-3">Tips</h3>
            <div class="space-y-2.5">
              <div
                v-for="(tip, i) in helpTips"
                :key="i"
                class="flex gap-2.5 px-3 py-2.5 rounded-lg bg-(--ui-bg-elevated)"
              >
                <UIcon :name="tip.icon" class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p class="text-xs text-(--ui-text-muted) leading-relaxed">{{ tip.text }}</p>
              </div>
            </div>
          </div>

          <!-- Supported platforms -->
          <div>
            <h3 class="text-sm font-semibold mb-2">Platform Support</h3>
            <div class="space-y-1.5">
              <div class="flex items-center gap-2 text-xs">
                <UIcon name="i-lucide-facebook" class="w-3.5 h-3.5 text-blue-500" />
                <span>Meta (Facebook & Instagram)</span>
                <UBadge color="success" variant="subtle" size="xs">Available</UBadge>
              </div>
              <div class="flex items-center gap-2 text-xs text-(--ui-text-muted)">
                <UIcon name="i-lucide-chrome" class="w-3.5 h-3.5" />
                <span>Google Ads</span>
                <UBadge color="neutral" variant="subtle" size="xs">Coming Soon</UBadge>
              </div>
              <div class="flex items-center gap-2 text-xs text-(--ui-text-muted)">
                <UIcon name="i-lucide-music" class="w-3.5 h-3.5" />
                <span>TikTok Ads</span>
                <UBadge color="neutral" variant="subtle" size="xs">Coming Soon</UBadge>
              </div>
            </div>
          </div>

          <!-- Close -->
          <UButton variant="outline" class="w-full justify-center" @click="showHelp = false">
            Got it
          </UButton>
        </div>
      </template>
    </USlideover>
  </div>
</template>
