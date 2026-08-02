<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { NearbyMarketCandidate, NearbyMarketRadius } from '~/types/site-intelligence'
import { useGoogleMaps } from '~/composables/useGoogleMaps'
import type { GoogleMapInstance, GoogleMapsLatLng } from '~/composables/useGoogleMaps'

const props = defineProps<{
  center: GoogleMapsLatLng
  radiusKm: NearbyMarketRadius
  candidates: NearbyMarketCandidate[]
  selectedPlaceId: string | null
}>()
const emit = defineEmits<{ select: [placeId: string] }>()

const mapElement = ref<HTMLElement | null>(null)
const loading = ref(true)
const localError = ref<string | null>(null)
const { load, error: loaderError } = useGoogleMaps()
const errorMessage = computed(() => localError.value ?? loaderError.value)

type Marker = { map: GoogleMapInstance | null, position?: { lat: number, lng: number }, addListener(name: string, fn: () => void): { remove(): void } }
type Circle = { map: GoogleMapInstance | null, setCenter?(center: unknown): void, setRadius?(radius: number): void }
let map: GoogleMapInstance | null = null
let circle: Circle | null = null
let clientMarker: Marker | null = null
let MarkerClass: (new (options: Record<string, unknown>) => Marker) | null = null
const markers = new Map<string, { marker: Marker, content: HTMLElement, position: { lat: number, lng: number }, remove(): void }>()

const position = (point: GoogleMapsLatLng) => ({ lat: point.latitude, lng: point.longitude })

function statusFor(candidate: NearbyMarketCandidate) {
  if (candidate.approvedDomainId || candidate.state === 'approved') return { label: 'Monitored', icon: '✓', tone: 'bg-success text-inverted' }
  if (candidate.state === 'saved') return { label: 'Saved', icon: '◆', tone: 'bg-info text-inverted' }
  if (candidate.state === 'nominated') return { label: 'Under review', icon: '!', tone: 'bg-warning text-inverted' }
  if (candidate.state === 'dismissed') return { label: 'Not selected', icon: '×', tone: 'bg-muted text-muted' }
  return { label: 'Discovery candidate', icon: '•', tone: 'bg-primary text-inverted' }
}

function clearMarkers() {
  for (const entry of markers.values()) {
    entry.remove()
    entry.marker.map = null
  }
  markers.clear()
}

function selectMarker(focus = true) {
  for (const [placeId, entry] of markers) {
    const selected = placeId === props.selectedPlaceId
    entry.content.dataset.selected = String(selected)
    entry.content.setAttribute('aria-pressed', String(selected))
  }
  const selected = props.selectedPlaceId ? markers.get(props.selectedPlaceId) : undefined
  if (!selected) return
  map?.panTo(selected.position)
  if (focus) void nextTick(() => selected.content.focus())
}

function renderMarkers() {
  if (!map || !MarkerClass) return
  clearMarkers()
  for (const candidate of props.candidates) {
    const state = statusFor(candidate)
    const content = document.createElement('span')
    content.className = `flex size-8 items-center justify-center rounded-full border-2 border-default text-sm font-semibold shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${state.tone}`
    content.textContent = state.icon
    content.tabIndex = 0
    content.role = 'button'
    content.dataset.selected = String(candidate.placeId === props.selectedPlaceId)
    content.setAttribute('aria-pressed', String(candidate.placeId === props.selectedPlaceId))
    content.setAttribute('aria-label', `${candidate.displayName}, ${state.label}, ${candidate.distanceKm.toFixed(1)} kilometres away`)
    const markerPosition = position(candidate.location)
    const marker = new MarkerClass({
      map,
      position: markerPosition,
      content,
      title: `${candidate.displayName} — ${state.label}`,
      gmpClickable: true
    })
    const choose = () => emit('select', candidate.placeId)
    const click = marker.addListener('click', choose)
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      choose()
    }
    content.addEventListener('keydown', keydown)
    markers.set(candidate.placeId, {
      marker,
      content,
      position: markerPosition,
      remove: () => {
        click.remove()
        content.removeEventListener('keydown', keydown)
      }
    })
  }
  selectMarker(false)
}

async function initialize() {
  const config = useRuntimeConfig() as { public?: { googleMapsMapId?: unknown } }
  const mapId = typeof config.public?.googleMapsMapId === 'string' ? config.public.googleMapsMapId.trim() : ''
  if (!mapId) {
    localError.value = 'Google Maps map ID is not configured.'
    loading.value = false
    return
  }
  try {
    const libraries = await load()
    if (!mapElement.value) return
    MarkerClass = libraries.AdvancedMarkerElement
    map = new libraries.Map(mapElement.value, {
      center: position(props.center),
      zoom: props.radiusKm === 10 ? 11 : props.radiusKm === 25 ? 10 : 9,
      mapId,
      mapTypeControl: false,
      streetViewControl: false
    })
    circle = new libraries.Circle({
      map,
      center: position(props.center),
      radius: props.radiusKm * 1000,
      clickable: false,
      strokeColor: '#2563eb',
      fillColor: '#2563eb',
      fillOpacity: 0.08
    })
    const content = document.createElement('span')
    content.className = 'flex size-9 items-center justify-center rounded-full border-2 border-default bg-inverted text-sm font-bold text-inverted shadow-sm'
    content.textContent = 'C'
    content.role = 'img'
    content.setAttribute('aria-label', 'Confirmed client trading location')
    clientMarker = new libraries.AdvancedMarkerElement({ map, position: position(props.center), content, title: 'Confirmed client trading location' })
    renderMarkers()
  } catch (cause: unknown) {
    localError.value = cause instanceof Error ? cause.message : 'Google Maps could not be loaded.'
  } finally {
    loading.value = false
  }
}

async function retryMap() {
  localError.value = null
  loading.value = true
  await initialize()
}

watch(() => props.candidates, renderMarkers, { deep: true })
watch(() => props.selectedPlaceId, () => selectMarker())
watch(() => props.radiusKm, value => circle?.setRadius?.(value * 1000))
watch(() => props.center, (value) => {
  const nextPosition = position(value)
  map?.panTo(nextPosition)
  circle?.setCenter?.(nextPosition)
  if (clientMarker) clientMarker.position = nextPosition
}, { deep: true })

onMounted(initialize)
onBeforeUnmount(() => {
  clearMarkers()
  if (clientMarker) clientMarker.map = null
  if (circle) circle.map = null
})
</script>

<template>
  <section class="space-y-3" data-nearby-market-ranked-list-required="true">
    <p id="nearby-market-map-list-alternative" class="sr-only">
      Every map marker has an equivalent keyboard-accessible entry in the ranked list.
    </p>
    <UAlert
      v-if="errorMessage"
      role="alert"
      color="error"
      icon="i-lucide-map-pin-off"
      title="Map unavailable"
      description="The map could not load. The ranked list remains available for reviewing and selecting dealerships."
    >
      <template #actions>
        <UButton
          label="Retry map"
          color="error"
          variant="soft"
          size="sm"
          icon="i-lucide-refresh-cw"
          data-testid="nearby-market-map-retry"
          @click="retryMap"
        />
      </template>
    </UAlert>
    <UAlert
      v-else-if="!loading && candidates.length === 0"
      role="status"
      color="neutral"
      icon="i-lucide-map-pin"
      title="No discovery candidates to map"
      description="Try another radius or include used and independent dealers. Results are not exhaustive."
    />
    <div
      v-if="loading"
      role="status"
      aria-live="polite"
      class="flex h-80 max-h-96 min-h-64 items-center justify-center rounded-lg border border-default bg-elevated text-sm text-muted"
    >
      Loading nearby market map…
    </div>
    <div
      v-show="!errorMessage && !loading"
      ref="mapElement"
      class="h-80 max-h-96 min-h-64 w-full overflow-hidden rounded-lg border border-default bg-elevated"
      role="region"
      aria-label="Nearby automotive market map"
      aria-describedby="nearby-market-map-list-alternative"
    />
  </section>
</template>
