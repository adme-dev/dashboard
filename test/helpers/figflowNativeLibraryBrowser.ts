/* eslint @typescript-eslint/no-explicit-any: off -- Dynamic browser/Worker JSON is asserted at the acceptance boundary. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { build } from 'esbuild'
import { compileScript, parse } from '@vue/compiler-sfc'
import { chromium, type Page } from 'playwright'

export const REVIEWED_08A_SOURCE = 'e615f5baaf01bd5c9cf6dc26a19145029eed2b02'
export const PREPARED_SOURCE = '956330e9b1131b50b368e8c236dea1e166f53a2f'
export const ACCEPTED_CORE_WASM = '70bfa31a2d7d0752293a3db7594b722b3bc3da992ad01e7484406fbe365c6b08'
export const NATIVE_08A_SOURCE = {
  engine: '530a33cf1d2b5e7a7c102ec9fa257a720ef18592f54ebe5bd62728c64f2f2d47',
  bridge: 'f6c14f7e9442fbac5ac4a82def700fdf3c554c7b96d2e059565dfc3a218d457d',
  patch: 'b4db2b0d', engineTests: 32, bridgeTests: 9, uiTests: 8
} as const
export const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')
export interface NativeLibraryReceipt {
  sourceCommit: string
  sourceDescription: string
  runtimeSourceFiles: Record<string, string>
  worker: {
    path: string
    sha256: string
  }
  renderer: {
    path: string
    sha256: string
  }
  native: {
    packageDirectory: string
    wasmFile: string
    wasmSha256: string
    zipSha256: string
    ciRun: string
    engineSha256: string
    bridgeSha256: string
    patchSha256: string
    engineTests: number
    bridgeTests: number
    uiTests: number
  }
  migrations: Array<{
    path: string
    sha256: string
  }>
}
export type NativeInput = {
  click: {
    x: number
    y: number
  }
} | {
  press: string
} | {
  text: string
} | {
  wheel: {
    x: number
    y: number
    deltaY: number
  }
}
/** Coordinates must be calibrated against the matching package's actual canvas.
 * These are input events, never bridge commands or mutation/state expressions. */
export interface NativeLibraryUiPlan {
  viewport: {
    width: number
    height: number
  }
  section: {
    x: number
    y: number
  }
  standaloneImage: {
    x: number
    y: number
  }
  firstInsertedInstance: {
    x: number
    y: number
  }
  secondInsertedInstance: {
    x: number
    y: number
  }
  edit: NativeInput[]
  expectedEditedText: string
  revisionEdit: NativeInput[]
  expectedRevisedText: string
  concurrentEdit: NativeInput[]
  expectedConcurrentText: string
}
export interface NativeLibraryDraft {
  documentId: string
  templateId: string
  revisionId: string
  blocks: Record<string, any>
  moduleInstances: Array<{
    instanceId: string
    moduleId: string
    revisionId: string
    rootBlockIds: string[]
  }>
  assets: Array<{
    id: string
  }>
  locks: unknown
  dependencies: unknown
  lineage: Array<{ blockId: string, nodeId: string, fields: unknown }>
  scope: unknown
  provenance: unknown
  subject: string | null
  previewText: string | null
}
/** Read committed files even while other owners have dirty files in this root. */
export function frozenReader(sourceCommit: string) {
  assert(/^[a-f0-9]{40}$/.test(sourceCommit), 'Require an exact committed browser source')
  execFileSync('git', ['merge-base', '--is-ancestor', REVIEWED_08A_SOURCE, sourceCommit])
  const paths = new Set(execFileSync('git', ['ls-tree', '-r', '--name-only', sourceCommit], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim().split('\n'))
  const consumed: Record<string, string> = {}
  const read = (path: string) => {
    assert(paths.has(path), `Missing frozen source: ${path}`)
    const bytes = execFileSync('git', ['show', `${sourceCommit}:${path}`], { maxBuffer: 16 * 1024 * 1024 })
    consumed[path] = sha256(bytes)
    return bytes.toString('utf8')
  }
  return { paths, read, consumed }
}
/** Only Nuxt framework plumbing and UI leaves are substituted. Every email
 * component, editor store, flow, library and image owner is frozen real source. */
const leafRuntime = `
const localState = new Map();
Object.assign(globalThis, Vue, {
  $fetch, useRoute, useRouter,
  useState: (key, init) => { if (!localState.has(key)) localState.set(key, Vue.ref(init())); return localState.get(key); },
  useRuntimeConfig: () => ({public:{figflowEdmEnabled:true}}),
  navigateTo: target => router.push(target),
  useToast: () => ({add: value => { const item=document.createElement('p'); item.textContent=[value.title,value.description].filter(Boolean).join(': '); document.querySelector('#fixture-toasts').append(item); }}),
  useEdmBuilder, useEdmDesignRoundtrip, useEdmDesignBrand, useEdmConditions, useEdmMergeTags, useEdmCustomModules, useEdmWorkspaceLeave
});
const passthrough = {setup:(_,ctx)=>()=>Vue.h('div',ctx.attrs,ctx.slots.default?.())};
const button = {props:['label','disabled','loading'],emits:['click'],setup:(p,c)=>()=>Vue.h('button',{...c.attrs,type:'button',disabled:p.disabled||p.loading,onClick:e=>c.emit('click',e)},c.slots.default?.()??p.label)};
const input = {props:['modelValue','type','disabled','readonly'],emits:['update:modelValue','blur','change'],setup:(p,c)=>{const label=Vue.inject('fixture-field-label',null);return()=>Vue.h(p.type==='textarea'?'textarea':'input',{...c.attrs,'aria-label':Vue.unref(label),type:p.type||'text',value:p.modelValue??'',disabled:p.disabled,readonly:p.readonly,onInput:e=>c.emit('update:modelValue',e.target.value),onChange:e=>c.emit('change',e),onBlur:e=>c.emit('blur',e)})}};
const textarea={...input,setup:(p,c)=>{const label=Vue.inject('fixture-field-label',null);return()=>Vue.h('textarea',{...c.attrs,'aria-label':Vue.unref(label),value:p.modelValue??'',disabled:p.disabled,onInput:e=>c.emit('update:modelValue',e.target.value),onBlur:e=>c.emit('blur',e)})}};
const select={props:['modelValue','items','disabled','valueKey','labelKey'],emits:['update:modelValue'],setup:(p,c)=>{const label=Vue.inject('fixture-field-label',null);return()=>Vue.h('select',{...c.attrs,'aria-label':Vue.unref(label),value:p.modelValue,disabled:p.disabled,onChange:e=>c.emit('update:modelValue',e.target.value)},(p.items??[]).map(item=>Vue.h('option',{value:typeof item==='object'?item[p.valueKey||'value']:item,disabled:item.disabled},typeof item==='object'?item[p.labelKey||'label']:item)))}};
const check={props:['modelValue','label','disabled'],emits:['update:modelValue'],setup:(p,c)=>()=>Vue.h('label',{...c.attrs},[Vue.h('input',{type:'checkbox',checked:p.modelValue,disabled:p.disabled,onChange:e=>c.emit('update:modelValue',e.target.checked)}),p.label])};
const overlay={props:['open','title','dismissible'],emits:['update:open'],setup:(p,c)=>()=>p.open?Vue.h('dialog',{class:'fixture-dialog','aria-label':p.title,'aria-modal':'true',onVnodeMounted:v=>{if(!v.el.open)v.el.showModal()},onCancel:e=>{e.preventDefault();if(p.dismissible!==false)c.emit('update:open',false)}},[c.slots.content?.()??[Vue.h('h2',p.title),c.slots.header?.(),c.slots.body?.(),c.slots.default?.(),c.slots.footer?.()]]):null};
const popover={props:['open'],emits:['update:open'],setup:(p,c)=>{const local=Vue.ref(false);return()=>Vue.h('div',[Vue.h('span',{onClick:()=>{local.value=!(p.open??local.value);c.emit('update:open',local.value)}},c.slots.default?.()),(p.open??local.value)?c.slots.content?.():null])}};
const field={props:['label','help'],setup:(p,c)=>{Vue.provide('fixture-field-label',Vue.computed(()=>p.label));return()=>Vue.h('div',{...c.attrs,class:'fixture-field'},[Vue.h('span',p.label),c.slots.default?.(),p.help?Vue.h('small',p.help):null])}};
const alert={props:['title','description','actions'],setup:(p,c)=>()=>Vue.h('div',{role:'alert'},[p.title,p.description,c.slots.default?.(),...(p.actions??[]).map(a=>Vue.h('button',{onClick:a.onClick},a.label))])};
const slider={props:['modelValue','min','max','step','disabled'],emits:['update:modelValue'],setup:(p,c)=>()=>Vue.h('input',{type:'range',min:p.min,max:p.max,step:p.step,disabled:p.disabled,value:Array.isArray(p.modelValue)?p.modelValue[0]:p.modelValue,onInput:e=>c.emit('update:modelValue',Array.isArray(p.modelValue)?[Number(e.target.value)]:Number(e.target.value))})};
const leaves={UButton:button,UInput:input,UTextarea:textarea,USelect:select,UCheckbox:check,UFormField:field,UModal:overlay,USlideover:overlay,UPopover:popover,UAlert:alert,USlider:slider,UIcon:passthrough,UBadge:passthrough,UTooltip:passthrough,USeparator:passthrough,UCard:passthrough,USkeleton:passthrough,ClientOnly:passthrough,NuxtLink:RouterLink};
`
export async function compileNativeLibraryBuilder(options: {
  sourceCommit: string
  templateId: string
}) {
  const root = process.cwd()
  const frozen = frozenReader(options.sourceCommit)
  const allComponents = [...frozen.paths].filter(path => path.startsWith('app/components/') && path.endsWith('.vue'))
  const nameOf = (path: string) => path.replace('app/components/', '').replace(/\.(client|server)\.vue$|\.vue$/g, '').split('/').map(part => part[0]!.toUpperCase() + part.slice(1)).join('')
  const componentPaths = new Map(allComponents.map(path => [nameOf(path), path]))
  const pending = ['app/components/email/builder/EdmFlyhubBuilder.client.vue']
  const selected = new Set<string>()
  const requiredLeaves = new Set<string>()
  for (const path of pending) {
    if (selected.has(path))
      continue
    selected.add(path)
    const { descriptor } = parse(frozen.read(path), { filename: path })
    const bindings = compileScript(descriptor, { id: sha256(path).slice(0, 12) }).bindings
    for (const [, name] of (descriptor.template?.content ?? '').matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) {
      if (bindings[name!])
        continue
      if (['Suspense', 'Transition', 'TransitionGroup', 'Teleport', 'KeepAlive'].includes(name!))
        continue
      if (componentPaths.has(name!))
        pending.push(componentPaths.get(name!)!)
      else
        requiredLeaves.add(name!)
    }
  }
  const supported = ['UButton', 'UInput', 'UTextarea', 'USelect', 'UCheckbox', 'UFormField', 'UModal', 'USlideover', 'UPopover', 'UAlert', 'USlider', 'UIcon', 'UBadge', 'UTooltip', 'USeparator', 'UCard', 'USkeleton', 'ClientOnly', 'NuxtLink']
  assert.deepEqual([...requiredLeaves].filter(name => !supported.includes(name)), [], 'A new UI component needs a semantic fixture; never silently stub it')
  const registrations = [...selected].map((path, index) => ({ path, name: nameOf(path), local: `Component${index}` }))
  const composables = ['useEdmBuilder', 'useEdmDesignRoundtrip', 'useEdmDesignBrand', 'useEdmConditions', 'useEdmMergeTags', 'useEdmCustomModules', 'useEdmWorkspaceLeave']
  const entry = `
import * as Vue from 'vue'; import {$fetch} from 'ofetch';
import {createRouter,createMemoryHistory,useRoute,useRouter,RouterLink} from 'vue-router';
${composables.map(name => `import {${name}} from './app/composables/${name}';`).join('\n')}
${registrations.map(c => `import ${c.local} from './${c.path}';`).join('\n')}
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/agency/email/builder',component:${registrations[0]!.local}}]});
${leafRuntime}
const app=Vue.createApp({setup:()=>()=>Vue.h(Vue.Suspense,null,{default:()=>Vue.h('main',[Vue.h(RouterView)])})});
// RouterView must be the actual router component, not a custom host state machine.
import {RouterView} from 'vue-router';
app.component('router-view',RouterView);
${registrations.map(c => `app.component('${c.name}',${c.local});`).join('\n')}
Object.entries(leaves).forEach(([name,component])=>app.component(name,component));
app.use(router);
router.push({path:'/agency/email/builder',query:{id:${JSON.stringify(options.templateId)},workspace:'figflow'}}).then(()=>router.isReady()).then(()=>app.mount('#app'));
// Read-only store observation. No flow, edit, history, save or selection action is exported.
window.__nativeLibraryRead=()=>JSON.parse(JSON.stringify({blocks:useEdmBuilder().document.value,selectedBlockId:useEdmBuilder().selectedBlockId.value}));
`
  const result = await build({
    stdin: { contents: entry, loader: 'ts', resolveDir: root }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
    define: { 'process.env.NODE_ENV': '"production"', '__VUE_OPTIONS_API__': 'true', '__VUE_PROD_DEVTOOLS__': 'false', '__VUE_PROD_HYDRATION_MISMATCH_DETAILS__': 'false' },
    plugins: [{ name: 'frozen-real-builder', setup(builder) {
      builder.onResolve({ filter: /^(?:\.{1,2}\/|~~\/|~\/)/ }, (args) => {
        if (args.namespace !== 'frozen' && args.importer && args.importer !== '<stdin>' && !args.importer.startsWith(root + sep))
          return
        if (args.importer.includes('/node_modules/'))
          return
        let path = args.path.startsWith('~~/') ? args.path.slice(3) : args.path.startsWith('~/') ? 'app/' + args.path.slice(2) : relative(root, resolve(args.resolveDir || dirname(args.importer), args.path))
        path = [path, path + '.ts', path + '.js', path + '.vue', path + '/index.ts'].find(candidate => frozen.paths.has(candidate)) ?? ''
        assert(path, `Unresolved frozen dependency ${args.path} from ${args.importer}`)
        return { path: resolve(root, path), namespace: 'frozen' }
      })
      builder.onLoad({ filter: /.*/, namespace: 'frozen' }, (args) => {
        const path = relative(root, args.path)
        const source = frozen.read(path)
        const contents = path.endsWith('.vue') ? compileScript(parse(source, { filename: args.path }).descriptor, { id: sha256(path).slice(0, 12), inlineTemplate: true }).content : source
        return { contents, loader: path.endsWith('.json') ? 'json' : 'ts', resolveDir: dirname(args.path) }
      })
    } }], logLevel: 'silent'
  })
  return { bytes: result.outputFiles[0]!.contents, sourceCommit: options.sourceCommit, sourceFiles: frozen.consumed, components: registrations.map(c => c.path), leaves: [...requiredLeaves].sort() }
}
/** Consume the coordinator's frozen archive receipts without rebuilding it. */
export async function readFrozenLibraryRuntime(directory: string) {
  const root = resolve(directory)
  assert(root.startsWith(resolve('.verification') + sep))
  const sourceBytes = await readFile(resolve(root, 'source-receipt.json'))
  const workerBytes = await readFile(resolve(root, 'private-worker-receipt.json'))
  const rendererBytes = await readFile(resolve(root, 'renderer-receipt.json'))
  const source = JSON.parse(sourceBytes.toString())
  const worker = JSON.parse(workerBytes.toString())
  const renderer = JSON.parse(rendererBytes.toString())
  assert.equal(source.sourceCommit, PREPARED_SOURCE)
  assert.equal(worker.sourceCommit, source.sourceCommit)
  assert.equal(renderer.sourceCommit, source.sourceCommit)
  assert.equal(worker.sourceArchiveSha256, source.sourceArchiveSha256)
  assert.equal(worker.admissionPassed, 22)
  assert.equal(worker.configuredDatabase, false)
  assert.equal(worker.deployment, false)
  const entries = Object.entries(source.files) as Array<[string, string]>
  assert.equal(entries.length, source.sourceFiles)
  for (let offset = 0; offset < entries.length; offset += 64) await Promise.all(entries.slice(offset, offset + 64).map(async ([path, hash]) => {
    const file = resolve(root, 'source', path)
    assert(file.startsWith(resolve(root, 'source') + sep))
    assert.equal(sha256(await readFile(file)), hash, 'Frozen archive changed: ' + path)
  }))
  const workerPath = resolve(worker.path)
  assert(workerPath.startsWith(root + sep))
  const rendererPath = resolve(root, renderer.artifact)
  assert(rendererPath.startsWith(root + sep))
  assert.equal(sha256(await readFile(workerPath)), worker.sha256)
  assert.equal(sha256(await readFile(rendererPath)), renderer.sha256)
  const runtimeSourceFiles = Object.fromEntries(['workers/email-design/admission.mjs', 'workers/email-design/sessionToken.ts', 'server/utils/email-marketing/designRevisions.ts', 'server/utils/email-marketing/designReads.ts', 'server/utils/email-marketing/designModules.ts', 'shared/emailRendering/designDesigner.ts', 'workers/email-rendering/src/index.ts', 'workers/email-rendering/src/handleRender.ts'].map(path => [path, source.files[path]]))
  return {
    sourceCommit: source.sourceCommit as string,
    sourceDescription: 'Parent frozen archive ' + source.sourceArchiveSha256 + '; all ' + entries.length + ' source files reverified',
    runtimeSourceFiles,
    worker: { path: workerPath, sha256: worker.sha256 as string },
    renderer: { path: rendererPath, sha256: renderer.sha256 as string },
    provenance: { sourceReceiptSha256: sha256(sourceBytes), privateWorkerReceiptSha256: sha256(workerBytes), rendererReceiptSha256: sha256(rendererBytes), sourceFilesVerified: entries.length, admissionPassed: worker.admissionPassed }
  }
}

export async function validateNativeLibraryReceipt(receipt: NativeLibraryReceipt) {
  assert(receipt.sourceDescription.trim(), 'Name the frozen runtime snapshot')
  assert.equal(receipt.sourceCommit, PREPARED_SOURCE, 'Use the reviewed frozen checkpoint, never mixed dirty source')
  frozenReader(receipt.sourceCommit)
  assert.notEqual(receipt.native.wasmSha256, ACCEPTED_CORE_WASM, 'Accepted core bytes cannot establish 08a acceptance')
  for (const key of ['wasmSha256', 'zipSha256', 'engineSha256', 'bridgeSha256', 'patchSha256'] as const)
    assert(/^[a-f0-9]{64}$/.test(receipt.native[key]), `Missing exact ${key}`)
  assert.equal(receipt.native.engineSha256, NATIVE_08A_SOURCE.engine)
  assert.equal(receipt.native.bridgeSha256, NATIVE_08A_SOURCE.bridge)
  assert(receipt.native.patchSha256.startsWith(NATIVE_08A_SOURCE.patch))
  assert.equal(receipt.native.engineTests, 32)
  assert.equal(receipt.native.bridgeTests, 9)
  assert.equal(receipt.native.uiTests, 8)
  assert(/^\d+$/.test(receipt.native.ciRun))
  for (const artifact of [receipt.worker, receipt.renderer]) {
    const path = resolve(artifact.path)
    assert(path.startsWith(resolve('.verification') + sep), 'Only parent-supplied verification artifacts are allowed')
    assert.equal(sha256(await readFile(path)), artifact.sha256)
  }
  const nativeRoot = resolve(receipt.native.packageDirectory)
  assert(nativeRoot.startsWith(resolve('.verification') + sep), 'Only an owned unpacked package is allowed')
  const wasm = resolve(nativeRoot, receipt.native.wasmFile)
  assert(wasm.startsWith(nativeRoot + sep))
  assert.equal(sha256(await readFile(wasm)), receipt.native.wasmSha256)
  const frozen = frozenReader(receipt.sourceCommit)
  for (const path of ['workers/email-design/admission.mjs', 'workers/email-design/sessionToken.ts', 'server/utils/email-marketing/designRevisions.ts', 'server/utils/email-marketing/designReads.ts', 'server/utils/email-marketing/designModules.ts', 'shared/emailRendering/designDesigner.ts', 'workers/email-rendering/src/index.ts', 'workers/email-rendering/src/handleRender.ts']) assert(receipt.runtimeSourceFiles[path], 'Missing frozen runtime input ' + path)
  for (const [path, hash] of Object.entries(receipt.runtimeSourceFiles)) assert.equal(sha256(frozen.read(path)), hash, 'Mixed runtime source ' + path)
  assert.equal(sha256(frozen.read('workers/craft-editors/patches/figflow-browser-bridge.patch')), receipt.native.patchSha256)
  assert(receipt.migrations.length > 0)
  for (const file of receipt.migrations) {
    assert(/^server\/database\/migrations\/49[1-7]_[a-z_]+\.sql$/.test(file.path), '498/dirty foundation is excluded from this prepared fixture')
    assert.equal(sha256(frozen.read(file.path)), file.sha256)
  }
}
const fixtureCss = `body{margin:0;font:14px system-ui;color:#17212f;background:#f5f6f8}button,input,select,textarea{font:inherit;padding:8px;margin:3px}button:disabled{opacity:.45}.fixture-field{display:flex;flex-direction:column;gap:4px;margin:8px 0}.fixture-dialog{position:fixed;inset:0;z-index:40;padding:16px;margin:0;max-width:none;max-height:none;width:100%;height:100%;box-sizing:border-box;background:white;overflow:auto}.flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1 1 0%}.min-h-0{min-height:0}.h-full{height:100%}.w-full{width:100%}.overflow-hidden{overflow:hidden}.overflow-y-auto{overflow-y:auto}.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}iframe{box-sizing:border-box;display:block;width:100%;height:520px;border:1px solid #ccd2db}iframe[title="FigFlow email design"]{height:820px;min-width:1000px}iframe[class*="1000px"]{max-width:1000px}iframe[class*="390px"]{max-width:390px}img{max-width:100%}#fixture-toasts{position:fixed;bottom:0;right:0;z-index:99;pointer-events:none}`
/** All host mutations below are triggered by the real components' visible UI.
 * HTTP fault injection changes transport acknowledgements only, never state. */
export async function exerciseNativeLibraryBrowser(options: {
  receipt: NativeLibraryReceipt
  plan: NativeLibraryUiPlan
  evidenceDirectory: string
  templateId: string
  moduleName: string
  imageName: string
  originalImageBlockId: string
  replacementAssetId: string
  request(path: string, body: unknown, method: string): Promise<{
    status: number
    body: any
  }>
  publicAsset(path: string): Promise<{
    bytes: Uint8Array
    contentType: string
  } | null>
  readDraft(): Promise<NativeLibraryDraft>
  readModule(id: string): Promise<{
    revisionId: string
  }>
}) {
  await validateNativeLibraryReceipt(options.receipt)
  const bundle = await compileNativeLibraryBuilder({ sourceCommit: options.receipt.sourceCommit, templateId: options.templateId })
  const evidence = resolve(options.evidenceDirectory)
  assert(evidence.startsWith(resolve('.verification/figflow-native-library-browser') + sep), 'Use a new run-specific evidence directory')
  await mkdir(evidence, { recursive: true })
  await writeFile(resolve(evidence, 'source-receipt.json'), JSON.stringify({ ...options.receipt, browserBundleSha256: sha256(bundle.bytes), browserSourceFiles: bundle.sourceFiles, realComponents: bundle.components, fixtureLeaves: bundle.leaves, fixtureCssSha256: sha256(fixtureCss), plan: options.plan }, null, 2))
  const playwrightSource = await readFile(resolve('node_modules/playwright-core/lib/coreBundle.js'), 'utf8')
  const injection = 'if (navigator.serviceWorker) navigator.serviceWorker.register = async () =>'
  const offset = playwrightSource.indexOf(injection)
  assert(offset > 0, 'Recheck Playwright instrumentation before classifying its known sandbox diagnostic')
  await writeFile(resolve(evidence, 'playwright-instrumentation.json'), JSON.stringify({ sha256: sha256(playwrightSource), line: playwrightSource.slice(0, offset).split('\n').length, snippet: playwrightSource.slice(offset - 100, offset + 160) }, null, 2))
  const browser = await chromium.launch({ executablePath: process.env.FIGFLOW_DESIGNER_CHROMIUM, headless: true, args: ['--enable-unsafe-swiftshader'] })
  const context = await browser.newContext({ viewport: options.plan.viewport, serviceWorkers: 'block' })
  const journal: Array<{
    path: string
    method: string
    body: any
    status: number
    response: any
    injected?: string
  }> = []
  const unexpected: string[] = [], errors: string[] = [], instrumentation: string[] = []
  const served: Record<string, string> = {}
  const responseChecks: Promise<void>[] = []
  let observedWasm: string | null = null
  let editorUrl: string | undefined
  let fault: 'failed-open' | 'unknown-open' | null = null
  let expectedConflict = false
  const attachedPages = new Set<Page>()
  const attach = async (page: Page) => {
    if (attachedPages.has(page))
      return
    attachedPages.add(page)
    const inspector = await context.newCDPSession(page)
    await inspector.send('Network.enable', { maxResourceBufferSize: 64 * 1024 * 1024, maxTotalBufferSize: 128 * 1024 * 1024 })
    page.on('pageerror', (error) => {
      const known = 'Failed to read the \'serviceWorker\' property from \'Navigator\': Service worker is disabled because the context is sandboxed and lacks the \'allow-same-origin\' flag.'
      const exact = 'SecurityError: ' + known + '\n    at <anonymous>:3:15\n    at <anonymous>:5:7'
      if (error.message === known && error.stack === exact)
        instrumentation.push(exact)
      else
        errors.push(error.stack ?? error.message)
    })
    const wasmRequests = new Map<string, { done(): void, url: string }>()
    inspector.on('Network.responseReceived', (event) => {
      if (!new URL(event.response.url).pathname.endsWith('.wasm')) return
      responseChecks.push(new Promise<void>(done => wasmRequests.set(event.requestId, { done, url: event.response.url })))
    })
    inspector.on('Network.loadingFinished', async (event) => {
      const captured = wasmRequests.get(event.requestId)
      if (!captured) return
      wasmRequests.delete(event.requestId)
      try {
        const response = await inspector.send('Network.getResponseBody', { requestId: event.requestId })
        observedWasm = sha256(Buffer.from(response.body, response.base64Encoded ? 'base64' : 'utf8'))
        assert.equal(observedWasm, options.receipt.native.wasmSha256, 'Actual CDP response bytes differ')
      } catch (error) {
        errors.push('WASM response capture: ' + String(error))
      } finally { captured.done() }
    })
    inspector.on('Network.loadingFailed', (event) => {
      const captured = wasmRequests.get(event.requestId)
      if (captured) {
        errors.push('WASM request failed: ' + event.errorText)
        wasmRequests.delete(event.requestId)
        captured.done()
      }
    })
    page.on('console', (message) => {
      if (message.type() !== 'error')
        return
      const location = message.location().url
      if (journal.some(entry => entry.injected && 'https://app.xeroflow.io' + entry.path === location) && /^Failed to load resource:/.test(message.text()))
        return
      errors.push(message.text())
    })
  }
  await context.routeWebSocket('**/*', (socket) => {
    unexpected.push('Unexpected WebSocket ' + socket.url())
    socket.close({ code: 1008, reason: 'Local fixture blocks WebSockets' })
  })
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url())
    try {
      if (url.origin === 'https://app.xeroflow.io') {
        if (url.pathname === '/fixture/native-library')
          return route.fulfill({ contentType: 'text/html', body: `<style>${fixtureCss}</style><div id="fixture-toasts" aria-live="polite"></div><div id="app"></div><script src="/fixture/native-library.js"></script>` })
        if (url.pathname === '/fixture/native-library.js')
          return route.fulfill({ contentType: 'application/javascript', body: Buffer.from(bundle.bytes) })
        if (url.pathname === '/favicon.ico')
          return route.fulfill({ status: 200, body: '' })
        if (url.pathname.startsWith('/api/public/banner-assets/')) {
          const asset = await options.publicAsset(url.pathname)
          assert(asset, 'Unregistered fixture image request')
          return route.fulfill({ contentType: asset.contentType, body: Buffer.from(asset.bytes), headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' } })
        }
        if (url.pathname.startsWith('/api/')) {
          const body = request.postData() ? request.postDataJSON() : undefined
          const isOpen = url.pathname === '/api/email/design/designer' && body?.command === 'open'
          const injected = isOpen ? fault : null
          if (injected)
            fault = null
          if (injected === 'failed-open') {
            journal.push({ path: url.pathname + url.search, method: request.method(), body, status: 503, response: null, injected })
            return route.fulfill({ status: 503, json: { statusMessage: 'fixture_precommit_open_unavailable' } })
          }
          const reply = await options.request(url.pathname + url.search, body, request.method())
          journal.push({ path: url.pathname + url.search, method: request.method(), body, status: reply.status, response: reply.body, ...(injected ? { injected } : {}) })
          if (reply.body?.handoff?.editorUrl) {
            const next = new URL(reply.body.handoff.editorUrl)
            assert.equal(next.protocol, 'https:')
            if (editorUrl)
              assert.equal(new URL(editorUrl).origin + new URL(editorUrl).pathname, next.origin + next.pathname, 'Handoff unexpectedly changed native package route')
            editorUrl = reply.body.handoff.editorUrl
          }
          if (injected === 'unknown-open') {
            assert.equal(reply.status, 200, 'Lost reply must follow a real committed open')
            return route.abort('connectionfailed')
          }
          if (reply.status >= 400) {
            assert(expectedConflict && reply.status === 409 && body?.command === 'update-module-instance', `Unexpected HTTP failure ${reply.status} ${url.pathname}: ${JSON.stringify(reply.body)}`)
            expectedConflict = false
            journal.at(-1)!.injected = 'real-stale-head-conflict'
          }
          return route.fulfill({ status: reply.status, json: reply.body })
        }
      }
      if (editorUrl) {
        const editor = new URL(editorUrl)
        // Follow the actual handoff URL; local package bytes may be mapped under
        // its older edm1 prefix. This does not activate a hosted URL/version.
        const prefix = editor.pathname.endsWith('/') ? editor.pathname : editor.pathname.slice(0, editor.pathname.lastIndexOf('/') + 1)
        if (url.origin === editor.origin && url.pathname.startsWith(prefix)) {
          const path = url.pathname.slice(prefix.length) || 'index.html'
          const file = resolve(options.receipt.native.packageDirectory, path)
          assert(file.startsWith(resolve(options.receipt.native.packageDirectory) + sep) && !path.includes('%'))
          const bytes = await readFile(file)
          served[path] = sha256(bytes)
          if (extname(file) === '.wasm') assert.equal(served[path], options.receipt.native.wasmSha256, 'Refuse mismatched native bytes before serving them')
          return route.fulfill({ body: bytes, contentType: ({ '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' } as Record<string, string>)[extname(file)] ?? 'application/octet-stream' })
        }
      }
      throw new Error('Unexpected network request ' + request.method() + ' ' + url.origin + url.pathname)
    } catch (error) {
      unexpected.push(String(error))
      await route.abort('blockedbyclient')
    }
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  await attach(page)
  const button = (name: string, target = page) => target.getByRole('button', { name, exact: true })
  const snapshot = async (name: string) => {
    await page.screenshot({ path: resolve(evidence, name + '.png'), fullPage: true })
    await writeFile(resolve(evidence, name + '.json'), JSON.stringify(await options.readDraft(), null, 2))
  }
  const assertSafePreview = async (title: string, name: string) => {
    const preview = page.getByTitle(title, { exact: true })
    await preview.waitFor()
    assert.equal(await preview.getAttribute('sandbox'), '')
    assert.equal(await preview.getAttribute('referrerpolicy'), 'no-referrer')
    const html = await preview.getAttribute('srcdoc')
    assert(html && !/<script\b/i.test(html), 'Preview must be compiled and scriptless')
    await writeFile(resolve(evidence, name + '.html'), html)
    for (const size of ['Desktop', 'Mobile']) {
      await button(size).last().click()
      assert((await preview.getAttribute('class'))?.includes(size === 'Mobile' ? '390px' : '1000px'))
      await snapshot(name + '-' + size.toLowerCase())
    }
  }
  const nativeFrame = async (target = page) => {
    const control = button('Return for review', target)
    await control.waitFor({ timeout: 60000 })
    await control.waitFor({ state: 'visible' })
    await target.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent?.trim() === 'Return for review' && !b.disabled), undefined, { timeout: 60000 })
    const frame = target.frames().find(frame => frame.url() === editorUrl)
    assert(frame, 'Missing native frame at actual handoff URL')
    return frame
  }
  const nativeRead = async (action: 'status' | 'edm_designer_snapshot' | 'edm_designer_context', target = page) => {
    const frame = await nativeFrame(target)
    await frame.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
    return frame.evaluate(async (action) => {
      const call = async (input: any) => {
        const raw = await (window as any).__xfFigBridge.request(JSON.stringify({ requestId: crypto.randomUUID(), ...input }))
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (!result.ok)
          throw new Error('Native read failed: ' + JSON.stringify(result))
        return result
      }
      const status = await call({ action: 'status' })
      if (action === 'status')
        return status
      return call({ action, instanceId: status.instanceId, documentId: status.documentId, expectedRevision: status.revision, params: {} })
    }, action)
  }
  const select = async (point: {
    x: number
    y: number
  }, expectedBlock?: string) => {
    const frame = await nativeFrame()
    await frame.locator('canvas').click({ position: point })
    const context = await nativeRead('edm_designer_context')
    if (expectedBlock)
      assert(context.result.selectedBlockIds.includes(expectedBlock), 'Calibrate the actual visible native selection before proceeding')
  }
  const nativeInputs = async (inputs: NativeInput[], target = page) => {
    assert(inputs.length > 0 && inputs.length <= 60)
    const canvas = (await nativeFrame(target)).locator('canvas')
    for (const event of inputs) {
      if ('click' in event)
        await canvas.click({ position: event.click })
      else if ('press' in event)
        await target.keyboard.press(event.press)
      else if ('text' in event)
        await target.keyboard.insertText(event.text)
      else {
        const box = await canvas.boundingBox()
        assert(box)
        await target.mouse.move(box.x + event.wheel.x, box.y + event.wheel.y)
        await target.mouse.wheel(0, event.wheel.deltaY)
      }
      await canvas.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
    }
  }
  const enterLibrary = async (intent = 'Library') => {
    await button(intent).click()
    await assertSafePreview('Captured email preview', 'capture-' + journal.length)
    await button('Use saved design in library').click()
    await button('Return to design').waitFor()
  }
  const restoredNative = async () => {
    await nativeFrame()
    const current = await options.readDraft()
    const store = await page.evaluate(() => (window as any).__nativeLibraryRead())
    assert.deepEqual(store.blocks, current.blocks, 'Real builder store/readback differs from confirmed canonical head')
    const raw = await nativeRead('edm_designer_snapshot')
    assert.deepEqual(raw.result.operations, [], 'Fresh same-owner reopen retained an old native operation log')
    return current
  }
  const reconcileReopen = async (action: () => Promise<unknown>, mode: 'failed-open' | 'unknown-open') => {
    fault = mode
    const isOpenRequest = (request: import('playwright').Request) => request.url().endsWith('/api/email/design/designer') && request.postDataJSON()?.command === 'open'
    const delivered = mode === 'failed-open'
      ? page.waitForResponse(response => response.status() === 503 && isOpenRequest(response.request()))
      : page.waitForEvent('requestfailed', { predicate: isOpenRequest })
    await action()
    await delivered
    await button('Reconcile saved action').waitFor()
    const original = journal.findLast(entry => entry.injected === mode)!
    assert(original && original.body.operationId)
    const committed = await options.readDraft()
    assert.equal(await button('Library').count(), 0, 'Unknown reopen exposed an editable native library action')
    await snapshot(mode + '-blocked')
    await button('Reconcile saved action').click()
    await restoredNative()
    const retry = journal.findLast(entry => entry.body?.command === 'open')!
    assert.deepEqual(retry.body, original.body, 'Reopen reconciliation changed the operation payload')
    assert.equal((await options.readDraft()).revisionId, committed.revisionId, 'Open reconciliation wrote another draft revision')
  }
  try {
    await page.goto('https://app.xeroflow.io/fixture/native-library')
    const initial = await options.readDraft()
    assert(initial.moduleInstances.length && initial.assets.length && initial.locks, 'Fixture must have real nonempty pins/assets/locks')
    await button('Edit in FigFlow').click()
    const status = await nativeRead('status')
    await writeFile(resolve(evidence, '00-native-status.json'), JSON.stringify(status, null, 2))
    await page.screenshot({ path: resolve(evidence, '00-native-ready.png'), fullPage: true })
    await Promise.all(responseChecks)
    assert.equal(observedWasm, options.receipt.native.wasmSha256, 'Verify the actual served WASM before any native UI edit')
    for (const capability of ['edm_designer_import', 'edm_designer_snapshot', 'edm_designer_context'])
      assert((status.result?.supportedActions ?? status.supportedActions)?.includes(capability), 'Actual native capability missing: ' + capability)
    assert.deepEqual((await nativeRead('edm_designer_snapshot')).result.operations, [])
    const before = await options.readDraft()
    assert.deepEqual(before.blocks, initial.blocks, 'Opening changed canonical content')
    await writeFile(resolve(evidence, '00-open-baseline.json'), JSON.stringify({ initial, before }, null, 2))
    await select(options.plan.section, 'heading')
    const oldFrame = await page.getByTitle('FigFlow email design', { exact: true }).elementHandle()
    await button('Library').click()
    await assertSafePreview('Captured email preview', '01-cancel-preview')
    await button('Continue editing').click()
    assert(await oldFrame!.evaluate(frame => frame.isConnected), 'Cancellation replaced the live native iframe')
    assert.deepEqual(await options.readDraft(), before, 'Cancelled read mutated the draft')
    await nativeInputs(options.plan.edit)
    const edits = await nativeRead('edm_designer_snapshot')
    assert(edits.result.operations.length > 0, 'Captured edit acceptance needs a nonempty native operation log')
    assert(JSON.stringify(edits.result.operations).includes(options.plan.expectedEditedText), 'Calibrated visible controls did not produce the intended edit')
    await writeFile(resolve(evidence, '02-raw-native-operations.json'), JSON.stringify(edits, null, 2))
    await button('Library').click()
    await assertSafePreview('Captured email preview', '02-captured-edit')
    await button('Review and save for library').click()
    await assertSafePreview('Proposed email preview', '03-compiled-review')
    assert.equal((await options.readDraft()).revisionId, before.revisionId, 'Review wrote before explicit Apply')
    await button('Apply and save changes').click()
    await button('Return to design').waitFor()
    const applied = await options.readDraft()
    assert.notEqual(applied.revisionId, before.revisionId)
    assert.equal(applied.blocks.heading.data.props.text, options.plan.expectedEditedText)
    assert.deepEqual(applied.locks, before.locks)
    await page.getByLabel('Library name', { exact: true }).fill(options.moduleName)
    await button('Publish module').click()
    await restoredNative()
    const publication = journal.findLast(entry => entry.body?.command === 'publish-module')!
    assert.equal(publication.status, 200)
    const moduleId = publication.response.moduleId, revisionId = publication.response.revisionId
    assert(moduleId && revisionId)
    assert.equal((await options.readDraft()).revisionId, applied.revisionId, 'Publication changed its source draft')
    for (const mode of ['failed-open', 'unknown-open'] as const) {
      await select(options.plan.section, 'heading')
      await enterLibrary()
      await page.getByLabel('Module', { exact: true }).selectOption(moduleId)
      await page.getByTitle('Selected module preview', { exact: true }).waitFor()
      await reconcileReopen(() => button('Insert selected version').click(), mode)
    }
    const inserted = await options.readDraft()
    const newInstances = inserted.moduleInstances.filter(instance => !before.moduleInstances.some(prior => prior.instanceId === instance.instanceId))
    assert.equal(newInstances.length, 2)
    assert(newInstances.every(instance => instance.moduleId === moduleId && instance.revisionId === revisionId))
    assert.equal(new Set(inserted.moduleInstances.map(instance => instance.instanceId)).size, inserted.moduleInstances.length)
    await snapshot('04-exact-version-inserted-twice')
    // Registered image publication, insertion and replacement all use real pickers.
    await select(options.plan.section, 'heading')
    await enterLibrary('Images')
    await button('Choose or upload an image').click()
    await page.getByText(options.imageName, { exact: true }).click()
    await button('Publish registered image').click()
    await restoredNative()
    await select(options.plan.section, 'heading')
    await enterLibrary('Images')
    await button('Choose or upload an image').click()
    await page.getByText(options.imageName, { exact: true }).click()
    await button('Insert published image').click()
    const imageInserted = await restoredNative()
    const imageCount = (draft: NativeLibraryDraft) => Object.values(draft.blocks).filter(block => block.type === 'Image').length
    assert.equal(imageCount(imageInserted), imageCount(inserted) + 1)
    await select(options.plan.standaloneImage, options.originalImageBlockId)
    await enterLibrary('Images')
    await button('Choose or upload an image').click()
    await page.getByText(options.imageName, { exact: true }).click()
    const oldImage = imageInserted.blocks[options.originalImageBlockId]
    await button('Replace selected image').click()
    const replaced = await restoredNative()
    assert.notEqual(replaced.blocks[options.originalImageBlockId].data.props.url, oldImage.data.props.url)
    assert.deepEqual({ ...replaced.blocks[options.originalImageBlockId].data.props, url: oldImage.data.props.url }, oldImage.data.props, 'Replacement changed non-image-source props')
    assert(replaced.assets.some(asset => asset.id === options.replacementAssetId))
    for (const asset of before.assets)
      assert(replaced.assets.some(next => next.id === asset.id), 'Old registered reference lost')
    assert.deepEqual(replaced.moduleInstances, inserted.moduleInstances)
    assert.deepEqual(replaced.locks, before.locks)
    assert.equal(replaced.documentId, before.documentId)
    assert.equal(replaced.templateId, before.templateId)
    assert.equal(replaced.subject, before.subject)
    assert.equal(replaced.previewText, before.previewText)
    await snapshot('05-registered-image-replaced')
    // Publish an actually changed revision from a second captured native edit.
    await select(options.plan.section, 'heading')
    await nativeInputs(options.plan.revisionEdit)
    const revisedOps = await nativeRead('edm_designer_snapshot')
    assert(revisedOps.result.operations.length && JSON.stringify(revisedOps.result.operations).includes(options.plan.expectedRevisedText))
    await writeFile(resolve(evidence, '06-revision-raw-native-operations.json'), JSON.stringify(revisedOps, null, 2))
    await button('Library').click()
    await assertSafePreview('Captured email preview', '06-revised-module-capture')
    await button('Review and save for library').click()
    await assertSafePreview('Proposed email preview', '06-revised-module-review')
    await button('Apply and save changes').click()
    await button('Return to design').waitFor()
    await page.getByLabel('Module', { exact: true }).selectOption(moduleId)
    await page.getByLabel('Library name', { exact: true }).fill(options.moduleName)
    await button('Revise selected module').click()
    await restoredNative()
    const revisedModule = await options.readModule(moduleId)
    assert.notEqual(revisedModule.revisionId, revisionId, 'Revise did not create a new immutable version')
    await select(options.plan.firstInsertedInstance, newInstances[0]!.rootBlockIds[0])
    await enterLibrary()
    await page.getByLabel('Module', { exact: true }).selectOption(moduleId)
    await page.getByLabel('I reviewed the selected version and local changes', { exact: true }).check()
    await button('Update this instance').click()
    const updated = await restoredNative()
    assert.equal(updated.moduleInstances.find(instance => instance.instanceId === newInstances[0]!.instanceId)?.revisionId, revisedModule.revisionId)
    assert.equal(updated.moduleInstances.find(instance => instance.instanceId === newInstances[1]!.instanceId)?.revisionId, revisionId, 'Updating one instance changed the other pin')
    await snapshot('07-one-instance-updated')
    // Cancel a prepared version update through the actual Return control.
    await select(options.plan.secondInsertedInstance, newInstances[1]!.rootBlockIds[0])
    await enterLibrary()
    await page.getByLabel('Module', { exact: true }).selectOption(moduleId)
    await page.getByLabel('I reviewed the selected version and local changes', { exact: true }).check()
    const cancelledUpdate = await options.readDraft()
    await button('Return to design').click()
    await restoredNative()
    assert.deepEqual(await options.readDraft(), cancelledUpdate, 'Cancelling a prepared instance update wrote the draft')
    // A second complete builder performs the competing edit through real UI.
    await select(options.plan.secondInsertedInstance, newInstances[1]!.rootBlockIds[0])
    await enterLibrary()
    await page.getByLabel('Module', { exact: true }).selectOption(moduleId)
    await page.getByLabel('I reviewed the selected version and local changes', { exact: true }).check()
    const staleBaseline = await options.readDraft()
    const concurrent = await context.newPage()
    await attach(concurrent)
    try {
      await concurrent.goto('https://app.xeroflow.io/fixture/native-library')
      await button('Edit in FigFlow', concurrent).click()
      await nativeInputs(options.plan.concurrentEdit, concurrent)
      const competing = await nativeRead('edm_designer_snapshot', concurrent)
      assert(competing.result.operations.length && JSON.stringify(competing.result.operations).includes(options.plan.expectedConcurrentText))
      await writeFile(resolve(evidence, '08-concurrent-raw-native-operations.json'), JSON.stringify(competing, null, 2))
      await button('Return for review', concurrent).click()
      const preview = concurrent.getByTitle('Proposed email preview', { exact: true })
      await preview.waitFor()
      assert.equal(await preview.getAttribute('sandbox'), '')
      assert.equal(await preview.getAttribute('referrerpolicy'), 'no-referrer')
      assert(!/<script\b/i.test(await preview.getAttribute('srcdoc') || ''))
      const appliedReply = concurrent.waitForResponse(response => response.url().endsWith('/api/email/design/designer') && response.request().postDataJSON()?.command === 'apply' && response.status() === 200)
      await button('Apply and save changes', concurrent).click()
      await appliedReply
      const winner = await options.readDraft()
      assert.notEqual(winner.revisionId, staleBaseline.revisionId)
      assert.equal(winner.blocks.heading.data.props.text, options.plan.expectedConcurrentText)
      expectedConflict = true
      const conflict = page.waitForResponse(response => response.url().endsWith('/api/email/design/modules') && response.status() === 409)
      await button('Update this instance').click()
      await conflict
      assert.deepEqual(await options.readDraft(), winner, 'Stale module update changed the winning canonical head')
      assert.deepEqual((await page.evaluate(() => (window as any).__nativeLibraryRead())).blocks, staleBaseline.blocks, 'Conflict silently replaced the first builder local version')
      await snapshot('08-real-stale-update-blocked')
    } finally {
      await concurrent.close()
    }
    // Reload after the known 409; this is explicit browser recovery, not an
    // assertion that the pending-command UI can cancel an uncertain write.
    await page.reload()
    await button('Edit in FigFlow').click()
    await restoredNative()
    await select(options.plan.secondInsertedInstance, newInstances[1]!.rootBlockIds[0])
    await enterLibrary()
    await page.getByLabel('I reviewed the selected version and local changes', { exact: true }).check()
    const beforeDetach = await options.readDraft()
    await button('Detach this instance').click()
    const detached = await restoredNative()
    assert.equal(detached.moduleInstances.length, beforeDetach.moduleInstances.length - 1)
    assert(!detached.moduleInstances.some(instance => instance.instanceId === newInstances[1]!.instanceId))
    assert.deepEqual(detached.blocks, beforeDetach.blocks, 'Detach changed rendered instance content')
    assert.deepEqual(detached.locks, before.locks)
    assert.deepEqual(detached.scope, before.scope)
    assert.deepEqual(detached.provenance, before.provenance)
    for (const entry of before.lineage) assert.deepEqual(detached.lineage.find(candidate => candidate.blockId === entry.blockId), entry, 'Original block/node/field lineage changed')
    for (const id of Object.keys(before.blocks)) assert(Object.hasOwn(detached.blocks, id), 'Original block ID lost')
    for (const pin of before.moduleInstances)
      assert(detached.moduleInstances.some(instance => instance.instanceId === pin.instanceId), 'Unrelated fixture pin lost')
    await snapshot('06-detached-content-retained')
    await page.reload()
    await button('Edit in FigFlow').click()
    const reopened = await restoredNative()
    assert.equal(reopened.revisionId, detached.revisionId)
    await snapshot('07-full-builder-reopened')
    await Promise.all(responseChecks)
    assert.equal(observedWasm, options.receipt.native.wasmSha256, 'No matching actual WASM response was observed')
    assert.equal(served[options.receipt.native.wasmFile], observedWasm)
    assert.deepEqual(unexpected, [])
    assert.deepEqual(errors, [])
    return { before, applied, inserted, imageInserted, replaced, detached, reopened, servedWasm: observedWasm, editorUrl, moduleId, revisionId,
      // Synthetic registered delivery is explicitly not the public Pages route.
      remaining: ['public signed Pages asset delivery (this fixture serves registered bytes directly)'],
      moduleHead: await options.readModule(moduleId) }
  } catch (error) {
    await page.screenshot({ path: resolve(evidence, 'failure.png'), fullPage: true }).catch(() => {})
    await writeFile(resolve(evidence, 'failure-dom.txt'), await page.locator('body').innerText().catch(() => 'Body unavailable'))
    await writeFile(resolve(evidence, 'failure.json'), JSON.stringify({ error: String(error), stack: (error as Error).stack, frames: page.frames().map(frame => frame.url()) }, null, 2))
    throw error
  } finally {
    await writeFile(resolve(evidence, 'browser-network.json'), JSON.stringify({ journal, served, observedWasm, editorUrl, unexpected, errors, instrumentation, localRouteMappingOnly: true }, null, 2))
    await browser.close()
  }
}
