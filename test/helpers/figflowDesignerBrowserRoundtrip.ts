/* eslint @typescript-eslint/no-explicit-any: off -- Browser globals cross the intentionally dynamic native fixture boundary. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { build } from 'esbuild'
import { compileScript, parse } from '@vue/compiler-sfc'
import { chromium } from 'playwright'

/** Local acceptance fixture: actual native WASM + composer store/flow/panel +
 * the caller's real private Worker. Every browser request is intercepted;
 * nothing reaches the production hosts whose origins exercise the frame guards.
 * This is not hosted or full-dashboard visual acceptance. */
export async function exerciseDesignerRoundtrip(options: {
  packageDirectory: string
  evidenceDirectory: string
  templateId: string
  blocks: unknown
  includeStructure: boolean
  structureAndMobile?: boolean
  request(path: string, body: unknown, method: string): Promise<{ status: number, body: unknown }>
  render(body: any): Promise<string>
}) {
  const repository = process.cwd()
  const nativeRoot = resolve(options.packageDirectory)
  const evidence = resolve(options.evidenceDirectory)
  assert(nativeRoot.startsWith('/private/tmp/figflow-') || nativeRoot.startsWith(resolve(repository, '.verification') + sep), 'Only an owned native package is allowed')
  await mkdir(evidence, { recursive: true })
  const playwrightPath = resolve(repository, 'node_modules/playwright-core/lib/coreBundle.js')
  const playwrightSource = await readFile(playwrightPath, 'utf8')
  const injection = 'if (navigator.serviceWorker) navigator.serviceWorker.register = async () =>'
  const injectionOffset = playwrightSource.indexOf(injection)
  assert(injectionOffset > 0, 'Recheck Playwright instrumentation before classifying its diagnostic')
  await writeFile(resolve(evidence, 'playwright-instrumentation.json'), JSON.stringify({
    path: playwrightPath, sha256: createHash('sha256').update(playwrightSource).digest('hex'),
    line: playwrightSource.slice(0, injectionOffset).split('\n').length,
    snippet: playwrightSource.slice(injectionOffset - 100, injectionOffset + 160)
  }, null, 2))
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
          busy: flow.busy.value, error: flow.error.value, mode: flow.mode.value, capabilities: flow.designerCapabilities.value, operationId: flow.designerOperationId.value,
          onProposeDesigner: (operations, operationId) => run(() => flow.proposeDesigner(operations, operationId)), onApply: apply,
          onCancel: () => run(() => flow.finish('cancel')), onResume: () => run(() => flow.resume(flow.handoff.value.id))
        }) : null
      ]) });
      app.component('UButton', { props: ['label','disabled','loading'], emits: ['click'],
        setup: (props, {emit}) => () => h('button', { disabled: props.disabled || props.loading, onClick: () => emit('click') }, props.label) });
      app.component('UAlert', { props: ['title','description'], setup: props => () => h('div', {role:'alert'}, [props.title, props.description]) });
      app.mount('#app');
      window.__roundtripFixture = {
        start: () => run(async () => { await flow.lookup(${JSON.stringify(options.templateId)}); await flow.open(${JSON.stringify(options.templateId)}, null, true) }),
        reload: async () => { await flow.lookup(${JSON.stringify(options.templateId)}); store.resetDocument(flow.draft.value.source.blocks) },
        state: () => JSON.parse(JSON.stringify({ handoff: flow.handoff.value, draft: flow.draft.value, capabilities: flow.designerCapabilities.value, operationId: flow.designerOperationId.value, error: flow.error.value, blocks: store.document.value, past: store.past.value.length })),
        undo: () => store.undo(), redo: () => store.redo(),
        concurrentStaff: async () => { store.updateBlockProps('cta', { text: 'Concurrent staff edit' }); await flow.saveStructured(store.document.value) },
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
  const browser = await chromium.launch({ executablePath: process.env.FIGFLOW_DESIGNER_CHROMIUM, headless: true, args: ['--enable-unsafe-swiftshader'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block' })
  const external: string[] = []
  const served = new Map<string, string>()
  const browserErrors: string[] = []
  const instrumentationErrors: string[] = []
  const requests: Array<{ path: string, method: string, status: number }> = []
  let editorUrl: string | undefined
  try {
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === 'https://app.xeroflow.io') {
        if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: '<style>body{font:14px system-ui}iframe{box-sizing:border-box;width:100%;height:750px}iframe[title="Proposed email preview"]{display:block;height:480px;margin:0 auto}iframe[class*="1000px"]{max-width:1000px}iframe[class*="390px"]{max-width:390px}button{padding:12px;margin:8px}</style><div id="app"></div><script src="/fixture.js"></script>' })
        if (url.pathname === '/favicon.ico') return route.fulfill({ status: 404, body: '' })
        if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: Buffer.from(bundled.outputFiles[0].contents) })
        if (url.pathname === '/api/email/templates/render') return route.fulfill({ json: { html: await options.render(request.postDataJSON()) } })
        if (url.pathname.startsWith('/api/email/design/')) {
          const response = await options.request(url.pathname, request.postDataJSON(), request.method())
          requests.push({ path: url.pathname, method: request.method(), status: response.status })
          const handoff = (response.body as any)?.handoff
          if (handoff?.editorUrl) {
            assert(!editorUrl || editorUrl === handoff.editorUrl, 'Unexpected editor URL change')
            editorUrl = handoff.editorUrl
          }
          return route.fulfill({ status: response.status, json: response.body })
        }
      }
      const prefix = editorUrl ? new URL(editorUrl).pathname : ''
      if (editorUrl && url.origin === new URL(editorUrl).origin && url.pathname.startsWith(prefix)) {
        const relative = url.pathname.slice(prefix.length) || 'index.html'
        const file = resolve(nativeRoot, relative)
        assert(file.startsWith(nativeRoot + sep) && !relative.includes('%'))
        const contentType = ({ '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' } as Record<string, string>)[extname(file)] ?? 'application/octet-stream'
        const bytes = await readFile(file)
        served.set(relative, createHash('sha256').update(bytes).digest('hex'))
        return route.fulfill({ contentType, body: bytes })
      }
      external.push(url.origin + url.pathname)
      return route.abort('blockedbyclient')
    })
    const page = await context.newPage()
    page.on('pageerror', (error) => {
      // Playwright coreBundle.js injects an unguarded navigator.serviceWorker
      // getter for serviceWorkers:'block' into sandbox='' srcdoc previews.
      // Retain this exact harness diagnostic separately; do not hide app errors.
      const known = 'Failed to read the \'serviceWorker\' property from \'Navigator\': Service worker is disabled because the context is sandboxed and lacks the \'allow-same-origin\' flag.'
      const stack = error.stack ?? error.message
      const expected = 'SecurityError: ' + known + '\n    at <anonymous>:3:15\n    at <anonymous>:5:7'
      if (error.message === known && stack === expected) instrumentationErrors.push(stack)
      else browserErrors.push(stack)
    })
    await page.goto('https://app.xeroflow.io/fixture')
    await page.waitForFunction(() => !!(window as any).__roundtripFixture)
    const state = () => page.evaluate(() => (window as any).__roundtripFixture.state())
    async function nativeFrame() {
      await page.getByRole('button', { name: 'Return for review', exact: true }).waitFor()
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Return for review' && !button.disabled), undefined, { timeout: 60_000 })
      const frame = page.frames().find(frame => frame.url() === editorUrl)
      assert(frame, 'Actual native designer iframe missing at handoff editorUrl')
      return frame
    }
    // Read-only observations only: all design/history edits below use real input.
    async function bridge(frame: Awaited<ReturnType<typeof nativeFrame>>, action: 'status' | 'edm_designer_snapshot') {
      await frame.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      return frame.evaluate(async (action) => {
        const bridge = (window as any).__xfFigBridge
        const call = async (input: any) => {
          const raw = await bridge.request(JSON.stringify({ requestId: crypto.randomUUID(), ...input }))
          const result = typeof raw === 'string' ? JSON.parse(raw) : raw
          if (!result.ok) throw new Error('Native bridge refused: ' + JSON.stringify(result.error))
          return result
        }
        const status = await call({ action: 'status' })
        if (action === 'status') return status
        return call({ action, instanceId: status.instanceId, documentId: status.documentId, expectedRevision: status.revision, params: {} })
      }, action)
    }
    async function saveEvidence(name: string) {
      await page.screenshot({ path: resolve(evidence, name + '.png'), fullPage: true })
    }
    await page.evaluate(() => (window as any).__roundtripFixture.start())
    const before = await state()
    const frame = await nativeFrame()
    const status = await bridge(frame, 'status')
    assert(JSON.stringify(status).includes('edm_designer_import') && JSON.stringify(status).includes('edm_designer_snapshot'), 'Native designer import/snapshot capabilities must actually be advertised')
    assert.equal(before.capabilities.blocks.find((block: any) => block.blockId === 'cta')?.editable, false)
    for (const instance of before.handoff.source.moduleInstances) {
      for (const root of instance.rootBlockIds) assert.equal(before.capabilities.blocks.find((block: any) => block.blockId === root)?.editable, false)
    }
    const noop = await bridge(frame, 'edm_designer_snapshot')
    await writeFile(resolve(evidence, 'native-initial.json'), JSON.stringify({ status, noop, before }, null, 2))
    await saveEvidence('01-designer-initial')
    assert.deepEqual(noop.result.operations, [], 'Opening the native designer must not log an edit')
    assert.equal(noop.result.operationId, before.operationId)
    const originalHead = before.draft.headRevisionId
    async function propose() {
      await page.getByRole('button', { name: 'Return for review', exact: true }).click()
      await page.waitForFunction(() => (window as any).__roundtripFixture.state().handoff.state === 'proposed' || !!document.querySelector('[role=alert]'))
      assert.equal((await state()).handoff.state, 'proposed', 'Actual Return for review refused native operations: ' + await page.locator('[role=alert]').allTextContents())
      await page.getByTitle('Proposed email preview', { exact: true }).waitFor()
    }
    async function previewBoth(prefix: string) {
      const preview = page.getByTitle('Proposed email preview', { exact: true })
      assert.equal(await preview.getAttribute('sandbox'), '')
      assert.equal(await preview.getAttribute('referrerpolicy'), 'no-referrer')
      const html = await preview.getAttribute('srcdoc')
      assert(html && html.includes('Hello {{first_name}}'), 'Compiled canonical email preview is missing')
      assert(!html.includes('<script'), 'Compiled preview must remain script-free')
      if (options.structureAndMobile && prefix === '04-design-proposal') {
        assert(html.includes('28px'), 'Compiled preview omitted mobile font override')
        assert(html.includes('36px'), 'Compiled preview omitted desktop font size')
      }
      await writeFile(resolve(evidence, prefix + '-compiled.html'), html)
      await page.getByRole('button', { name: 'Desktop', exact: true }).click()
      assert((await preview.getAttribute('class'))?.includes('max-w-[1000px]'))
      assert.equal((await preview.boundingBox())?.width, 1000)
      await saveEvidence(prefix + '-desktop')
      await page.getByRole('button', { name: 'Mobile', exact: true }).click()
      assert((await preview.getAttribute('class'))?.includes('max-w-[390px]'))
      assert.equal((await preview.boundingBox())?.width, 390)
      await saveEvidence(prefix + '-mobile')
    }
    await propose()
    assert.deepEqual((await state()).blocks, before.blocks)
    assert.deepEqual((await state()).handoff.proposal, before.handoff.source, 'No-op must preserve the entire original canonical document')
    await previewBoth('02-noop')
    await page.getByRole('button', { name: 'Keep current draft', exact: true }).click()
    await page.waitForFunction(() => (window as any).__roundtripFixture.state().handoff.state === 'cancelled')
    assert.equal((await state()).draft.headRevisionId, originalHead)
    assert.deepEqual((await state()).blocks, before.blocks, 'Keep original must retain composer')

    await page.evaluate(() => (window as any).__roundtripFixture.start())
    const editingFrame = await nativeFrame()
    async function nativeControls(): Promise<void> {
      await editingFrame.locator('canvas').click({ position: { x: 590, y: 330 } })
      await editingFrame.locator('canvas').click({ position: { x: 1270, y: 296 } })
      await editingFrame.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      await page.keyboard.press('Meta+A')
      await page.keyboard.insertText('Hello {{first_name}} designer')
      await page.keyboard.press('Enter')
      const props = await bridge(editingFrame, 'edm_designer_snapshot')
      await writeFile(resolve(evidence, 'calibrate-props.json'), JSON.stringify(props, null, 2))
      assert.equal(props.result.operations.at(-1)?.op, 'set-props')
      await editingFrame.locator('canvas').click({ position: { x: 590, y: 330 } })
      await editingFrame.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      await saveEvidence('calibrate-before-style')
      await editingFrame.locator('canvas').click({ position: { x: 1245, y: 476 } })
      await editingFrame.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      await page.keyboard.press('Meta+A')
      await page.keyboard.insertText('36')
      await page.keyboard.press('Enter')
      const style = await bridge(editingFrame, 'edm_designer_snapshot')
      await writeFile(resolve(evidence, 'calibrate-style.json'), JSON.stringify(style, null, 2))
      await saveEvidence('calibrate-heading-edited')
      assert.equal(style.result.operations.at(-1)?.op, 'set-style')
      await editingFrame.locator('canvas').click({ position: { x: 1228, y: 264 } })
      const undone = await bridge(editingFrame, 'edm_designer_snapshot')
      assert.deepEqual(undone.result.operations, props.result.operations, 'Native Undo did not restore the canonical operation log')
      await saveEvidence('03a-native-undo')
      await editingFrame.locator('canvas').click({ position: { x: 1287, y: 264 } })
      const redone = await bridge(editingFrame, 'edm_designer_snapshot')
      assert.deepEqual(redone.result.operations, style.result.operations, 'Native Redo did not restore the canonical operation log')
      await saveEvidence('03b-native-redo')
      if (!options.includeStructure) return
      await editingFrame.locator('canvas').click({ position: { x: 1250, y: 716 } })
      await editingFrame.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      await saveEvidence('calibrate-add-menu')
      await editingFrame.locator('canvas').click({ position: { x: 1240, y: 585 } })
      const added = await bridge(editingFrame, 'edm_designer_snapshot')
      assert.equal(added.result.operations.at(-1)?.op, 'add-section')
      assert.equal(added.result.operations.at(-1)?.sectionType, 'Spacer')
      assert(!Object.hasOwn(added.result.operations.at(-1), 'columnIndex'), 'Root insertion must omit columnIndex without normalization')
      if (!options.structureAndMobile) return
      const canvasBounds = await editingFrame.locator('canvas').boundingBox()
      assert(canvasBounds)
      // Native heading remains selected. Toggle mobile style and type its font
      // size using the same visible number control as the desktop operation.
      await page.mouse.click(canvasBounds.x + 1205, canvasBounds.y + 328)
      await editingFrame.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      // Return keyboard focus to the selected native section after toggling
      // the mobile control, then focus its visible native number value.
      await editingFrame.locator('canvas').click({ position: { x: 590, y: 330 } })
      await editingFrame.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      await saveEvidence('calibrate-mobile-before-field')
      await writeFile(resolve(evidence, 'native-dom-inputs.json'), JSON.stringify(await editingFrame.evaluate(() => [...document.querySelectorAll('input')].map(input => ({ html: input.outerHTML, rect: input.getBoundingClientRect().toJSON(), active: document.activeElement === input }))), null, 2))
      await editingFrame.locator('canvas').click({ position: { x: 1258, y: 476 }, timeout: 5000 })
      await editingFrame.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      await page.keyboard.press('Meta+A')
      await page.keyboard.insertText('28')
      await page.keyboard.press('Enter')
      const mobile = await bridge(editingFrame, 'edm_designer_snapshot')
      await writeFile(resolve(evidence, 'native-mobile.json'), JSON.stringify(mobile, null, 2))
      assert.deepEqual(mobile.result.operations.at(-1), { blockId: 'heading', mobile: true, op: 'set-style', style: { fontSize: 28 } })
      await saveEvidence('07-native-mobile-style')
      await page.mouse.move(canvasBounds.x + 1320, canvasBounds.y + 620)
      await page.mouse.wheel(0, 620)
      await editingFrame.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      await saveEvidence('calibrate-structural-controls')
      await editingFrame.locator('canvas').click({ position: { x: 1316, y: 586 } })
      const moved = await bridge(editingFrame, 'edm_designer_snapshot')
      assert.deepEqual(moved.result.operations.at(-1), { blockId: 'heading', index: 1, op: 'move-section', parentId: 'root' })
      await saveEvidence('08-native-move')
      // Reflow changes the native selection; select the original Heading's
      // actual layer row again before using its approved Duplicate control.
      await editingFrame.locator('canvas').click({ position: { x: 150, y: 378 } })
      await page.mouse.move(canvasBounds.x + 1320, canvasBounds.y + 620)
      await page.mouse.wheel(0, 620)
      await editingFrame.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      await saveEvidence('calibrate-before-duplicate')
      await editingFrame.locator('canvas').click({ position: { x: 1234, y: 618 } })
      const duplicated = await bridge(editingFrame, 'edm_designer_snapshot')
      await writeFile(resolve(evidence, 'native-duplicated.json'), JSON.stringify(duplicated, null, 2))
      assert.deepEqual(duplicated.result.operations.at(-1), { blockId: 'heading', index: 2, op: 'duplicate-section', parentId: 'root' })
      await saveEvidence('09-native-duplicate')
      // The copied Heading is the next visible layer above the original.
      // Select it through the layer list and remove only that new identity.
      await editingFrame.locator('canvas').click({ position: { x: 150, y: 378 } })
      await page.mouse.move(canvasBounds.x + 1320, canvasBounds.y + 620)
      await page.mouse.wheel(0, 620)
      await editingFrame.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      await saveEvidence('calibrate-before-remove')
      await editingFrame.locator('canvas').click({ position: { x: 1313, y: 618 } })
      const removed = await bridge(editingFrame, 'edm_designer_snapshot')
      const duplicateId = 'designer-' + duplicated.result.operationId + '-' + (duplicated.result.operations.length - 1) + '-0'
      assert.deepEqual(removed.result.operations.at(-1), { blockId: duplicateId, op: 'remove-section' })
      assert.equal(removed.result.operations.length, 7)
      for (const operation of removed.result.operations) {
        if (['add-section', 'move-section', 'duplicate-section'].includes(operation.op)) assert(!Object.hasOwn(operation, 'columnIndex'), 'Root structural operation must omit columnIndex without normalization')
      }
      await writeFile(resolve(evidence, 'native-removed.json'), JSON.stringify(removed, null, 2))
      await saveEvidence('10-native-remove')
    }
    await nativeControls()
    const edited = await bridge(editingFrame, 'edm_designer_snapshot')
    const operations = edited.result.operations as Array<{ op: string }>
    assert(operations.some(operation => operation.op === 'set-props'))
    assert(operations.some(operation => operation.op === 'set-style'))
    if (options.includeStructure) assert(operations.some(operation => operation.op === 'add-section'))
    await writeFile(resolve(evidence, 'native-edited.json'), JSON.stringify(edited, null, 2))
    await saveEvidence('03-controls-after-undo-redo')
    await propose()
    const proposed = await state()
    if (options.structureAndMobile) {
      assert.equal(proposed.handoff.proposal.blocks.heading.data.style.fontSize, 36)
      assert.equal(proposed.handoff.proposal.blocks.heading.data.mobile.style.fontSize, 28)
      const spacerId = 'designer-' + edited.result.operationId + '-2-0'
      const duplicateId = 'designer-' + edited.result.operationId + '-5-0'
      assert.equal(proposed.handoff.proposal.blocks[spacerId].type, 'Spacer')
      assert.deepEqual(proposed.handoff.proposal.blocks.root.data.childrenIds, [spacerId, 'heading', ...proposed.handoff.source.blocks.root.data.childrenIds.slice(1)])
      assert(!Object.hasOwn(proposed.handoff.proposal.blocks, duplicateId), 'Removed copy survived the returned canonical proposal')
    }
    assert.deepEqual(proposed.blocks, before.blocks, 'Proposal changed composer before explicit Apply')
    for (const key of ['scope', 'source', 'dependencies', 'moduleInstances', 'assets', 'rootChildrenIds']) {
      assert.deepEqual(proposed.handoff.proposal[key], proposed.handoff.source[key], 'Protected canonical field changed: ' + key)
    }
    assert.deepEqual(proposed.handoff.proposal.policy.designerLocks, proposed.handoff.source.policy.designerLocks)
    assert.deepEqual(proposed.handoff.proposal.blocks.cta, proposed.handoff.source.blocks.cta, 'Explicit designer lock changed')
    for (const instance of proposed.handoff.source.moduleInstances) {
      for (const root of instance.rootBlockIds) assert.deepEqual(proposed.handoff.proposal.blocks[root], proposed.handoff.source.blocks[root], 'Pinned module block changed')
    }
    for (const original of proposed.handoff.source.lineage) {
      assert.deepEqual(proposed.handoff.proposal.lineage.find((entry: any) => entry.blockId === original.blockId), original)
    }
    await previewBoth('04-design-proposal')
    await page.getByRole('button', { name: 'Apply and save changes', exact: true }).click()
    await page.waitForFunction(() => (window as any).__roundtripFixture.state().handoff.state === 'applied')
    const applied = await state()
    assert.equal(applied.past, 1, 'Designer apply must be one composer undo step')
    assert.equal(applied.draft.headRevisionId, applied.handoff.appliedRevisionId)
    assert.deepEqual(applied.blocks, proposed.handoff.proposal.blocks)
    await page.evaluate(() => (window as any).__roundtripFixture.undo())
    assert.deepEqual((await state()).blocks, before.blocks)
    await page.evaluate(() => (window as any).__roundtripFixture.redo())
    assert.deepEqual((await state()).blocks, applied.blocks)
    await page.evaluate(() => (window as any).__roundtripFixture.reload())
    assert.equal((await state()).draft.headRevisionId, applied.draft.headRevisionId)
    assert.deepEqual((await state()).blocks, applied.blocks, 'Same-head reload changed the applied design')
    await page.evaluate(() => (window as any).__roundtripFixture.staff())
    const staffSaved = await state()
    assert.notEqual(staffSaved.draft.headRevisionId, applied.draft.headRevisionId)
    assert.equal(staffSaved.blocks.cta.data.props.text, 'Staff CTA preserved')
    await page.evaluate(() => (window as any).__roundtripFixture.start())
    const secondFrame = await nativeFrame()
    const reopened = await bridge(secondFrame, 'edm_designer_snapshot')
    assert.deepEqual(reopened.result.operations, [], 'Reopening a saved design introduced phantom operations')
    assert.deepEqual((await state()).handoff.source.blocks, staffSaved.blocks)
    await saveEvidence('05-second-reopen')
    await propose()
    assert.deepEqual((await state()).handoff.proposal.blocks, staffSaved.blocks)
    // A real concurrent staff write advances the head after the proposal. The
    // unchanged explicit Apply must be rejected by the actual Worker CAS.
    await page.evaluate(() => (window as any).__roundtripFixture.concurrentStaff())
    const concurrent = await state()
    await page.getByRole('button', { name: 'Apply and save changes', exact: true }).click()
    await page.waitForFunction(() => !!(window as any).__roundtripFixture.state().error)
    assert.equal((await state()).handoff.state, 'proposed')
    assert.deepEqual((await state()).blocks, concurrent.blocks)
    assert(requests.some(request => request.path === '/api/email/design/designer' && request.status === 409), 'Concurrent Apply was not rejected')
    await saveEvidence('06-conflict-keeps-current')
    await page.evaluate(() => (window as any).__roundtripFixture.reload())
    const final = await state()
    assert.equal(final.draft.headRevisionId, concurrent.draft.headRevisionId)
    assert.deepEqual(final.blocks, concurrent.blocks)
    for (const key of ['scope', 'source', 'policy', 'dependencies', 'moduleInstances', 'assets', 'lineage']) {
      assert.deepEqual(final.draft.source[key], applied.draft.source[key], 'Staff save changed protected state: ' + key)
    }
    for (const instance of applied.draft.source.moduleInstances) {
      for (const root of instance.rootBlockIds) assert.deepEqual(final.blocks[root], applied.blocks[root], 'Staff save changed a pinned module')
    }
    assert.deepEqual(external, [], 'Browser attempted a request outside the isolated fixture')
    assert.deepEqual(browserErrors, [], 'Browser runtime error')
    const wasm = [...served.entries()].filter(([file]) => file.endsWith('.wasm'))
    assert.equal(wasm.length, 1, 'Exactly one actual WASM must be served')
    if (process.env.FIGFLOW_DESIGNER_WASM_SHA256) assert.equal(wasm[0][1], process.env.FIGFLOW_DESIGNER_WASM_SHA256)
    await writeFile(resolve(evidence, 'browser-result.json'), JSON.stringify({ originalHead, appliedHead: applied.draft.headRevisionId, staffHead: staffSaved.draft.headRevisionId, final, status, noop, edited, reopened, instrumentationErrors }, null, 2))
    return { final, applied, staffSaved }
  } finally {
    const last = context.pages()[0]
    if (last) {
      await last.screenshot({ path: resolve(evidence, 'last-state.png'), fullPage: true }).catch(() => {})
      await writeFile(resolve(evidence, 'last-dom.html'), await last.content().catch(() => 'unavailable'))
    }
    await writeFile(resolve(evidence, 'browser-network.json'), JSON.stringify({ editorUrl, packageDirectory: nativeRoot, servedSha256: Object.fromEntries(served), requests, external, browserErrors, instrumentationErrors, node: process.version, chromium: browser.version() }, null, 2))
    await context.close()
    await browser.close()
  }
}
