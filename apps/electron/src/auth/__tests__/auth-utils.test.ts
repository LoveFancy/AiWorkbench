import { describe, it, expect } from 'vitest'
import { extractToken, parseJobId } from '../auth-service'

// ===== extractToken 测试 =====

describe('extractToken', () => {
  it('正常提取 EIPGW-TOKEN', () => {
    const header = 'EIPGW-TOKEN=eyJhbGciOiJIUzI1NiJ9.xxx; Path=/; HttpOnly'
    expect(extractToken(header)).toBe('eyJhbGciOiJIUzI1NiJ9.xxx')
  })

  it('无 EIPGW-TOKEN 时返回 null', () => {
    expect(extractToken('SESSION=abc; Path=/')).toBeNull()
  })

  it('空字符串返回 null', () => {
    expect(extractToken('')).toBeNull()
  })

  it('多个 cookie 中提取 EIPGW-TOKEN', () => {
    const header = 'SESSION=abc; EIPGW-TOKEN=my.jwt.token; OTHER=xyz'
    expect(extractToken(header)).toBe('my.jwt.token')
  })
})

// ===== parseJobId 测试 =====

describe('parseJobId', () => {
  function createTestJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    return `${header}.${body}.test_signature`
  }

  it('从有效 JWT 中解析 mid', () => {
    const jwt = createTestJwt({ mid: '022480', exp: 9999999999 })
    expect(parseJobId(jwt)).toBe('022480')
  })

  it('无 mid 字段时返回 null', () => {
    const jwt = createTestJwt({ sub: 'user1' })
    expect(parseJobId(jwt)).toBeNull()
  })

  it('非法 JWT 格式返回 null', () => {
    expect(parseJobId('not-a-jwt')).toBeNull()
    expect(parseJobId('')).toBeNull()
    expect(parseJobId('a.b')).toBeNull()
  })
})
