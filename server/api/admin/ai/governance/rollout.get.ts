import { createError, eventHandler, setResponseHeader, type H3Event } from 'h3'
import { requirePermission, type User } from '~~/server/utils/auth'
import {
  CompanyRolloutReadinessError,
  getCompanyAssistantRolloutReadiness,
  type CompanyAssistantRolloutReadiness
} from '~~/server/utils/ai/governance/companyRolloutReadiness'

interface CompanyRolloutReadinessGetDependencies {
  requirePermission(event: H3Event, permission: 'ADMIN'): Promise<User>
  setResponseHeader(event: H3Event, name: string, value: string): void
  getReadiness(): Promise<CompanyAssistantRolloutReadiness>
}

const defaultDependencies: CompanyRolloutReadinessGetDependencies = {
  requirePermission,
  setResponseHeader,
  getReadiness: getCompanyAssistantRolloutReadiness
}

function publicReadiness(readiness: CompanyAssistantRolloutReadiness): CompanyAssistantRolloutReadiness {
  return {
    readyForPilot: readiness.readyForPilot === true,
    readyForEnforcement: readiness.readyForEnforcement === true,
    activeEmployeeCount: readiness.activeEmployeeCount,
    coveredEmployeeCount: readiness.coveredEmployeeCount,
    uncoveredEmployees: readiness.uncoveredEmployees.map(employee => ({
      userId: employee.userId,
      name: employee.name,
      role: employee.role,
      reasons: [...employee.reasons]
    })),
    departmentCoverage: readiness.departmentCoverage.map(department => ({
      departmentId: department.departmentId,
      name: department.name,
      ownerReady: department.ownerReady,
      releaseState: department.releaseState,
      latestGatePassed: department.latestGatePassed,
      activeEmployeeCount: department.activeEmployeeCount
    })),
    blockers: [...readiness.blockers]
  }
}

export function createCompanyRolloutReadinessGetHandler(
  dependencies: CompanyRolloutReadinessGetDependencies = defaultDependencies
) {
  return async (event: H3Event) => {
    await dependencies.requirePermission(event, 'ADMIN')
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')
    try {
      return publicReadiness(await dependencies.getReadiness())
    } catch (error) {
      if (error instanceof CompanyRolloutReadinessError) {
        throw createError({
          statusCode: 500,
          statusMessage: 'AI assistant rollout readiness is unavailable',
          data: { code: 'rollout_readiness_unavailable' }
        })
      }
      throw error
    }
  }
}

export default eventHandler(createCompanyRolloutReadinessGetHandler())
