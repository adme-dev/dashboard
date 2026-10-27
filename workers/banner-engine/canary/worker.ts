import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers'

const NAME = 'banner-native-canary-once-v1'
const KEY = 'permanent-consumption-v1'
const HASH = /^[a-f0-9]{64}$/
const IMAGE = /^registry\.cloudflare\.com\/[a-f0-9]{32}\/banner-engine-native-canary@sha256:[a-f0-9]{64}$/
// Trusted launch contract for the retained image; the packaged entrypoint is unchanged.
// The supervisor creates scratch under /tmp before daemon readiness, while the pinned
// dind wrapper mounts tmpfs over /tmp unless /tmp is already a mountpoint. Pre-mount as
// Cloudflare's Docker-in-Docker guide does, refuse to continue unless /tmp is a mountpoint,
// then exec the image's own ENTRYPOINT argv. Fixed literal; no caller or env input.
const LAUNCH_ENTRYPOINT = Object.freeze(['/bin/sh', '-c',
  'set -eu; mountpoint -q /tmp || mount -t tmpfs none /tmp; mountpoint -q /tmp; export TMPDIR=/tmp; exec node /opt/canary/supervisor.mjs'])

type RecordState = {
  state: 'consumed' | 'finished' | 'uncertain' | 'stopped'
  consumedAt: number
  deadline: number
  packageSha256: string
  outerImage: string
  bootId?: string
  receipt?: unknown
  outerDestroyed?: boolean
}

async function boundedJSON(response: Response, maximum: number): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error('canary-response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) throw new Error('canary-response-ceiling')
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('canary-receipt')
  return value as Record<string, unknown>
}

export class NativeCanary extends DurableObject<Cloudflare.Env> {
  // TypeScript protected is not an RPC security boundary. A local symbol cannot
  // be forged/serialized through a Durable Object stub to bypass consumption.
  #executionTicket = Symbol('consumed-canary')
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env)
    if (!ctx.id.equals(env.NATIVE_CANARY.idFromName(NAME))) throw new Error('canary-fixed-identity')
  }

  async status(): Promise<RecordState | null> {
    return await this.ctx.storage.get<RecordState>(KEY) ?? null
  }

  async run(...args: unknown[]): Promise<RecordState> {
    if (args.length) throw new Error('canary-arguments-forbidden')
    const old = await this.status()
    if (old) return old
    if (this.env.BANNER_NATIVE_CANARY_ENABLED !== 'true'
      || !HASH.test(this.env.BANNER_NATIVE_CANARY_PACKAGE_SHA256)
      || !IMAGE.test(this.env.BANNER_NATIVE_CANARY_OUTER_IMAGE)) throw new Error('canary-disabled-or-unpinned')
    const decision = await this.ctx.storage.transaction(async (tx) => {
      const existing = await tx.get<RecordState>(KEY)
      if (existing) return { first: false, record: existing }
      const now = Date.now()
      const record: RecordState = { state: 'consumed', consumedAt: now, deadline: now + 300000,
        packageSha256: this.env.BANNER_NATIVE_CANARY_PACKAGE_SHA256,
        outerImage: this.env.BANNER_NATIVE_CANARY_OUTER_IMAGE }
      await tx.put(KEY, record)
      await tx.setAlarm(record.deadline)
      return { first: true, record }
    })
    await this.ctx.storage.sync()
    if (!decision.first) return decision.record
    // No startup, retry, lease, reset, reconstruction or recovery executes this branch.
    // A crash here spends the one invocation, even if the VM never starts.
    let receipt: unknown
    let succeeded = false
    let destroyed = false
    try {
      receipt = await this.executeContainer(decision.record, this.#executionTicket)
      succeeded = true
    } catch { /* retain the spent permission; no transport replay */ } finally {
      try {
        await this.destroyContainer()
        destroyed = true
      } catch { /* alarm will retry destroy only */ }
    }
    return this.ctx.storage.transaction(async (tx) => {
      const latest = await tx.get<RecordState>(KEY)
      if (!latest) throw new Error('canary-consumption-missing')
      if (latest.state === 'stopped') return latest
      const record: RecordState = { ...latest, state: succeeded && destroyed ? 'finished' : 'uncertain',
        ...(receipt ? { receipt } : {}), outerDestroyed: destroyed }
      await tx.put(KEY, record)
      return record
    })
  }

  protected async executeContainer(record: RecordState, ticket: symbol): Promise<unknown> {
    if (ticket !== this.#executionTicket) throw new Error('canary-private-execution')
    const container = this.ctx.container
    if (!container || Date.now() >= record.deadline || (await this.status())?.state !== 'consumed') throw new Error('canary-not-startable')
    if (container.running) throw new Error('canary-unexpected-existing-vm')
    container.start({ enableInternet: false, entrypoint: [...LAUNCH_ENTRYPOINT] })
    await container.setInactivityTimeout(300000)
    const port = container.getTcpPort(8080)
    let ready: Record<string, unknown> | undefined
    const readyDeadline = Math.min(Date.now() + 45000, record.deadline)
    while (Date.now() < readyDeadline) {
      try {
        ready = object(await boundedJSON(await port.fetch('http://canary/ready', { signal: AbortSignal.timeout(2000) }), 1024))
        break
      } catch { await new Promise(resolve => setTimeout(resolve, 200)) }
    }
    if (!ready || typeof ready.bootId !== 'string' || !/^[a-f0-9-]{36}$/.test(ready.bootId)
      || ready.packageSha256 !== record.packageSha256) throw new Error('canary-boot-mismatch')
    const bootId = ready.bootId
    await this.ctx.storage.transaction(async (tx) => {
      const current = await tx.get<RecordState>(KEY)
      if (!current || current.state !== 'consumed' || current.bootId || Date.now() >= current.deadline) throw new Error('canary-delivery-fenced')
      await tx.put(KEY, { ...current, bootId })
    })
    await this.ctx.storage.sync()
    // Direct port transport does NOT start/restart a stopped VM. Exactly one POST.
    const receipt = object(await boundedJSON(await port.fetch('http://canary/run', {
      method: 'POST', headers: { 'content-length': '0', 'x-canary-boot': bootId },
      signal: AbortSignal.timeout(Math.max(1, record.deadline - Date.now() - 5000))
    }), 131072))
    if (receipt.schema !== 'banner-native-canary-v1' || receipt.status !== 'passed'
      || receipt.bootId !== bootId || receipt.packageSha256 !== record.packageSha256) throw new Error('canary-receipt-mismatch')
    const cleanup = object(receipt.cleanup)
    if (cleanup.innerRemoved !== true || cleanup.scratchRemoved !== true || cleanup.deliveryFenced !== true) throw new Error('canary-cleanup-unverified')
    return receipt
  }

  protected async destroyContainer(): Promise<void> {
    if (!this.ctx.container) throw new Error('canary-no-container')
    await this.ctx.container.destroy()
    if (this.ctx.container.running) throw new Error('canary-destroy-unverified')
  }

  async alarm(): Promise<void> {
    // Permanently fence even a delayed first start before attempting termination.
    await this.ctx.storage.transaction(async (tx) => {
      const old = await tx.get<RecordState>(KEY)
      if (old && old.state !== 'finished') await tx.put(KEY, { ...old, state: 'stopped' })
    })
    await this.ctx.storage.sync()
    await this.destroyContainer()
    await this.ctx.storage.transaction(async (tx) => {
      const old = await tx.get<RecordState>(KEY)
      if (old) await tx.put(KEY, { ...old, outerDestroyed: true })
    })
  }

  async fetch(): Promise<Response> { return new Response(null, { status: 404 }) }
}

// Only an explicitly provisioned trusted service binding can invoke this entrypoint.
export class NativeCanaryControl extends WorkerEntrypoint<Cloudflare.Env> {
  async run(...args: unknown[]) { return this.env.NATIVE_CANARY.getByName(NAME).run(...args) }
  async status() { return this.env.NATIVE_CANARY.getByName(NAME).status() }
}

export default {
  fetch() { return new Response(null, { status: 404 }) }
} satisfies ExportedHandler<Cloudflare.Env>
