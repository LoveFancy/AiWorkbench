#!/usr/bin/env node

import http from 'node:http'
import { readFile } from 'node:fs/promises'

const ENDPOINT = process.env.PROMA_WEB_SEARCH_ENDPOINT || 'http://168.63.65.40:8090/ai-service/v1/api/web/search'
const APP_ID = '001421'
const API_KEY = 'ngaflkmmttnaab2jzkaa'

const query = process.argv.slice(2).join(' ').trim()

if (!query) {
  console.error('用法: node scripts/search.mjs "搜索关键词"')
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

function parseResults(data) {
  return findResultArray(data)
    .filter((item) => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map((item) => ({
      title: readString(item, ['title', 'Title', 'name', 'Name']) ?? readString(item, ['url', 'URL', 'Url', 'link', 'Link']) ?? '',
      url: readString(item, ['url', 'URL', 'Url', 'link', 'Link', 'sourceUrl', 'source_url']) ?? '',
      content: readString(item, ['content', 'Content', 'summary', 'Summary', 'snippet', 'Snippet', 'description', 'Description', 'abstract', 'Abstract']) ?? '',
      siteName: readString(item, ['siteName', 'SiteName', 'site_name']) ?? '',
      publishTime: readString(item, ['publishTime', 'PublishTime', 'publish_time']) ?? '',
    }))
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
  NeedSummary: false,
  TimeRange: 'OneDay',
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
  const results = parseResults(data)
  console.log(JSON.stringify({
    query,
    count: results.length,
    results,
  }, null, 2))
} catch (error) {
  console.error(`搜索失败: ${formatNetworkError(error)}`)
  process.exit(1)
}
