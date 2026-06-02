import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { guardAudioPrompt, loadBlocklist } from '~~/server/utils/audio/musicGuard'
import { createMusicAsset, getMusicAssetByIdempotencyKey, requeueFailedMusicAsset } from '~~/server/utils/audio/assets'
import { getMusicQueue, musicIdempotencyKey, type MusicJobPayload } from '~~/server/utils/audio/musicJob'

const BodySchema = z.object({
  prompt: z.string().min(2).max(2000),
  title: z.string().max(120).nullish(),
  clientId: z.string().uuid().nullish(),
  isInstrumental: z.boolean().default(false),
  lyrics: z.string().max(3500).nullish(),
  format: z.enum(['mp3', 'wav']).default('mp3'),
  channels: z.array(z.enum(['radio', 'tiktok', 'meta'])).default([])
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const body = BodySchema.parse(await readBody(event))

  // Hard gate: a brief or lyrics that name a copyrighted artist is a Meta
  // takedown + account-flag risk. Reject (422) — unlike VO, which only strips.
  const kv = (event.context as any).cloudflare?.env?.CACHE ?? null
  const blocklist = await loadBlocklist(kv)
  const briefGuard = guardAudioPrompt(body.prompt, blocklist)
  const lyricsGuard = body.lyrics
    ? guardAudioPrompt(body.lyrics, blocklist)
    : { safe: true, violations: [] as string[] }
  if (!briefGuard.safe || !lyricsGuard.safe) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Brief or lyrics name a specific artist — rephrase to a genre/mood',
      data: { violations: [...briefGuard.violations, ...lyricsGuard.violations] }
    })
  }

  // Music gen is async (full-song latency exceeds a request) and runs in the
  // audio-jobs companion Worker. No queue binding → feature not enabled; fail
  // fast rather than orphan a permanently-queued row.
  const queue = getMusicQueue(event)
  if (!queue) {
    throw createError({ statusCode: 503, statusMessage: 'Music generation is not enabled yet' })
  }

  const idempotencyKey = musicIdempotencyKey({
    createdBy: user.id,
    prompt: body.prompt,
    isInstrumental: body.isInstrumental,
    lyrics: body.lyrics ?? null
  })

  let asset
  try {
    asset = await createMusicAsset({
      createdBy: user.id,
      clientId: body.clientId ?? null,
      title: body.title ?? null,
      prompt: body.prompt,
      isInstrumental: body.isInstrumental,
      lyrics: body.lyrics ?? null,
      channels: body.channels,
      format: body.format,
      idempotencyKey
    })
  } catch {
    // idempotency_key UNIQUE collision — the same brief already exists. If that
    // prior attempt FAILED, let the user retry it (re-queue + re-enqueue) rather
    // than dead-ending on a 409 forever. A still-pending/done brief is a genuine
    // duplicate.
    const existing = await getMusicAssetByIdempotencyKey(idempotencyKey)
    if (existing && existing.status === 'failed' && await requeueFailedMusicAsset(existing.id)) {
      asset = { ...existing, status: 'queued', error: null }
    } else {
      throw createError({
        statusCode: 409,
        statusMessage: 'That exact brief was just submitted — check the library'
      })
    }
  }

  const payload: MusicJobPayload = {
    assetId: asset.id,
    prompt: body.prompt,
    isInstrumental: body.isInstrumental,
    lyrics: body.lyrics ?? null,
    format: body.format,
    idempotencyKey
  }
  await queue.send(payload)

  setResponseStatus(event, 202)
  return { asset }
})
