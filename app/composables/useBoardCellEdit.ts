import type { CustomColumn, TaskColumnValue } from '~/types'

interface CellUpdatePayload {
  textValue?: string | null
  numberValue?: number | null
  dateValue?: string | null
  dateEndValue?: string | null
  jsonValue?: any
}

interface PendingEdit {
  taskId: string
  columnId: string
  payload: CellUpdatePayload
  previousValue: TaskColumnValue | null
}

export function useBoardCellEdit() {
  const toast = useToast()
  const saving = ref<Set<string>>(new Set())
  const cellValues = ref<Map<string, TaskColumnValue>>(new Map())
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string, body?: unknown }
  ) => Promise<T>

  function cellKey(taskId: string, columnId: string): string {
    return `${taskId}:${columnId}`
  }

  function getValue(taskId: string, columnId: string): TaskColumnValue | null {
    return cellValues.value.get(cellKey(taskId, columnId)) || null
  }

  function setValues(values: TaskColumnValue[]) {
    for (const v of values) {
      cellValues.value.set(cellKey(v.taskId, v.columnId), v)
    }
  }

  function isSaving(taskId: string, columnId: string): boolean {
    return saving.value.has(cellKey(taskId, columnId))
  }

  async function updateCellValue(
    taskId: string,
    columnId: string,
    payload: CellUpdatePayload
  ): Promise<boolean> {
    const key = cellKey(taskId, columnId)
    const previousValue = cellValues.value.get(key) || null

    // Optimistic update
    const optimistic: TaskColumnValue = {
      id: previousValue?.id || '',
      taskId,
      columnId,
      textValue: payload.textValue ?? previousValue?.textValue,
      numberValue: payload.numberValue ?? previousValue?.numberValue,
      dateValue: payload.dateValue ?? previousValue?.dateValue,
      dateEndValue: payload.dateEndValue ?? previousValue?.dateEndValue,
      jsonValue: payload.jsonValue !== undefined ? payload.jsonValue : previousValue?.jsonValue,
      createdAt: previousValue?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    cellValues.value.set(key, optimistic)
    saving.value.add(key)

    try {
      const result = await apiFetch<TaskColumnValue>(
        `/api/agency/tasks/${taskId}/column-values/${columnId}`,
        {
          method: 'PATCH',
          body: payload,
        }
      )
      cellValues.value.set(key, result)
      return true
    } catch (err: any) {
      // Rollback on failure
      if (previousValue) {
        cellValues.value.set(key, previousValue)
      } else {
        cellValues.value.delete(key)
      }
      toast.add({
        title: 'Failed to save',
        description: err?.data?.statusMessage || 'Could not update cell value',
        color: 'error',
      })
      return false
    } finally {
      saving.value.delete(key)
    }
  }

  return {
    cellValues,
    getValue,
    setValues,
    isSaving,
    updateCellValue,
  }
}
