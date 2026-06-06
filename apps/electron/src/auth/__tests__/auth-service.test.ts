import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// ============ Mock safeStorage ============

const mockEncryptStore = new Map<string, string>()
let encryptCounter = 0

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => {
      const key = `enc_${++encryptCounter}`
      mockEncryptStore.set(key, s)
      return Buffer.from(key, 'utf-8')
    },
    decryptString: (buf: Buffer) => {
      return mockEncryptStore.get(buf.toString('utf-8')) ?? ''
    },
  },
}))

// ============ Mock getConfigDir → 使用临时目录 ============

let tempDir: string

vi.mock('../../main/lib/config-paths', () => ({
  getConfigDir: () => tempDir,
}))

// ============ 辅助函数 ============

function createTestJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.test_signature`
}

interface MockScenario {
  loginStatus: number
  shortToken: string
  longToken: string
}

function mockEipGateway(scenario: Partial<MockScenario> = {}) {
  const defaults: MockScenario = {
    loginStatus: 200,
    shortToken: createTestJwt({ mid: '022480' }),
    longToken: createTestJwt({ mid: '022480', sub: 'long_term' }),
  }
  const s = { ...defaults, ...scenario }

  return vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url.toString()
    if (urlStr.includes('/gateway/login')) {
      return new Response(null, {
        status: s.loginStatus,
        headers: s.loginStatus === 200
          ? { 'set-cookie': `EIPGW-TOKEN=${s.shortToken}; Path=/; HttpOnly` }
          : {},
      })
    }
    if (urlStr.includes('/manage/user/token/generate')) {
      return new Response(
        `EIPGW-TOKEN:您的token为：${s.longToken}`,
        { status: 200 },
      )
    }
    return new Response('Not Found', { status: 404 })
  })
}

function setMockFetch(fetchFn: unknown): void {
  globalThis.fetch = fetchFn as typeof fetch
}

// ============ 测试 ============

describe('auth-service 集成测试', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'workmate-test-auth-'))
    mockEncryptStore.clear()
    encryptCounter = 0
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  describe('loginWithEipGateway - 完整流程', () => {
    it('正常登录 → 获取长期 Token → 落盘加密', async () => {
      setMockFetch(mockEipGateway())

      const { loginWithEipGateway } = await import('../auth-service')
      const result = await loginWithEipGateway('022480', 'password123')

      expect(result.success).toBe(true)
      expect(result.jobId).toBe('022480')
      expect(result.tokenExpiresAt).toBeGreaterThan(Date.now() - 1000)

      // 验证落盘文件
      const authFile = JSON.parse(readFileSync(join(tempDir, 'auth.json'), 'utf-8'))
      expect(authFile.jobId).toBe('022480')
      expect(authFile.encryptedToken).toBeTruthy()
      expect(authFile.createdAt).toBeGreaterThan(0)
      expect(authFile.expiresAt).toBeGreaterThan(Date.now() - 1000)
    })

    it('登录失败（HTTP 401）→ 返回 success=false', async () => {
      setMockFetch(mockEipGateway({ loginStatus: 401 }))

      const { loginWithEipGateway } = await import('../auth-service')
      const result = await loginWithEipGateway('022480', 'wrong')

      expect(result.success).toBe(false)
      expect(result.message).toContain('401')
    })

    it('登录成功但获取长期 Token 失败 → 返回失败', async () => {
      const shortToken = createTestJwt({ mid: '022480' })
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(new Response(null, {
          status: 200,
          headers: { 'set-cookie': `EIPGW-TOKEN=${shortToken}; Path=/` },
        }))
        .mockResolvedValueOnce(new Response('Internal Error', { status: 500 }))

      setMockFetch(mockFetch)

      const { loginWithEipGateway } = await import('../auth-service')
      const result = await loginWithEipGateway('022480', 'pass')

      expect(result.success).toBe(false)
      expect(result.message).toBe('获取长期 Token 失败')
    })

    it('网络异常 → 返回异常信息', async () => {
      setMockFetch(vi.fn().mockRejectedValue(new Error('Network error')))

      const { loginWithEipGateway } = await import('../auth-service')
      const result = await loginWithEipGateway('022480', 'pass')

      expect(result.success).toBe(false)
      expect(result.message).toContain('Network error')
    })
  })

  describe('getToken / getAuthInfo / needsReauth', () => {
    async function setupLoggedIn() {
      setMockFetch(mockEipGateway())
      const { loginWithEipGateway } = await import('../auth-service')
      await loginWithEipGateway('022480', 'pass')
    }

    it('getToken 正常解密返回 Token', async () => {
      await setupLoggedIn()

      const { getToken } = await import('../auth-service')
      const token = getToken()
      expect(token).toBeTruthy()
      expect(token!.split('.')).toHaveLength(3)
    })

    it('getAuthInfo 返回完整认证信息', async () => {
      await setupLoggedIn()

      const { getAuthInfo } = await import('../auth-service')
      const info = getAuthInfo()
      expect(info).not.toBeNull()
      expect(info!.jobId).toBe('022480')
      expect(info!.token).toBeTruthy()
      expect(info!.needsReauth).toBe(false)
      expect(info!.createdAt).toBeGreaterThan(0)
      expect(info!.lastLoginAt).toBeGreaterThan(0)
    })

    it('needsReauth - 未超 180 天返回 false', async () => {
      await setupLoggedIn()

      const { needsReauth } = await import('../auth-service')
      expect(needsReauth()).toBe(false)
    })

    it('needsReauth - 超过 180 天返回 true', async () => {
      await setupLoggedIn()

      // 手动修改 auth.json 中的 createdAt 为 181 天前
      const authPath = join(tempDir, 'auth.json')
      const authFile = JSON.parse(readFileSync(authPath, 'utf-8'))
      authFile.createdAt = Date.now() - 181 * 24 * 60 * 60 * 1000
      writeFileSync(authPath, JSON.stringify(authFile))

      const { needsReauth } = await import('../auth-service')
      expect(needsReauth()).toBe(true)
    })

    it('getAuthInfo - needsReauth 为 true 时仍返回 token', async () => {
      await setupLoggedIn()

      const authPath = join(tempDir, 'auth.json')
      const authFile = JSON.parse(readFileSync(authPath, 'utf-8'))
      authFile.createdAt = Date.now() - 181 * 24 * 60 * 60 * 1000
      writeFileSync(authPath, JSON.stringify(authFile))

      const { getAuthInfo } = await import('../auth-service')
      const info = getAuthInfo()
      expect(info).not.toBeNull()
      expect(info!.needsReauth).toBe(true)
      expect(info!.token).toBeTruthy()
    })

    it('Token 自身过期 → getAuthInfo 返回 null', async () => {
      await setupLoggedIn()

      const authPath = join(tempDir, 'auth.json')
      const authFile = JSON.parse(readFileSync(authPath, 'utf-8'))
      authFile.expiresAt = Date.now() - 1000
      writeFileSync(authPath, JSON.stringify(authFile))

      const { getAuthInfo } = await import('../auth-service')
      expect(getAuthInfo()).toBeNull()
    })
  })

  describe('logout', () => {
    it('logout 后 getToken 返回 null', async () => {
      setMockFetch(mockEipGateway())
      const { loginWithEipGateway, logout, getToken, getJobId } = await import('../auth-service')
      await loginWithEipGateway('022480', 'pass')

      expect(getToken()).toBeTruthy()

      logout()

      expect(getToken()).toBeNull()
      expect(getJobId()).toBeNull()
    })
  })
})
