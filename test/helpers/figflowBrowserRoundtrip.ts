/* eslint @typescript-eslint/no-explicit-any: off -- Browser globals cross the intentionally dynamic native fixture boundary. */
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { build } from 'esbuild'
import { compileScript, parse } from '@vue/compiler-sfc'
import { chromium } from 'playwright'

/** Local acceptance fixture: actual native WASM + composer store/flow/panel +
 * the caller's real private Worker. Every browser request is intercepted;
 * nothing reaches the production hosts whose origins exercise the frame guards.
 * This is not hosted or full-dashboard visual acceptance. */
export async function exerciseNativeRoundtrip(options: {
  packageDirectory: string
  evidenceDirectory: string
  templateId: string
  blocks: unknown
  request(path: string, body: unknown, method: string): Promise<{ status: number, body: unknown }>
  render(body: any): Promise<string>
}) {
  const repository = process.cwd()
  const nativeRoot = resolve(options.packageDirectory)
  const evidence = resolve(options.evidenceDirectory)
  assert(nativeRoot.startsWith('/private/tmp/figflow-') || nativeRoot.startsWith(resolve(repository, '.verification') + sep), 'Only an owned native package is allowed')
  await mkdir(evidence, { recursive: true })
  const bundled = await build({
    stdin: { contents: `
      import { createApp, h } from 'vue';
      import { $fetch } from 'ofetch';
      import Panel from './app/components/email/builder/EdmFigflowHandoff.client.vue';
      import { useEdmDesignRoundtrip } from './app/composables/useEdmDesignRoundtrip';
      import { useEdmBuilder } from './app/composables/useEdmBuilder';
      globalThis.$fetch = $fetch;
      const flow = useEdmDesignRoundtrip();
      const store = useEdmBuilder();
      store.resetDocument(${JSON.stringify(options.blocks)});
      const run = action => flow.run(action).catch(() => {});
      const apply = () => run(async () => {
        const baseline = flow.handoff.value;
        const result = await flow.finish('apply');
        if (!store.applyDesignReturn(baseline.source.blocks, baseline.proposal.blocks)) throw new Error('Local conflict');
      });
      const app = createApp({ render: () => h('main', [
        h('p', { id: 'local-heading' }, store.document.value.heading.data.props.text),
        h('p', { id: 'flow-error' }, flow.error.value),
        flow.handoff.value ? h(Panel, { key: flow.handoff.value.id, handoff: flow.handoff.value,
          busy: flow.busy.value, error: flow.error.value,
          onPropose: design => run(() => flow.propose(design)), onApply: apply,
          onCancel: () => run(() => flow.finish('cancel')), onResume: () => run(() => flow.resume(flow.handoff.value.id))
        }) : null
      ]) });
      app.component('UButton', { props: ['label','disabled','loading'], emits: ['click'],
        setup: (props, {emit}) => () => h('button', { disabled: props.disabled || props.loading, onClick: () => emit('click') }, props.label) });
      app.component('UAlert', { props: ['title','description'], setup: props => () => h('div', {role:'alert'}, [props.title, props.description]) });
      app.mount('#app');
      window.__roundtripFixture = {
        start: () => run(() => flow.open(${JSON.stringify(options.templateId)}, null)),
        state: () => JSON.parse(JSON.stringify({ handoff: flow.handoff.value, blocks: store.document.value, past: store.past.value.length })),
        undo: () => store.undo(), redo: () => store.redo(),
        staff: async () => { store.updateBlockProps('cta', { text: 'Staff CTA preserved' }); await flow.saveStructured(store.document.value) }
      };
    `, resolveDir: repository, loader: 'ts' },
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
    define: { 'process.env.NODE_ENV': '"production"', '__VUE_OPTIONS_API__': 'true', '__VUE_PROD_DEVTOOLS__': 'false', '__VUE_PROD_HYDRATION_MISMATCH_DETAILS__': 'false' },
    alias: { '~~': repository },
    plugins: [{ name: 'real-handoff-component', setup(builder) {
      builder.onLoad({ filter: /\.vue$/ }, async (args) => {
        const source = await readFile(args.path, 'utf8')
        const { descriptor } = parse(source, { filename: args.path })
        const script = compileScript(descriptor, { id: 'figflow-handoff-fixture', inlineTemplate: true })
        return { contents: script.content, loader: 'ts', resolveDir: dirname(args.path) }
      })
    } }], logLevel: 'silent'
  })
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block' })
  const external: string[] = []
  try {
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === 'https://app.xeroflow.io') {
        if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: '<style>body{font:14px system-ui}iframe{width:100%;height:750px}button{padding:12px;margin:8px}</style><div id="app"></div><script src="/fixture.js"></script>' })
        if (url.pathname === '/favicon.ico') return route.fulfill({ status: 404, body: '' })
        if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundled.outputFiles[0].contents })
        if (url.pathname === '/api/email/templates/render') return route.fulfill({ json: { html: await options.render(request.postDataJSON()) } })
        if (url.pathname.startsWith('/api/email/design/')) {
          const response = await options.request(url.pathname, request.postDataJSON(), request.method())
          return route.fulfill({ status: response.status, json: response.body })
        }
      }
      const prefix = '/figflow/0.11.2-edm1/'
      if (url.origin === 'https://creative.xeroflow.io' && url.pathname.startsWith(prefix)) {
        const relative = url.pathname.slice(prefix.length) || 'index.html'
        const file = resolve(nativeRoot, relative)
        assert(file.startsWith(nativeRoot + sep) && !relative.includes('%'))
        const contentType = ({ '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' } as Record<string, string>)[extname(file)] ?? 'application/octet-stream'
        return route.fulfill({ contentType, body: await readFile(file) })
      }
      external.push(url.origin + url.pathname)
      return route.abort('blockedbyclient')
    })
    const page = await context.newPage()
    await page.goto('https://app.xeroflow.io/fixture')
    await page.waitForFunction(() => !!(window as any).__roundtripFixture)
    const state = () => page.evaluate(() => (window as any).__roundtripFixture.state())
    async function nativeEdit(text: string) {
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Return for review' && !button.disabled), undefined, { timeout: 60_000 })
      const frame = page.frames().find(frame => frame.url().startsWith('https://creative.xeroflow.io/figflow/0.11.2-edm1/'))
      assert(frame, 'Actual native iframe missing')
      return frame.evaluate(async (text) => {
        const bridge = (window as any).__xfFigBridge
        const call = async (input: any) => {
          const raw = await bridge.request(JSON.stringify({ requestId: crypto.randomUUID(), ...input }))
          const result = typeof raw === 'string' ? JSON.parse(raw) : raw
          if (!result.ok) throw new Error('Native bridge refused: ' + result.error?.code)
          return result
        }
        const status = await call({ action: 'status' })
        const binding = { instanceId: status.instanceId, documentId: status.documentId, expectedRevision: status.revision }
        const inspected = await call({ ...binding, action: 'inspect', params: { depth: 4 } })
        const nodes: any[] = []
        const visit = (value: any) => {
          if (value && typeof value === 'object') {
            if (value.name === 'Heading' && typeof value.characters === 'string') nodes.push(value)
            Object.values(value).forEach(visit)
          }
        }
        visit(inspected.result)
        if (nodes.length !== 1) throw new Error('Mapped native heading missing')
        const updated = await call({ ...binding, action: 'update_node', params: { id: nodes[0].id, props: { characters: text } } })
        return { instanceId: updated.instanceId, documentId: updated.documentId }
      }, text)
    }
    await page.evaluate(() => (window as any).__roundtripFixture.start())
    const before = await state()
    const native = await nativeEdit('Real native browser return')
    await page.screenshot({ path: resolve(evidence, 'native-before-return.png') })
    await page.getByRole('button', { name: 'Return for review', exact: true }).click()
    await page.waitForFunction(() => (window as any).__roundtripFixture.state().handoff.state === 'proposed')
    assert.deepEqual((await state()).blocks, before.blocks, 'Proposal changed composer before Apply')
    await page.getByRole('button', { name: 'Apply and save changes', exact: true }).click()
    await page.waitForFunction(() => (window as any).__roundtripFixture.state().handoff.state === 'applied' && document.querySelector('#local-heading')?.textContent === 'Real native browser return')
    assert.equal((await state()).past, 1)
    await page.evaluate(() => (window as any).__roundtripFixture.undo())
    assert.deepEqual((await state()).blocks, before.blocks)
    await page.evaluate(() => (window as any).__roundtripFixture.redo())
    await page.evaluate(() => (window as any).__roundtripFixture.staff())
    await page.evaluate(() => (window as any).__roundtripFixture.start())
    await nativeEdit('Second real native return')
    await page.getByRole('button', { name: 'Return for review', exact: true }).click()
    await page.getByRole('button', { name: 'Apply and save changes', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('#local-heading')?.textContent === 'Second real native return')
    const final = await state()
    assert.equal(final.blocks.cta.data.props.text, 'Staff CTA preserved')
    assert.deepEqual(external, [], 'Browser attempted a request outside the isolated fixture')
    return { native, final }
  } finally {
    await context.close()
    await browser.close()
  }
}
