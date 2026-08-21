import {
  CreateLeadConnectorSchema,
  RotateLeadConnectorSecretSchema,
  UpdateLeadConnectorSchema
} from '~~/server/utils/leads/connectorContracts'
import { leadConnectorRepository } from '~~/server/utils/leads/connectorRepository'

function invalid(message: string): never {
  throw createError({ statusCode: 422, statusMessage: message })
}

export const leadConnectorService = {
  list(clientId?: string) {
    return leadConnectorRepository.list(clientId)
  },

  async create(raw: unknown, actorId: string) {
    const parsed = CreateLeadConnectorSchema.safeParse(raw)
    if (!parsed.success) invalid('Invalid lead connector configuration')
    return leadConnectorRepository.create({ ...parsed.data, actorId })
  },

  async update(id: string, clientId: string, raw: unknown) {
    const parsed = UpdateLeadConnectorSchema.safeParse(raw)
    if (!parsed.success) invalid('Invalid lead connector update')
    const updated = await leadConnectorRepository.update(id, clientId, parsed.data)
    if (!updated) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Lead connector changed or was not found'
      })
    }
    return updated
  },

  async rotate(id: string, clientId: string, raw: unknown) {
    const parsed = RotateLeadConnectorSecretSchema.safeParse(raw)
    if (!parsed.success) invalid('Invalid lead connector rotation')
    const rotated = await leadConnectorRepository.rotate(id, clientId, parsed.data.expectedVersion)
    if (!rotated) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Lead connector changed, was not found, or has no signing secret'
      })
    }
    console.info({
      event: 'lead_connector_secret_rotated',
      connectorId: id,
      clientId,
      reason: parsed.data.reason
    })
    return rotated
  }
}
