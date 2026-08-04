import { createHash } from 'node:crypto'
import type { ExtractionBlock, NativeExtractionResult } from '~~/server/utils/boardKnowledge/extractNative'

export interface KnowledgeChunkDraft {
  chunkIndex: number
  content: string
  contentHash: string
  tokenEstimate: number
  heading: string | null
  pageStart: number | null
  pageEnd: number | null
  sheetName: string | null
  slideNumber: number | null
}

const TARGET_CHARACTERS = 1_800
const MAX_CHARACTERS = 2_200
const OVERLAP_CHARACTERS = 200

function splitBlock(content: string): string[] {
  const normalized = content.trim()
  if (!normalized) return []
  if (normalized.length <= MAX_CHARACTERS) return [normalized]

  const parts: string[] = []
  let start = 0
  while (normalized.length - start > MAX_CHARACTERS) {
    const targetEnd = start + TARGET_CHARACTERS
    const whitespace = normalized.lastIndexOf(' ', targetEnd)
    const end = whitespace > start ? whitespace : targetEnd
    parts.push(normalized.slice(start, end).trim())
    start = Math.max(end - OVERLAP_CHARACTERS, start + 1)
  }
  const finalPart = normalized.slice(start).trim()
  if (finalPart) parts.push(finalPart)
  return parts
}

function contentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function chunkFromBlock(block: ExtractionBlock, content: string): Omit<KnowledgeChunkDraft, 'chunkIndex'> {
  return {
    content,
    contentHash: contentHash(content),
    tokenEstimate: Math.ceil(content.length / 4),
    heading: block.heading || null,
    pageStart: block.pageStart ?? null,
    pageEnd: block.pageEnd ?? null,
    sheetName: block.sheetName || null,
    slideNumber: block.slideNumber ?? null
  }
}

export function buildKnowledgeChunks(result: NativeExtractionResult): KnowledgeChunkDraft[] {
  const drafts: Array<Omit<KnowledgeChunkDraft, 'chunkIndex'>> = []
  const seen = new Set<string>()

  for (const block of result.blocks) {
    for (const content of splitBlock(block.content)) {
      const draft = chunkFromBlock(block, content)
      if (seen.has(draft.contentHash)) continue
      seen.add(draft.contentHash)
      drafts.push(draft)
    }
  }

  return drafts.map((draft, chunkIndex) => ({ ...draft, chunkIndex }))
}
