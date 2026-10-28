import { queryOneFresh } from '~~/server/utils/db'
import type { H3Event } from 'h3'
import { mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'
import { createGooglePmaxPausedExecutor } from '~~/server/utils/googlePmaxPausedExecutor'
import { loadGooglePmaxProviderConnection } from '~~/server/utils/googlePmaxProviderConnection'
import { createGooglePmaxRemoteProvider } from '~~/server/utils/googlePmaxRemoteProvider'
import { createGooglePmaxRemoteDecisionEngine } from '~~/server/utils/googlePmaxRemoteDecisionEngine'
import type { GooglePmaxLaunch } from '~~/server/utils/googlePmaxLaunchStore'
import { getGooglePmaxLaunch } from '~~/server/utils/googlePmaxLaunchStore'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'
import { resolveMarketingProviderConfig } from '~~/server/utils/marketingProviderConfig'

type RuntimeEnv = Record<string, string | undefined>

interface ExecutionServiceDependencies {
  env?: (event: H3Event) => RuntimeEnv
  runtimeConfig?: ReturnType<typeof resolveGoogleAdsRuntimeConfig>
  authorize?: (launch: GooglePmaxLaunch, kind: 'create' | 'activate') => Promise<void>
  executor?: ReturnType<typeof createGooglePmaxPausedExecutor>
}

export class GooglePmaxExecutionGateError extends Error {
  constructor(public readonly code:
    | 'PMAX_PROVIDER_WRITES_DISABLED'
    | 'PMAX_ACTIVATION_DISABLED') {
    super(code === 'PMAX_ACTIVATION_DISABLED'
      ? 'Google PMax activation is disabled by the production kill switch.'
      : 'Google PMax provider writes are disabled by the production kill switch.')
    this.name = 'GooglePmaxExecutionGateError'
  }
}

export function googlePmaxExecutionPolicy(env: RuntimeEnv) {
  // Kill switches resolve through the shared marketing provider config; defaults are off.
  const config = resolveMarketingProviderConfig(env)
  return {
    providerWritesEnabled: config.pmaxProviderWrites,
    activationEnabled: config.pmaxProviderWrites && config.pmaxActivation
  }
}

function executor(event: H3Event, dependencies: ExecutionServiceDependencies) {
  if (dependencies.executor) return dependencies.executor
  const googleRuntimeConfig = dependencies.runtimeConfig ?? resolveGoogleAdsRuntimeConfig(undefined, event)
  const decisionEngine = createGooglePmaxRemoteDecisionEngine(event)
  return createGooglePmaxPausedExecutor({
    ...(dependencies.authorize ? { authorize: dependencies.authorize, getLaunch: input => getGooglePmaxLaunch({ ...input, fresh: true }) } : {}),
    parseConfig: decisionEngine.parseConfig,
    provider: createGooglePmaxRemoteProvider(event, {
      loadConnection: config => loadGooglePmaxProviderConnection(config, {
        queryOne: queryOneFresh, getRuntimeConfig: () => googleRuntimeConfig
      })
    })
  })
}

export async function executeGooglePmaxPausedCreate(input: {
  event: H3Event
  launchId: string
  tenantId: string
  actorId: string
}, dependencies: ExecutionServiceDependencies = {}) {
  const policy = googlePmaxExecutionPolicy((dependencies.env || mergedRuntimeEnv)(input.event))
  if (!policy.providerWritesEnabled) {
    throw new GooglePmaxExecutionGateError('PMAX_PROVIDER_WRITES_DISABLED')
  }
  return executor(input.event, dependencies).createAndVerify(input)
}

export async function executeGooglePmaxActivation(input: {
  event: H3Event
  launchId: string
  tenantId: string
  actorId: string
}, dependencies: ExecutionServiceDependencies = {}) {
  const policy = googlePmaxExecutionPolicy((dependencies.env || mergedRuntimeEnv)(input.event))
  if (!policy.activationEnabled) {
    throw new GooglePmaxExecutionGateError('PMAX_ACTIVATION_DISABLED')
  }
  return executor(input.event, dependencies).activateAndVerify(input)
}
