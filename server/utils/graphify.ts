/**
 * Graphify reader: pulls graph.json + GRAPH_REPORT.md from R2 and exposes
 * lightweight query helpers used by the AI agent context tools.
 *
 * R2 layout (key prefix per project_repos.graphify_path):
 *   graphify/<project_slug>/graph.json
 *   graphify/<project_slug>/GRAPH_REPORT.md
 *
 * The graphify_path column on project_repos stores just the prefix
 * (e.g. "graphify/promotion-knoxgwmhaval").
 *
 * Caches are per-isolate / per-Node-process (Map keyed by R2 key).
 * Multiple isolates on CF Pages will each fetch independently — that's fine,
 * R2 reads are cheap and the 5-min TTL keeps things warm enough.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

interface GraphNode {
  id: string
  label: string
  file_type?: string
  source_file?: string
  source_location?: string
  community?: number
}

interface GraphEdge {
  source: string
  target: string
  relation?: string
}

export interface GraphData {
  nodes: GraphNode[]
  links?: GraphEdge[]
  edges?: GraphEdge[]
  graph?: { hyperedges?: any[] }
}

export class GraphifyError extends Error {
  status: number
  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions)
    this.name = 'GraphifyError'
    this.status = status
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000

interface CacheEntry<T> {
  value: T
  loadedAt: number
}

const _graphCache = new Map<string, CacheEntry<GraphData>>()
const _reportCache = new Map<string, CacheEntry<string>>()

function getR2(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new GraphifyError(
      500,
      'R2 storage is not configured on this environment',
    )
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

async function readR2Object(key: string): Promise<Uint8Array> {
  const client = getR2()
  const bucket = process.env.R2_BUCKET_NAME || 'agency-files'
  let res
  try {
    res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  } catch (err: any) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
      throw new GraphifyError(404, 'Graphify artifact not found in R2', { cause: err })
    }
    console.error(`[graphify] R2 read failed for ${key}:`, err)
    throw new GraphifyError(502, 'Failed to read graphify artifact from R2', { cause: err })
  }
  if (!res.Body) throw new GraphifyError(404, 'Graphify artifact not found in R2')

  const chunks: Uint8Array[] = []
  // Body may be a Node Readable, a Web ReadableStream, or async-iterable depending on runtime.
  // The aws-sdk normalizes to async iterable on Node; on Workers, transformToByteArray is preferred.
  const body: any = res.Body
  if (typeof body.transformToByteArray === 'function') {
    return await body.transformToByteArray()
  }
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  // Concatenate Uint8Arrays
  let total = 0
  for (const c of chunks) total += c.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

export async function loadGraph(graphifyPath: string): Promise<GraphData> {
  const key = `${graphifyPath}/graph.json`
  const cached = _graphCache.get(key)
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.value

  const bytes = await readR2Object(key)
  const graph = JSON.parse(bytesToString(bytes)) as GraphData
  _graphCache.set(key, { value: graph, loadedAt: Date.now() })
  return graph
}

export async function loadReport(graphifyPath: string): Promise<string> {
  const key = `${graphifyPath}/GRAPH_REPORT.md`
  const cached = _reportCache.get(key)
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.value

  const bytes = await readR2Object(key)
  const md = bytesToString(bytes)
  _reportCache.set(key, { value: md, loadedAt: Date.now() })
  return md
}

export async function searchNodes(
  graphifyPath: string,
  query: string,
  limit = 10,
): Promise<GraphNode[]> {
  const graph = await loadGraph(graphifyPath)
  const q = query.toLowerCase()
  return graph.nodes
    .filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        n.id.toLowerCase().includes(q) ||
        (n.source_file?.toLowerCase().includes(q) ?? false),
    )
    .slice(0, limit)
}

export async function getCommunity(
  graphifyPath: string,
  communityId: number,
): Promise<GraphNode[]> {
  const graph = await loadGraph(graphifyPath)
  return graph.nodes.filter((n) => n.community === communityId)
}

export async function getNeighbors(
  graphifyPath: string,
  nodeId: string,
): Promise<{ node: string; relation: string }[]> {
  const graph = await loadGraph(graphifyPath)
  const edges = graph.links ?? graph.edges ?? []
  return edges
    .filter((e) => e.source === nodeId || e.target === nodeId)
    .map((e) => ({
      node: e.source === nodeId ? e.target : e.source,
      relation: e.relation ?? 'related',
    }))
}

export async function getFileForNode(
  graphifyPath: string,
  nodeId: string,
): Promise<string | null> {
  const graph = await loadGraph(graphifyPath)
  const node = graph.nodes.find((n) => n.id === nodeId)
  return node?.source_file ?? null
}
