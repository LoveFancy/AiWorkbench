import { describe, expect, test } from 'bun:test'
import { buildLocalApiCurlExample, getApiTokenActionLabel, getLocalApiExampleBaseUrl, getLocalApiStatusDisplay } from './LocalApiSettings.utils'

describe('本地 API 设置展示文案', () => {
  test('没有 Token 时操作按钮显示生成', () => {
    expect(getApiTokenActionLabel(false)).toBe('生成')
  })

  test('已有 Token 时操作按钮显示重置', () => {
    expect(getApiTokenActionLabel(true)).toBe('重置')
  })
})

describe('本地 API 调用示例', () => {
  test('运行状态为 0.0.0.0 时示例使用 127.0.0.1', () => {
    expect(getLocalApiExampleBaseUrl({
      statusUrl: 'http://0.0.0.0:17373',
      settingsHost: '0.0.0.0',
      port: 17373,
    })).toBe('http://127.0.0.1:17373')
  })

  test('未运行时基于设置生成本机可调用地址', () => {
    expect(getLocalApiExampleBaseUrl({
      statusUrl: null,
      settingsHost: '0.0.0.0',
      port: 17373,
    })).toBe('http://127.0.0.1:17373')
  })

  test('生成创建 Agent 会话的 cURL 示例', () => {
    const example = buildLocalApiCurlExample({
      baseUrl: 'http://127.0.0.1:17373',
      token: 'wm_test_token',
    })

    expect(example).toContain("curl -X POST 'http://127.0.0.1:17373/api/agent/sessions'")
    expect(example).toContain("Authorization: Bearer wm_test_token")
    expect(example).toContain('"title": "Local API Session"')
  })

  test('没有明文 Token 时使用占位符', () => {
    const example = buildLocalApiCurlExample({
      baseUrl: 'http://127.0.0.1:17373',
      token: null,
    })

    expect(example).toContain("Authorization: Bearer <API_TOKEN>")
  })
})

describe('本地 API 运行状态展示', () => {
  test('运行中时展示运行中和地址', () => {
    expect(getLocalApiStatusDisplay({
      running: true,
      url: 'http://0.0.0.0:17373',
    })).toEqual({
      tone: 'running',
      label: '运行中',
      description: 'http://0.0.0.0:17373',
    })
  })

  test('未运行时展示默认关闭说明', () => {
    expect(getLocalApiStatusDisplay({
      running: false,
      url: null,
    })).toEqual({
      tone: 'stopped',
      label: '未运行',
      description: '默认关闭，仅在启用后监听本机端口。',
    })
  })
})
