const META_GRAPH_HOST = 'graph.facebook.com'

export function normalizeMetaGraphPageUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Meta returned an invalid pagination URL.')
  }

  if (url.protocol !== 'https:' || url.hostname !== META_GRAPH_HOST || url.username || url.password) {
    throw new Error('Meta returned an invalid pagination URL.')
  }

  url.searchParams.delete('access_token')
  return url.toString()
}
