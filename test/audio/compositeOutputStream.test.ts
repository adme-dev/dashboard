import { afterEach, describe, expect, it } from 'vitest'
import { Miniflare } from 'miniflare'
import { buildSync } from 'esbuild'
import { resolve } from 'node:path'

let runtime: Miniflare | undefined
afterEach(async () => {
  await runtime?.dispose()
})
async function start() {
  const bundle = buildSync({ entryPoints: [resolve('workers/audio-jobs/src/compositeOutputStream.ts')], bundle: true, write: false, format: 'esm', platform: 'neutral' }).outputFiles[0]!.text
  runtime = new Miniflare({ modules: true, compatibilityDate: '2025-12-01', r2Buckets: ['BUCKET'], script: `${bundle}
export default { async fetch(request,env) {
  const mode=new URL(request.url).pathname.slice(1)
  let cancelled=false
  const bytes=new TextEncoder().encode('approved mp4 bytes')
  const body=new ReadableStream({start(c){ c.enqueue(bytes);if(mode!=='put-failure')c.close() },cancel(){cancelled=true}})
  const expected=mode==='short'?bytes.length+1:mode==='long'?bytes.length-1:bytes.length
  const response=new Response(body,{headers:mode==='missing'?{}:{'content-length':String(expected)}})
  try {
    const bucket=mode==='put-failure'?{put:async()=>{throw new Error('storage unavailable')}}:env.BUCKET
    await putCompositeOutput(bucket,'output.mp4',response)
    return Response.json({ok:true,text:await(await env.BUCKET.get('output.mp4')).text()})
  }catch(error){return Response.json({ok:false,cancelled,error:String(error)})}
}}` })
  await runtime.ready
  return runtime
}
describe('workerd known-length composite output upload', () => {
  it('streams exact bytes into actual local R2 without buffering', async () => {
    const r = await start()
    expect(await (await r.dispatchFetch('http://local/exact')).json()).toEqual({ ok: true, text: 'approved mp4 bytes' })
  })
  it.each(['short', 'long', 'missing'])('rejects %s length rather than publishing', async (mode) => {
    const r = await start()
    expect(await (await r.dispatchFetch(`http://local/${mode}`)).json()).toMatchObject({ ok: false })
    expect(await (await r.getR2Bucket('BUCKET')).get('output.mp4')).toBeNull()
  })
  it('cancels the upstream body when R2 fails before consumption', async () => {
    const r = await start()
    expect(await (await r.dispatchFetch('http://local/put-failure')).json()).toMatchObject({ ok: false, cancelled: true })
  })
})
