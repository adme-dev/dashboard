<script setup lang="ts">
import type { BannerBrandKit } from '~/types/banner-studio'
import { brandFont } from '~/utils/banner-brand-kit'
import { motorstackBrandId } from '~~/shared/bannerBrandGuides'
import { brandStyleProfile } from '~~/shared/bannerBrandProfiles'

const props = defineProps<{ kit: Pick<BannerBrandKit, 'sourceUrl' | 'name' | 'fonts'> }>()
const brandId = computed(() => motorstackBrandId(props.kit.sourceUrl))
const profile = computed(() => brandStyleProfile(brandId.value))
const buttonFace = computed(() => brandFont(props.kit, profile.value?.ctaFontRole || 'body'))
const headingFace = computed(() => brandFont(props.kit, profile.value?.headingFontRole || 'heading') || brandFont(props.kit, 'heading'))
const bodyFace = computed(() => brandFont(props.kit, 'body'))
const buttonStyle = computed(() => profile.value
  ? ({
      backgroundColor: profile.value.ctaFill, color: profile.value.ctaText,
      border: profile.value.ctaBorder ? `1px solid ${profile.value.ctaBorder}` : 'none',
      borderRadius: `${profile.value.ctaRadius}px`, textTransform: profile.value.ctaCase,
      fontFamily: brandId.value === 'ldv' ? 'Open Sans, sans-serif' : buttonFace.value?.family || 'sans-serif', fontWeight: brandId.value === 'ldv' ? 700 : buttonFace.value?.defaultWeight || 700,
      fontSize: brandId.value === 'ldv' ? '13px' : undefined,
      minWidth: brandId.value === 'ldv' ? '170px' : undefined,
      padding: brandId.value === 'ldv' ? '12px 10px' : undefined
    })
  : {})
const secondaryStyle = computed(() => profile.value
  ? ({
      backgroundColor: profile.value.secondaryFill, color: profile.value.secondaryText,
      border: profile.value.secondaryBorder ? `1px solid ${profile.value.secondaryBorder}` : 'none',
      borderRadius: `${profile.value.ctaRadius}px`, textTransform: profile.value.ctaCase,
      fontFamily: brandId.value === 'ldv' ? 'Open Sans, sans-serif' : buttonFace.value?.family || 'sans-serif', fontWeight: brandId.value === 'ldv' ? 700 : buttonFace.value?.defaultWeight || 700,
      fontSize: brandId.value === 'ldv' ? '13px' : undefined,
      minWidth: brandId.value === 'ldv' ? '170px' : undefined,
      padding: brandId.value === 'ldv' ? '12px 10px' : undefined
    })
  : {})
</script>

<template>
  <section v-if="brandId" class="space-y-3 rounded-md border border-default bg-elevated p-3">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h3 class="text-xs font-semibold text-highlighted">
          {{ kit.name }} dealer style guide
        </h3>
        <p class="text-[11px] text-muted">
          {{ brandId === 'ldv' ? 'Updated 30 August 2026' : 'Button and type reference' }}
        </p>
      </div>
      <a
        :href="`https://oem-variants.pages.dev/app/#/media?oem=${brandId}`"
        target="_blank"
        rel="noopener noreferrer"
        class="text-[11px] text-primary underline"
      >View full guide</a>
    </div>
    <template v-if="profile">
      <div class="flex flex-wrap gap-2 p-3" :style="{ backgroundColor: profile.surface }">
        <span class="inline-flex min-h-9 items-center justify-center px-3 text-xs" :style="buttonStyle">Book a test drive</span>
        <span class="inline-flex min-h-9 items-center justify-center px-3 text-xs" :style="secondaryStyle">Explore models</span>
      </div>
      <div v-if="brandId === 'ldv'" class="flex flex-wrap gap-2 bg-black p-3">
        <span class="inline-flex items-center justify-center bg-[#bc3219] text-white uppercase" :style="{ fontFamily: 'Open Sans, sans-serif', fontWeight: 700, fontSize: '13px', minWidth: '170px', padding: '12px 10px' }">Book a test drive</span>
        <span class="inline-flex items-center justify-center bg-white text-black uppercase" :style="{ fontFamily: 'Open Sans, sans-serif', fontWeight: 700, fontSize: '13px', minWidth: '170px', padding: '12px 10px' }">Download brochure</span>
      </div>
      <p class="text-xs leading-relaxed text-muted">
        {{ profile.note }}
      </p>
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] leading-snug">
        <dt class="text-muted">
          Heading
        </dt><dd>{{ headingFace?.family || 'No heading font saved' }}</dd>
        <dt class="text-muted">
          Body
        </dt><dd>{{ bodyFace?.family || 'No body font saved' }}</dd>
        <dt class="text-muted">
          Button
        </dt><dd>{{ buttonFace?.family || 'No button font saved' }} · {{ profile.ctaCase }} · {{ profile.ctaRadius }}px corners</dd>
        <template v-if="brandId === 'ldv'">
          <dt class="text-muted">
            LDV layout
          </dt><dd>1400px content, 800px heading, 40px / 90px bands from 768px</dd>
          <dt class="text-muted">
            LDV action
          </dt><dd>Open Sans Bold 13px, minimum 170px, 12px × 10px padding, 150ms ease-out</dd>
        </template>
      </dl>
    </template>
    <p v-else class="text-xs text-muted">
      No reviewed button profile is available for this brand yet. The preview uses the saved kit colours and fonts; view the full source guide for more detail.
    </p>
  </section>
</template>
