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
  title?: string
  type: string
  value?: string
  text?: string
  additional_info?: string
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
}

export interface MondayWorkspace {
  id: string
  name: string
  description?: string
}

export interface MondayAccount {
  id: string
  name: string
  slug: string
}

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
   * Make a GraphQL request to Monday.com
   */
  private async request<T>(query: string, variables?: Record<string, any>): Promise<T> {
    const response = await ofetch<{ data?: T; errors?: any[] }>(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': this.apiToken,
        'Content-Type': 'application/json',
        'API-Version': '2024-01',
      },
      body: { query, variables },
    })

    if (response.errors && response.errors.length > 0) {
      const error = response.errors[0]
      throw new Error(`Monday API Error: ${error.message || JSON.stringify(error)}`)
    }

    return response.data as T
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

    // Use simpler query without where clause - filter by state in code if needed
    const query = `
      query {
        boards(limit: ${limit}, page: ${page}) {
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
    const cursorParam = options?.cursor ? `, cursor: {\"id\":\"${options.cursor}\"}` : ''

    const query = `
      query {
        boards(ids: ["${boardId}"]) {
          items_page(limit: ${limit}${cursorParam}) {
            cursor
            items {
              id
              name
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

    const data = await this.request<{ boards: [{ items_page: { cursor?: string; items: any[] } }] }>(query)
    const board = data.boards[0]

    if (!board) {
      return { items: [], cursor: undefined }
    }

    // Transform group to group_id for compatibility
    const items: MondayItem[] = board.items_page.items.map(item => ({
      ...item,
      group_id: item.group?.id,
      group_title: item.group?.title,
    }))

    return {
      items,
      cursor: board.items_page.cursor,
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
            state
            created_at
            updated_at
            creator_id
            board_id
            column_values {
              id
              title
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
