import { describe, it, expect } from 'vitest'
import { extractFragment, reidFragment, fragmentTopLevelTemplates } from '~~/app/utils/edmModuleFragment'
import type { EdmFlyhubDocument, EdmFlyhubBlock } from '~~/app/types/edm'

// ── Test fixtures ────────────────────────────────────────────────────────────
function htmlBlock(html: string): EdmFlyhubBlock {
  return { type: 'Html', data: { props: { html }, style: { padding: { top: 8, bottom: 8, left: 8, right: 8 } } } }
}

// A document: root → [hero(html), container → [heading, text], cols(ColumnsContainer)]
function sampleDoc(): EdmFlyhubDocument {
  return {
    root: { type: 'EmailLayout', data: { childrenIds: ['hero', 'container', 'cols'] } },
    hero: htmlBlock('<h1>Hero</h1>'),
    container: { type: 'Container', data: { childrenIds: ['heading', 'text'], style: { backgroundColor: '#fff' } } },
    heading: { type: 'Heading', data: { props: { text: 'Hi' } } },
    text: { type: 'Text', data: { props: { text: 'Body' } } },
    cols: {
      type: 'ColumnsContainer',
      data: { props: { columns: [{ childrenIds: ['c1'] }, { childrenIds: ['c2'] }] } }
    },
    c1: htmlBlock('<p>left</p>'),
    c2: htmlBlock('<p>right</p>')
  }
}

describe('extractFragment', () => {
  it('extracts a single leaf block into a one-block fragment', () => {
    const frag = extractFragment(sampleDoc(), 'hero')
    expect(frag.rootChildrenIds).toEqual(['hero'])
    expect(Object.keys(frag.blocks)).toEqual(['hero'])
    expect(frag.blocks.hero.type).toBe('Html')
  })

  it('collects a container and all its childrenIds descendants', () => {
    const frag = extractFragment(sampleDoc(), 'container')
    expect(frag.rootChildrenIds).toEqual(['container'])
    expect(new Set(Object.keys(frag.blocks))).toEqual(new Set(['container', 'heading', 'text']))
  })

  it('collects ColumnsContainer column children (props.columns[].childrenIds)', () => {
    const frag = extractFragment(sampleDoc(), 'cols')
    expect(new Set(Object.keys(frag.blocks))).toEqual(new Set(['cols', 'c1', 'c2']))
  })

  it('does not include sibling/unrelated blocks or root', () => {
    const frag = extractFragment(sampleDoc(), 'container')
    expect(frag.blocks.hero).toBeUndefined()
    expect(frag.blocks.root).toBeUndefined()
    expect(frag.blocks.cols).toBeUndefined()
  })

  it('deep-clones — mutating the fragment never touches the source document', () => {
    const doc = sampleDoc()
    const frag = extractFragment(doc, 'container')
    ;(frag.blocks.heading.data.props as Record<string, unknown>).text = 'CHANGED'
    expect((doc.heading.data.props as Record<string, unknown>).text).toBe('Hi')
  })

  it('strips dangling child refs so the fragment is internally closed', () => {
    const doc = sampleDoc()
    // container references a child that does not exist in the document
    doc.container.data.childrenIds = ['heading', 'text', 'ghost']
    const frag = extractFragment(doc, 'container')
    expect(Object.keys(frag.blocks)).not.toContain('ghost')
    // the dangling ref is removed from the parent's childrenIds too
    expect(frag.blocks.container.data.childrenIds).toEqual(['heading', 'text'])
  })

  it('throws on the root block', () => {
    expect(() => extractFragment(sampleDoc(), 'root')).toThrow()
  })

  it('throws on a missing block', () => {
    expect(() => extractFragment(sampleDoc(), 'nope')).toThrow()
  })
})

describe('reidFragment', () => {
  const seq = () => {
    let n = 0
    return () => `new-${++n}`
  }

  it('replaces every block id with a fresh id', () => {
    const frag = extractFragment(sampleDoc(), 'container')
    const out = reidFragment(frag, seq())
    expect(Object.keys(out.blocks).every(id => id.startsWith('new-'))).toBe(true)
    expect(out.rootChildrenIds.every(id => id.startsWith('new-'))).toBe(true)
  })

  it('rewrites childrenIds references to the new ids (no dangling/old ids)', () => {
    const frag = extractFragment(sampleDoc(), 'container')
    const out = reidFragment(frag, seq())
    const container = out.blocks[out.rootChildrenIds[0]]
    const childIds = container.data.childrenIds as string[]
    expect(childIds.every(id => id.startsWith('new-'))).toBe(true)
    // every referenced child actually exists in the remapped blocks map
    expect(childIds.every(id => out.blocks[id])).toBe(true)
  })

  it('rewrites ColumnsContainer props.columns[].childrenIds', () => {
    const frag = extractFragment(sampleDoc(), 'cols')
    const out = reidFragment(frag, seq())
    const cols = out.blocks[out.rootChildrenIds[0]]
    const columns = (cols.data.props as { columns: Array<{ childrenIds: string[] }> }).columns
    const allCol = columns.flatMap(c => c.childrenIds)
    expect(allCol.every(id => id.startsWith('new-'))).toBe(true)
    expect(allCol.every(id => out.blocks[id])).toBe(true)
  })

  it('drops unmapped (dangling) child refs instead of leaking the original id', () => {
    // a fragment that is NOT internally closed: container points at a ghost id
    const frag = {
      blocks: {
        container: { type: 'Container', data: { childrenIds: ['heading', 'ghost'] } },
        heading: { type: 'Heading', data: { props: { text: 'Hi' } } }
      },
      rootChildrenIds: ['container']
    }
    const out = reidFragment(frag, seq())
    const container = out.blocks[out.rootChildrenIds[0]]
    const childIds = container.data.childrenIds as string[]
    // 'ghost' was never minted → dropped, not passed through as 'ghost'
    expect(childIds).toHaveLength(1)
    expect(childIds.every(id => id.startsWith('new-'))).toBe(true)
    expect(out.blocks.ghost).toBeUndefined()
  })

  it('never reuses an id even if the generator collides', () => {
    const frag = extractFragment(sampleDoc(), 'container')
    // a generator that returns the same id twice before varying
    let n = 0
    const collidingGen = () => {
      const seqIds = ['dup', 'dup', 'dup', 'b', 'c', 'd']
      return seqIds[n++] ?? `x-${n}`
    }
    const out = reidFragment(frag, collidingGen)
    const ids = Object.keys(out.blocks)
    expect(new Set(ids).size).toBe(ids.length) // all unique despite collisions
  })

  it('produces a fragment whose ids are disjoint from the original', () => {
    const frag = extractFragment(sampleDoc(), 'container')
    const out = reidFragment(frag, seq())
    const origIds = new Set(Object.keys(frag.blocks))
    expect(Object.keys(out.blocks).some(id => origIds.has(id))).toBe(false)
  })

  it('round-trips with the real generateBlockId (unique, no collisions)', () => {
    const frag = extractFragment(sampleDoc(), 'cols')
    const out = reidFragment(frag) // default id generator
    const ids = Object.keys(out.blocks)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('fragmentTopLevelTemplates', () => {
  it('returns one { type, data } template per rootChildId, in order', () => {
    const frag = {
      blocks: {
        a: { type: 'Html', data: { props: { html: 'x' } } },
        b: { type: 'Heading', data: { props: { text: 'T' } } }
      },
      rootChildrenIds: ['a', 'b']
    }
    const tpls = fragmentTopLevelTemplates(frag)
    expect(tpls.map(t => t.type)).toEqual(['Html', 'Heading'])
    expect(tpls[0].data).toEqual({ props: { html: 'x' } })
  })

  it('skips rootChildIds with no matching block (defensive)', () => {
    const frag = {
      blocks: { a: { type: 'Html', data: {} } },
      rootChildrenIds: ['a', 'missing']
    }
    expect(fragmentTopLevelTemplates(frag).map(t => t.type)).toEqual(['Html'])
  })
})
