/**
 * 华泰 SkillHub 服务
 *
 * 负责读取内部 Skill 市场清单，并将 Skill 安装到当前 Agent 工作区。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { getInactiveSkillsDir, getWorkspaceSkillsDir } from './config-paths'
import { getAllWorkspaceSkills } from './agent-workspace-manager'
import { getValidSkillHubToken, getSkillHubApiBase } from './skillhub-auth-service'

export interface HtSkillHubSkill {
  name: string
  description: string
  files: string[]
}

export interface HtSkillHubSkillWithStatus extends HtSkillHubSkill {
  installed: boolean
  enabled?: boolean
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
  return /^@?[a-zA-Z0-9._-]+(\/[a-zA-Z0-9._-]+)?$/.test(name) && !name.startsWith('.') && name.length <= 200
}

/** 从 scope 名称中提取短名称作为目录名，例如 @ht-skills/code-review → code-review */
function shortSkillName(skillName: string): string {
  const slash = skillName.lastIndexOf('/')
  return slash >= 0 ? skillName.substring(slash + 1) : skillName
}

// ===== SkillHub API 统一请求入口 =====

async function skillHubFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getValidSkillHubToken()
  const base = getSkillHubApiBase()
  const url = `${base}${path}`
  const method = init?.method ?? 'GET'
  console.log('[SkillHub] => %s %s', method, url)
  if (init?.body) {
    try {
      console.log('[SkillHub]    body: %s', typeof init.body === 'string' ? init.body.substring(0, 500) : String(init.body).substring(0, 500))
    } catch { /* ignore */ }
  }
  const makeRequest = (t: string) => fetch(url, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${t}`,
    },
  })

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
    throw new Error(
      `SkillHub 请求失败 (${response.status})\n` +
      `请求: ${method} ${url}\n` +
      (bodyPreview ? `Body: ${bodyPreview}\n` : '') +
      `响应: ${text.substring(0, 500)}`
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
  createdAt?: string
  updatedAt?: string
  businessOwnerId?: string
  businessOwnerName?: string
}

export async function fetchSkillHubSkills(query: SkillListQuery = {}): Promise<SkillMetadataRaw[]> {
  const body: Record<string, unknown> = {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
    sort: query.sort ?? 'downloads',
    order: query.order ?? 'desc',
  }
  if (query.keyword) body.keyword = query.keyword
  if (query.category) body.category = query.category
  if (query.env) body.env = query.env

  const response = await skillHubFetch('/ai_skillhub_service/api/v1/market/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const body = await response.json() as { code: string; data: SkillMetadataRaw[] }
  return body.data ?? []
}

export async function fetchSkillHubDetail(skillName: string): Promise<SkillMetadataRaw> {
  const response = await skillHubFetch(
    `/ai_skillhub_service/api/v1/market/skills/${encodeURIComponent(skillName)}`
  )

  const body = await response.json() as { code: string; data: SkillMetadataRaw }
  return body.data
}

export async function downloadSkillHubZip(skillName: string, version: string): Promise<Response> {
  const url = `/ai_skillhub_service/api/v1/skills/download/${encodeURIComponent(skillName)}/${encodeURIComponent(version)}`
  console.log('[SkillHub] 下载 Skill name=%s version=%s', skillName, version)
  const response = await skillHubFetch(url, { method: 'POST' })

  return response
}

// ===== SkillHub 管理操作 =====

export async function fetchHtSkillHubIndex(workspaceSlug?: string, page?: number): Promise<HtSkillHubSkillWithStatus[]> {
  const remoteSkills = await fetchSkillHubSkills({ page: page ?? 1, pageSize: 20 })

  const skills: HtSkillHubSkill[] = remoteSkills.map((raw) => ({
    name: raw.skillName,
    displayName: raw.displayName,
    description: raw.description,
    version: raw.version,
    category: raw.category,
    tags: raw.tags,
    author: raw.ownerName,
    downloadCount: raw.downloadCount,
    files: [],
  }))

  if (!workspaceSlug) {
    return skills.map((skill) => ({ ...skill, installed: false }))
  }

  const installed = new Map(getAllWorkspaceSkills(workspaceSlug).map((s) => [s.slug, s.enabled]))
  return skills.map((skill) => ({
    ...skill,
    installed: installed.has(shortSkillName(skill.name)),
    enabled: installed.get(shortSkillName(skill.name)),
  }))
}

export async function readHtSkillHubSkillContent(skillName: string): Promise<string> {
  const skills = await fetchSkillHubSkills()
  const skill = skills.find((s) => s.skillName === skillName)
  return skill?.readme ?? ''
}

export async function installHtSkillHubSkill(input: InstallHtSkillHubSkillInput): Promise<InstallHtSkillHubSkillResult> {
  const { workspaceSlug, skill, overwrite } = input
  const activeDir = input.activeDir ?? getWorkspaceSkillsDir(workspaceSlug)
  const inactiveDir = input.inactiveDir ?? getInactiveSkillsDir(workspaceSlug)

  if (!isValidSkillName(skill.name)) throw new Error(`非法 Skill 名称: ${skill.name}`)

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
  const activePath = join(activeDir, dirName)
  const inactivePath = join(inactiveDir, dirName)

  if (existsSync(activePath)) {
    rmSync(activePath, { recursive: true, force: true })
  }
  if (existsSync(inactivePath)) {
    rmSync(inactivePath, { recursive: true, force: true })
  }
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

  for (let i = 0; i < skillNames.length; i += concurrency) {
    const batch = skillNames.slice(i, i + concurrency)
    const batchResults = await Promise.allSettled(
      batch.map(async (name) => {
        const skills = await fetchSkillHubSkills()
        const raw = skills.find((s) => s.skillName === name)
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
