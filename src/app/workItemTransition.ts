import type { WorkItemStatus } from '../domain/models'

const statuses: readonly WorkItemStatus[] = ['todo', 'in_progress', 'done']

export const resolveWorkItemStatus = (
  currentStatus: WorkItemStatus,
  targetId: string | null,
): WorkItemStatus | null => {
  if (targetId === null) return null
  const targetStatus = statuses.find((status) =>
    targetId === `column:${status}` || targetId.endsWith(`:${status}`),
  )
  return targetStatus === undefined || targetStatus === currentStatus ? null : targetStatus
}
