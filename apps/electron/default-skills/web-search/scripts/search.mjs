#!/usr/bin/env node

import http from 'node:http'
import { readFile } from 'node:fs/promises'

const ENDPOINT = process.env.PROMA_WEB_SEARCH_ENDPOINT || 'http://168.63.65.40:8090/ai-service/v1/api/web/search'
const APP_ID = '001421'
const API_KEY = 'ngaflkmmttnaab2jzkaa'
const DEFAULT_TIME_RANGE = 'OneMonth'
const DEFAULT_MAX_CONTENT_CHARS = 600
const TIME_RANGE_VALUES = new Set(['OneDay', 'OneWeek', 'OneMonth', 'OneYear'])

function parseArgs(argv) {
  const queryParts = []
  let timeRange = DEFAULT_TIME_RANGE
  let maxContentChars = DEFAULT_MAX_CONTENT_CHARS

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--time-range') {
      const value = argv[i + 1]
      if (!TIME_RANGE_VALUES.has(value)) {
        console.error(`无效的 --time-range: ${value || ''}`)
        console.error(`可选值: ${Array.from(TIME_RANGE_VALUES).join(', ')}`)
        process.exit(2)
      }
      timeRange = value
      i += 1
      continue
    }
    if (arg === '--max-content-chars') {
      const value = Number(argv[i + 1])
      if (!Number.isInteger(value) || value < 80 || value > 4000) {
        console.error(`无效的 --max-content-chars: ${argv[i + 1] || ''}`)
        console.error('可选范围: 80 到 4000')
        process.exit(2)
      }
      maxContentChars = value
      i += 1
      continue
    }
    queryParts.push(arg)
  }

  return {
    query: queryParts.join(' ').trim(),
    timeRange,
    maxContentChars,
  }
}

const { query, timeRange, maxContentChars } = parseArgs(process.argv.slice(2))

if (!query) {
  console.error('用法: node scripts/search.mjs [--time-range OneMonth] [--max-content-chars 600] "搜索关键词"')
  console.error('有效期可选值: OneDay, OneWeek, OneMonth, OneYear；默认 OneMonth')
  process.exit(2)
}

function formatNetworkError(error, depth = 0) {
  if (depth > 3) return String(error)
  const message = error instanceof Error ? error.message : String(error)
  const fields = ['code', 'errno', 'syscall', 'address', 'port', 'hostname']
    .map((key) => {
      const value = error?.[key]
      if (typeof value !== 'string' && typeof value !== 'number') return null
      return `${key}=${value}`
    })
    .filter(Boolean)

  const parts = []
  if (fields.length > 0) parts.push(fields.join(', '))
  if (error?.cause) parts.push(`cause: ${formatNetworkError(error.cause, depth + 1)}`)

  return parts.length > 0 ? `${message} (${parts.join('; ')})` : message
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const request = http.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: 'POST',
      headers: {
        apiKey: API_KEY,
        appId: APP_ID,
        'Content-Type': 'application/json',
      },
      agent: false,
      timeout: 15000,
    }, (response) => {
      const chunks = []
      response.setEncoding('utf8')
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          text: chunks.join(''),
        })
      })
    })

    request.on('timeout', () => {
      request.destroy(new Error('request timeout'))
    })
    request.on('error', reject)
    request.end(JSON.stringify(body))
  })
}

function getNestedValue(record, path) {
  let current = record
  for (const part of path.split('.')) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined
    current = current[part]
  }
  return current
}

function readString(record, keys) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function compactText(value, maxChars) {
  if (!value) return { text: '', truncated: false }
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxChars) return { text: normalized, truncated: false }
  return { text: `${normalized.slice(0, maxChars)}...`, truncated: true }
}

function findResultArray(data) {
  if (Array.isArray(data)) return data
  if (typeof data !== 'object' || data === null) return []

  const paths = [
    'data.results',
    'data.webResults',
    'result.webResults',
    'result.results',
    'webResults',
    'results',
    'items',
    'records',
  ]

  for (const path of paths) {
    const value = getNestedValue(data, path)
    if (Array.isArray(value)) return value
  }

  return []
}

function parseResults(data, maxChars) {
  return findResultArray(data)
    .filter((item) => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map((item) => {
      const rawContent = readString(item, ['summary', 'Summary', 'content', 'Content', 'snippet', 'Snippet', 'description', 'Description', 'abstract', 'Abstract']) ?? ''
      const content = compactText(rawContent, maxChars)
      return {
        title: readString(item, ['title', 'Title', 'name', 'Name']) ?? readString(item, ['url', 'URL', 'Url', 'link', 'Link']) ?? '',
        url: readString(item, ['url', 'URL', 'Url', 'link', 'Link', 'sourceUrl', 'source_url']) ?? '',
        content: content.text,
        contentTruncated: content.truncated,
        siteName: readString(item, ['siteName', 'SiteName', 'site_name']) ?? '',
        publishTime: readString(item, ['publishTime', 'PublishTime', 'publish_time']) ?? '',
      }
    })
    .filter((item) => item.title || item.url)
}

const body = {
  query,
  SearchType: 'web',
  count: 10,
  Filter: {
    NeedContent: false,
    NeedUrl: true,
    Sites: null,
    AuthInfoLevel: '0',
  },
  NeedSummary: true,
  TimeRange: timeRange,
}

try {
  const data = process.env.PROMA_WEB_SEARCH_FIXTURE
    ? JSON.parse(await readFile(process.env.PROMA_WEB_SEARCH_FIXTURE, 'utf-8'))
    : await (async () => {
      const response = await postJson(ENDPOINT, body)
      if (!response.ok) {
        console.error(`搜索请求失败 (${response.status}): ${response.text}`)
        process.exit(1)
      }
      return JSON.parse(response.text)
    })()
  const results = parseResults(data, maxContentChars)
  console.log(JSON.stringify({
    query,
    timeRange,
    maxContentChars,
    count: results.length,
    results,
  }, null, 2))
} catch (error) {
  console.error(`搜索失败: ${formatNetworkError(error)}`)
  process.exit(1)
}
