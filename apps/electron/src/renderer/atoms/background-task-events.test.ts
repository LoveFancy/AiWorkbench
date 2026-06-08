import { expect, test } from 'bun:test'
import type { AgentEvent } from '@proma/shared'
import type { BackgroundTask } from './agent-atoms'
import { applyBackgroundTaskEvent } from './agent-atoms'

test('后台任务收到完成通知后从运行中列表移除', () => {
  const current: BackgroundTask[] = [
    {
      id: 'task-1',
      type: 'agent',
      toolUseId: 'tool-1',
      startTime: 1,
      elapsedSeconds: 12,
      intent: '调研 Redis 性能',
    },
  ]
  const event: AgentEvent = {
    type: 'task_notification',
    taskId: 'task-1',
    toolUseId: 'tool-1',
    status: 'completed',
    summary: '调研完成',
  }

  expect(applyBackgroundTaskEvent(current, event)).toEqual([])
})

test('后台任务完成通知缺少 toolUseId 时按 taskId 移除', () => {
  const current: BackgroundTask[] = [
    {
      id: 'task-1',
      type: 'agent',
      toolUseId: 'tool-1',
      startTime: 1,
      elapsedSeconds: 12,
    },
  ]
  const event: AgentEvent = {
    type: 'task_notification',
    taskId: 'task-1',
    status: 'completed',
    summary: '调研完成',
  }

  expect(applyBackgroundTaskEvent(current, event)).toEqual([])
})
