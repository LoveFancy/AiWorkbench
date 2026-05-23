/**
 * 华泰 SkillHub 服务
 *
 * 负责读取内部 Skill 市场清单，并将 Skill 安装到当前 Agent 工作区。
 */

import { existsSync, mkdirSync, rmSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, relative } from 'node:path'
import { getInactiveSkillsDir, getWorkspaceSkillsDir } from './config-paths'
import { getAllWorkspaceSkills } from './agent-workspace-manager'

export const HT_SKILLHUB_BASE_URL = 'http://skillhub.uat.saas.htsc/.well-known/skills'

export interface HtSkillHubSkill {
  name: string
  description: string
  files: string[]
}

export interface HtSkillHubIndex {
  skills: HtSkillHubSkill[]
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
  fetchText?: (url: string) => Promise<string>
}

export interface InstallHtSkillHubSkillResult {
  skillName: string
  status: 'installed' | 'overwritten'
  enabled: boolean
}

function isValidSkillName(name: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(name) && !name.startsWith('.') && name.length <= 120
}

export function validateHtSkillHubFilePath(filePath: string): void {
  const normalized = filePath.replace(/\\/g, '/')
  if (
    normalized !== filePath
    || normalized.length === 0
    || normalized.startsWith('/')
    || isAbsolute(normalized)
    || normalized.split('/').some((part) => part === '..' || part === '' || part.startsWith('.'))
  ) {
    throw new Error(`非法 Skill 文件路径: ${filePath}`)
  }
}

function resolveWithin(root: string, relativePath: string): string {
  const abs = resolve(root, relativePath)
  const rel = relative(root, abs)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`非法 Skill 文件路径: ${relativePath}`)
  }
  return abs
}

async function defaultFetchText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`请求失败 (${response.status}): ${text}`)
  }
  return response.text()
}

function buildSkillFileUrl(skillName: string, filePath: string): string {
  return `${HT_SKILLHUB_BASE_URL}/${encodeURIComponent(skillName)}/${filePath.split('/').map(encodeURIComponent).join('/')}`
}

function normalizeHubSkill(raw: unknown): HtSkillHubSkill | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const description = typeof record.description === 'string' ? record.description : ''
  const files = Array.isArray(record.files)
    ? record.files.filter((file): file is string => typeof file === 'string')
    : []
  if (!name || !isValidSkillName(name) || !files.includes('SKILL.md')) return null
  return { name, description, files }
}

export async function fetchHtSkillHubIndex(workspaceSlug?: string): Promise<HtSkillHubSkillWithStatus[]> {
  const response = await fetch(`${HT_SKILLHUB_BASE_URL}/index.json`)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`读取华泰 SkillHub 清单失败 (${response.status}): ${text}`)
  }

  const data = await response.json() as unknown
  const rawSkills = typeof data === 'object' && data !== null && Array.isArray((data as { skills?: unknown }).skills)
    ? (data as { skills: unknown[] }).skills
    : []
  const skills = rawSkills.map(normalizeHubSkill).filter((skill): skill is HtSkillHubSkill => skill !== null)

  if (!workspaceSlug) {
    return skills.map((skill) => ({ ...skill, installed: false }))
  }

  const installed = new Map(getAllWorkspaceSkills(workspaceSlug).map((skill) => [skill.slug, skill.enabled]))
  return skills.map((skill) => ({
    ...skill,
    installed: installed.has(skill.name),
    enabled: installed.get(skill.name),
  }))
}

export async function readHtSkillHubSkillContent(skillName: string): Promise<string> {
  if (!isValidSkillName(skillName)) throw new Error(`非法 Skill 名称: ${skillName}`)
  return defaultFetchText(buildSkillFileUrl(skillName, 'SKILL.md'))
}

export async function installHtSkillHubSkill(input: InstallHtSkillHubSkillInput): Promise<InstallHtSkillHubSkillResult> {
  const { workspaceSlug, skill, overwrite } = input
  const activeDir = input.activeDir ?? getWorkspaceSkillsDir(workspaceSlug)
  const inactiveDir = input.inactiveDir ?? getInactiveSkillsDir(workspaceSlug)
  const fetchText = input.fetchText ?? defaultFetchText

  if (!isValidSkillName(skill.name)) throw new Error(`非法 Skill 名称: ${skill.name}`)
  if (!skill.files.includes('SKILL.md')) throw new Error(`Skill ${skill.name} 缺少 SKILL.md`)
  for (const file of skill.files) validateHtSkillHubFilePath(file)

  const activePath = join(activeDir, skill.name)
  const inactivePath = join(inactiveDir, skill.name)
  const activeExists = existsSync(activePath)
  const inactiveExists = existsSync(inactivePath)
  const alreadyInstalled = activeExists || inactiveExists

  if (alreadyInstalled && !overwrite) {
    throw new Error(`当前工作区已存在同名 Skill: ${skill.name}`)
  }

  const enabled = inactiveExists ? false : true
  const parentDir = enabled ? activeDir : inactiveDir
  const targetPath = enabled ? activePath : inactivePath
  const tmpPath = join(parentDir, `.${skill.name}.installing-${Date.now()}`)

  rmSync(tmpPath, { recursive: true, force: true })
  mkdirSync(tmpPath, { recursive: true })

  try {
    for (const file of skill.files) {
      const content = await fetchText(buildSkillFileUrl(skill.name, file))
      const targetFile = resolveWithin(tmpPath, file)
      mkdirSync(dirname(targetFile), { recursive: true })
      writeFileSync(targetFile, content, 'utf-8')
    }

    if (existsSync(targetPath)) {
      rmSync(targetPath, { recursive: true, force: true })
    }
    renameSync(tmpPath, targetPath)
  } catch (error) {
    rmSync(tmpPath, { recursive: true, force: true })
    throw error
  }

  return {
    skillName: skill.name,
    status: alreadyInstalled ? 'overwritten' : 'installed',
    enabled,
  }
}
