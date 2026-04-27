/**
 * Read-only GitHub API client for the project_repos integration.
 * Uses raw fetch (no octokit dependency) — read ops only for AI agent context.
 */

import { queryOne, execute } from './db'
import { encryptToken, decryptToken } from './tokenCrypto'

interface ProjectRepoRow {
  id: string
  department_id: string
  repo_url: string
  default_branch: string
  access_token_encrypted: Buffer | null
  token_iv: Buffer | null
  graphify_path: string | null
}

export interface RepoCoords {
  owner: string
  repo: string
}

export function parseRepoUrl(url: string): RepoCoords {
  const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/i)
  if (!m) throw new Error(`Invalid GitHub URL: ${url}`)
  return { owner: m[1], repo: m[2] }
}

export async function getRepoForBoard(departmentId: string): Promise<ProjectRepoRow | null> {
  return queryOne<ProjectRepoRow>(
    'SELECT id, department_id, repo_url, default_branch, access_token_encrypted, token_iv, graphify_path FROM project_repos WHERE department_id = $1 LIMIT 1',
    [departmentId],
  )
}

export async function setRepoToken(departmentId: string, plaintextToken: string): Promise<void> {
  const { ciphertext, iv } = await encryptToken(plaintextToken)
  const updated = await execute(
    'UPDATE project_repos SET access_token_encrypted = $1, token_iv = $2 WHERE department_id = $3',
    [ciphertext, iv, departmentId],
  )
  if (updated === 0) {
    throw new Error(`No project_repos row found for department ${departmentId}`)
  }
}

async function getDecryptedToken(repo: ProjectRepoRow): Promise<string> {
  if (!repo.access_token_encrypted || !repo.token_iv) {
    throw new Error('No access token configured for this repo')
  }
  return decryptToken(repo.access_token_encrypted, repo.token_iv)
}

async function ghFetch(repo: ProjectRepoRow, apiPath: string, init?: RequestInit): Promise<Response> {
  const token = await getDecryptedToken(repo)
  const res = await fetch(`https://api.github.com${apiPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'agency-dashboard',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub ${res.status} on ${apiPath}: ${body.slice(0, 200)}`)
  }
  return res
}

export interface RepoFileEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
}

export async function listFiles(departmentId: string, path = ''): Promise<RepoFileEntry[]> {
  const repo = await getRepoForBoard(departmentId)
  if (!repo) throw new Error(`No repo connected to board ${departmentId}`)
  const { owner, repo: name } = parseRepoUrl(repo.repo_url)
  const res = await ghFetch(
    repo,
    `/repos/${owner}/${name}/contents/${encodeURI(path)}?ref=${encodeURIComponent(repo.default_branch)}`,
  )
  const data = (await res.json()) as any
  if (!Array.isArray(data)) {
    throw new Error(`Path "${path}" is a file, not a directory`)
  }
  return data.map((d: any) => ({ name: d.name, path: d.path, type: d.type, size: d.size }))
}

export async function getFile(departmentId: string, path: string): Promise<string> {
  const repo = await getRepoForBoard(departmentId)
  if (!repo) throw new Error(`No repo connected to board ${departmentId}`)
  const { owner, repo: name } = parseRepoUrl(repo.repo_url)
  const res = await ghFetch(
    repo,
    `/repos/${owner}/${name}/contents/${encodeURI(path)}?ref=${encodeURIComponent(repo.default_branch)}`,
  )
  const data = (await res.json()) as any
  if (Array.isArray(data)) {
    throw new Error(`Path "${path}" is a directory, not a file`)
  }
  if (data.encoding !== 'base64') {
    throw new Error(`Unexpected encoding: ${data.encoding}`)
  }
  return Buffer.from(data.content, 'base64').toString('utf-8')
}

export interface CodeSearchHit {
  path: string
  htmlUrl: string
  fragment: string
}

export async function searchCode(
  departmentId: string,
  query: string,
  limit = 10,
): Promise<CodeSearchHit[]> {
  const repo = await getRepoForBoard(departmentId)
  if (!repo) throw new Error(`No repo connected to board ${departmentId}`)
  const { owner, repo: name } = parseRepoUrl(repo.repo_url)
  const fullQuery = `${query} repo:${owner}/${name}`
  const res = await ghFetch(
    repo,
    `/search/code?q=${encodeURIComponent(fullQuery)}&per_page=${Math.min(limit, 30)}`,
    { headers: { Accept: 'application/vnd.github.text-match+json' } },
  )
  const data = (await res.json()) as any
  return (data.items as any[]).slice(0, limit).map((i) => ({
    path: i.path,
    htmlUrl: i.html_url,
    fragment: i.text_matches?.[0]?.fragment ?? '',
  }))
}
