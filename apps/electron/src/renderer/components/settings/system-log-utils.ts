export type LogLevelFilter = 'all' | 'INFO' | 'WARN' | 'ERROR'

export interface LogSegment {
  text: string
  matched: boolean
}

export interface LogEntry {
  id: number
  text: string
  level: Exclude<LogLevelFilter, 'all'> | null
  lowerText: string
}

export interface DisplayedLogEntries {
  entries: LogEntry[]
  totalMatches: number
  hasMoreEntries: boolean
  searchSkipped: boolean
}

const LOG_ENTRY_START_RE = /^\d{4}-\d{2}-\d{2}T/
const LOG_LEVEL_RE = /\[(INFO|WARN|ERROR)\]/
const MIN_SEARCH_QUERY_LENGTH = 2

function getLogLevel(text: string): LogEntry['level'] {
  const match = LOG_LEVEL_RE.exec(text)
  return match ? match[1] as LogEntry['level'] : null
}

function countKeywordMatches(source: string, target: string): number {
  let count = 0
  let start = 0

  while (start < source.length) {
    const index = source.indexOf(target, start)
    if (index === -1) break
    count += 1
    start = index + target.length
  }

  return count
}

export function parseLogEntries(content: string): LogEntry[] {
  const rawEntries: string[] = []
  let current: string[] = []

  for (const line of content.split(/\r?\n/)) {
    if (!line && current.length === 0) continue
    if (LOG_ENTRY_START_RE.test(line) && current.length > 0) {
      rawEntries.push(current.join('\n'))
      current = []
    }
    if (line) current.push(line)
  }

  if (current.length > 0) rawEntries.push(current.join('\n'))

  return rawEntries.reverse().map((text, index) => ({
    id: index,
    text,
    level: getLogLevel(text),
    lowerText: text.toLowerCase(),
  }))
}

export function getDisplayedLogEntries(
  entries: LogEntry[],
  level: LogLevelFilter,
  query: string,
  limit: number,
): DisplayedLogEntries {
  const levelEntries = level === 'all' ? entries : entries.filter((entry) => entry.level === level)
  const keyword = query.trim()
  const boundedLimit = Math.max(1, Math.floor(limit))

  if (!keyword || keyword.length < MIN_SEARCH_QUERY_LENGTH) {
    return {
      entries: levelEntries.slice(0, boundedLimit),
      totalMatches: 0,
      hasMoreEntries: levelEntries.length > boundedLimit,
      searchSkipped: keyword.length > 0,
    }
  }

  const target = keyword.toLowerCase()
  const matchedEntries: LogEntry[] = []
  let totalMatches = 0
  let matchingEntryCount = 0

  for (const entry of levelEntries) {
    const count = countKeywordMatches(entry.lowerText, target)
    if (count === 0) continue

    matchingEntryCount += 1
    totalMatches += count
    if (matchedEntries.length < boundedLimit) {
      matchedEntries.push(entry)
    }
  }

  return {
    entries: matchedEntries,
    totalMatches,
    hasMoreEntries: matchingEntryCount > matchedEntries.length,
    searchSkipped: false,
  }
}

export function buildLogSegments(content: string, query: string): LogSegment[] {
  const keyword = query.trim()
  if (!keyword || keyword.length < MIN_SEARCH_QUERY_LENGTH) {
    return [{ text: content, matched: false }]
  }

  const segments: LogSegment[] = []
  const source = content.toLowerCase()
  const target = keyword.toLowerCase()
  let cursor = 0

  while (cursor < content.length) {
    const index = source.indexOf(target, cursor)
    if (index === -1) break
    if (index > cursor) {
      segments.push({ text: content.slice(cursor, index), matched: false })
    }
    segments.push({ text: content.slice(index, index + keyword.length), matched: true })
    cursor = index + keyword.length
  }

  if (cursor < content.length) {
    segments.push({ text: content.slice(cursor), matched: false })
  }

  return segments.length > 0 ? segments : [{ text: content, matched: false }]
}
