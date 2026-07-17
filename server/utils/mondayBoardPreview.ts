import { z } from 'zod'

const MondayBoardIdSchema = z.string().trim().regex(/^\d+$/).max(30)
const MondayEntityStateSchema = z.enum(['active', 'archived', 'deleted'])
const MondayTimestampSchema = z.string().datetime({ offset: true })

export const MondayBoardPreviewRequestSchema = z.strictObject({
  boardId: MondayBoardIdSchema,
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
})

const ExternalMondayBoardSchema = z.object({
  id: MondayBoardIdSchema,
  name: z.string().trim().min(1).max(500),
  type: z.string().trim().min(1).max(100),
  state: MondayEntityStateSchema,
  workspace_id: z.string().trim().max(100).optional(),
  groups: z.array(z.object({
    id: z.string().trim().min(1).max(255),
    title: z.string().trim().min(1).max(500),
    color: z.string().trim().max(100),
    position: z.string().trim().max(100)
  })).max(100).optional(),
  columns: z.array(z.object({
    id: z.string().trim().min(1).max(255),
    title: z.string().trim().min(1).max(500),
    type: z.string().trim().min(1).max(100)
  })).max(200).optional()
})

const ExternalMondayItemSchema = z.object({
  id: z.string().trim().regex(/^\d+$/).max(30),
  name: z.string().trim().min(1).max(1000),
  state: MondayEntityStateSchema,
  group_id: z.string().trim().max(255).optional(),
  group_title: z.string().trim().max(500).optional(),
  created_at: MondayTimestampSchema,
  updated_at: MondayTimestampSchema,
  column_values: z.array(z.object({
    id: z.string().trim().min(1).max(255),
    type: z.string().trim().min(1).max(100),
    text: z.string().max(5000).nullable().optional()
  })).max(200).optional(),
  subitems: z.array(z.object({
    id: z.string().trim().regex(/^\d+$/).max(30)
  })).max(1000).optional()
})

const PreviewColumnValueSchema = z.strictObject({
  columnId: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(100),
  text: z.string().max(500)
})

export const MondayBoardPreviewResponseSchema = z.strictObject({
  board: z.strictObject({
    id: MondayBoardIdSchema,
    name: z.string().trim().min(1).max(500),
    type: z.string().trim().min(1).max(100),
    state: MondayEntityStateSchema,
    workspaceId: z.string().trim().max(100).nullable()
  }),
  groups: z.array(z.strictObject({
    id: z.string().trim().min(1).max(255),
    title: z.string().trim().min(1).max(500),
    color: z.string().trim().max(100),
    position: z.string().trim().max(100)
  })).max(100),
  columns: z.array(z.strictObject({
    id: z.string().trim().min(1).max(255),
    title: z.string().trim().min(1).max(500),
    type: z.string().trim().min(1).max(100)
  })).max(200),
  items: z.array(z.strictObject({
    id: z.string().trim().regex(/^\d+$/).max(30),
    name: z.string().trim().min(1).max(500),
    state: MondayEntityStateSchema,
    groupId: z.string().trim().max(255).nullable(),
    groupTitle: z.string().trim().max(500).nullable(),
    createdAt: MondayTimestampSchema,
    updatedAt: MondayTimestampSchema,
    subitemCount: z.number().int().nonnegative().max(1000),
    columnValues: z.array(PreviewColumnValueSchema).max(200),
    redactedColumnCount: z.number().int().nonnegative().max(200)
  })).max(100),
  pagination: z.strictObject({
    pageSize: z.number().int().min(1).max(100),
    returnedItems: z.number().int().nonnegative().max(100),
    isTruncated: z.boolean()
  })
})

const SAFE_COLUMN_VALUE_TYPES = new Set([
  'status',
  'date',
  'timeline',
  'dependency',
  'board_relation'
])

export function buildMondayBoardPreview(input: {
  board: unknown
  items: unknown[]
  pageSize: number
  isTruncated: boolean
}) {
  const board = ExternalMondayBoardSchema.parse(input.board)
  const items = z.array(ExternalMondayItemSchema).max(100).parse(input.items)

  return MondayBoardPreviewResponseSchema.parse({
    board: {
      id: board.id,
      name: board.name,
      type: board.type,
      state: board.state,
      workspaceId: board.workspace_id ?? null
    },
    groups: board.groups ?? [],
    columns: (board.columns ?? []).map(column => ({
      id: column.id,
      title: column.title,
      type: column.type
    })),
    items: items.map((item) => {
      const sourceColumnValues = item.column_values ?? []
      const safeColumnValues = sourceColumnValues.filter(value => SAFE_COLUMN_VALUE_TYPES.has(value.type))

      return {
        id: item.id,
        name: item.name.slice(0, 500),
        state: item.state,
        groupId: item.group_id ?? null,
        groupTitle: item.group_title ?? null,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        subitemCount: item.subitems?.length ?? 0,
        columnValues: safeColumnValues.map(value => ({
          columnId: value.id,
          type: value.type,
          text: (value.text ?? '').slice(0, 500)
        })),
        redactedColumnCount: sourceColumnValues.length - safeColumnValues.length
      }
    }),
    pagination: {
      pageSize: input.pageSize,
      returnedItems: items.length,
      isTruncated: input.isTruncated
    }
  })
}
