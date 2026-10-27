import { describe, expect, it } from 'vitest'
import type { BannerProject, Layer } from '../../app/types/banner-studio'
import { BANNER_PINNED_FONT } from '../../shared/bannerPinnedFont'
import { hashBridgeValue } from '../../shared/bannerDocumentBridge'
import {
  COMPANION_VERSION,
  COMPANION_REQUEST_MAX_BYTES,
  COMPANION_PROPOSAL_MAX_BYTES,
  companionBlockReason,
  parseCompanionRequest,
  parseCompanionProposal,
  validateCompanionProposal
} from '../../shared/bannerCompanion'

const heading = (): Layer => ({
  id: 7,
  name: 'Heading',
  type: 'text',
  x: 10,
  y: 20,
  w: 400,
  h: 100,
  zIndex: 1,
  opacity: 1,
  animIn: 'none',
  animInDur: 0,
  startTime: 0,
  endTime: 5,
  text: 'Welcome home',
  fontFamily: 'Source Sans 3',
  fontWeight: 700,
  fontSize: 24,
  color: '#112233'
})
async function fixture() {
  const snapshot = {
    id: 'project',
    name: 'Letter',
    canvasData: { mrec: { layers: [heading()] } },
    clientId: null,
    thumbnailUrl: null,
    status: 'draft',
    tags: [],
    createdBy: 'local',
    createdAt: 'now',
    updatedAt: 'now'
  } as BannerProject
  const request = {
    version: COMPANION_VERSION,
    requestId: crypto.randomUUID(),
    sourceHash: await hashBridgeValue(snapshot),
    boardKey: 'mrec',
    layerId: 7,
    revision: 1,
    snapshot,
    fontHash: BANNER_PINNED_FONT.sha256
  }
  const { snapshot: _, ...identity } = request
  const proposal = {
    ...identity,
    text: 'Come say hello',
    engine: { name: 'PhotoCraft' as const, version: '0.16.0' as const, platform: 'linux' as const }
  }
  return { request, proposal }
}

describe('companion wording file contract', () => {
  it('roundtrips complete source and a small wording-only proposal', async () => {
    const { request, proposal } = await fixture()
    expect(parseCompanionRequest(JSON.stringify(request))).toEqual(request)
    expect(parseCompanionProposal(JSON.stringify(proposal))).toEqual(proposal)
    expect(validateCompanionProposal(proposal, request)).toEqual(proposal)
  })
  it.each([
    'canvasData',
    'snapshot',
    'bounds',
    'metrics',
    'fontFamily',
    'url',
    'script',
    'textRuns',
    '__proto__',
    'constructor',
    'prototype'
  ])('rejects imported %s authority', async (key) => {
    const { proposal } = await fixture()
    expect(() => parseCompanionProposal(JSON.stringify({ ...proposal, [key]: 'untrusted' }))).toThrow()
  })
  it('rejects unknown request and engine keys', async () => {
    const { request, proposal } = await fixture()
    expect(() => parseCompanionRequest(JSON.stringify({ ...request, command: 'run' }))).toThrow()
    expect(() =>
      parseCompanionProposal(JSON.stringify({ ...proposal, engine: { ...proposal.engine, authenticated: true } }))
    ).toThrow()
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      expect(() => parseCompanionRequest(JSON.stringify({ ...request, [key]: 'untrusted' }))).toThrow()
      expect(() =>
        parseCompanionProposal(JSON.stringify({ ...proposal, engine: { ...proposal.engine, [key]: 'untrusted' } }))
      ).toThrow()
    }
  })
  it.each(['requestId', 'sourceHash', 'boardKey', 'layerId', 'revision'])(
    'binds %s to originating request',
    async (key) => {
      const { request, proposal } = await fixture()
      const changed = {
        ...proposal,
        [key]:
          key === 'requestId'
            ? crypto.randomUUID()
            : key === 'sourceHash'
              ? 'a'.repeat(64)
              : key === 'boardKey'
                ? 'other'
                : 9
      }
      expect(() => validateCompanionProposal(changed, request)).toThrow('different or stale')
    }
  )
  it('requires fixed versions, engine and exact font identity', async () => {
    const { proposal } = await fixture()
    for (const patch of [
      { version: 'later' },
      { fontHash: 'b'.repeat(64) },
      { engine: { ...proposal.engine, name: 'Other' } }
    ]) {
      expect(() => parseCompanionProposal(JSON.stringify({ ...proposal, ...patch }))).toThrow()
    }
  })
  it.each([
    '',
    ' ',
    'Two\nlines',
    'Tab\there',
    '\u007f',
    '\u0085',
    '\u00a0',
    '\u202e',
    '\ud800',
    'Hello 🎉',
    'שָׁלוֹם',
    'A'.repeat(4001)
  ])('rejects malformed or unsupported wording %j', async (text) => {
    const { proposal } = await fixture()
    expect(() => parseCompanionProposal(JSON.stringify({ ...proposal, text }))).toThrow()
  })
  it.each(['Save $500', 'Visit Main Street', 'Free drinks', 'New Subaru', 'Welcome home'])(
    'rejects unsafe, brand-changing or unchanged return %s',
    async (text) => {
      const { proposal, request } = await fixture()
      expect(() => validateCompanionProposal({ ...proposal, text }, request)).toThrow()
    }
  )
  it.each([
    { fontFamily: 'Arial' },
    { fontWeight: 400 },
    { fontSize: 513 },
    { copyLocked: true },
    { locked: true },
    { text: 'Terms apply' },
    { textRuns: [{ text: 'Welcome home' }] },
    { textShadow: '0 0 2px white' },
    { letterSpacing: '2px' },
    { rotation: 1 },
    { feedBindings: [{ property: 'text' }] }
  ])('reports unsupported original without conversion %j', (patch) => {
    expect(companionBlockReason({ ...heading(), ...patch } as Layer)).not.toBe('')
  })
  it('keeps descriptive provenance exportable without trusting its declaration', () => {
    const layer = {
      ...heading(),
      companionEdit: {
        kind: 'manual-companion-wording',
        engineVerified: false,
        declaredEngine: { name: 'PhotoCraft', version: '0.16.0', platform: 'linux' },
        requestId: crypto.randomUUID(),
        sourceHash: 'a'.repeat(64),
        fontHash: BANNER_PINNED_FONT.sha256
      }
    } as Layer
    expect(companionBlockReason(layer)).toBe('')
  })
  it('bounds both raw length and UTF-8 byte size before JSON parsing', () => {
    expect(() => parseCompanionProposal(' '.repeat(COMPANION_PROPOSAL_MAX_BYTES + 1))).toThrow('size limit')
    expect(() => parseCompanionProposal('é'.repeat(COMPANION_PROPOSAL_MAX_BYTES / 2 + 1))).toThrow('size limit')
    expect(() => parseCompanionRequest(' '.repeat(COMPANION_REQUEST_MAX_BYTES + 1))).toThrow('size limit')
    expect(() => parseCompanionProposal('{')).toThrow('valid JSON')
  })
  it('rejects missing selection, duplicate identity and non-finite source JSON', async () => {
    const { request } = await fixture()
    expect(() => parseCompanionRequest(JSON.stringify({ ...request, layerId: 8 }))).toThrow()
    request.snapshot.canvasData.mrec!.layers.push(heading())
    expect(() => parseCompanionRequest(JSON.stringify(request))).toThrow('duplicate')
    const raw = JSON.stringify(request).replace('"x":10', '"x":1e999')
    expect(() => parseCompanionRequest(raw)).toThrow('finite JSON')
  })
})
