import type { H3Event } from 'h3'
import { mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'
import { createGooglePmaxPausedExecutor } from '~~/server/utils/googlePmaxPausedExecutor'
import { loadGooglePmaxProviderConnection } from '~~/server/utils/googlePmaxProviderConnection'
import { createGooglePmaxRemoteProvider } from '~~/server/utils/googlePmaxRemoteProvider'
import { createGooglePmaxRemoteDecisionEngine } from '~~/server/utils/googlePmaxRemoteDecisionEngine'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'

type RuntimeEnv = Record<string, string | undefined>

interface ExecutionServiceDependencies {
  env?: (event: H3Event) => RuntimeEnv
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
  const providerWritesEnabled = env.GOOGLE_PMAX_PROVIDER_WRITES_ENABLED === 'true'
  return {
    providerWritesEnabled,
    activationEnabled: providerWritesEnabled && env.GOOGLE_PMAX_ACTIVATION_ENABLED === 'true'
  }
}

function executor(event: H3Event, dependencies: ExecutionServiceDependencies) {
  if (dependencies.executor) return dependencies.executor
  const googleRuntimeConfig = resolveGoogleAdsRuntimeConfig(undefined, event)
  const decisionEngine = createGooglePmaxRemoteDecisionEngine(event)
  return createGooglePmaxPausedExecutor({
    parseConfig: decisionEngine.parseConfig,
    provider: createGooglePmaxRemoteProvider(event, {
      loadConnection: config => loadGooglePmaxProviderConnection(config, {
        getRuntimeConfig: () => googleRuntimeConfig
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
