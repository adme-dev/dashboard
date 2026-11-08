import { defineEventHandler } from 'h3'
import { createRoleSkillAdminHandlers } from '~~/server/utils/ai/roleSkills/admin'

export default defineEventHandler(event => createRoleSkillAdminHandlers().list(event))
