import { afterEach, describe, expect, test } from 'bun:test'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const skillDir = join(import.meta.dir, '../../../default-skills/web-search')
const scriptPath = join(skillDir, 'scripts/search.mjs')

let tempDir: string | null = null

afterEach(async () => {
  if (!tempDir) return
  rmSync(tempDir, { recursive: true, force: true })
  tempDir = null
})

describe('内置联网检索 Skill', () => {
  test('SKILL.md 描述触发条件并引用直连搜索脚本', () => {
    const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8')
    const script = readFileSync(scriptPath, 'utf-8')

    expect(content).toContain('name: web-search')
    expect(content).toContain('version: "1.0.2"')
    expect(content).toContain('node scripts/search.mjs')
    expect(content).toContain('--time-range OneWeek')
    expect(content).toContain('--max-content-chars 2000')
    expect(content).toContain('忽略代理环境变量')
    expect(script).toContain('agent: false')
    expect(script).toContain("DEFAULT_TIME_RANGE = 'OneMonth'")
    expect(script).toContain('DEFAULT_MAX_CONTENT_CHARS = 600')
  })

  test('搜索脚本解析 Compass result.webResults 并优先输出 content 字段', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'proma-web-search-skill-test-'))
    const fixturePath = join(tempDir, 'response.json')
    writeFileSync(
      fixturePath,
      JSON.stringify({
        result: {
          webResults: [
            {
              title: '环境质量_中华人民共和国生态环境部',
              url: 'https://www.mee.gov.cn/hjzl/',
              snippet: '短摘要',
              content: '完整正文：2024年，全国生态环境质量持续改善。',
              publishTime: '2026-05-24T13:28:14+08:00',
            },
          ],
        },
      }),
      'utf-8',
    )

    const { stdout } = await execFileAsync('node', [scriptPath, '环境'], {
      env: {
        ...process.env,
        PROMA_WEB_SEARCH_FIXTURE: fixturePath,
        HTTP_PROXY: 'http://127.0.0.1:1',
        HTTPS_PROXY: 'http://127.0.0.1:1',
      },
    })

    const output = JSON.parse(stdout) as {
      query: string
      timeRange: string
      maxContentChars: number
      count: number
      results: Array<{ title: string; url: string; content: string; contentTruncated: boolean }>
    }

    expect(output.query).toBe('环境')
    expect(output.timeRange).toBe('OneMonth')
    expect(output.maxContentChars).toBe(600)
    expect(output.count).toBe(1)
    expect(output.results[0]?.url).toBe('https://www.mee.gov.cn/hjzl/')
    expect(output.results[0]?.content).toContain('完整正文')
    expect(output.results[0]?.content).not.toBe('短摘要')
    expect(output.results[0]?.contentTruncated).toBe(false)
  })

  test('搜索脚本支持通过 --time-range 指定检索有效期', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'proma-web-search-skill-test-'))
    const fixturePath = join(tempDir, 'response.json')
    writeFileSync(fixturePath, JSON.stringify({ result: { webResults: [] } }), 'utf-8')

    const { stdout } = await execFileAsync('node', [scriptPath, '--time-range', 'OneWeek', '环境'], {
      env: {
        ...process.env,
        PROMA_WEB_SEARCH_FIXTURE: fixturePath,
      },
    })

    const output = JSON.parse(stdout) as { query: string; timeRange: string; count: number }

    expect(output.query).toBe('环境')
    expect(output.timeRange).toBe('OneWeek')
    expect(output.count).toBe(0)
  })

  test('搜索脚本默认压缩长内容，避免工具结果过大', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'proma-web-search-skill-test-'))
    const fixturePath = join(tempDir, 'response.json')
    writeFileSync(
      fixturePath,
      JSON.stringify({
        result: {
          webResults: [
            {
              title: '长内容',
              url: 'https://example.com/long',
              content: '长'.repeat(900),
            },
          ],
        },
      }),
      'utf-8',
    )

    const { stdout } = await execFileAsync('node', [scriptPath, '长内容'], {
      env: {
        ...process.env,
        PROMA_WEB_SEARCH_FIXTURE: fixturePath,
      },
    })

    const output = JSON.parse(stdout) as {
      results: Array<{ content: string; contentTruncated: boolean }>
    }

    expect(output.results[0]?.content.length).toBeLessThanOrEqual(603)
    expect(output.results[0]?.contentTruncated).toBe(true)
  })
})
