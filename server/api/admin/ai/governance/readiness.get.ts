import { createError, eventHandler, setResponseHeader, type H3Event } from 'h3'
import { requirePermission, type User } from '~~/server/utils/auth'
import {
  DepartmentPackReadinessError,
  getDepartmentPackReadiness,
  type DepartmentPackReadinessResult
} from '~~/server/utils/ai/governance/departmentPackReadiness'

interface DepartmentPackReadinessGetDependencies {
  requirePermission(event: H3Event, permission: 'ADMIN'): Promise<User>
  setResponseHeader(event: H3Event, name: string, value: string): void
  getReadiness(): Promise<DepartmentPackReadinessResult>
}

const defaultDependencies: DepartmentPackReadinessGetDependencies = {
  requirePermission,
  setResponseHeader,
  getReadiness: getDepartmentPackReadiness
}

export function createDepartmentPackReadinessGetHandler(
  dependencies: DepartmentPackReadinessGetDependencies = defaultDependencies
) {
  return async (event: H3Event) => {
    await dependencies.requirePermission(event, 'ADMIN')
    dependencies.setResponseHeader(event, 'Cache-Control', 'private, no-store')

    try {
      return await dependencies.getReadiness()
    } catch (error) {
      if (error instanceof DepartmentPackReadinessError) {
        throw createError({
          statusCode: 500,
          statusMessage: 'AI department readiness is unavailable',
          data: { code: 'readiness_unavailable' }
        })
      }
      throw error
    }
  }
}

export default eventHandler(createDepartmentPackReadinessGetHandler())
