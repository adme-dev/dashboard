import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, symlink, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from 'playwright'

// Actual production Nuxt UI page/components, synthetic transport; no credentials or billing.
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const directory = await mkdtemp(join(tmpdir(), 'image-credits-browser-'))
const output = resolve(process.env.IMAGE_CREDITS_SCREENSHOTS || join(root, '.output/image-credits-browser'))
let server, browser
try {
  await mkdir(output, { recursive: true })
  await symlink(join(root, 'node_modules'), join(directory, 'node_modules'))
  await writeFile(join(directory, 'package.json'), '{"type":"module","private":true}')
  for (const file of ['vite.config.mjs', 'index.html']) {
    const source = await readFile(join(root, 'test/fixtures/generatedCollectionsBrowser', `${file}.txt`), 'utf8')
    await writeFile(join(directory, file), source.replaceAll('__DASHBOARD_ROOT__', root).replaceAll('__FIXTURE_ROOT__', directory))
  }
  await writeFile(join(directory, 'style.css'), `@import "tailwindcss";\n@import "@nuxt/ui";\n@source "${root}/app/components/page-studio/ImageCreditSummary.vue";\n@source "${root}/app/pages/studio/credits.vue";\n@source "${root}/app/components/page-studio/ImageCreditTopUp.vue";`)
  await writeFile(join(directory, 'App.vue'), '<template><UApp><main class="mx-auto max-w-5xl p-5"><Suspense><RouterView /></Suspense></main></UApp></template>')
  await writeFile(join(directory, 'main.js'), `
import './style.css';
import * as Vue from 'vue';
import {createRouter,createWebHistory,useRoute} from 'vue-router';
import ui from '@nuxt/ui/vue-plugin';
import App from './App.vue';
import Credits from '${root}/app/pages/studio/credits.vue';
import Summary from '${root}/app/components/page-studio/ImageCreditSummary.vue';
import TopUp from '${root}/app/components/page-studio/ImageCreditTopUp.vue';
const state=Vue.reactive({fail:false,site:'site-a',requests:[],billing:true,paid:false,intents:[]});
const pack={id:'test100',version:'v1',currency:'aud',amountMinor:1000,credits:100};
window.fixture=state;
Object.assign(window,Vue,{useRoute,$fetch:async(url,options={})=>{if(url.endsWith('/receipt'))return {intentId:options.query.intentId,pack,status:state.paid?'confirmed':'pending',createdAt:new Date().toISOString(),compensatedCredits:0};state.intents.push(JSON.parse(JSON.stringify(options.body)));throw new Error('Synthetic unknown checkout');},navigateTo:()=>{throw new Error('Unexpected external navigation')},definePageMeta:()=>{},useHead:()=>{},useFetch:async(url,options={})=>{
 const data=Vue.ref(null),error=Vue.ref(null),pending=Vue.ref(false);
 const refresh=async()=>{pending.value=true;try{
  const endpoint=Vue.toValue(url),query=Vue.toValue(options.query);
  state.requests.push({endpoint,query});
  if(state.fail)throw new Error('Synthetic access denied');
  data.value=endpoint.endsWith('/billing')?{available:state.billing,canPurchase:true,mode:'test',packs:state.billing?[pack]:[],purchases:[]}:endpoint.endsWith('/sites')?{sites:[{id:'site-a',name:'Linen Studio'},{id:'site-b',name:'Second customer'}],total:2}:{balance:{available:endpoint.includes('site-a')?70:25,balance:80,reserved:10,frozen:false},canPurchase:true,history:{items:[{id:'entry',kind:query?.before?'grant':'settle',credits:query?.before?100:-10,reserved:query?.before?0:-10,createdAt:'2026-09-30T00:00:00Z'}],nextCursor:query?.before?null:{createdAt:'2026-09-30T00:00:00.123456Z',entryId:'cursor'}}};
  error.value=null;
 }catch(e){error.value=e}finally{pending.value=false}};
 await refresh();Vue.watch(()=>[Vue.toValue(url),Vue.toValue(options.query)],refresh,{deep:true});return {data,error,pending,refresh};
}});
const router=createRouter({history:createWebHistory(),routes:[{path:'/',component:Credits}]});
const app=Vue.createApp(App);app.component('PageStudioImageCreditSummary',Summary);app.component('PageStudioImageCreditTopUp',TopUp);app.use(router);app.use(ui);app.mount('#app');
`)
  server = await createServer({ configFile: join(directory, 'vite.config.mjs') })
  await server.listen()
  const address = server.httpServer.address()
  assert(address && typeof address !== 'string')
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${address.port}`)
  await page.getByRole('heading', { name: 'Available image credits' }).waitFor()
  await page.getByRole('cell', { name: /Image saved/ }).waitFor()
  for (const mode of ['light', 'dark']) {
    await page.evaluate(value => document.documentElement.classList.toggle('dark', value === 'dark'), mode)
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      assert.equal(await page.getByRole('heading', { name: 'Image credits', exact: true }).count(), 1)
      await page.screenshot({ path: join(output, `credits-${mode}-${width}.png`), fullPage: true, animations: 'disabled' })
    }
  }
  await page.getByRole('combobox', { name: 'Credit pack' }).click()
  await page.getByRole('option', { name: /100 credits/ }).click()
  await page.getByRole('button', { name: 'Continue to test checkout' }).click()
  await page.getByText('Checkout could not be confirmed. Retry this same purchase or check its payment status.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Resume test checkout' }).click()
  const intents = await page.evaluate(() => window.fixture.intents)
  assert.equal(intents.length, 2)
  assert.deepEqual(intents[0], intents[1])
  await page.getByRole('button', { name: 'Check payment status' }).click()
  await page.getByText('Payment is not confirmed yet. Check again before starting another purchase.', { exact: true }).waitFor()
  await page.evaluate(() => {
    window.fixture.paid = true
  })
  await page.getByRole('button', { name: 'Check payment status' }).click()
  await page.getByText('Payment confirmed. Your credit activity includes this purchase.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Start another purchase' }).click()
  await page.getByRole('button', { name: 'Older activity', exact: true }).click()
  await page.getByRole('cell', { name: /Credits added/ }).waitFor()
  const requests = await page.evaluate(() => window.fixture.requests)
  assert.equal(requests.filter(item => item.endpoint.endsWith('/account')).at(-1).query.before, JSON.stringify({ createdAt: '2026-09-30T00:00:00.123456Z', entryId: 'cursor' }))
  await page.getByRole('button', { name: 'Website', exact: true }).click()
  await page.getByRole('option', { name: 'Second customer' }).click()
  await page.getByText('25', { exact: true }).waitFor()
  await page.getByRole('cell', { name: /Image saved/ }).waitFor()
  await page.evaluate(() => {
    window.fixture.fail = true
  })
  await page.getByRole('button', { name: 'Refresh credits', exact: true }).click()
  await page.getByText('Credits could not be loaded', { exact: true }).waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Available image credits' }).count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS: real Nuxt UI credits page, desktop/mobile, activity cursor, site switch reset, access failure hides retained data, test checkout retry identity, pending/confirmed receipt; zero browser errors.')
} finally {
  await browser?.close()
  await server?.close()
  await rm(directory, { recursive: true, force: true })
}
