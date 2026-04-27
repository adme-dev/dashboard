/**
 * Read-only GitHub API client for the project_repos integration.
 * Raw fetch (no octokit) — read ops only for AI agent context.
 *
 * Errors are deliberately generic in `GithubError`. Callers should
 * surface the message as-is to clients (it's pre-sanitized) and log
 * the raw `cause` server-side for debugging.
 */

import { queryOne, execute } from './db'
import { encryptToken, decryptToken } from './tokenCrypto'

interface ProjectRepoRow {
  id: string
  department_id: string
  repo_url: string
  default_branch: string
  access_token_encrypted: Uint8Array | null
  token_iv: Uint8Array | null
  graphify_path: string | null
}

export interface RepoCoords {
  owner: string
  repo: string
}

export class GithubError extends Error {
  status: number
  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions)
    this.name = 'GithubError'
    this.status = status
  }
}

/**
 * Strip trailing /, .git, and lowercase host portion. Used for
 * uniqueness on (department_id, repo_url) to avoid duplicate rows.
 */
export function normalizeRepoUrl(input: string): string {
  let url = input.trim()
  url = url.replace(/\/+$/, '')
  url = url.replace(/\.git$/i, '')
  // Lowercase the github.com host but leave owner/repo case alone (they're case-insensitive on GH but tools may care).
  return url.replace(/^https?:\/\/github\.com/i, 'https://github.com')
}

export function parseRepoUrl(url: string): RepoCoords {
  // Allow dots in repo name (e.g. owner/some.repo). Strip .git separately.
  const cleaned = url.replace(/\.git$/i, '').replace(/\/+$/, '')
  const m = cleaned.match(/github\.com[:/]([^/]+)\/([^/?#]+?)(?:\/|$)/i)
  if (!m || !m[1] || !m[2]) {
    throw new GithubError(400, 'Invalid GitHub URL')
  }
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
    throw new GithubError(404, 'No repo connected to this board')
  }
}

async function getDecryptedToken(repo: ProjectRepoRow): Promise<string> {
  if (!repo.access_token_encrypted || !repo.token_iv) {
    throw new GithubError(409, 'No access token configured for this repo')
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
    // Log full detail server-side; surface generic message to caller.
    const body = await res.text().catch(() => '')
    console.error(`[github] ${res.status} ${apiPath}: ${body.slice(0, 500)}`)
    if (res.status === 404) throw new GithubError(404, 'Not found in repo')
    if (res.status === 401 || res.status === 403) {
      throw new GithubError(res.status, 'GitHub auth failed — check the access token')
    }
    if (res.status === 422) throw new GithubError(422, 'GitHub rejected the request')
    if (res.status === 429) throw new GithubError(429, 'GitHub rate limit hit, try again later')
    throw new GithubError(502, 'Upstream GitHub error')
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
  if (!repo) throw new GithubError(404, 'No repo connected to this board')
  const { owner, repo: name } = parseRepoUrl(repo.repo_url)
  const res = await ghFetch(
    repo,
    `/repos/${owner}/${name}/contents/${encodeURI(path)}?ref=${encodeURIComponent(repo.default_branch)}`,
  )
  const data = (await res.json()) as any
  if (!Array.isArray(data)) throw new GithubError(400, 'Path is a file, not a directory')
  return data.map((d: any) => ({ name: d.name, path: d.path, type: d.type, size: d.size }))
}

export async function getFile(departmentId: string, path: string): Promise<string> {
  const repo = await getRepoForBoard(departmentId)
  if (!repo) throw new GithubError(404, 'No repo connected to this board')
  const { owner, repo: name } = parseRepoUrl(repo.repo_url)
  const res = await ghFetch(
    repo,
    `/repos/${owner}/${name}/contents/${encodeURI(path)}?ref=${encodeURIComponent(repo.default_branch)}`,
  )
  const data = (await res.json()) as any
  if (Array.isArray(data)) throw new GithubError(400, 'Path is a directory, not a file')
  if (data.encoding !== 'base64') throw new GithubError(502, 'Unexpected GitHub response encoding')
  // Decode base64 → utf8 without depending on Buffer (CF-portable).
  const binStr = atob(String(data.content).replace(/\n/g, ''))
  const bytes = new Uint8Array(binStr.length)
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export interface CodeSearchHit {
  path: string
  htmlUrl: string
  fragment: string
}

// Strip GitHub search qualifiers so user input can't pivot the search
// to other repos / orgs / users via the connected token's scopes.
const GH_SEARCH_QUALIFIERS = /\b(?:repo|org|user|in|path|filename|extension|language|fork|forks|size|topic|topics|is|archived):/gi

export async function searchCode(
  departmentId: string,
  query: string,
  limit = 10,
): Promise<CodeSearchHit[]> {
  const repo = await getRepoForBoard(departmentId)
  if (!repo) throw new GithubError(404, 'No repo connected to this board')
  const { owner, repo: name } = parseRepoUrl(repo.repo_url)
  const sanitized = query.replace(GH_SEARCH_QUALIFIERS, '').trim()
  if (!sanitized) throw new GithubError(400, 'Empty query after sanitization')
  const fullQuery = `${sanitized} repo:${owner}/${name}`
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
