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

const CACHE_TTL_MS = 5 * 60 * 1000

interface CacheEntry<T> {
  key: string
  value: T
  loadedAt: number
}

let _graphCache: CacheEntry<GraphData> | null = null
let _reportCache: CacheEntry<string> | null = null

function getR2(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)')
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

async function readR2Object(key: string): Promise<Buffer> {
  const client = getR2()
  const bucket = process.env.R2_BUCKET_NAME || 'agency-files'
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!res.Body) throw new Error(`R2 object not found: ${key}`)

  const chunks: Buffer[] = []
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export async function loadGraph(graphifyPath: string): Promise<GraphData> {
  const key = `${graphifyPath}/graph.json`
  if (_graphCache && _graphCache.key === key && Date.now() - _graphCache.loadedAt < CACHE_TTL_MS) {
    return _graphCache.value
  }
  const buf = await readR2Object(key)
  const graph = JSON.parse(buf.toString('utf-8')) as GraphData
  _graphCache = { key, value: graph, loadedAt: Date.now() }
  return graph
}

export async function loadReport(graphifyPath: string): Promise<string> {
  const key = `${graphifyPath}/GRAPH_REPORT.md`
  if (_reportCache && _reportCache.key === key && Date.now() - _reportCache.loadedAt < CACHE_TTL_MS) {
    return _reportCache.value
  }
  const buf = await readR2Object(key)
  const md = buf.toString('utf-8')
  _reportCache = { key, value: md, loadedAt: Date.now() }
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
