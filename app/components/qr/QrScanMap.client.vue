<script setup lang="ts">
/**
 * Scan cluster map. Leaflet for the map, supercluster for grouping, CARTO basemap tiles (no API key).
 * Points are Cloudflare city-centroids, so a bubble means "scans near <suburb>", not exact positions.
 */
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Supercluster from 'supercluster'

export interface QrScanPoint { lat: number, lng: number, scans: number, city: string | null, postcode: string | null }
interface Props { scans: number, city: string | null, postcode: string | null }

const props = defineProps<{ points: QrScanPoint[] }>()
const colorMode = useColorMode()
const el = ref<HTMLElement>()
let map: L.Map | null = null
let tiles: L.TileLayer | null = null
let layer: L.LayerGroup | null = null
let index: Supercluster<Props, Props> | null = null

const TILE = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
}
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

const total = computed(() => props.points.reduce((n, p) => n + p.scans, 0))
const places = computed(() => props.points.length)

function bubble(count: number, isCluster: boolean): L.DivIcon {
  const size = Math.round(Math.min(56, 28 + Math.log2(Math.max(1, count)) * 5))
  return L.divIcon({
    html: `<div class="qr-bubble${isCluster ? ' is-cluster' : ''}" style="width:${size}px;height:${size}px">${count.toLocaleString()}</div>`,
    className: 'qr-bubble-wrap',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  })
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] as string))
}

function setTiles() {
  if (!map) return
  tiles?.remove()
  tiles = L.tileLayer(colorMode.value === 'dark' ? TILE.dark : TILE.light, { attribution: ATTR, subdomains: 'abcd', maxZoom: 18 }).addTo(map)
}

function buildIndex() {
  index = new Supercluster<Props, Props>({
    radius: 48,
    maxZoom: 16,
    map: p => ({ scans: p.scans, city: p.city, postcode: p.postcode }),
    reduce: (acc, p) => {
      acc.scans += p.scans
    }
  })
  index.load(props.points.map(p => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
    properties: { scans: p.scans, city: p.city, postcode: p.postcode }
  })))
}

/** Redraw the markers visible in the current viewport at the current zoom. */
function draw() {
  if (!map || !index) return
  layer?.remove()
  layer = L.layerGroup()
  const b = map.getBounds()
  const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
  const zoom = Math.round(map.getZoom())
  for (const f of index.getClusters(bbox, zoom)) {
    const [lng, lat] = f.geometry.coordinates as [number, number]
    const fp = f.properties as any
    const isCluster = !!fp.cluster
    const scans = Number(fp.scans ?? 0)
    const m = L.marker([lat, lng], { icon: bubble(scans, isCluster), keyboard: true })
    if (isCluster) {
      const clusterId = fp.cluster_id as number
      m.on('click', () => {
        const next = Math.min(index!.getClusterExpansionZoom(clusterId), 16)
        map!.flyTo([lat, lng], next, { duration: 0.4 })
      })
      const names = index.getLeaves(clusterId, 3).map(l => l.properties.city).filter(Boolean) as string[]
      const more = Number(fp.point_count) - names.length
      m.bindTooltip(`${scans.toLocaleString()} scans · ${escapeHtml(names.join(', '))}${more > 0 ? ` +${more} more` : ''}`, { direction: 'top', offset: [0, -12] })
    } else {
      const label = [f.properties.city, f.properties.postcode].filter(Boolean).join(' ') || 'Unknown area'
      m.bindPopup(`<strong>${escapeHtml(label)}</strong><br>${scans.toLocaleString()} ${scans === 1 ? 'scan' : 'scans'}`, { closeButton: false })
    }
    layer.addLayer(m)
  }
  layer.addTo(map)
}

function fit() {
  if (!map || !props.points.length) return
  const pts = props.points.map(p => [p.lat, p.lng] as L.LatLngTuple)
  if (pts.length === 1) map.setView(pts[0]!, 10)
  else map.fitBounds(pts, { padding: [32, 32], maxZoom: 12 })
}

function init(node: HTMLElement) {
  if (map) return
  map = L.map(node, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
  map.setView([-25.27, 133.77], 4) // Australia; replaced by fit() once points render
  setTiles()
  buildIndex()
  fit()
  draw()
  map.on('moveend zoomend', draw)
}
// Nuxt's `.client` wrapper mounts a placeholder before the real template, so template refs are not
// bound inside onMounted — initialise when the element actually appears instead.
watch(el, (node) => {
  if (node) init(node)
}, { immediate: true, flush: 'post' })
watch(() => props.points, () => {
  buildIndex()
  fit()
  draw()
}, { deep: true })
watch(() => colorMode.value, setTiles)
onBeforeUnmount(() => {
  map?.remove()
  map = null
})
</script>

<template>
  <div class="relative">
    <div ref="el" class="qr-map h-80 w-full rounded-lg" />
    <div class="pointer-events-none absolute left-3 top-3 z-[400] rounded-md bg-default/90 px-2 py-1 text-xs text-muted shadow-sm ring-1 ring-default">
      {{ total.toLocaleString() }} {{ total === 1 ? 'scan' : 'scans' }} · {{ places }} {{ places === 1 ? 'area' : 'areas' }}
    </div>
  </div>
</template>

<style>
.qr-map { background: var(--ui-bg-elevated); }
.qr-map .leaflet-control-zoom a { background: var(--ui-bg); color: var(--ui-text); border-color: var(--ui-border); }
.qr-map .leaflet-control-attribution { background: color-mix(in srgb, var(--ui-bg) 85%, transparent); color: var(--ui-text-muted); font-size: 10px; }
.qr-map .leaflet-control-attribution a { color: var(--ui-text-muted); }
.qr-map .leaflet-popup-content-wrapper, .qr-map .leaflet-tooltip { background: var(--ui-bg); color: var(--ui-text); border: 1px solid var(--ui-border); border-radius: 8px; box-shadow: 0 4px 16px rgb(0 0 0 / 0.25); font-size: 12px; }
.qr-map .leaflet-popup-tip { background: var(--ui-bg); }
.qr-map .leaflet-tooltip-top::before { border-top-color: var(--ui-border); }
.qr-bubble-wrap { background: transparent; border: 0; }
.qr-bubble {
  display: flex; align-items: center; justify-content: center;
  border-radius: 9999px; cursor: pointer;
  background: color-mix(in srgb, var(--ui-primary) 85%, transparent);
  color: white; font-weight: 600; font-size: 12px; font-variant-numeric: tabular-nums;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ui-primary) 25%, transparent);
}
.qr-bubble.is-cluster { background: var(--ui-primary); box-shadow: 0 0 0 6px color-mix(in srgb, var(--ui-primary) 30%, transparent); }
</style>
