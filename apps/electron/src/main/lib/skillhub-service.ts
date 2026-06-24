/**
 * 华泰 SkillHub 服务
 *
 * 负责读取内部 Skill 市场清单，并将 Skill 安装到当前 Agent 工作区。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, resolve, sep } from 'node:path'
import { getInactiveSkillsDir, getWorkspaceSkillsDir } from './config-paths'
import { getAllWorkspaceSkills } from './agent-workspace-manager'
import { getValidSkillHubToken, getSkillHubApiBase, shouldUseMockSkillHub } from './skillhub-auth-service'
import { getToken } from '../../auth/auth-service'

export interface HtSkillHubSkill {
  name: string
  displayName?: string
  description: string
  version?: string
  category?: string
  tags?: string[]
  author?: string
  downloadCount?: number
  installed?: boolean
  files: string[]
  canDownload?: boolean
}

export interface HtSkillHubSkillWithStatus extends HtSkillHubSkill {
  installed: boolean
  enabled?: boolean
}

export interface HtSkillHubSkillPage {
  items: HtSkillHubSkillWithStatus[]
  page: number
  pageSize: number
  hasMore: boolean
}

export interface InstallHtSkillHubSkillInput {
  workspaceSlug: string
  skill: HtSkillHubSkill
  overwrite: boolean
  activeDir?: string
  inactiveDir?: string
}

export interface InstallHtSkillHubSkillResult {
  skillName: string
  status: 'installed' | 'overwritten'
  enabled: boolean
}

function isValidSkillName(name: string): boolean {
  if (!/^@?[a-zA-Z0-9._-]+(\/[a-zA-Z0-9._-]+)?$/.test(name) || name.length > 200) {
    return false
  }

  return name.split('/').every((segment) => {
    const normalized = segment.startsWith('@') ? segment.slice(1) : segment
    return normalized.length > 0 && normalized !== '.' && normalized !== '..' && !normalized.startsWith('.')
  })
}

/** 从 scope 名称中提取短名称作为目录名，例如 @ht-skills/code-review → code-review */
function shortSkillName(skillName: string): string {
  const slash = skillName.lastIndexOf('/')
  return slash >= 0 ? skillName.substring(slash + 1) : skillName
}

function assertValidSkillName(name: string): void {
  if (!isValidSkillName(name)) {
    throw new Error(`非法 Skill 名称: ${name}`)
  }
}

function resolveSkillPath(baseDir: string, dirName: string): string {
  const basePath = resolve(baseDir)
  const targetPath = resolve(baseDir, dirName)
  if (!targetPath.startsWith(`${basePath}${sep}`)) {
    throw new Error(`非法 Skill 名称: ${dirName}`)
  }
  return targetPath
}

export function redactSkillHubHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = key.toLowerCase()
    redacted[key] = normalizedKey === 'authorization' || normalizedKey === 'cookie' || normalizedKey === 'set-cookie'
      ? '[REDACTED]'
      : value
  }
  return redacted
}

// ===== SkillHub API 统一请求入口 =====

function isSkillHubDebugLogEnabled(): boolean {
  return process.env.WORKMATE_SKILLHUB_DEBUG === '1'
}

function formatErrorResponse(text: string): string {
  if (!text) return '(空响应)'
  try {
    const json = JSON.parse(text)
    // 如果后端返回了 message/error 字段，优先展示可读信息；完整 JSON 作为补充
    const summary = json.message || json.error || json.msg || ''
    const detail = JSON.stringify(json)
    return summary ? `${summary}\n详细信息: ${detail}` : detail
  } catch {
    return text
  }
}

async function skillHubFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getValidSkillHubToken()
  const eipgwToken = getToken()
  const base = getSkillHubApiBase()
  const url = `${base}${path}`
  const method = init?.method ?? 'GET'
  console.log('[SkillHub] => %s %s', method, url)
  const debugLog = isSkillHubDebugLogEnabled()
  if (debugLog && init?.body) {
    try {
      console.log('[SkillHub]    body: %s', typeof init.body === 'string' ? init.body.substring(0, 500) : String(init.body).substring(0, 500))
    } catch { /* ignore */ }
  }
  const buildHeaders = (t: string): Record<string, string> => ({
    ...(init?.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${t}`,
    ...(eipgwToken ? { Cookie: `EIPGW-TOKEN=${eipgwToken}` } : {}),
  })

  const makeRequest = (t: string) => fetch(url, { ...init, headers: buildHeaders(t) })

  const requestHeaders = buildHeaders(token)
  if (debugLog) {
    console.log('[SkillHub]    headers: %s', JSON.stringify(redactSkillHubHeaders(requestHeaders)))
  }

  let response = await makeRequest(token)
  console.log('[SkillHub] <= %s %s HTTP %d', method, url, response.status)
  if (response.status === 401) {
    console.log('[SkillHub] Token 过期，重新换票后重试')
    const newToken = await getValidSkillHubToken()
    response = await makeRequest(newToken)
    console.log('[SkillHub] <= %s %s HTTP %d', method, url, response.status)
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '(响应读取失败)')
    const bodyPreview = typeof init?.body === 'string' ? (init.body.length > 500 ? init.body.substring(0, 500) + '…' : init.body) : ''
    const errorDetail = formatErrorResponse(text)
    throw new Error(
      `SkillHub 请求失败 (${response.status})\n` +
      `请求: ${method} ${url}\n` +
      `Headers: ${JSON.stringify(redactSkillHubHeaders(requestHeaders))}\n` +
      (bodyPreview ? `Body: ${bodyPreview}\n` : '') +
      `响应: ${errorDetail}`
    )
  }

  return response
}

// ===== 新接口 =====

interface SkillListQuery {
  keyword?: string
  category?: string
  env?: string
  page?: number
  pageSize?: number
  sort?: string
  order?: string
}

interface WorkspaceInstallStatusCacheEntry {
  expiresAt: number
  slugLowerMap: Map<string, boolean>
  sourceNameMap: Map<string, boolean>
}

const WORKSPACE_INSTALL_STATUS_CACHE_TTL_MS = 5_000
const workspaceInstallStatusCache = new Map<string, WorkspaceInstallStatusCacheEntry>()

function invalidateWorkspaceInstallStatusCache(workspaceSlug: string): void {
  workspaceInstallStatusCache.delete(workspaceSlug)
}

function readWorkspaceInstallStatus(workspaceSlug: string): WorkspaceInstallStatusCacheEntry {
  const cached = workspaceInstallStatusCache.get(workspaceSlug)
  if (cached && cached.expiresAt > Date.now()) return cached

  const localSkills = getAllWorkspaceSkills(workspaceSlug)
  const activeSkillsDir = getWorkspaceSkillsDir(workspaceSlug)
  const inactiveSkillsDir = getInactiveSkillsDir(workspaceSlug)
  const slugLowerMap = new Map<string, boolean>()
  const sourceNameMap = new Map<string, boolean>()

  for (const s of localSkills) {
    slugLowerMap.set(s.slug.toLowerCase(), s.enabled)
  }

  for (const dir of [activeSkillsDir, inactiveSkillsDir]) {
    for (const s of localSkills) {
      const sourcePath = join(dir, s.slug, '.proma-source.json')
      try {
        if (existsSync(sourcePath)) {
          const source = JSON.parse(readFileSync(sourcePath, 'utf-8')) as { skillName?: string }
          if (source.skillName) {
            sourceNameMap.set(source.skillName.toLowerCase(), s.enabled)
          }
        }
      } catch { /* 跳过损坏的来源记录 */ }
    }
  }

  const entry = {
    expiresAt: Date.now() + WORKSPACE_INSTALL_STATUS_CACHE_TTL_MS,
    slugLowerMap,
    sourceNameMap,
  }
  workspaceInstallStatusCache.set(workspaceSlug, entry)
  return entry
}

interface SkillMetadataRaw {
  skillName: string
  displayName?: string
  description: string
  category?: string
  tags?: string[]
  owner?: string
  ownerName?: string
  version?: string
  author?: string
  license?: string
  readme?: string
  dependencies?: string
  envVars?: string
  downloadCount?: number
  lastUpdated?: string
  versions?: Array<{ version: string; description: string; publishedAt: string }>
  status?: string
  permission?: { role: string; grantedAt: string; grantedBy: string; grantedByName: string }
  permissionApplicationStatus?: number
  type?: number
  createdAt?: string
  updatedAt?: string
  businessOwnerId?: string
  businessOwnerName?: string
}

const MOCK_SKILLHUB_SKILLS: SkillMetadataRaw[] = [
  {
    skillName: 'prd-writer',
    displayName: 'PRD 文档助手',
    description: '根据需求背景、用户故事和流程信息生成结构化 PRD，支持章节拆分、待确认问题和评审清单。',
    category: '产品设计',
    tags: ['PRD', '需求分析', '产品经理'],
    ownerName: '产品工具组',
    version: '1.4.2',
    downloadCount: 286,
    readme: [
      '# PRD 文档助手',
      '',
      '用于将零散需求材料整理为结构化 PRD。',
      '',
      '## 能力',
      '- 自动生成背景、目标、范围、流程、异常场景和验收标准',
      '- 支持逐章节确认模式',
      '- 支持按公司产品模板输出',
      '',
      '## 适用场景',
      '新需求立项、存量需求补充、PRD 评审前自检。',
    ].join('\n'),
  },
  {
    skillName: 'drawio-doc-exporter',
    displayName: 'Drawio 文档嵌入',
    description: '将 Drawio 流程图、架构图转换为图片并嵌入文档，适合方案设计和流程说明。',
    category: '文档处理',
    tags: ['Drawio', '流程图', '文档'],
    ownerName: '研发效能组',
    version: '0.9.8',
    downloadCount: 172,
    readme: [
      '# Drawio 文档嵌入',
      '',
      '读取 `.drawio` 文件并导出为图片，自动插入到目标文档。',
      '',
      '## 能力',
      '- 支持流程图、架构图、ER 图导出',
      '- 支持批量处理多个图表',
      '- 支持在 Word/Markdown 文档中插入图片和标题',
    ].join('\n'),
  },
  {
    skillName: 'test-case-generator',
    displayName: '测试用例生成',
    description: '基于接口定义、需求说明和业务规则生成测试点、用例表和边界场景。',
    category: '测试',
    tags: ['测试用例', '边界条件', '质量保障'],
    ownerName: '测试平台组',
    version: '1.1.0',
    downloadCount: 241,
    readme: [
      '# 测试用例生成',
      '',
      '帮助测试人员从需求和接口材料中快速生成覆盖完整的测试用例。',
      '',
      '## 输出',
      '- 功能测试点',
      '- 异常和边界场景',
      '- 可复制到 Excel 的用例表',
    ].join('\n'),
  },
  {
    skillName: 'api-design-review',
    displayName: '接口设计评审',
    description: '检查 REST/RPC 接口设计的一致性、兼容性、错误码、幂等性和字段命名问题。',
    category: '研发',
    tags: ['API', '接口设计', '评审'],
    ownerName: '架构治理组',
    version: '2.0.1',
    downloadCount: 398,
    readme: [
      '# 接口设计评审',
      '',
      '用于在概设和详设阶段检查接口设计质量。',
      '',
      '## 检查项',
      '- 字段命名和数据结构一致性',
      '- 错误码与异常语义',
      '- 幂等、分页、排序和兼容性',
    ].join('\n'),
  },
  {
    skillName: 'weekly-report-polisher',
    displayName: '周报润色',
    description: '把零散工作项整理为面向管理汇报的周报，突出产出、价值、风险和下周计划。',
    category: '办公效率',
    tags: ['周报', '汇报', '总结'],
    ownerName: 'WorkMate 团队',
    version: '1.0.3',
    downloadCount: 519,
    readme: [
      '# 周报润色',
      '',
      '将原始工作流水整理为结构化周报。',
      '',
      '## 特点',
      '- 保留事实，不夸大',
      '- 合并重复事项',
      '- 自动提炼业务价值和用户影响',
    ].join('\n'),
  },
  {
    skillName: 'incident-review',
    displayName: '故障复盘助手',
    description: '根据故障时间线、监控日志和处置记录生成复盘报告、根因分析和改进项。',
    category: '运维',
    tags: ['故障复盘', 'SRE', '根因分析'],
    ownerName: '基础设施中心',
    version: '0.8.5',
    downloadCount: 133,
    readme: [
      '# 故障复盘助手',
      '',
      '面向故障复盘场景，整理时间线、影响面、根因和改进动作。',
      '',
      '## 输出',
      '- 故障概览',
      '- 时间线',
      '- 根因分析',
      '- 改进项和负责人',
    ].join('\n'),
  },
]

function filterMockSkillHubSkills(query: SkillListQuery = {}): SkillMetadataRaw[] {
  const keyword = query.keyword?.trim().toLowerCase()
  const category = query.category?.trim()
  const filtered = MOCK_SKILLHUB_SKILLS.filter((skill) => {
    if (category && skill.category !== category) return false
    if (!keyword) return true
    return [
      skill.skillName,
      skill.displayName,
      skill.description,
      skill.category,
      ...(skill.tags ?? []),
      skill.ownerName,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  })

  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.max(1, query.pageSize ?? 20)
  return filtered.slice((page - 1) * pageSize, page * pageSize)
}

export async function fetchSkillHubSkills(query: SkillListQuery = {}): Promise<SkillMetadataRaw[]> {
  if (shouldUseMockSkillHub()) {
    console.log('[SkillHub] 使用 mock 技能市场数据')
    return filterMockSkillHubSkills(query)
  }

  const reqBody: Record<string, unknown> = {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
    sort: query.sort ?? 'downloads',
    order: query.order ?? 'desc',
  }
  if (query.keyword) reqBody.keyword = query.keyword
  if (query.category) reqBody.category = query.category
  if (query.env) reqBody.env = query.env

  const response = await skillHubFetch('/workmate/skillhub/ai_skillhub_service/api/v1/market/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
  })

  const body = await response.json() as { code: string; data: SkillMetadataRaw[] }
  return body.data ?? []
}

export async function fetchSkillHubDetail(skillName: string): Promise<SkillMetadataRaw> {
  if (shouldUseMockSkillHub()) {
    const skill = MOCK_SKILLHUB_SKILLS.find((item) => item.skillName.toLowerCase() === skillName.toLowerCase())
    if (!skill) throw new Error(`华泰 SkillHub mock 未找到 Skill: ${skillName}`)
    return skill
  }

  const response = await skillHubFetch(
    `/workmate/skillhub/ai_skillhub_service/api/v1/market/skills/${encodeURIComponent(skillName)}`
  )

  const body = await response.json() as { code: string; data: SkillMetadataRaw }
  return body.data
}

export async function downloadSkillHubZip(skillName: string, version: string): Promise<Response> {
  const url = `/workmate/skillhub/ai_skillhub_service/api/v1/skills/download/${encodeURIComponent(skillName)}/${encodeURIComponent(version)}`
  console.log('[SkillHub] 下载 Skill name=%s version=%s', skillName, version)
  const response = await skillHubFetch(url, { method: 'POST' })

  return response
}

// ===== SkillHub 管理操作 =====

function mapSkillHubSkill(raw: SkillMetadataRaw): HtSkillHubSkill {
  return {
    name: raw.skillName,
    displayName: raw.displayName,
    description: raw.description,
    version: raw.version,
    category: raw.category,
    tags: raw.tags,
    author: raw.ownerName,
    downloadCount: raw.downloadCount,
    files: [],
    canDownload: canDownloadSkill(raw.type, raw.permission),
  }
}

/**
 * 判断 Skill 是否允许用户直接下载。
 *
 * type=1,3,4 → 可直接下载
 * type=0,2 → 需要 permission.role === 'user' 才可下载
 * 其他类型 → 不可下载，需通过 EIP 申请
 */
export function canDownloadSkill(
  type: number | undefined,
  permission: { role: string } | undefined,
): boolean {
  // 可直接下载的类型
  if (type === 1 || type === 3 || type === 4) return true

  // 需权限判断的类型
  if (type === 0 || type === 2) {
    return permission?.role === 'user'
  }

  // 未知类型默认不可下载
  return false
}

/** 权限不足时的提示页面 */
export const SKILLHUB_APPLY_URL = 'http://eip.htsc.com.cn/skillhub/#/skillhub/skillMarket'

function applyWorkspaceInstallStatus(skills: HtSkillHubSkill[], workspaceSlug?: string): HtSkillHubSkillWithStatus[] {
  if (!workspaceSlug) {
    return skills.map((skill) => ({ ...skill, installed: false }))
  }

  const { slugLowerMap, sourceNameMap } = readWorkspaceInstallStatus(workspaceSlug)

  // 多维度匹配，避免大小写 / 目录名不一致导致已安装 Skill 显示为未安装：
  //   1. slug（目录名）case-insensitive
  //   2. .proma-source.json 中记录的原始 skillName（包括活跃和禁用目录）
  return skills.map((skill) => {
    const short = shortSkillName(skill.name)
    const installed = slugLowerMap.has(short.toLowerCase()) || sourceNameMap.has(skill.name.toLowerCase())
    const enabled = slugLowerMap.get(short.toLowerCase()) ?? sourceNameMap.get(skill.name.toLowerCase())
    return { ...skill, installed, enabled }
  })
}

export async function fetchHtSkillHubIndexPage(
  workspaceSlug?: string,
  page?: number,
  keyword?: string,
  category?: string,
  pageSize = 20,
): Promise<HtSkillHubSkillPage> {
  const normalizedPage = Math.max(1, page ?? 1)
  const normalizedPageSize = Math.max(1, Math.min(Math.floor(pageSize), 50))
  const remoteSkills = await fetchSkillHubSkills({
    page: normalizedPage,
    pageSize: normalizedPageSize + 1,
    keyword,
    category,
  })
  const hasMore = remoteSkills.length > normalizedPageSize
  const items = applyWorkspaceInstallStatus(
    remoteSkills.slice(0, normalizedPageSize).map(mapSkillHubSkill),
    workspaceSlug,
  )

  return {
    items,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    hasMore,
  }
}

export async function fetchHtSkillHubIndex(workspaceSlug?: string, page?: number, keyword?: string, category?: string): Promise<HtSkillHubSkillWithStatus[]> {
  const result = await fetchHtSkillHubIndexPage(workspaceSlug, page, keyword, category)
  return result.items
}

export async function readHtSkillHubSkillContent(skillName: string): Promise<string> {
  const skills = await fetchSkillHubSkills()
  const key = skillName.toLowerCase()
  const skill = skills.find((s) => s.skillName.toLowerCase() === key)
  return skill?.readme ?? ''
}

export async function installHtSkillHubSkill(input: InstallHtSkillHubSkillInput): Promise<InstallHtSkillHubSkillResult> {
  const { workspaceSlug, skill, overwrite } = input
  const activeDir = input.activeDir ?? getWorkspaceSkillsDir(workspaceSlug)
  const inactiveDir = input.inactiveDir ?? getInactiveSkillsDir(workspaceSlug)

  assertValidSkillName(skill.name)

  const dirName = shortSkillName(skill.name)
  const tmpDir = join(activeDir, `.${dirName}.install-${Date.now()}`)

  let installedVersion: string | undefined
  try {
    const detail = await fetchSkillHubDetail(skill.name)
    installedVersion = detail.version
  } catch { /* 详情失败不阻塞安装 */ }

  const activePath = join(activeDir, dirName)
  const inactivePath = join(inactiveDir, dirName)
  const activeExists = existsSync(activePath)
  const inactiveExists = existsSync(inactivePath)
  const alreadyInstalled = activeExists || inactiveExists

  if (alreadyInstalled && !overwrite) {
    throw new Error(`当前工作区已存在同名 Skill: ${skill.name}`)
  }

  if (activeExists) rmSync(activePath, { recursive: true, force: true })
  if (inactiveExists) rmSync(inactivePath, { recursive: true, force: true })

  const version = installedVersion ?? 'latest'
  const response = await downloadSkillHubZip(skill.name, version)

  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })
  const zipPath = join(tmpDir, `${skill.name}.zip`)

  try {
    const buffer = Buffer.from(await response.arrayBuffer())
    writeFileSync(zipPath, buffer)

    const safeZipPath = zipPath.replace(/'/g, "''")
    const safeTmpDir = tmpDir.replace(/'/g, "''")
    execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${safeZipPath}' -DestinationPath '${safeTmpDir}' -Force"`, { stdio: 'pipe' })

    if (!existsSync(join(tmpDir, 'SKILL.md'))) {
      throw new Error('安装包不完整，缺少 SKILL.md')
    }

    // 安装完成后删除 .zip（避免残留在 skill 目录中）
    rmSync(zipPath, { force: true })

    if (existsSync(activePath)) {
      rmSync(activePath, { recursive: true, force: true })
    }
    renameSync(tmpDir, activePath)
  } catch (error) {
    rmSync(tmpDir, { recursive: true, force: true })
    throw error
  }

  const sourcePath = join(activePath, '.proma-source.json')
  writeFileSync(sourcePath, JSON.stringify({
    type: 'skillhub',
    skillName: skill.name,
    installedAt: new Date().toISOString(),
    installedVersion,
  }, null, 2), 'utf-8')

  rmSync(tmpDir, { recursive: true, force: true })
  invalidateWorkspaceInstallStatusCache(workspaceSlug)

  return {
    skillName: skill.name,
    status: alreadyInstalled ? 'overwritten' : 'installed',
    enabled: true,
  }
}

export async function uninstallHtSkillHubSkill(
  workspaceSlug: string, skillName: string
): Promise<void> {
  const dirName = shortSkillName(skillName)
  const activeDir = getWorkspaceSkillsDir(workspaceSlug)
  const inactiveDir = getInactiveSkillsDir(workspaceSlug)
  assertValidSkillName(skillName)
  const activePath = resolveSkillPath(activeDir, dirName)
  const inactivePath = resolveSkillPath(inactiveDir, dirName)

  if (existsSync(activePath)) {
    rmSync(activePath, { recursive: true, force: true })
  }
  if (existsSync(inactivePath)) {
    rmSync(inactivePath, { recursive: true, force: true })
  }
  invalidateWorkspaceInstallStatusCache(workspaceSlug)
}

export async function checkSkillUpdates(
  workspaceSlug: string
): Promise<Array<{ skillName: string; currentVersion?: string; latestVersion?: string; hasUpdate: boolean }>> {
  const skillsDir = getWorkspaceSkillsDir(workspaceSlug)

  const remoteSkills = await fetchSkillHubSkills()
  const remoteVersionMap = new Map<string, string>()
  for (const skill of remoteSkills) {
    if (skill.version) {
      remoteVersionMap.set(shortSkillName(skill.skillName), skill.version)
    }
  }

  const result: Array<{ skillName: string; currentVersion?: string; latestVersion?: string; hasUpdate: boolean }> = []

  if (!existsSync(skillsDir)) return result

  const entries = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())

  for (const entry of entries) {
    const sourcePath = join(skillsDir, entry.name, '.proma-source.json')
    if (!existsSync(sourcePath)) continue

    try {
      const source = JSON.parse(readFileSync(sourcePath, 'utf-8')) as { type: string; installedVersion?: string }
      if (source.type !== 'skillhub') continue

      const currentVersion = source.installedVersion
      const latestVersion = remoteVersionMap.get(entry.name)

      const hasUpdate = !!(currentVersion && latestVersion && compareVersions(currentVersion, latestVersion) < 0)

      result.push({
        skillName: entry.name,
        currentVersion,
        latestVersion,
        hasUpdate,
      })
    } catch { /* 跳过损坏文件 */ }
  }

  return result
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1
    if ((pa[i] || 0) < (pb[i] || 0)) return -1
  }
  return 0
}

export async function batchInstallHtSkillHubSkills(
  workspaceSlug: string,
  skillNames: string[],
  overwrite?: boolean
): Promise<InstallHtSkillHubSkillResult[]> {
  const results: InstallHtSkillHubSkillResult[] = []
  const concurrency = 3

  // 一次性拉取远端列表，避免每个 skill 都单独请求
  const allSkills = await fetchSkillHubSkills()
  const nameLowerMap = new Map(allSkills.map((s) => [s.skillName.toLowerCase(), s]))

  for (let i = 0; i < skillNames.length; i += concurrency) {
    const batch = skillNames.slice(i, i + concurrency)
    const batchResults = await Promise.allSettled(
      batch.map(async (name) => {
        const raw = nameLowerMap.get(name.toLowerCase())
        if (!raw) throw new Error(`SkillHub 未找到 Skill: ${name}`)

        const skill: HtSkillHubSkill = { name: raw.skillName, description: raw.description, files: [] }
        return installHtSkillHubSkill({ workspaceSlug, skill, overwrite: overwrite ?? false })
      })
    )

    for (const r of batchResults) {
      if (r.status === 'fulfilled') results.push(r.value)
      else console.error('[SkillHub] 批量安装失败:', r.reason)
    }
  }

  return results
}

export async function batchUninstallHtSkillHubSkills(
  workspaceSlug: string,
  skillNames: string[]
): Promise<void> {
  for (const name of skillNames) {
    try {
      await uninstallHtSkillHubSkill(workspaceSlug, name)
    } catch (error) {
      console.error(`[SkillHub] 卸载 ${name} 失败:`, error)
    }
  }
}
