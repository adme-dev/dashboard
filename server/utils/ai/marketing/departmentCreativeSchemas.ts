// Dependency-free (zod only): safe for policy/projection imports.
import { z } from 'zod'

export const DEPARTMENT_CREATIVE_READ_NAMES = [
  'marketing_list_banner_projects', 'marketing_get_banner_project', 'marketing_list_banner_templates',
  'marketing_list_banner_assets', 'marketing_preview_banner_project', 'marketing_get_banner_render_status'
] as const
export const DEPARTMENT_CREATIVE_WRITE_NAMES = [
  'marketing_create_banner_project', 'marketing_update_banner_project', 'marketing_export_banner_render'
] as const
export type DepartmentCreativeToolName = typeof DEPARTMENT_CREATIVE_READ_NAMES[number] | typeof DEPARTMENT_CREATIVE_WRITE_NAMES[number]

const uuid = z.string().uuid()
const revision = z.string().regex(/^[0-9a-f]{64}$/, 'Use the revision returned by marketing_get_banner_project')
const formatKey = z.string().regex(/^[a-z0-9_-]{1,40}$/i)
/** Provenance tags belong to the native import path only; MCP can never forge or strip them. */
const tag = z.string().trim().min(1).max(50).refine(value => !/^source(:|-sha256)/i.test(value), 'Provenance tags are managed by the import path')
const tags = z.array(tag).max(20)
const artboard = z.object({ layers: z.array(z.record(z.string(), z.unknown())).max(200) }).passthrough()
const canvasData = z.record(formatKey, artboard).refine(value => Object.keys(value).length >= 1 && Object.keys(value).length <= 20, 'Provide 1-20 artboards')
  .refine(value => JSON.stringify(value).length <= 1_000_000, 'Canvas exceeds 1 MB')

export const departmentCreativeContracts = {
  marketing_list_banner_projects: z.strictObject({
    clientId: uuid,
    status: z.string().trim().min(1).max(20).optional(),
    afterId: uuid.optional(),
    limit: z.number().int().min(1).max(100).default(50)
  }),
  marketing_get_banner_project: z.strictObject({ clientId: uuid, projectId: uuid }),
  marketing_list_banner_templates: z.strictObject({
    clientId: uuid,
    category: z.string().trim().min(1).max(50).optional(),
    limit: z.number().int().min(1).max(100).default(50)
  }),
  marketing_list_banner_assets: z.strictObject({
    clientId: uuid,
    afterId: uuid.optional(),
    limit: z.number().int().min(1).max(100).default(50)
  }),
  marketing_preview_banner_project: z.strictObject({ clientId: uuid, projectId: uuid, format: formatKey, expectedRevision: revision.optional() }),
  marketing_get_banner_render_status: z.strictObject({ clientId: uuid, projectId: uuid, jobIds: z.array(uuid).min(1).max(20) }),
  // Flat object (no oneOf): a non-object root or union schema has hidden MCP catalogs before.
  marketing_create_banner_project: z.strictObject({
    clientId: uuid,
    name: z.string().trim().min(1).max(255),
    sourceKind: z.enum(['blank', 'template', 'project']),
    headline: z.string().trim().min(1).max(120).optional(),
    templateId: uuid.optional(),
    sourceProjectId: uuid.optional(),
    sourceRevision: revision.optional(),
    tags: tags.optional(),
    acknowledgement: z.literal('CREATE_BANNER_DRAFT')
  }).refine(value => value.sourceKind === 'blank'
    ? Boolean(value.headline) && !value.templateId && !value.sourceProjectId && !value.sourceRevision
    : value.sourceKind === 'template'
      ? Boolean(value.templateId) && !value.headline && !value.sourceProjectId && !value.sourceRevision
      : Boolean(value.sourceProjectId && value.sourceRevision) && !value.headline && !value.templateId,
  'blank needs headline; template needs templateId; project needs sourceProjectId + sourceRevision'),
  marketing_update_banner_project: z.strictObject({
    clientId: uuid,
    projectId: uuid,
    expectedRevision: revision,
    changes: z.strictObject({ name: z.string().trim().min(1).max(255).optional(), canvasData: canvasData.optional(), tags: tags.optional() })
      .refine(value => Object.values(value).some(v => v !== undefined), 'Provide at least one change'),
    acknowledgement: z.literal('UPDATE_BANNER_DRAFT')
  }),
  marketing_export_banner_render: z.strictObject({
    clientId: uuid,
    projectId: uuid,
    format: formatKey,
    expectedRevision: revision,
    fps: z.number().int().min(12).max(60).default(30),
    quality: z.union([z.literal(1), z.literal(2)]).default(1),
    acknowledgement: z.literal('QUEUE_BANNER_RENDER')
  })
} satisfies Record<DepartmentCreativeToolName, z.ZodTypeAny>
