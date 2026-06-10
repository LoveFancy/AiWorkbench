import { describe, expect, test } from 'bun:test'
import {
  buildLogSegments,
  getDisplayedLogEntries,
  type LogEntry,
  parseLogEntries,
  type LogLevelFilter,
} from './system-log-utils.ts'

const sampleLog = [
  '2026-06-09T10:00:00.000Z [INFO] [启动] proma ready',
  '2026-06-09T10:00:01.000Z [WARN] [模型] proma retry',
  '  caused by timeout',
  '2026-06-09T10:00:02.000Z [ERROR] [Agent] failed',
  '2026-06-09T10:00:03.000Z [INFO] [设置] saved',
].join('\n')

function expectEntry(entry: LogEntry | undefined): LogEntry {
  expect(entry).toBeDefined()
  return entry as LogEntry
}

describe('system-log-utils', () => {
  test('解析日志条目时保持多行堆栈并按最新日志优先排列', () => {
    const entries = parseLogEntries(sampleLog)

    expect(entries.map((entry) => entry.level)).toEqual(['INFO', 'ERROR', 'WARN', 'INFO'])
    expect(expectEntry(entries[2]).text).toContain('caused by timeout')
    expect(expectEntry(entries[0]).text).toContain('[设置] saved')
  })

  test('按日志级别过滤时不重复拆分原始日志内容', () => {
    const entries = parseLogEntries(sampleLog)
    const result = getDisplayedLogEntries(entries, 'WARN', '', 50)

    expect(result.entries).toHaveLength(1)
    expect(expectEntry(result.entries[0]).text).toContain('[WARN]')
    expect(result.totalMatches).toBe(0)
    expect(result.hasMoreEntries).toBe(false)
  })

  test('搜索时只返回匹配条目并限制渲染数量', () => {
    const entries = parseLogEntries(sampleLog)
    const result = getDisplayedLogEntries(entries, 'all', 'proma', 1)

    expect(result.entries).toHaveLength(1)
    expect(expectEntry(result.entries[0]).text).toContain('proma retry')
    expect(result.totalMatches).toBe(2)
    expect(result.hasMoreEntries).toBe(true)
  })

  test('单条日志内多个命中不会误判为存在更多未展示条目', () => {
    const entries = parseLogEntries('2026-06-09T10:00:00.000Z [INFO] proma proma')
    const result = getDisplayedLogEntries(entries, 'all', 'proma', 50)

    expect(result.entries).toHaveLength(1)
    expect(result.totalMatches).toBe(2)
    expect(result.hasMoreEntries).toBe(false)
  })

  test('搜索关键字少于两个字符时不触发全文检索', () => {
    const entries = parseLogEntries(sampleLog)
    const result = getDisplayedLogEntries(entries, 'all', 'p', 50)

    expect(result.entries).toHaveLength(4)
    expect(result.totalMatches).toBe(0)
    expect(result.searchSkipped).toBe(true)
  })

  test('高亮分段只作用于单条展示内容', () => {
    expect(buildLogSegments('Proma proma', 'proma')).toEqual([
      { text: 'Proma', matched: true },
      { text: ' ', matched: false },
      { text: 'proma', matched: true },
    ])
  })

  test('类型支持现有日志级别筛选值', () => {
    const level: LogLevelFilter = 'ERROR'
    expect(level).toBe('ERROR')
  })
})
