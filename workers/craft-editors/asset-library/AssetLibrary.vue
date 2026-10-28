<script setup>
import { computed, onMounted, ref, watch } from 'vue'
const props = defineProps(['opened', 'close', 'ready'])
const brands = ref([]), brand = ref(''), kind = ref('all'), search = ref(''), assets = ref([]), colors = ref([])
const model = ref(''), appliedModel = ref(''), modelError = ref('')
const modelEnabled = computed(() => kind.value === 'all' || kind.value === 'media')
const loading = ref(false), error = ref(''), denied = ref(false), notice = ref(''), busy = ref('')
let generation = 0
const kinds = [{ id: 'all', name: 'All assets' }, { id: 'slides', name: 'Banners' }, { id: 'media', name: 'Photos & brochures' }, { id: 'brand', name: 'Brand kit' }]
const visual = location.pathname.split('/')[1] !== 'soundflow'
const filtered = computed(() => assets.value.filter(a => !search.value.trim() || a.name.toLowerCase().includes(search.value.trim().toLowerCase())))
function safeURL(value) { try { const u = new URL(value, location.origin); return u.origin === location.origin && u.pathname === '/__assets/motorstack/file' && !u.username && !u.password ? u.href : null } catch { return null } }
async function get(url) { let r; try { r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', redirect: 'error' }) } catch { throw Error('The asset library is unavailable. Try again.') }; if (!r.ok) { const e = new Error(r.status === 401 || r.status === 403 ? 'Sign in to XeroFlow to use this library.' : 'The asset library is unavailable. Try again.'); e.status = r.status; throw e } return r }
function fail(e) { denied.value = e.status === 401 || e.status === 403; error.value = e.message || 'The asset library is unavailable. Try again.' }
async function loadBrands() { loading.value = true; error.value = ''; try { const d = await (await get('/__assets/motorstack/brands')).json(); brands.value = Array.isArray(d.brands) ? d.brands.filter(b => typeof b.id === 'string' && typeof b.name === 'string') : []; if (brands.value.length) { brand.value = brands.value[0].id; await loadCatalog() } } catch (e) { fail(e) } finally { loading.value = false } }
async function loadCatalog() { if (!brand.value) return; const gen = ++generation; loading.value = true; error.value = ''; denied.value = false; notice.value = ''; try { const p = new URLSearchParams({ brand: brand.value, kind: kind.value }); if (modelEnabled.value && appliedModel.value) p.set('model', appliedModel.value); const d = await (await get('/__assets/motorstack/catalog?' + p)).json(); if (gen !== generation) return; assets.value = (Array.isArray(d.assets) ? d.assets : []).filter(a => a && typeof a.id === 'string' && typeof a.name === 'string' && safeURL(a.url)).map(a => ({ ...a, url: safeURL(a.url), thumbnail: safeURL(a.thumbnail) })); colors.value = (Array.isArray(d.colors) ? d.colors : []).map(c => typeof c === 'string' ? { name: c, value: c } : c).filter(c => /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c.value || c.hex || '')).map(c => ({ name: c.name || c.value || c.hex, value: c.value || c.hex })); } catch (e) { if (gen === generation) fail(e) } finally { if (gen === generation) loading.value = false } }
watch(brand, (value, old) => { model.value = ''; appliedModel.value = ''; modelError.value = ''; if (value && old) loadCatalog() })
watch(kind, () => { if (brand.value) loadCatalog() })
function applyModel() { const value = model.value.trim(); if (value.length > 100) { modelError.value = 'Use a model name of 100 characters or fewer.'; return } modelError.value = ''; appliedModel.value = value; loadCatalog() }
function image(a) { return /^image\/(png|jpeg|webp|avif)$/i.test(a.mime || '') }
function filename(a) { const name = a.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').slice(0, 140) || 'Motorstack asset'; const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'application/pdf': 'pdf', 'font/woff2': 'woff2', 'font/woff': 'woff', 'font/ttf': 'ttf', 'font/otf': 'otf', 'image/svg+xml': 'svg' }[a.mime]; return ext && !name.toLowerCase().endsWith('.' + ext) ? name + '.' + ext : name }
async function bytes(a) { const r = await get(a.url); const b = await r.blob(); if (b.size > 32 * 1024 * 1024) throw Error('This asset is too large to import here.'); return b }
async function download(a) { busy.value = a.id; error.value = ''; try { const b = await bytes(a); const url = URL.createObjectURL(b); const link = document.createElement('a'); link.href = url; link.download = filename(a); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); notice.value = 'Download started.' } catch (e) { fail(e) } finally { busy.value = '' } }
async function send(a) { busy.value = a.id; error.value = ''; try { if (!visual || !image(a) || a.importable === false) return; const canvas = document.querySelector('canvas'); if (!canvas) throw Error('Open a document in the editor, then try again.'); const b = await bytes(a); if (!/^image\/(png|jpeg|webp|avif)$/i.test(b.type)) throw Error('This asset cannot be sent to the editor. Download it instead.'); if (typeof DataTransfer !== 'function' || typeof DragEvent !== 'function') throw Error('This browser cannot send files directly. Download the asset, then open it in your editor.'); const transfer = new DataTransfer(); transfer.items.add(new File([b], filename(a), { type: b.type })); const r = canvas.getBoundingClientRect(); for (const type of ['dragenter', 'dragover', 'drop']) canvas.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); notice.value = 'Sent to the editor. The editor chooses how to open or import the file.'; } catch (e) { fail(e) } finally { busy.value = '' } }
onMounted(async () => { props.ready?.(); await loadBrands() })
</script>
<template>
  <UApp :toaster="null" :portal="false">
    <div class="xf-library">
      <section class="xf-library-panel" role="dialog" aria-label="Motorstack asset library" aria-modal="false">
        <header class="xf-library-head"><div><h2>Motorstack assets</h2><p>Your connected brand library</p></div><UButton color="neutral" variant="ghost" aria-label="Close asset library" @click="close">Close</UButton></header>
        <div class="xf-library-controls">
          <div class="xf-library-brands" aria-label="Choose a brand"><UButton v-for="b in brands" :key="b.id" size="xs" :color="brand === b.id ? 'primary' : 'neutral'" :variant="brand === b.id ? 'soft' : 'ghost'" :aria-pressed="brand === b.id" @click="brand = b.id">{{ b.name }}</UButton></div>
          <UFormField label="Find an asset"><UInput v-model="search" placeholder="Search names in this library" class="w-full" /></UFormField>
          <div class="xf-library-kinds" aria-label="Asset category"><UButton v-for="k in kinds" :key="k.id" size="xs" :color="kind === k.id ? 'primary' : 'neutral'" :variant="kind === k.id ? 'soft' : 'ghost'" :aria-pressed="kind === k.id" @click="kind = k.id">{{ k.name }}</UButton></div>
          <UFormField label="Model (optional)" :error="modelError" class="xf-library-model"><div class="xf-library-model-controls"><UInput v-model="model" placeholder="e.g. Ariya" :maxlength="100" :disabled="!modelEnabled" class="w-full" @keydown.enter.prevent="applyModel" /><UButton color="neutral" variant="soft" :disabled="!modelEnabled || loading" @click="applyModel">Apply</UButton></div></UFormField>
        </div>
        <div class="xf-library-scroll" aria-live="polite">
          <div v-if="error" class="xf-library-state" role="status"><p>{{ error }}</p><UButton v-if="!denied" variant="soft" class="mt-3" @click="brands.length ? loadCatalog() : loadBrands()">Try again</UButton><UButton v-else to="/__auth/start?return=%2F" target="_blank" rel="noopener noreferrer" class="mt-3">Sign in to XeroFlow</UButton></div>
          <p v-else-if="loading" class="xf-library-state">Loading your library…</p>
          <p v-else-if="!brands.length" class="xf-library-state">No brands are connected to this library.</p>
          <template v-else>
            <div v-if="colors.length && !search" class="xf-library-colors"><h3 class="xf-library-section">Brand colours</h3><span v-for="c in colors" :key="c.value" class="xf-library-color"><span class="xf-library-swatch" :style="{ backgroundColor: c.value }"></span>{{ c.name }} {{ c.value }}</span></div>
            <p class="xf-library-count">{{ filtered.length }} {{ filtered.length === 1 ? 'asset' : 'assets' }}</p>
            <p v-if="!filtered.length" class="xf-library-state">No matching assets. Try another name, brand or category.</p>
            <div class="xf-library-grid"><article v-for="a in filtered" :key="a.id" class="xf-library-card"><img v-if="a.thumbnail" :src="a.thumbnail" :alt="a.name" loading="lazy" class="xf-library-art"><div v-else class="xf-library-file">{{ a.type || 'File' }}</div><div class="xf-library-card-body"><h3>{{ a.name }}</h3><div class="xf-library-card-actions"><UButton v-if="visual && image(a) && a.importable !== false" size="xs" color="primary" variant="soft" :disabled="!!busy" @click="send(a)">{{ busy === a.id ? 'Working…' : 'Send to editor' }}</UButton><UButton size="xs" color="neutral" variant="outline" :disabled="!!busy" @click="download(a)">Download</UButton></div></div></article></div>
          </template>
        </div>
        <footer class="xf-library-notice"><span v-if="notice" role="status">{{ notice }}</span><span v-else-if="!visual">This library contains visual assets. Download them to use in another application.</span><span v-else>Choose an image to send to the editor, or download a file.</span></footer>
      </section>
    </div>
  </UApp>
</template>
