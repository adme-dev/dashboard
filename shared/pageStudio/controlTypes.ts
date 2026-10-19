export interface PageStudioControlScope {
  tenantId: string
  clientId: string
  siteId: string
}

export interface PageStudioControlQueryClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

export interface PageStudioCheckpointInput {
  checkpointId: string
  createdAt: string
  digest: string
  etag: string
  objectKey: string
  scope: PageStudioControlScope
  userId: string
}

export interface PageStudioCheckpointCommitInput {
  checkpoint: PageStudioCheckpointInput
  expectedCheckpointId: string | null
}

export interface PageStudioQueryClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>
}

export type RunPageStudioTransaction = <T>(
  callback: (db: PageStudioQueryClient) => Promise<T>
) => Promise<T>

export interface PageStudioSessionQueryClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>
}

export type PageStudioSessionQueryOne = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
) => Promise<T | null>

export interface PageStudioLoginSession {
  role: 'agency' | 'client'
  tokenHash: string
  userId: string
  issuedAt: Date
  expiresAt: Date
}
