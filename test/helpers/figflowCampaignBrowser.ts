/* eslint @typescript-eslint/no-explicit-any: off -- Bounded synthetic wire JSON is asserted at each acceptance boundary. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { build } from 'esbuild'
import { compileScript, parse } from '@vue/compiler-sfc'
import { chromium, type Page } from 'playwright'
import { frozenReader, sha256, type NativeInput } from './figflowNativeLibraryBrowser'

export { sha256 }
export const CAMPAIGN_EVIDENCE_ROOT = resolve('.verification/figflow-campaign-browser-preparation-iteration2-20261103')
// Withdrawn P1 pin retained for historical evidence; no runtime may admit it.
export const CAMPAIGN_499_APPROVED_SHA256: string | null = null
export const CAMPAIGN_499_SHA256 = '31cad088418962141d990368cc2fb460fd030ee2eb2cb9530078d16f49f06453'
export const CAMPAIGN_NATIVE_BASE = '6c7f60c5586f9d199f2192e25cf76811fd151532'
export const CAMPAIGN_NATIVE = { engine: 'dbc49902ad077a25ee45f368ad0c96e337a4f3e69e5bd98b62c056b93346c4a1', patch: 'ae19af3b9ddd8f625e52782c9a99c2394f968fa34edcf6a7290f6dc5d76b1754', engineTests: 40, bridgeTests: 9, uiTests: 8 } as const
export const CAMPAIGN_MIGRATIONS = ['491_email_design_revisions.sql', '492_email_design_revision_metadata.sql', '493_email_design_handoffs.sql', '494_email_merge_tag_definitions.sql', '495_email_asset_publication.sql', '496_email_content_conditions.sql', '498_email_campaign_design_projection.sql', '499_email_template_successor_projection.sql'].map(name => 'server/database/migrations/' + name)
export const CAMPAIGN_RUNTIME_SOURCES = ['app/components/email/builder/EdmFlyhubBuilder.client.vue', 'app/components/email/builder/EdmFigflowHandoff.client.vue', 'app/composables/useEdmDesignRoundtrip.ts', 'shared/emailRendering/designRoundtrip.ts', 'shared/emailRendering/designDesigner.ts', 'shared/emailRendering/designTemplates.ts', 'shared/emailRendering/designModules.ts', 'server/utils/email-marketing/designTemplates.ts', 'server/plugins/database-connections.ts', 'server/utils/email-marketing/designHandoffs.ts', 'server/utils/email-marketing/designCampaigns.ts', 'server/utils/email-marketing/designDraftOwners.ts', 'server/utils/email-marketing/designRevisions.ts', 'server/api/email/campaigns/[id].patch.ts', 'server/utils/email-marketing/campaigns.ts', 'server/utils/email-marketing/designLibraryHttp.ts', 'server/utils/auth.ts', 'server/utils/sessionToken.ts', 'server/utils/email-marketing/access.ts', 'workers/email-design/sessionToken.ts', 'workers/email-design/admission.mjs', 'workers/craft-editors/figflow-edm-relay.mjs'] as const
interface Artifact {
  path: string
  sha256: string
  sourceCommit: string
}
/** Parent-supplied exact frozen inputs, not a receipt generated from changing UI.
 * Pages artifact must wrap the actual campaign PATCH route and existing auth/
 * middleware; no fixture content writer or alternate sender is permitted. */
export interface CampaignReceipt {
  sourceCommit: string
  approvedSourceCommit: string
  worker: Artifact
  renderer: Artifact
  pages: Artifact & {
    handler: string
    authentication: string
    origin: string
    senderEnabled: boolean
    cohost: { authAdapter: string, authorityUrl: string, method: string, route: string }
  }
  sourceArchive: {
    root: string
    path: string
    sha256: string
    files: Record<string, string>
  }
  runtimeSourceFiles: Record<string, string>
  migrations: Array<{
    path: string
    sha256: string
  }>
  native: {
    workflowHead: string
    actualCheckout: string
    parents: string[]
    ciRun: string
    engineSha256: string
    patchSha256: string
    engineTests: number
    bridgeTests: number
    uiTests: number
    allNamedPassed: boolean
    allSummariesPassed: boolean
    nativeHashesMatch: boolean
    packageHashesMatch: boolean
    packageDirectory: string
    wasmFile: string
    wasmSha256: string
    zipPath: string
    zipSha256: string
    provenanceFiles: Array<{
      path: string
      sha256: string
    }>
  }
}
/** Pure envelope admission does not establish that any artifact exists or ran. */
export function validateCampaignReceiptShape(value: any): asserts value is CampaignReceipt {
  assert(value && /^[a-f0-9]{40}$/.test(value.sourceCommit), 'Require exact committed source')
  assert.equal(value.approvedSourceCommit, value.sourceCommit, 'Require explicit parent-approved freeze')
  assert.notEqual(value.sourceCommit, CAMPAIGN_NATIVE_BASE, 'Native-only source is not the coherent campaign UI freeze')
  for (const owner of ['worker', 'renderer', 'pages'])
    assert.equal(value[owner]?.sourceCommit, value.sourceCommit, 'Mixed ' + owner + ' source')
  const n = value.native
  assert.equal(n.workflowHead, value.sourceCommit, 'Native workflow must match the UI freeze')
  assert(/^[a-f0-9]{40}$/.test(n.actualCheckout) && n.parents.includes(value.sourceCommit))
  assert(/^\d+$/.test(n.ciRun))
  assert.equal(n.engineSha256, CAMPAIGN_NATIVE.engine)
  assert.equal(n.patchSha256, CAMPAIGN_NATIVE.patch)
  for (const key of ['engineTests', 'bridgeTests', 'uiTests'] as const)
    assert.equal(n[key], CAMPAIGN_NATIVE[key])
  for (const key of ['allNamedPassed', 'allSummariesPassed', 'nativeHashesMatch', 'packageHashesMatch'])
    assert.equal(n[key], true)
  for (const key of ['wasmSha256', 'zipSha256'])
    assert(/^[a-f0-9]{64}$/.test(n[key]))
  assert(!['18a31d0079c72f0ed07bb678c0ca548098c81d06c8bf05deb94c25c782457c59', '70bfa31a2d7d0752293a3db7594b722b3bc3da992ad01e7484406fbe365c6b08'].includes(n.wasmSha256), 'Old32/9/8 or core bytes cannot establish campaign acceptance')
  assert.deepEqual(value.migrations.map((x: any) => x.path).sort(), [...CAMPAIGN_MIGRATIONS].sort(), 'Require exact coherent migrations, no duplicates')
  assert.equal(value.migrations.find((file: any) => file.path.endsWith('/499_email_template_successor_projection.sql'))?.sha256, CAMPAIGN_499_APPROVED_SHA256 ?? CAMPAIGN_499_SHA256, '499 shape must match the recorded pin; actual review admission is separately closed')
  for (const file of value.migrations)
    assert(/^[a-f0-9]{64}$/.test(file.sha256))
  assert.equal(value.pages.handler, 'server/api/email/campaigns/[id].patch.ts', 'Keep actual Pages staff save owner')
  assert.equal(value.pages.authentication, 'pages-auth-me-v1')
  assert.equal(value.pages.origin, 'https://app.xeroflow.io')
  assert.equal(value.pages.senderEnabled, false)
  assert.equal(value.pages.cohost?.authAdapter, 'workers/email-design/sessionToken.ts')
  assert.equal(value.pages.cohost?.authorityUrl, 'https://preview.agency-dashboard-6cm.pages.dev/api/auth/me')
  assert.equal(value.pages.cohost?.method, 'PATCH')
  assert.equal(value.pages.cohost?.route, '/api/email/campaigns/:id')
}
/** Actual admission is closed until the parent supplies a reviewed replacement.
 * A historical shape check is never permission to build/apply the withdrawn499. */
export function requireReviewedCampaign499(hash: string) {
  assert(CAMPAIGN_499_APPROVED_SHA256, '499 acceptance blocked: reviewed replacement pin pending')
  assert.notEqual(hash, CAMPAIGN_499_SHA256, 'Withdrawn P1 migration499 cannot be admitted')
  assert.equal(hash, CAMPAIGN_499_APPROVED_SHA256)
}
export function admitCampaignReceipt(value: any): asserts value is CampaignReceipt {
  validateCampaignReceiptShape(value)
  requireReviewedCampaign499(value.migrations.find((file: any) => file.path.endsWith('/499_email_template_successor_projection.sql'))!.sha256)
}
const verificationFile = (path: string) => {
  const file = resolve(path)
  assert(file.startsWith(resolve('.verification') + sep), 'Only supplied local verification artifacts')
  return file
}
/** Disk admission is intentionally unavailable without a matching future freeze. */
export async function verifyCampaignReceipt(value: unknown, approvedSource: string) {
  admitCampaignReceipt(value)
  const r = value
  assert.equal(approvedSource, r.sourceCommit, 'Pin parent source separately from receipt labels')
  execFileSync('git', ['merge-base', '--is-ancestor', CAMPAIGN_NATIVE_BASE, r.sourceCommit])
  const source = frozenReader(r.sourceCommit)
  for (const artifact of [r.worker, r.renderer, r.pages])
    assert.equal(sha256(await readFile(verificationFile(artifact.path))), artifact.sha256)
  const archive = verificationFile(r.sourceArchive.root)
  assert(/^[a-f0-9]{64}$/.test(r.sourceArchive.sha256))
  assert.equal(sha256(await readFile(verificationFile(r.sourceArchive.path))), r.sourceArchive.sha256)
  assert(Object.keys(r.sourceArchive.files).length > 6000, 'Require complete frozen source inventory')
  for (const [path, hash] of Object.entries(r.sourceArchive.files)) {
    const file = resolve(archive, path)
    assert(file.startsWith(archive + sep))
    assert.equal(sha256(await readFile(file)), hash, 'Frozen source differs: ' + path)
  }
  for (const path of CAMPAIGN_RUNTIME_SOURCES) {
    assert(r.runtimeSourceFiles[path], 'Missing source admission ' + path)
    assert.equal(sha256(source.read(path)), r.runtimeSourceFiles[path])
    assert.equal(r.sourceArchive.files[path], r.runtimeSourceFiles[path])
  }
  assert.equal(sha256(source.read('workers/craft-editors/patches/figflow-browser-bridge.patch')), CAMPAIGN_NATIVE.patch)
  for (const file of r.migrations)
    assert.equal(sha256(source.read(file.path)), file.sha256)
  assert.equal(r.migrations.find(file => file.path.endsWith('/498_email_campaign_design_projection.sql'))?.sha256, 'e8fdd367968efe31eba4efb9af8bc4ecb381e16769efdbe12f88fedaca08e1fb')
  assert(r.native.provenanceFiles.length >= 5, 'Require checkout, package, native summaries and both hash-validation receipts')
  const provenance: any[] = []
  for (const file of r.native.provenanceFiles) {
    const bytes = await readFile(verificationFile(file.path))
    assert.equal(sha256(bytes), file.sha256)
    provenance.push(JSON.parse(bytes.toString()))
  }
  assert(provenance.some(p => p.workflow_head === r.sourceCommit && String(p.run_id) === r.native.ciRun && p.package_directory === r.native.packageDirectory && p.zip_sha256 === r.native.zipSha256 && p.wasm_sha256 === r.native.wasmSha256))
  assert(JSON.stringify(provenance).includes(CAMPAIGN_NATIVE.engine) && JSON.stringify(provenance).includes(CAMPAIGN_NATIVE.patch), 'Package source-hash proof must name refined native source')
  assert(provenance.some(p => p.actual_checkout === r.native.actualCheckout && p.workflow_head === r.sourceCommit && p.both_expected_parents_verified === true))
  assert(provenance.some(p => p.engine === 40 && p.bridge === 9 && p.ui === 8 && p.all_named_passed === true && p.all_summaries_successful === true))
  assert(provenance.filter(p => p.all_match === true && p.checks?.every((c: any) => c.match === true)).length >= 2)
  assert.equal(sha256(await readFile(verificationFile(r.native.zipPath))), r.native.zipSha256)
  const nativeRoot = verificationFile(r.native.packageDirectory), wasm = resolve(nativeRoot, r.native.wasmFile)
  assert(wasm.startsWith(nativeRoot + sep))
  assert.equal(sha256(await readFile(wasm)), r.native.wasmSha256)
  return r
}
/** Local cohost changes transport/search_path only; every mutation still calls
 * the supplied actual Worker or actual Pages artifact. Compile-only testable. */
export function campaignFixtureEntry(schema: string, artifactName: 'campaign-design' | 'campaign-pages') {
  assert(/^figflow_campaign_browser_[a-f0-9]{32}$/.test(schema), 'Only unique owned schema')
  return `import actual from './${artifactName}.mjs';export default {async fetch(request,env,context){
    ${artifactName === 'campaign-design' ? `const path=new URL(request.url).pathname;if(request.method==='PATCH'&&path.startsWith('/api/email/campaigns/')&&path.split('/').length===5)return env.CAMPAIGN_PAGES.fetch(request);` : ''}
    if(new URL(request.url).pathname==='/__fixture/preview'){const body=await request.json();return Response.json(await env.EMAIL_RENDERER.render({version:1,expectedEnvironment:'staging',operation:'document',document:body.body_source,options:{...(typeof body.subject==='string'?{subjectLine:body.subject}:{}),...(typeof body.preview_text==='string'?{previewText:body.preview_text}:{}),...(body.variables?{variables:body.variables}:{})}}));}
    const scoped={...env};for(const key of ['HYPERDRIVE','HYPERDRIVE_FRESH']){const u=new URL(env[key].connectionString);u.searchParams.set('options','-c search_path=${schema},public');scoped[key]={connectionString:u.href};}return actual.fetch(request,scoped,context);}};`
}

export interface CampaignSnapshot {
  campaignId: string
  documentId: string
  revisionId: string
  source: any
  subject: string | null
  previewText: string | null
  baseTemplateRevisionId: string | null
  renderedHtmlSha256: string
  bodyHtml: string
  status: string
  fromEmail: string | null
  filterRules: unknown
}
export type HostInput = {
  clickImage: { name: string, index: number }
} | {
  clickText: string
} | {
  clickButton: string
} | {
  label: string
  value: string
} | {
  selectLabel: string
  value: string
}
export interface CampaignUiPlan {
  viewport: {
    width: number
    height: number
  }
  edit: NativeInput[]
  secondEdit: NativeInput[]
  staleEdit: NativeInput[]
  winningEdit: NativeInput[]
  expectedText: [
    string,
    string,
    string,
    string
  ]
  staff: HostInput[]
  staffNewImage: HostInput[]
  expectedStaffCta: {
    text: string
    url: string
  }
  expectedStaffImageLink: string
}
// Frozen full-builder compiler and semantic UI leaves reused from the reviewed08a harness.
const leafRuntime = `
const localState = new Map();
Object.assign(globalThis, Vue, {
  $fetch, useRoute, useRouter,
  useState: (key, init) => { if (!localState.has(key)) localState.set(key, Vue.ref(init())); return localState.get(key); },
  useRuntimeConfig: () => ({public:{figflowEdmEnabled:true}}),
  navigateTo: (target, options) => options?.external ? window.location.assign(router.resolve(target).href) : router.push(target),
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
export async function compileCampaignBuilder(options: {
  sourceCommit: string
  campaignId: string
  handoff?: {
    id: string
    mode: 'content' | 'designer'
  }
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
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/agency/email/compose',component:${registrations[0]!.local}}]});
${leafRuntime}
const app=Vue.createApp({setup:()=>()=>Vue.h(Vue.Suspense,null,{default:()=>Vue.h('main',[Vue.h(RouterView)])})});
// RouterView must be the actual router component, not a custom host state machine.
import {RouterView} from 'vue-router';
app.component('router-view',RouterView);
${registrations.map(c => `app.component('${c.name}',${c.local});`).join('\n')}
Object.entries(leaves).forEach(([name,component])=>app.component(name,component));
app.use(router);
router.push({path:'/agency/email/compose',query:{campaign:${JSON.stringify(options.campaignId)},...${JSON.stringify(options.handoff ? { designSession: options.handoff.id, designMode: options.handoff.mode } : {})}}}).then(()=>router.isReady()).then(()=>app.mount('#app'));
// Read-only store observation. No flow, edit, history, save or selection action is exported.
window.__campaignRead=()=>JSON.parse(JSON.stringify({blocks:useEdmBuilder().document.value,selectedBlockId:useEdmBuilder().selectedBlockId.value}));
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
const fixtureCss = `body{margin:0;font:14px system-ui;color:#17212f;background:#f5f6f8}button,input,select,textarea{font:inherit;padding:8px;margin:3px}button:disabled{opacity:.45}.fixture-field{display:flex;flex-direction:column;gap:4px;margin:8px 0}.fixture-dialog{position:fixed;inset:0;z-index:40;padding:16px;margin:0;max-width:none;max-height:none;width:100%;height:100%;box-sizing:border-box;background:white;overflow:auto}.flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1 1 0%}.min-h-0{min-height:0}.h-full{height:100%}.w-full{width:100%}.overflow-hidden{overflow:hidden}.overflow-y-auto{overflow-y:auto}.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}iframe{box-sizing:border-box;display:block;width:100%;height:520px;border:1px solid #ccd2db}iframe[title="FigFlow email design"]{height:820px;min-width:1000px}iframe[class*="1000px"]{max-width:1000px}iframe[class*="390px"]{max-width:390px}img{max-width:100%}#fixture-toasts{position:fixed;bottom:0;right:0;z-index:99;pointer-events:none}`
export async function exerciseCampaignBrowser(o: {
  receipt: CampaignReceipt
  plan: CampaignUiPlan
  evidence: string
  campaignA: string
  campaignB: string
  contentCampaign: string
  contentHandoff: string
  originalImageId: string
  newImageId: string
  replacementAssetId: string
  request(path: string, body: any, method: string): Promise<{
    status: number
    body: any
  }>
  publicAsset(path: string): Promise<{
    bytes: Uint8Array
    contentType: string
  } | null>
  read(id: string): Promise<CampaignSnapshot>
  protectedState(): Promise<unknown>
  guard(change: 'revoke' | 'restore' | 'freeze' | 'unfreeze'): Promise<void>
  campaignCount(): Promise<number>
}) {
  const evidence = resolve(o.evidence)
  assert(evidence.startsWith(CAMPAIGN_EVIDENCE_ROOT + sep))
  await mkdir(evidence, { recursive: true })
  const browser = await chromium.launch({ executablePath: process.env.FIGFLOW_DESIGNER_CHROMIUM, headless: true, args: ['--enable-unsafe-swiftshader'] })
  const context = await browser.newContext({ viewport: o.plan.viewport, serviceWorkers: 'block' })
  // Passive connect observation proves native campaign-kind import without
  // replacing the bridge, mutating editor state, or issuing private commands.
  await context.addInitScript(() => {
    const received: any[] = []
    Object.defineProperty(window, '__campaignImports', { value: received })
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'connect' && event.data.payload?.design) received.push(JSON.parse(JSON.stringify({ origin: event.origin, payload: event.data.payload })))
    })
  })
  const journal: any[] = [], unexpected: string[] = [], errors: string[] = [], instrumentation: string[] = []
  const served: Record<string, string> = {}, bundles: Record<string, any> = {}
  const responseChecks: Promise<void>[] = []
  const editorUrls = new Set<string>(), wasmObservations: string[] = []
  let lost: 'apply' | 'save-proposal-as-new-draft' | null = null
  let denial: {
    command: string
    statuses: number[]
    label: string
  } | null = null
  const fingerprint = await readFile(resolve('node_modules/playwright-core/lib/coreBundle.js'), 'utf8')
  assert(fingerprint.includes('if (navigator.serviceWorker) navigator.serviceWorker.register = async () =>'))
  const attach = async (page: Page) => {
    page.setDefaultTimeout(15000)
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable', { maxResourceBufferSize: 64 * 1024 * 1024, maxTotalBufferSize: 128 * 1024 * 1024 })
    const requests = new Map<string, () => void>()
    cdp.on('Network.responseReceived', (e) => {
      if (new URL(e.response.url).pathname.endsWith('.wasm'))
        responseChecks.push(new Promise<void>(done => requests.set(e.requestId, done)))
    })
    cdp.on('Network.loadingFinished', async (e) => {
      const done = requests.get(e.requestId)
      if (!done)
        return
      requests.delete(e.requestId)
      try {
        const b = await cdp.send('Network.getResponseBody', { requestId: e.requestId })
        const hash = sha256(Buffer.from(b.body, b.base64Encoded ? 'base64' : 'utf8'))
        assert.equal(hash, o.receipt.native.wasmSha256)
        wasmObservations.push(hash)
      } catch (error) {
        errors.push('WASM response: ' + String(error))
      } finally {
        done()
      }
    })
    cdp.on('Network.loadingFailed', (e) => {
      const done = requests.get(e.requestId)
      if (done) {
        requests.delete(e.requestId)
        errors.push('WASM loading failed: ' + e.errorText)
        done()
      }
    })
    page.on('pageerror', (error) => {
      const exact = 'SecurityError: Failed to read the \'serviceWorker\' property from \'Navigator\': Service worker is disabled because the context is sandboxed and lacks the \'allow-same-origin\' flag.\n    at <anonymous>:3:15\n    at <anonymous>:5:7'
      if (error.stack === exact)
        instrumentation.push(exact)
      else
        errors.push(error.stack ?? error.message)
    })
    page.on('console', (message) => {
      if (message.type() !== 'error')
        return
      if (/^Failed to load resource:/.test(message.text()) && journal.some(x => x.expectedFailure && 'https://app.xeroflow.io' + x.path === message.location().url))
        return
      errors.push(message.text())
    })
  }
  await context.routeWebSocket('**/*', (socket) => {
    unexpected.push('WebSocket ' + socket.url())
    socket.close({ code: 1008, reason: 'Fixture blocks outbound' })
  })
  await context.route('**/*', async (route) => {
    const req = route.request(), url = new URL(req.url())
    try {
      if (url.origin === 'https://app.xeroflow.io') {
        if (url.pathname === '/agency/email/compose') {
          const id = url.searchParams.get('campaign')
          assert(id && /^[a-f0-9-]{36}$/.test(id))
          const key = url.search
          if (!bundles[key])
            bundles[key] = await compileCampaignBuilder({ sourceCommit: o.receipt.sourceCommit, campaignId: id, ...(url.searchParams.has('designSession') ? { handoff: { id: url.searchParams.get('designSession')!, mode: url.searchParams.get('designMode') === 'content' ? 'content' : 'designer' } } : {}) })
          return route.fulfill({ contentType: 'text/html', body: `<style>${fixtureCss}</style><div id="fixture-toasts" aria-live="polite"></div><div id="app"></div><script src="/fixture/campaign.js?${encodeURIComponent(key)}"></script>` })
        }
        if (url.pathname === '/fixture/campaign.js') {
          const bundle = bundles[decodeURIComponent(url.search.slice(1))]
          assert(bundle)
          return route.fulfill({ contentType: 'application/javascript', body: Buffer.from(bundle.bytes) })
        }
        if (url.pathname === '/favicon.ico')
          return route.fulfill({ status: 200, body: '' })
        if (url.pathname.startsWith('/api/public/banner-assets/')) {
          const asset = await o.publicAsset(url.pathname)
          assert(asset)
          return route.fulfill({ body: Buffer.from(asset.bytes), contentType: asset.contentType, headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } })
        }
        if (url.pathname.startsWith('/api/')) {
          const body = req.postData() ? req.postDataJSON() : undefined
          const reply = await o.request(url.pathname + url.search, body, req.method())
          const entry: any = { path: url.pathname + url.search, method: req.method(), body, status: reply.status, response: reply.body }
          journal.push(entry)
          if (reply.body?.handoff?.editorUrl)
            editorUrls.add(reply.body.handoff.editorUrl)
          if (reply.status >= 400) {
            assert(denial && body?.command === denial.command && denial.statuses.includes(reply.status), 'Unexpected HTTP failure ' + JSON.stringify(entry))
            entry.expectedFailure = denial.label
            denial = null
          }
          if (lost && body?.command === lost) {
            assert.equal(reply.status, 200, 'Drop only real committed replies')
            entry.expectedFailure = 'committed-lost-' + lost
            lost = null
            return route.abort('connectionfailed')
          }
          return route.fulfill({ status: reply.status, json: reply.body })
        }
      }
      for (const value of editorUrls) {
        const editor = new URL(value), prefix = editor.pathname.endsWith('/') ? editor.pathname : editor.pathname.slice(0, editor.pathname.lastIndexOf('/') + 1)
        if (url.origin !== editor.origin || !url.pathname.startsWith(prefix))
          continue
        const name = url.pathname.slice(prefix.length) || 'index.html'
        const file = resolve(o.receipt.native.packageDirectory, name)
        assert(file.startsWith(resolve(o.receipt.native.packageDirectory) + sep) && !name.includes('%'))
        const bytes = await readFile(file)
        served[name] = sha256(bytes)
        if (name.endsWith('.wasm'))
          assert.equal(served[name], o.receipt.native.wasmSha256)
        return route.fulfill({ body: bytes, contentType: ({ '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml' } as Record<string, string>)[extname(file)] ?? 'application/octet-stream' })
      }
      throw new Error('Unexpected HTTP request ' + req.method() + ' ' + url.origin + url.pathname)
    } catch (error) {
      unexpected.push(String(error))
      await route.abort('blockedbyclient')
    }
  })
  const page = await context.newPage()
  await attach(page)
  const button = (name: string, p = page) => p.getByRole('button', { name, exact: true })
  const snapshot = async (name: string, id = o.campaignA) => {
    await page.screenshot({ path: resolve(evidence, name + '.png'), fullPage: true })
    await writeFile(resolve(evidence, name + '.json'), JSON.stringify(await o.read(id), null, 2))
  }
  const frame = async (p = page) => {
    await p.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent?.trim() === 'Return for review' && !b.disabled), undefined, { timeout: 60000 })
    const found = p.frames().find(f => editorUrls.has(f.url()))
    assert(found, 'Actual bound native iframe missing')
    return found
  }
  const nativeRead = async (action: 'status' | 'edm_snapshot' | 'edm_designer_snapshot', p = page) => {
    const f = await frame(p)
    await f.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
    return f.evaluate(async (action) => {
      const call = async (input: any) => {
        const raw = await (window as any).__xfFigBridge.request(JSON.stringify({ requestId: crypto.randomUUID(), ...input }))
        const out = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (!out.ok)
          throw new Error('Native read refused ' + JSON.stringify(out))
        return out
      }
      const status = await call({ action: 'status' })
      if (action === 'status')
        return status
      return call({ action, instanceId: status.instanceId, documentId: status.documentId, expectedRevision: status.revision, params: {} })
    }, action)
  }
  const nativeInputs = async (events: NativeInput[], p = page) => {
    assert(events.length > 0 && events.length <= 60)
    const canvas = (await frame(p)).locator('canvas')
    for (const e of events) {
      if ('click' in e)
        await canvas.click({ position: e.click })
      else if ('press' in e)
        await p.keyboard.press(e.press)
      else if ('text' in e)
        await p.keyboard.insertText(e.text)
      else {
        const box = await canvas.boundingBox()
        assert(box)
        await p.mouse.move(box.x + e.wheel.x, box.y + e.wheel.y)
        await p.mouse.wheel(0, e.wheel.deltaY)
      }
      await canvas.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
    }
  }
  const hostInputs = async (events: HostInput[]) => {
    for (const e of events) {
      const saved = 'clickButton' in e && e.clickButton === 'Save'
        ? page.waitForResponse(r => r.url().endsWith('/api/email/campaigns/' + o.campaignA) && r.request().method() === 'PATCH' && r.status() === 200)
        : 'clickText' in e && e.clickText === 'Synthetic blue registered replacement'
          ? page.waitForResponse(r => r.url().endsWith('/api/email/design/modules') && r.request().postDataJSON()?.command === 'replace-published-image' && r.status() === 200)
          : null
      if ('clickImage' in e) {
        assert(Number.isInteger(e.clickImage.index) && e.clickImage.index >= 0 && e.clickImage.index < 10)
        await page.getByRole('img', { name: e.clickImage.name, exact: true }).nth(e.clickImage.index).click()
      } else if ('clickText' in e)
        await page.getByText(e.clickText, { exact: true }).click()
      else if ('clickButton' in e)
        await button(e.clickButton).click()
      else if ('selectLabel' in e)
        await page.getByLabel(e.selectLabel, { exact: true }).selectOption(e.value)
      else
        await page.getByLabel(e.label, { exact: true }).fill(e.value)
      if (saved) await saved
    }
  }
  const review = async (name: string, p = page) => {
    await button('Return for review', p).click()
    const preview = p.getByTitle('Proposed email preview', { exact: true })
    await preview.waitFor()
    assert.equal(await preview.getAttribute('sandbox'), '')
    assert.equal(await preview.getAttribute('referrerpolicy'), 'no-referrer')
    const html = await preview.getAttribute('srcdoc')
    assert(html && !/<script\b/i.test(html))
    await writeFile(resolve(evidence, name + '.html'), html)
    for (const size of ['Desktop', 'Mobile']) {
      await button(size, p).last().click()
      assert((await preview.getAttribute('class'))?.includes(size === 'Mobile' ? '390px' : '1000px'))
      await p.screenshot({ path: resolve(evidence, name + '-' + size.toLowerCase() + '.png'), fullPage: true })
    }
  }
  const apply = async (p = page) => {
    const response = p.waitForResponse(r => r.url().endsWith('/api/email/design/designer') && r.request().postDataJSON()?.command === 'apply' && r.status() === 200)
    await button('Apply and save changes', p).click()
    await response
  }
  const url = (id: string) => 'https://app.xeroflow.io/agency/email/compose?campaign=' + id
  const reopen = async () => {
    await page.goto(url(o.campaignA))
    await button('Edit in FigFlow').click()
    const raw = await nativeRead('edm_designer_snapshot')
    assert.deepEqual(raw.result.operations, [])
    const state = await o.read(o.campaignA)
    assert.equal(state.source.kind, 'campaign-draft')
    assert.deepEqual((await page.evaluate(() => (window as any).__campaignRead())).blocks, state.source.blocks)
    return state
  }
  try {
    const protectedBefore = await o.protectedState(), before = await o.read(o.campaignA)
    const wrongClient = await o.request('/api/email/design/designer', { command: 'start', operationId: crypto.randomUUID(), owner: { kind: 'campaign', id: o.campaignA }, clientId: crypto.randomUUID() }, 'POST')
    assert([403, 404, 409].includes(wrongClient.status), 'Client-switched owner was admitted')
    assert(['NOT_FOUND', 'SCOPE_MISMATCH', 'design_scope_mismatch'].includes(wrongClient.body.statusMessage))
    await writeFile(resolve(evidence, '00-client-switch-refusal.json'), JSON.stringify(wrongClient, null, 2))
    assert.deepEqual(await o.read(o.campaignA), before)
    assert.equal(before.source.kind, 'campaign-draft')
    assert(before.source.moduleInstances.length && before.source.assets.length && before.source.policy.designerLocks.blockIds.length)
    // A separate real campaign exercises strict content-only admission; A keeps
    // its linked pins/locks and is never stripped or relabelled to make it fit.
    editorUrls.clear()
    await page.goto(url(o.contentCampaign) + '&designSession=' + o.contentHandoff + '&designMode=content')
    const contentBefore = await o.read(o.contentCampaign), content = await nativeRead('edm_snapshot')
    assert.equal(content.result.kind, 'campaign-draft')
    assert.deepEqual(content.result, contentBefore.source)
    await writeFile(resolve(evidence, '00-content-campaign-noop.json'), JSON.stringify(content, null, 2))
    await snapshot('00-content-campaign-noop', o.contentCampaign)
    const contentImports = await (await frame()).evaluate(() => (window as any).__campaignImports)
    assert(contentImports.some((item: any) => item.payload.design.kind === 'campaign-draft' && item.payload.mode !== 'designer'))
    await writeFile(resolve(evidence, '00-content-native-import.json'), JSON.stringify(contentImports, null, 2))
    const opened = await reopen()
    assert.equal(opened.revisionId, before.revisionId)
    const status = await nativeRead('status')
    for (const action of ['edm_import', 'edm_snapshot', 'edm_designer_import', 'edm_designer_snapshot'])
      assert(status.result.supportedActions.includes(action))
    await Promise.all(responseChecks)
    assert(wasmObservations.length && wasmObservations.every(x => x === o.receipt.native.wasmSha256))
    const designerImports = await (await frame()).evaluate(() => (window as any).__campaignImports)
    assert(designerImports.some((item: any) => item.payload.design.kind === 'campaign-draft' && item.payload.mode === 'designer'))
    await writeFile(resolve(evidence, '01-designer-native-import.json'), JSON.stringify(designerImports, null, 2))
    await snapshot('01-designer-campaign-noop')
    await nativeInputs(o.plan.edit)
    const raw = await nativeRead('edm_designer_snapshot')
    assert(raw.result.operations.length && JSON.stringify(raw.result.operations).includes(o.plan.expectedText[0]))
    assert(raw.result.operations.some((op: any) => op.op === 'set-style'), 'Campaign first journey requires actual approved style as well as text')
    await writeFile(resolve(evidence, '02-native-raw.json'), JSON.stringify(raw, null, 2))
    await review('02-native-review')
    assert.deepEqual(await o.read(o.campaignA), opened)
    // Unknown Apply: actual commit, lost transport reply, exact original replay.
    lost = 'apply'
    const failed = page.waitForEvent('requestfailed', { predicate: r => r.postData()?.includes('"command":"apply"') === true })
    await button('Apply and save changes').click()
    await failed
    const committed = await o.read(o.campaignA)
    assert.notEqual(committed.revisionId, opened.revisionId)
    const pendingWrites = journal.filter(x => x.method !== 'GET').length
    assert(await button('Apply and save changes').isDisabled(), 'Unknown Apply left a second write enabled')
    const original = journal.findLast(x => x.expectedFailure === 'committed-lost-apply')
    assert(original)
    const confirmedReplay = page.waitForResponse(r => r.status() === 200 && r.url().endsWith('/api/email/design/designer') && r.request().postDataJSON()?.action?.operationId === original.body.action.operationId)
    await button('Reconcile saved action').click()
    await confirmedReplay
    await page.waitForFunction(expected => JSON.stringify((window as any).__campaignRead().blocks) === JSON.stringify(expected), committed.source.blocks)
    const retries = journal.filter(x => x.body?.action?.operationId === original.body.action.operationId)
    assert.equal(retries.length, 2)
    assert.deepEqual(retries.at(-1).body, original.body)
    assert.equal((await o.read(o.campaignA)).revisionId, committed.revisionId)
    assert(journal.filter(x => x.method !== 'GET').length > pendingWrites)
    assert.equal((await page.evaluate(() => (window as any).__campaignRead())).blocks.heading.data.props.text, committed.source.blocks.heading.data.props.text)
    // Reload closes handoff UI explicitly before staff edits in the real builder.
    await page.goto(url(o.campaignA))
    await hostInputs(o.plan.staff)
    let staff = await o.read(o.campaignA)
    assert.notEqual(staff.revisionId, committed.revisionId)
    assert.deepEqual({ text: staff.source.blocks.cta.data.props.text, url: staff.source.blocks.cta.data.props.url }, o.plan.expectedStaffCta)
    assert.equal(staff.source.blocks[o.originalImageId].data.props.linkHref, o.plan.expectedStaffImageLink)
    assert(staff.source.assets.some((x: any) => x.id === o.replacementAssetId))
    const staffCalls = journal.filter(x => x.path === '/api/email/campaigns/' + o.campaignA && x.method === 'PATCH')
    assert(staffCalls.length && staffCalls.every(x => x.body.operation_id && x.body.expected_design_revision_id))
    assert(journal.some(x => x.body?.command === 'replace-published-image' && x.body.assetId === o.replacementAssetId && !Object.hasOwn(x.body, 'url')))
    // New-image default is a separate actual UI assertion, not inferred from
    // the legitimate legacy image's preexisting content URL grant.
    assert(staff.source.policy.editableFields.includes(o.newImageId + '.data.props.url'))
    assert(staff.source.lineage.find((x: any) => x.blockId === o.newImageId)?.fields.url)
    const beforeNewImage = staff
    await hostInputs(o.plan.staffNewImage)
    staff = await o.read(o.campaignA)
    assert.notEqual(staff.revisionId, beforeNewImage.revisionId)
    assert.notEqual(staff.source.blocks[o.newImageId].data.props.url, beforeNewImage.source.blocks[o.newImageId].data.props.url)
    assert.equal(staff.source.blocks[o.newImageId].data.props.url, staff.source.blocks[o.originalImageId].data.props.url)
    assert.deepEqual({ ...staff.source.blocks[o.newImageId].data.props, url: beforeNewImage.source.blocks[o.newImageId].data.props.url }, beforeNewImage.source.blocks[o.newImageId].data.props)
    assert.deepEqual(staff.source.lineage, beforeNewImage.source.lineage)
    assert.deepEqual(staff.source.policy, beforeNewImage.source.policy)
    assert(journal.some(x => x.body?.command === 'replace-published-image' && x.body.blockId === o.newImageId && x.body.assetId === o.replacementAssetId && !Object.hasOwn(x.body, 'url')))
    await snapshot('03b-new-inserted-image-typed-staff-replacement')
    await snapshot('03-staff-saved')
    const second = await reopen()
    assert.equal(second.revisionId, staff.revisionId)
    await nativeInputs(o.plan.secondEdit)
    const secondRaw = await nativeRead('edm_designer_snapshot')
    assert(secondRaw.result.operations.length && JSON.stringify(secondRaw.result.operations).includes(o.plan.expectedText[1]))
    await writeFile(resolve(evidence, '04-native-raw.json'), JSON.stringify(secondRaw, null, 2))
    await review('04-second-review')
    await apply()
    const afterSecond = await o.read(o.campaignA)
    assert.notEqual(afterSecond.revisionId, staff.revisionId)
    await reopen()
    assert.equal((await o.read(o.campaignA)).revisionId, afterSecond.revisionId)
    assert.equal(afterSecond.source.blocks.cta.data.props.text, o.plan.expectedStaffCta.text)
    assert.equal(afterSecond.source.blocks[o.originalImageId].data.props.linkHref, o.plan.expectedStaffImageLink)
    await nativeInputs(o.plan.staleEdit)
    const staleRaw = await nativeRead('edm_designer_snapshot')
    assert(staleRaw.result.operations.length && JSON.stringify(staleRaw.result.operations).includes(o.plan.expectedText[2]))
    await writeFile(resolve(evidence, '05-stale-raw.json'), JSON.stringify(staleRaw, null, 2))
    await review('05-stale-proposal')
    const loserProposal = journal.findLast(x => x.body?.command === 'propose')?.response.handoff
    assert(loserProposal?.source.kind === 'campaign-draft' && loserProposal.proposal.kind === 'campaign-draft')
    const other = await context.newPage()
    await attach(other)
    try {
      await other.goto(url(o.campaignA))
      await button('Edit in FigFlow', other).click()
      await nativeInputs(o.plan.winningEdit, other)
      const winRaw = await nativeRead('edm_designer_snapshot', other)
      assert(JSON.stringify(winRaw.result.operations).includes(o.plan.expectedText[3]))
      await writeFile(resolve(evidence, '05-winner-raw.json'), JSON.stringify(winRaw, null, 2))
      await review('05-winner-review', other)
      await apply(other)
    } finally {
      await other.close()
    }
    const winner = await o.read(o.campaignA)
    denial = { command: 'apply', statuses: [409], label: 'real-remote-head-conflict' }
    const conflict = page.waitForResponse(r => r.status() === 409 && r.request().postDataJSON()?.command === 'apply')
    await button('Apply and save changes').click()
    await conflict
    assert.deepEqual(await o.read(o.campaignA), winner)
    assert.deepEqual((await page.evaluate(() => (window as any).__campaignRead())).blocks, loserProposal.source.blocks, 'Stale refusal replaced local composer content')
    const resumed = await o.request('/api/email/design/designer', { command: 'resume', handoffId: loserProposal.id }, 'POST')
    assert.equal(resumed.status, 200)
    assert.deepEqual(resumed.body.handoff.proposal, loserProposal.proposal)
    await snapshot('06-real-conflict-preserves-both')
    const count = await o.campaignCount()
    await page.getByLabel('New campaign name', { exact: true }).fill('Explicit recovered campaign C')
    lost = 'save-proposal-as-new-draft'
    const recoveryLost = page.waitForEvent('requestfailed', { predicate: r => r.postData()?.includes('save-proposal-as-new-draft') === true })
    await button('Save as new campaign').click()
    await recoveryLost
    await button('Reconcile saved action').click()
    await page.waitForURL(u => u.pathname === '/agency/email/compose' && u.searchParams.get('campaign') !== o.campaignA)
    const recoveryCalls = journal.filter(x => x.body?.command === 'save-proposal-as-new-draft')
    assert.equal(recoveryCalls.length, 2)
    assert.deepEqual(recoveryCalls[0].body, recoveryCalls[1].body)
    const recovered = recoveryCalls[1].response.recovery
    assert.equal(await o.campaignCount(), count + 1)
    const c = await o.read(recovered.campaignId)
    assert.equal(c.status, 'draft')
    assert.equal(c.fromEmail, null)
    assert.equal(c.filterRules, null)
    assert.deepEqual(c.source, loserProposal.proposal)
    assert.deepEqual(await o.read(o.campaignA), winner)
    // Fresh authority and frozen-state failures target real persisted sessions.
    await reopen()
    await nativeInputs(o.plan.staleEdit)
    await review('07-revocation-proposal')
    const beforeDenied = await o.read(o.campaignA)
    await o.guard('revoke')
    try {
      denial = { command: 'apply', statuses: [401, 403], label: 'fresh-session-revoked' }
      const refused = page.waitForResponse(r => [401, 403].includes(r.status()) && r.request().postDataJSON()?.command === 'apply')
      await button('Apply and save changes').click()
      await refused
      assert.deepEqual(await o.read(o.campaignA), beforeDenied)
    } finally {
      await o.guard('restore')
    }
    await o.guard('freeze')
    try {
      const frozen = await o.read(o.campaignA)
      await page.goto(url(o.campaignA))
      assert.equal(await button('Edit in FigFlow').count(), 0)
      const refused = await o.request('/api/email/design/designer', { command: 'open', operationId: crypto.randomUUID(), draftId: frozen.documentId, expectedRevisionId: frozen.revisionId }, 'POST')
      assert.equal(refused.status, 409)
      assert.equal(refused.body.statusMessage, 'CAMPAIGN_FROZEN')
      assert.deepEqual(await o.read(o.campaignA), frozen)
    } finally {
      await o.guard('unfreeze')
    }
    const final = await o.read(o.campaignA)
    assert.equal(final.subject, before.subject)
    assert.equal(final.previewText, before.previewText)
    assert.equal(final.source.blocks.cta.data.props.url, o.plan.expectedStaffCta.url)
    assert(final.source.assets.some((asset: any) => asset.id === o.replacementAssetId))
    assert.equal(final.baseTemplateRevisionId, before.baseTemplateRevisionId)
    assert.deepEqual(final.source.policy, before.source.policy)
    assert.deepEqual(final.source.lineage, before.source.lineage)
    assert.deepEqual(final.source.moduleInstances, before.source.moduleInstances)
    assert.deepEqual(await o.protectedState(), protectedBefore, 'B, template/module revisions or frozen fixtures changed')
    await Promise.all(responseChecks)
    assert.equal(served['figflow-edm-relay.mjs'], o.receipt.runtimeSourceFiles['workers/craft-editors/figflow-edm-relay.mjs'])
    assert.deepEqual(unexpected, [])
    assert.deepEqual(errors, [])
    assert.equal(denial, null)
    return { before, final, recovered: c, protectedUnchanged: true, observedWasm: wasmObservations, remaining: ['public signed Pages image delivery', 'ordinary hosted employee/RBAC', 'real email', 'full OEM fidelity'] }
  } catch (error) {
    await page.screenshot({ path: resolve(evidence, 'failure.png'), fullPage: true }).catch(() => {
    })
    await writeFile(resolve(evidence, 'failure.json'), JSON.stringify({ error: String(error), stack: (error as Error).stack }, null, 2))
    throw error
  } finally {
    await writeFile(resolve(evidence, 'browser-network.json'), JSON.stringify({ journal, served, editorUrls: [...editorUrls], wasmObservations, unexpected, errors, instrumentation, playwrightSourceSha256: sha256(fingerprint), localMappingOnly: true, bundles: Object.fromEntries(Object.entries(bundles).map(([key, b]) => [key, { sha256: sha256(b.bytes), sourceFiles: b.sourceFiles, components: b.components, leaves: b.leaves }])) }, null, 2))
    await browser.close()
  }
}
