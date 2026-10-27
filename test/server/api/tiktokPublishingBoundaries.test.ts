import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({access:vi.fn(),query:vi.fn(),refresh:vi.fn(),creator:vi.fn(),reconcile:vi.fn()}))
vi.mock('~~/server/utils/social/clientAccess',()=>({requireFreshSocialClientAccess:mocks.access}))
vi.mock('~~/server/utils/db',()=>({queryOneFresh:mocks.query}))
vi.mock('~~/server/utils/socialPublishing',()=>({refreshableAccessToken:mocks.refresh}))
vi.mock('~~/server/utils/social-providers/tiktok',()=>({queryTikTokCreatorPostCapabilities:mocks.creator}))
vi.mock('~~/server/utils/socialPublishing/reconciliation',()=>({reconcileDueSocialPostTargets:mocks.reconcile}))
vi.stubGlobal('defineEventHandler',(handler:unknown)=>handler)
vi.stubGlobal('getQuery',()=>({clientId:'client-a'}))
vi.stubGlobal('getRouterParam',()=> 'account-b')
const {default:creatorRoute}=await import('~~/server/api/agency/social/publishing/accounts/[id]/creator-info.get')
const {default:cron}=await import('~~/server/api/cron/reconcile-social-posts.post')
beforeEach(()=>{vi.clearAllMocks();mocks.access.mockResolvedValue({context:{assistantReadOnly:false}});mocks.query.mockResolvedValue(null)})
describe('Task5 actual route boundaries',()=>{
  it('rejects scope failure before credentials or creator access',async()=>{
    mocks.access.mockRejectedValue(new Error('denied'))
    await expect(creatorRoute({} as any)).rejects.toThrow('denied')
    expect(mocks.query).not.toHaveBeenCalled();expect(mocks.creator).not.toHaveBeenCalled()
  })
  it('binds account lookup to the authorized client before provider access',async()=>{
    await expect(creatorRoute({} as any)).rejects.toThrow('not found')
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('id=$1 AND client_id=$2'),['account-b','client-a'])
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
  it('requires bound cron secret even when process fallback differs',async()=>{
    const event={context:{cloudflare:{env:{CRON_SECRET:'bound'}}},node:{req:{headers:{'x-cron-secret':'wrong'}}}} as any
    await expect(cron(event)).rejects.toThrow('Unauthorized');expect(mocks.reconcile).not.toHaveBeenCalled()
    event.node.req.headers['x-cron-secret']='bound';await cron(event);expect(mocks.reconcile).toHaveBeenCalledWith({event})
  })
})
