import type { exportLinuxProject, editLinuxWording } from '../../workers/banner-engine/native/photocraft'
import type { BannerProject } from '../../app/types/banner-studio'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink
} from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { COMPANION_VERSION } from '../../shared/bannerCompanion'
import { BANNER_PINNED_FONT } from '../../shared/bannerPinnedFont'
import { hashBridgeValue } from '../../shared/bannerDocumentBridge'
import {
  runCompanionWording,
  parseCompanionArgs
} from '../../scripts/banner-studio/companion-wording'

const state = vi.hoisted(() => ({ calls: [] as Array<Parameters<typeof exportLinuxProject>[0] | Parameters<typeof editLinuxWording>[0]>, fault: '' }))
vi.mock('../../workers/banner-engine/native/photocraft', () => ({
  exportLinuxProject: async (input: Parameters<typeof exportLinuxProject>[0]) => {
    state.calls.push(input)
    return {
      mappings: [{ bannerId: state.fault === 'mapping' ? 999 : 7 }],
      sidecarHash: 'sealed',
      nativePath: '/unused.pcraft',
      sidecar: {
        sourceHash: await hashBridgeValue(input.project),
        linuxBinding: {
          font: { sha256: BANNER_PINNED_FONT.sha256 },
          imageId: 'local'
        }
      }
    }
  },
  editLinuxWording: async (input: Parameters<typeof editLinuxWording>[0]) => {
    state.calls.push(input)
    const after = structuredClone(input.currentProject),
      layer = after.canvasData.custom_2000x500.layers[0],
      before = layer.text
    layer.text = input.text
    if (state.fault === 'other-data') after.name = 'changed'
    return {
      nativePath: '/unused-edited.pcraft',
      plan: { changes: [{ layerId: 7, before, after: input.text }], after }
    }
  }
}))
let root: string
beforeEach(async () => {
  state.calls = []
  state.fault = ''
  await mkdir(resolve('output'), { recursive: true })
  root = await mkdtemp(resolve('output/companion-cli-test-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})
async function fixture(patch = {}) {
  const snapshot = {
    id: 'test',
    name: 'Artwork',
    canvasData: {
      custom_2000x500: {
        layers: [
          {
            id: 7,
            name: 'Heading',
            type: 'text',
            text: 'COME CELEBRATE OUR NEW HOME',
            fontFamily: 'Source Sans 3',
            fontWeight: 700,
            fontSize: 100,
            color: '#003399',
            x: 0,
            y: 0,
            w: 1900,
            h: 140,
            zIndex: 1,
            opacity: 1,
            animIn: 'none',
            animInDur: 0,
            startTime: 0,
            endTime: 5
          }
        ]
      }
    }
  } as BannerProject
  const request = {
    version: COMPANION_VERSION,
    requestId: randomUUID(),
    sourceHash: await hashBridgeValue(snapshot),
    boardKey: 'custom_2000x500',
    layerId: 7,
    revision: 1,
    fontHash: BANNER_PINNED_FONT.sha256,
    snapshot,
    ...patch
  }
  const path = join(root, 'request.json')
  await writeFile(path, JSON.stringify(request))
  return {
    request: path,
    text: 'COME CELEBRATE WITH US',
    out: join(root, 'result')
  }
}
it('runs only selected native work and emits a bound small wording proposal', async () => {
  const options = await fixture(),
    result = await runCompanionWording(options)
  expect((state.calls[0] as Parameters<typeof exportLinuxProject>[0]).layerIds).toEqual([7])
  expect(state.calls).toHaveLength(2)
  expect(result.proposal.text).toBe(options.text)
  expect(JSON.parse(await readFile(result.proposalPath, 'utf8'))).toEqual(
    result.proposal
  )
  expect(result.proposal).not.toHaveProperty('snapshot')
  await expect(runCompanionWording(options)).rejects.toThrow('EEXIST')
  expect(state.calls).toHaveLength(2)
})
it('rejects a changed source hash before execution', async () => {
  await expect(
    runCompanionWording(await fixture({ sourceHash: '0'.repeat(64) }))
  ).rejects.toThrow('source hash')
  expect(state.calls).toHaveLength(0)
})
it.each(['mapping', 'other-data'])(
  'rejects unexpected native %s',
  async (fault) => {
    state.fault = fault
    await expect(runCompanionWording(await fixture())).rejects.toThrow()
    await expect(readFile(join(root, 'result/proposal.json'))).rejects.toThrow(
      'ENOENT'
    )
  }
)
it.each(['https://example.invalid/request.json', '/tmp/foreign.json'])(
  'rejects foreign request %s before execution',
  async (request) => {
    await expect(
      runCompanionWording({ ...(await fixture()), request })
    ).rejects.toThrow()
    expect(state.calls).toHaveLength(0)
  }
)
it('rejects symbolic request and output parent paths', async () => {
  const options = await fixture(),
    alias = join(root, 'link.json')
  await symlink(options.request, alias)
  await expect(
    runCompanionWording({ ...options, request: alias })
  ).rejects.toThrow('Symbolic')
  const parent = join(root, 'alias')
  await symlink(root, parent)
  await expect(
    runCompanionWording({ ...options, out: join(parent, 'result') })
  ).rejects.toThrow('Symbolic')
  expect(state.calls).toHaveLength(0)
})
it('rejects protected factual replacement before native execution', async () => {
  await expect(
    runCompanionWording({ ...(await fixture()), text: 'SAVE $500 TODAY' })
  ).rejects.toThrow('protected')
  expect(state.calls).toHaveLength(0)
})
it('accepts literal shell punctuation only as data and rejects duplicate/extra switches', () => {
  expect(
    parseCompanionArgs([
      '--text',
      'Hello $(echo secret)',
      '--out',
      'output/new',
      '--request',
      'output/file'
    ])
  ).toEqual({
    request: 'output/file',
    out: 'output/new',
    text: 'Hello $(echo secret)'
  })
  expect(() =>
    parseCompanionArgs(['--text', 'a', '--text', 'b', '--out', 'c'])
  ).toThrow('duplicate')
  expect(() => parseCompanionArgs(['--request', 'a'])).toThrow('Usage')
})
