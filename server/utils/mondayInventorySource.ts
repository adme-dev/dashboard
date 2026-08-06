import { ofetch } from 'ofetch'

import type {
  MondayInventoryBoard,
  MondayInventorySource,
  MondayInventoryUser,
  MondayInventoryWorkspace,
} from './mondayInventory'

export const MONDAY_INVENTORY_API_VERSION = '2025-04'
const MONDAY_NESTED_WORKSPACE_MEMBER_LIMIT = 25

type Requester = <T>(query: string) => Promise<T>

function users(raw: Array<any> | undefined): Array<{ id: string; name: string; email?: string | null }> {
  return (raw || [])
    .filter(user => user != null)
    .map(user => ({ id: String(user.id), name: user.name, email: user.email ?? null }))
}

export class MondayGraphqlInventorySource implements MondayInventorySource {
  readonly apiVersion = MONDAY_INVENTORY_API_VERSION
  readonly workspaceMembershipScope = 'current_user_visible' as const
  private readonly requester: Requester

  constructor(token: string, requester?: Requester) {
    if (!token) throw new Error('MONDAY_API_TOKEN is required')
    this.requester = requester || (async <T>(query: string): Promise<T> => {
      const response = await ofetch<{ data?: T; errors?: Array<{ message?: string }> }>('https://api.monday.com/v2', {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json', 'API-Version': this.apiVersion },
        body: { query },
      })
      if (response.errors?.length) throw new Error(`Monday API error: ${response.errors[0].message || 'unknown GraphQL error'}`)
      if (!response.data) throw new Error('Monday API returned no data')
      return response.data
    })
  }

  async getAccount() {
    const data = await this.requester<{ me: { account: { id: string; name: string; slug?: string | null } } }>(`
      query InventoryAccount { me { account { id name slug } } }
    `)
    return { ...data.me.account, id: String(data.me.account.id) }
  }

  async getWorkspacesPage({ page, limit }: { page: number; limit: number }): Promise<{ entities: MondayInventoryWorkspace[] }> {
    const data = await this.requester<{ workspaces: any[] }>(`
      query InventoryWorkspaces {
        workspaces(limit: ${limit}, page: ${page}, state: all) {
          id name description kind state created_at is_default_workspace
          owners_subscribers { id name email }
          users_subscribers { id name email }
          team_owners_subscribers { id name }
          teams_subscribers { id name }
        }
      }
    `)
    return { entities: (data.workspaces || []).filter(workspace => workspace != null).map(workspace => {
      const ownerIds = users(workspace.owners_subscribers).map(user => user.id)
      const subscriberIds = users(workspace.users_subscribers).map(user => user.id)
      const teamOwnerIds = (workspace.team_owners_subscribers || [])
        .filter((team: any) => team != null)
        .map((team: any) => String(team.id))
      const teamSubscriberIds = (workspace.teams_subscribers || [])
        .filter((team: any) => team != null)
        .map((team: any) => String(team.id))
      return {
        id: String(workspace.id),
        name: workspace.name,
        description: workspace.description ?? null,
        kind: workspace.kind ?? null,
        state: workspace.state ?? null,
        ownerIds,
        subscriberIds,
        teamOwnerIds,
        teamSubscriberIds,
        isDefaultWorkspace: workspace.is_default_workspace ?? null,
        membershipTruncated: [ownerIds, subscriberIds, teamOwnerIds, teamSubscriberIds]
          .some(values => values.length >= MONDAY_NESTED_WORKSPACE_MEMBER_LIMIT),
        createdAt: workspace.created_at ?? null,
      }
    }) }
  }

  async getBoardsPage({ page, limit, state }: { page: number; limit: number; state: 'active' | 'archived' }): Promise<{ entities: MondayInventoryBoard[] }> {
    const data = await this.requester<{ boards: any[] }>(`
      query InventoryBoards {
        boards(limit: ${limit}, page: ${page}, state: ${state}) {
          id name type state board_kind workspace_id items_count permissions updated_at
          owners { id name email }
          subscribers { id name email }
          team_owners { id }
          team_subscribers { id }
          groups { id title color position }
          columns { id title type settings_str }
          views { id name type settings_str view_specific_data_str }
        }
      }
    `)
    return { entities: (data.boards || []).map(board => ({
      id: String(board.id),
      name: board.name,
      state: board.state,
      providerType: board.type ?? null,
      boardKind: board.board_kind ?? null,
      objectTypeUniqueKey: null,
      workspaceId: board.workspace_id == null ? null : String(board.workspace_id),
      itemCount: board.items_count ?? null,
      permissions: board.permissions ?? null,
      createdAt: null,
      updatedAt: board.updated_at ?? null,
      owners: users(board.owners),
      subscribers: users(board.subscribers),
      teamOwnerIds: (board.team_owners || []).map((team: any) => String(typeof team === 'object' ? team.id : team)),
      teamSubscriberIds: (board.team_subscribers || []).map((team: any) => String(typeof team === 'object' ? team.id : team)),
      groups: (board.groups || []).map((group: any) => ({ id: String(group.id), title: group.title, color: group.color ?? null, position: group.position ?? null })),
      columns: (board.columns || []).map((column: any) => ({ id: String(column.id), title: column.title, type: column.type, settingsStr: column.settings_str ?? null })),
      views: (board.views || []).map((view: any) => ({
        id: String(view.id),
        name: view.name,
        type: view.type,
        settingsStr: view.settings_str ?? null,
        viewSpecificDataStr: view.view_specific_data_str ?? null,
      })),
    })) }
  }

  async getUsersPage({ page, limit }: { page: number; limit: number }): Promise<{ entities: MondayInventoryUser[] }> {
    const fields = `
      id name email title enabled is_pending is_admin is_guest is_view_only last_activity created_at
      teams { id name }
    `
    const activeAndPending = await this.requester<{ users: any[] }>(`
      query InventoryActiveAndPendingUsers {
        users(limit: ${limit}, page: ${page}, kind: all) {
          ${fields}
        }
      }
    `)
    const inactive = await this.requester<{ users: any[] }>(`
      query InventoryInactiveUsers {
        users(limit: ${limit}, page: ${page}, kind: all, non_active: true) {
          ${fields}
        }
      }
    `)
    const byId = new Map<string, any>()
    for (const user of [...(activeAndPending.users || []), ...(inactive.users || [])]) byId.set(String(user.id), user)
    return { entities: [...byId.values()].map(user => ({
      id: String(user.id),
      name: user.name,
      email: user.email,
      title: user.title ?? null,
      enabled: Boolean(user.enabled),
      isPending: Boolean(user.is_pending),
      isAdmin: Boolean(user.is_admin),
      isGuest: Boolean(user.is_guest),
      isViewOnly: Boolean(user.is_view_only),
      teamIds: (user.teams || []).map((team: any) => String(team.id)),
      lastActivity: user.last_activity ?? null,
      createdAt: user.created_at ?? null,
    })) }
  }
}
