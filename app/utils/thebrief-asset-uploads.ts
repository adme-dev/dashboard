/** Bound browser memory and requests; drain in-flight writes before reporting failure. */
export async function uploadTheBriefAssets<T extends { path: string, sha256: string }>(
  assets: T[],
  clientId: string,
  acknowledged: Map<string, string>,
  upload: (asset: T, identity: string) => Promise<{ url: string, clientId: string }>
): Promise<Map<string, string>> {
  const identity = (asset: T) => `${clientId}:${asset.sha256}`
  const unique = [...new Map(assets.map(asset => [identity(asset), asset])).values()]
  const pending = unique.filter(asset => !acknowledged.has(identity(asset)))
  let cursor = 0
  let failed = false
  let failure: unknown
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, async () => {
    while (!failed) {
      const asset = pending[cursor++]
      if (!asset) return
      try {
        const stored = await upload(asset, identity(asset))
        if (!stored.url || stored.clientId !== clientId) throw new Error('Upload did not return a managed asset for the selected client')
        acknowledged.set(identity(asset), stored.url)
      } catch (cause) {
        if (!failed) {
          failed = true
          failure = cause
        }
      }
    }
  }))
  if (failed) throw failure
  return new Map(assets.map(asset => [asset.path, acknowledged.get(identity(asset))!]))
}
