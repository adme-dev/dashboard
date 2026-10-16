import { describe, expect, it } from 'vitest'
import { capturePageStudioRpcMethod } from '~~/server/utils/pageStudio/privateRpc'

describe('private Page Studio RPC invocation', () => {
  it('captures the original method and receiver without reading remote bind/call members', async () => {
    const service = { name: 'original', operation: new Proxy(function (this: { name: string }, value: string) {
      return Promise.resolve(`${this.name}:${value}`)
    }, { get(_target, property) { throw new Error(`Unexpected remote member ${String(property)}`) } }) }
    const invoke = capturePageStudioRpcMethod(service, 'operation')!
    await Promise.resolve()
    service.operation = () => Promise.resolve('replacement')
    expect(await invoke('request')).toBe('original:request')
  })
  it('does not invent a callable missing binding or retry a failed invocation', async () => {
    expect(capturePageStudioRpcMethod(undefined, 'operation')).toBeNull()
    expect(capturePageStudioRpcMethod({ operation: true }, 'operation')).toBeNull()
    let calls = 0
    const invoke = capturePageStudioRpcMethod({ operation() {
      calls++
      throw new Error('Lost acknowledgement')
    } }, 'operation')!
    await expect(async () => invoke()).rejects.toThrow('Lost acknowledgement')
    expect(calls).toBe(1)
  })
})
