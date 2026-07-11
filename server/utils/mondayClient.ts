/**
 * Monday.com API Client
 * Handles all interactions with the Monday.com GraphQL API
 */

import { ofetch } from 'ofetch'

// ============================================
// Types
// ============================================

export interface MondayBoard {
  id: string
  name: string
  type: string
  state: 'active' | 'archived' | 'deleted'
  workspace_id?: string
  owner?: {
    id: string
    name: string
    email: string
  }
  columns?: MondayColumn[]
  groups?: MondayGroup[]
  items_count?: number
}

export interface MondayColumn {
  id: string
  title: string
  type: string
  settings?: string
  settings_str?: string
}

export interface MondayGroup {
  id: string
  title: string
  color: string
  position: string
}

export interface MondayItem {
  id: string
  name: string
  // Canonical source link; supported by Monday API versions 2024-04 and later.
  // Source: https://developer.monday.com/api-reference/changelog/new-url-field-on-boards-and-items
  url?: string
  board_id: string
  group_id?: string
  group_title?: string
  state: 'active' | 'archived' | 'deleted'
  created_at: string
  updated_at: string
  creator_id?: string
  column_values?: MondayColumnValue[]
  subitems?: MondayItem[]
  updates?: MondayUpdate[]
  assets?: MondayAsset[]
}

export interface MondayColumnValue {
  id: string
  type: string
  title?: string
  value?: string
  text?: string
  settings_str?: string
}

export interface MondayUpdate {
  id: string
  item_id: string
  creator_id: string
  creator_name?: string
  created_at: string
  updated_at: string
  body: string
  text_body: string
  replies?: MondayReply[]
}

export interface MondayReply {
  id: string
  creator_id: string
  created_at: string
  text_body: string
}

export interface MondayAsset {
  id: string
  name: string
  url: string
  file_size: number
  file_extension: string
  uploaded_at: string
  uploaded_by: string
}

export interface MondayUser {
  id: string
  name: string
  email: string
  url: string
  photo_thumb?: string
  photo_url?: string
}

export interface MondayWorkspace {
  id: string
  name: string
  description?: string
  kind?: string
}

export interface MondayAccount {
  id: string
  name: string
  slug: string
}

export type MondayWebhookEvent =
  | 'change_column_value' | 'change_subitem_column_value' | 'change_name'
  | 'create_item' | 'item_archived' | 'item_deleted' | 'item_restored'
  | 'create_subitem' | 'change_subitem_name' | 'subitem_archived' | 'subitem_deleted'
  | 'create_update' | 'edit_update' | 'delete_update' | 'create_subitem_update'

// ============================================
// Client
// ============================================

export class MondayClient {
  private apiToken: string
  private baseUrl = 'https://api.monday.com/v2'

  constructor(apiToken: string) {
    this.apiToken = apiToken
  }

  /**
   * Make a GraphQL request to Monday.com with retry on 429
   */
  private async request<T>(query: string, variables?: Record<string, any>, retries = 3): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await ofetch<{ data?: T; errors?: any[] }>(this.baseUrl, {
          method: 'POST',
          headers: {
            'Authorization': this.apiToken,
            'Content-Type': 'application/json',
            'API-Version': '2025-04',
          },
          body: { query, variables },
        })

        if (response.errors && response.errors.length > 0) {
          const error = response.errors[0]
          throw new Error(`Monday API Error: ${error.message || JSON.stringify(error)}`)
        }

        return response.data as T
      } catch (err: any) {
        const is429 = err?.status === 429 || err?.statusCode === 429 || err?.message?.includes('429')
        if (is429 && attempt < retries) {
          const delay = Math.pow(2, attempt + 1) * 1000 // 2s, 4s, 8s
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        throw err
      }
    }
    throw new Error('Max retries exceeded')
  }

  /**
   * Test the API connection and get account info
   */
  async testConnection(): Promise<MondayAccount> {
    const query = `
      query {
        me {
          id
          name
          account {
            id
            name
            slug
          }
        }
      }
    `

    const data = await this.request<{ me: { account: MondayAccount } }>(query)
    return data.me.account
  }

  async getWebhooks(boardId: string): Promise<Array<{ id: string; board_id: string; event: MondayWebhookEvent; config?: string }>> {
    const data = await this.request<{ webhooks: Array<{ id: string; board_id: string; event: MondayWebhookEvent; config?: string }> }>(`
      query AppWebhooks($boardId: ID!) {
        webhooks(board_id: $boardId, app_webhooks_only: true) { id board_id event config }
      }
    `, { boardId })
    return data.webhooks || []
  }

  async createWebhook(boardId: string, url: string, webhookEvent: MondayWebhookEvent) {
    const data = await this.request<{ create_webhook: { id: string; board_id: string } }>(`
      mutation CreateWebhook($boardId: ID!, $url: String!, $event: WebhookEventType!) {
        create_webhook(board_id: $boardId, url: $url, event: $event) { id board_id }
      }
    `, { boardId, url, event: webhookEvent })
    return data.create_webhook
  }

  /**
   * Get all boards with optional filters
   */
  async getBoards(options?: {
    limit?: number
    page?: number
    workspaceIds?: string[]
    boardIds?: string[]
    boardKind?: 'public' | 'private' | 'share'
    state?: 'active' | 'all' | 'archived' | 'deleted'
  }): Promise<MondayBoard[]> {
    const limit = options?.limit || 100
    const page = options?.page || 1
    const state = options?.state || 'active'

    // Lightweight query - fetch details per-board only when needed
    const query = `
      query {
        boards(limit: ${limit}, page: ${page}) {
          id
          name
          type
          state
          workspace_id
          items_count
        }
      }
    `

    const data = await this.request<{ boards: MondayBoard[] }>(query)
    
    // Filter by state if specified (client-side filtering)
    if (state && state !== 'all') {
      data.boards = data.boards.filter(board => board.state === state)
    }
    return data.boards
  }

  /**
   * Get a single board with all details
   */
  async getBoard(boardId: string): Promise<MondayBoard | null> {
    const query = `
      query {
        boards(ids: ["${boardId}"]) {
          id
          name
          type
          state
          workspace_id
          owner {
            id
            name
            email
          }
          columns {
            id
            title
            type
            settings_str
          }
          groups {
            id
            title
            color
            position
          }
        }
      }
    `

    const data = await this.request<{ boards: MondayBoard[] }>(query)
    return data.boards[0] || null
  }

  /**
   * Get items from a board with pagination
   */
  async getItems(boardId: string, options?: {
    limit?: number
    cursor?: string
    excludeDeleted?: boolean
  }): Promise<{ items: MondayItem[]; cursor?: string }> {
    const limit = options?.limit || 100

    let query: string
    let parseResponse: (data: any) => { cursor?: string; items: any[] }

    if (options?.cursor) {
      // Use next_items_page for subsequent pages (top-level query)
      query = `
        query {
          next_items_page(cursor: "${options.cursor}", limit: ${limit}) {
            cursor
            items {
              id
              name
              url
              state
              created_at
              updated_at
              creator_id
              group {
                id
                title
              }
              column_values {
                id
                type
                value
                text
              }
            }
          }
        }
      `
      parseResponse = (data: any) => data.next_items_page || { cursor: undefined, items: [] }
    } else {
      // Use items_page on board for first page
      query = `
        query {
          boards(ids: ["${boardId}"]) {
            items_page(limit: ${limit}) {
              cursor
              items {
                id
                name
                url
                state
                created_at
                updated_at
                creator_id
                group {
                  id
                  title
                }
                column_values {
                  id
                  type
                  value
                  text
                }
              }
            }
          }
        }
      `
      parseResponse = (data: any) => {
        const board = data.boards?.[0]
        return board?.items_page || { cursor: undefined, items: [] }
      }
    }

    const data = await this.request<any>(query)
    const result = parseResponse(data)

    // Transform group to group_id for compatibility and add board_id
    const items: MondayItem[] = (result.items || []).map((item: any) => ({
      ...item,
      board_id: boardId,
      group_id: item.group?.id,
      group_title: item.group?.title,
    }))

    return {
      items,
      cursor: result.cursor || undefined,
    }
  }

  /**
   * Get subitems for an item
   */
  async getSubitems(parentItemId: string): Promise<MondayItem[]> {
    const query = `
      query {
        items(ids: ["${parentItemId}"]) {
          subitems {
            id
            name
            url
            state
            created_at
            updated_at
            creator_id
            board_id
            column_values {
              id
              type
              value
              text
            }
          }
        }
      }
    `

    const data = await this.request<{ items: [{ subitems?: MondayItem[] }] }>(query)
    return data.items[0]?.subitems || []
  }

  /**
   * Get updates for items
   */
  async getUpdates(itemIds: string[]): Promise<MondayUpdate[]> {
    if (itemIds.length === 0) return []

    const idsString = itemIds.map(id => `"${id}"`).join(',')

    const query = `
      query {
        items(ids: [${idsString}]) {
          updates {
            id
            creator_id
            created_at
            updated_at
            body
            text_body
            replies {
              id
              creator_id
              created_at
              text_body
            }
          }
        }
      }
    `

    const data = await this.request<{ items: [{ updates?: MondayUpdate[] }] }>(query)
    return data.items.flatMap(item => item.updates || [])
  }

  /**
   * Get assets (files) for items
   */
  async getAssets(itemIds: string[]): Promise<MondayAsset[]> {
    if (itemIds.length === 0) return []

    const idsString = itemIds.map(id => `"${id}"`).join(',')

    const query = `
      query {
        items(ids: [${idsString}]) {
          assets {
            id
            name
            url
            file_size
            file_extension
            uploaded_at
            uploaded_by
          }
        }
      }
    `

    const data = await this.request<{ items: [{ assets?: MondayAsset[] }] }>(query)
    return data.items.flatMap(item => item.assets || [])
  }

  /**
   * Get all users in the account
   */
  async getUsers(options?: { limit?: number; page?: number }): Promise<MondayUser[]> {
    const limit = options?.limit || 100
    const page = options?.page || 1

    const query = `
      query {
        users(limit: ${limit}, page: ${page}) {
          id
          name
          email
          url
          photo_thumb
        }
      }
    `

    const data = await this.request<{ users: MondayUser[] }>(query)
    return data.users
  }

  /**
   * Get all workspaces
   */
  async getWorkspaces(): Promise<MondayWorkspace[]> {
    const query = `
      query {
        workspaces {
          id
          name
          description
        }
      }
    `

    const data = await this.request<{ workspaces: MondayWorkspace[] }>(query)
    return data.workspaces
  }

  /**
   * Download a file from Monday.com
   */
  async downloadFile(assetId: string): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const query = `
      query {
        assets(ids: ["${assetId}"]) {
          id
          name
          url
          file_extension
        }
      }
    `

    const data = await this.request<{ assets: MondayAsset[] }>(query)
    const asset = data.assets[0]

    if (!asset?.url) {
      throw new Error(`Asset ${assetId} not found or has no URL`)
    }

    // Download the file
    const response = await ofetch(asset.url, {
      method: 'GET',
      responseType: 'arrayBuffer',
    })

    const contentType = this.getContentType(asset.file_extension)

    return {
      buffer: Buffer.from(response),
      filename: asset.name,
      contentType,
    }
  }

  private getContentType(extension: string): string {
    const types: Record<string, string> = {
      'pdf': 'application/pdf',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'txt': 'text/plain',
      'csv': 'text/csv',
      'zip': 'application/zip',
    }
    return types[extension?.toLowerCase()] || 'application/octet-stream'
  }
}

/**
 * Create a Monday.com client from a stored token
 */
export async function createMondayClient(token?: string): Promise<MondayClient> {
  const apiToken = token || process.env.MONDAY_API_TOKEN

  if (!apiToken) {
    throw new Error('Monday.com API token not configured')
  }

  return new MondayClient(apiToken)
}

/**
 * Validate a Monday.com API token
 */
export async function validateMondayToken(token: string): Promise<{ valid: boolean; account?: MondayAccount; error?: string }> {
  try {
    const client = new MondayClient(token)
    const account = await client.testConnection()
    return { valid: true, account }
  } catch (error: any) {
    return { valid: false, error: error.message }
  }
}
